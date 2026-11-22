/**
 * Image generation and editing via Microsoft Foundry's MAI Image API.
 *
 *   POST https://{resource}.services.ai.azure.com/mai/v1/images/generations
 *   Body: { prompt, width, height, model: deploymentName }
 *   Result: data[0].b64_json contains a base64-encoded PNG.
 *
 * api-version is optional; sent from AZURE_OPENAI_API_VERSION_IMAGE, empty to omit.
 *
 * The backend sends one upstream request per image.
 *
 * Auth:
 *   - Production: Managed Identity → bearer for
 *     https://cognitiveservices.azure.com/.default, sent as Authorization.
 *     The MAI endpoint accepts both api-key and AAD bearer.
 *   - Local dev: api-key from AZURE_OPENAI_API_KEY.
 */

import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { GeneratedImage, ImageServiceResponse, ImageSize, PartialError } from '../types/contracts';

const AZURE_OPENAI_SCOPE = 'https://cognitiveservices.azure.com/.default';

// Local opt-in diagnostic for prompt color normalization.
const DEBUG = /^(1|true|yes|on)$/i.test(process.env.IMAGEO_DEBUG || '');

function isRunningInAzure(): boolean {
  return !!process.env.WEBSITE_SITE_NAME;
}

/**
 * Derive the MAI endpoint from the configured AZURE_OPENAI_ENDPOINT.
 * Swaps .cognitiveservices.azure.com → .services.ai.azure.com.
 * Overridable via AZURE_MAI_ENDPOINT if Microsoft changes the subdomain.
 */
function getMaiEndpoint(): string {
  const override = process.env.AZURE_MAI_ENDPOINT;
  if (override) return override.replace(/\/+$/, '');

  const base = process.env.AZURE_OPENAI_ENDPOINT;
  if (!base) throw new Error('AZURE_OPENAI_ENDPOINT is not configured');
  return base
    .replace(/\/+$/, '')
    .replace(/\.cognitiveservices\.azure\.com$/i, '.services.ai.azure.com');
}

function getDeployment(): string {
  const d = process.env.AZURE_OPENAI_DEPLOYMENT_IMAGE;
  if (!d) throw new Error('AZURE_OPENAI_DEPLOYMENT_IMAGE is not configured');
  return d;
}

function sizeToDims(size: ImageSize): { width: number; height: number } {
  const [w, h] = size.split('x').map((n) => parseInt(n, 10));
  return { width: w, height: h };
}

let tokenProvider: (() => Promise<string>) | undefined;
function getTokenProvider(): () => Promise<string> {
  if (!tokenProvider) {
    tokenProvider = getBearerTokenProvider(new DefaultAzureCredential(), AZURE_OPENAI_SCOPE);
  }
  return tokenProvider;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (isRunningInAzure()) {
    const token = await getTokenProvider()();
    return { Authorization: `Bearer ${token}` };
  }
  const key = process.env.AZURE_OPENAI_API_KEY;
  if (!key) {
    throw new Error('Set AZURE_OPENAI_API_KEY in backend/local.settings.json for local development.');
  }
  return { 'api-key': key };
}

async function urlToB64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch generated image URL (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.toString('base64');
}

interface MaiImageChoice { b64_json?: string; url?: string; revised_prompt?: string; }
interface MaiImageResponse { data?: MaiImageChoice[]; model?: string; size?: string; }

/**
 * Append api-version only when configured.
 * Defaults to `preview`; set AZURE_OPENAI_API_VERSION_IMAGE empty to omit.
 */
function imageUrl(operation: 'generations' | 'edits'): string {
  const base = `${getMaiEndpoint()}/mai/v1/images/${operation}`;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION_IMAGE ?? 'preview';
  return apiVersion ? `${base}?api-version=${encodeURIComponent(apiVersion)}` : base;
}

async function generateOne(prompt: string, size: ImageSize, transparentBackground: boolean): Promise<GeneratedImage> {
  const deployment = getDeployment();
  const { width, height } = sizeToDims(size);
  const body = JSON.stringify({
    prompt, width, height, model: deployment,
    ...(transparentBackground ? { background: 'transparent' } : {}),
  });
  return requestImage('generations', body, deployment);
}

export function refineImage(png: Buffer, instruction: string, guide?: Buffer): Promise<GeneratedImage> {
  const deployment = getDeployment();
  const form = new FormData();
  form.set('model', deployment);
  const prompt = guide
    ? 'Edit the first image. The second image shows the selection with a magenta overlay on the same picture. ' +
      'Keep the original framing and alignment. Leave all selection markings out of the result.\n' + instruction
    : instruction;
  form.set('prompt', prompt);
  form.append('image', new Blob([png], { type: 'image/png' }), 'source.png');
  if (guide) form.append('image', new Blob([guide], { type: 'image/png' }), 'selection-guide.png');
  return requestImage('edits', form, deployment);
}

async function requestImage(
  operation: 'generations' | 'edits', body: string | FormData, deployment: string
): Promise<GeneratedImage> {
  const url = imageUrl(operation);
  const headers = await authHeaders();
  if (typeof body === 'string') headers['Content-Type'] = 'application/json';
  const t0 = Date.now();
  const res = await fetch(url, { method: 'POST', headers, body });
  const dt = Date.now() - t0;
  const raw = await res.text();

  if (!res.ok) {
    const failure = classifyImageFailure(res, raw);
    console.error(`[imageGen] ${operation} ${dt}ms HTTP ${res.status} category=${failure.code}` +
      (failure.serviceResponse?.requestId ? ` requestId=${failure.serviceResponse.requestId}` : ''));
    throw failure;
  }

  let parsed: MaiImageResponse;
  try { parsed = JSON.parse(raw) as MaiImageResponse; } catch {
    throw new Error('Image API returned an invalid JSON response');
  }

  const first = parsed.data?.[0];
  if (!first) throw new Error('Image API returned no data');

  let b64 = first.b64_json || '';
  if (!b64 && first.url) {
    console.log('[imageGen] b64_json missing, fetching URL and base64-encoding');
    b64 = await urlToB64(first.url);
  }
  if (!b64) throw new Error('Image API returned neither b64_json nor url');

  console.log(`[imageGen] ← ${operation} ${dt}ms ${(b64.length * 3 / 4 / 1024).toFixed(0)}KB`);
  return { b64, revisedPrompt: first.revised_prompt, model: process.env.IMAGE_MODEL_LABEL || deployment };
}

const IMAGE_FAILURES = {
  output_content_filtered: [400, 'Foundry blocked the generated image. No image was returned.'],
  content_policy_violation: [400, 'The image service blocked this request under its safety policies. Rephrase the prompt and try again.'],
  unsupported_background: [400, 'Foundry rejected the background setting. Turn off Transparent background and try again.'],
  invalid_image_size: [400, 'Foundry rejected the requested image size. Choose another size and try again.'],
  invalid_prompt: [400, 'Foundry rejected the prompt. Shorten or rephrase it and try again.'],
  upstream_bad_request: [400, 'Foundry rejected the image request (HTTP 400). Contact support if the issue persists.'],
  rate_limit_exceeded: [429, 'Rate limited. Wait a moment before trying again.'],
  auth_error: [502, 'Foundry could not authorize the image service. Contact your administrator.'],
  server_error: [502, 'The image service is temporarily unavailable. Retry in a moment.'],
  image_service_error: [502, 'The image service could not complete the request. Contact support if the issue persists.'],
} as const;

type ImageFailureCode = keyof typeof IMAGE_FAILURES;

class ImageServiceError extends Error {
  constructor(readonly code: ImageFailureCode, readonly serviceResponse?: ImageServiceResponse) {
    const requestId = serviceResponse?.requestId;
    super(IMAGE_FAILURES[code][1] + (requestId ? ` Request ID: ${requestId}.` : ''));
  }
}

// Classify the cause for the user independently of the fields safe to disclose.
function classifyBadRequest(payload: unknown): ImageFailureCode {
  const nodes: unknown[] = [payload];
  const codes: string[] = [];
  const messages: string[] = [];
  const fields: string[] = [];
  for (let i = 0; i < nodes.length && i < 16; i++) {
    const node = nodes[i];
    if (typeof node === 'string') { messages.push(node.slice(0, 2048)); continue; }
    if (!node || typeof node !== 'object') continue;
    const value = node as Record<string, unknown>;
    for (const code of [value.code, value.type]) {
      if (typeof code === 'string') codes.push(code.slice(0, 80).replace(/[_ -]/g, '').toLowerCase());
    }
    for (const field of [value.param, value.target]) {
      if (typeof field === 'string') fields.push(field.toLowerCase());
    }
    if (typeof value.message === 'string') messages.push(value.message.slice(0, 2048));
    for (const inner of [value.error, value.innererror, value.innerError, value.detail, value.details]) {
      if (Array.isArray(inner)) nodes.push(...inner.slice(0, 5));
      else if (inner) nodes.push(inner);
    }
  }
  const hasCode = (...known: string[]): boolean => codes.some(code => known.includes(code));
  if (hasCode('ratelimitexceeded', 'toomanyrequests')) return 'rate_limit_exceeded';
  if (hasCode('contentsafetyviolation', 'contentpolicyviolation', 'contentfilter', 'responsibleaipolicyviolation') ||
      messages.some(m => /content[_-](?:safety|policy)[_-]violation|(?:blocked|rejected|violat\w*)[^.\n]{0,100}\bsafety polic(?:y|ies)\b|\bsafety polic(?:y|ies)\b[^.\n]{0,60}\b(?:blocked|violated)\b/i.test(m))) {
    if (messages.some(m => /\b(?:output content|generated (?:image|content))\s+(?:was\s+)?(?:violated|blocked|filtered)\b/i.test(m))) {
      return 'output_content_filtered';
    }
    return 'content_policy_violation';
  }
  if (fields.some(f => ['background', 'transparent_background', 'transparentbackground'].includes(f)) ||
      hasCode('unsupportedbackground') ||
      messages.some(m => /(?:unknown|unrecognized|unsupported|not supported) (?:parameter|setting|value)?[: ='"\s]*background\b|\bbackground\b[^.\n]{0,40}\b(?:not supported|unsupported)\b/i.test(m))) {
    return 'unsupported_background';
  }
  if (fields.some(f => ['width', 'height', 'size', 'dimensions'].includes(f)) ||
      hasCode('invalidimagesize', 'unsupportedimagesize', 'invaliddimensions')) return 'invalid_image_size';
  if (hasCode('invalidprompt', 'prompttoolong')) return 'invalid_prompt';
  return 'upstream_bad_request';
}

const PUBLIC_PROVIDER_CODES = new Set([
  'content_safety_violation', 'content_policy_violation', 'content_filter', 'ResponsibleAIPolicyViolation',
  'BadRequest', 'invalid_request_error', 'unsupported_parameter', 'rate_limit_exceeded', 'TooManyRequests',
]);
const OUTPUT_FILTER_MESSAGE = 'Output content violated safety policies. Violation categories: disallowed.';

function classifyImageFailure(res: Response, raw: string): ImageServiceError {
  // Foundry gateway headers normally contain GUIDs. Discard arbitrary header values.
  const idPattern = /^(?:[\da-f]{32}|[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12})$/i;
  const requestId = ['apim-request-id', 'x-ms-request-id', 'x-request-id', 'request-id']
    .map(name => res.headers.get(name)).find((id): id is string => !!id && idPattern.test(id));
  const serviceResponse: ImageServiceResponse = { httpStatus: res.status };
  if (requestId) serviceResponse.requestId = requestId;

  let payload: unknown;
  if (raw.length <= 65_536) {
    try { payload = JSON.parse(raw); } catch { payload = raw; }
  }
  // Only publish exact values from the structured error. Free-form provider
  // messages and nested details can contain prompts, deployment names or URLs.
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = payload.error;
    if (error && typeof error === 'object' && 'code' in error &&
        typeof error.code === 'string' && PUBLIC_PROVIDER_CODES.has(error.code)) {
      serviceResponse.providerCode = error.code;
      if (error.code === 'content_safety_violation' && 'message' in error && error.message === OUTPUT_FILTER_MESSAGE) {
        serviceResponse.message = OUTPUT_FILTER_MESSAGE;
        serviceResponse.stage = 'output';
        serviceResponse.category = 'disallowed';
      }
    }
  }

  let code: ImageFailureCode = 'image_service_error';
  if (res.status === 400) code = classifyBadRequest(payload);
  else if (res.status === 429) code = 'rate_limit_exceeded';
  else if (res.status === 401 || res.status === 403) code = 'auth_error';
  else if (res.status >= 500) code = 'server_error';
  return new ImageServiceError(code, serviceResponse);
}

export function toToastMessage(err: unknown) {
  const failure = err instanceof ImageServiceError ? err : new ImageServiceError('image_service_error');
  return {
    message: failure.message, code: failure.code, status: IMAGE_FAILURES[failure.code][0],
    ...(failure.serviceResponse && { serviceResponse: failure.serviceResponse }),
  };
}

function hexToColorName(hex: string): string {
  const clean = hex.replace(/^#/, '');
  let r: number, g: number, b: number;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16);
    g = parseInt(clean[1] + clean[1], 16);
    b = parseInt(clean[2] + clean[2], 16);
  } else {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
  }
  return rgbToColorName(r, g, b);
}

function rgbToColorName(r: number, g: number, b: number): string {
  const rN = r / 255, gN = g / 255, bN = b / 255;
  const max = Math.max(rN, gN, bN), min = Math.min(rN, gN, bN);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rN: h = ((gN - bN) / d + (gN < bN ? 6 : 0)) * 60; break;
      case gN: h = ((bN - rN) / d + 2) * 60; break;
      default: h = ((rN - gN) / d + 4) * 60;
    }
  }

  if (l < 0.08) return 'near-black';
  if (l > 0.92) return 'white';
  if (s < 0.20) return l < 0.35 ? 'dark gray' : l > 0.70 ? 'light gray' : 'gray';

  const hue =
    (h >= 345 || h < 15) ? 'red'
    : h < 40 ? 'orange'
    : h < 65 ? 'yellow'
    : h < 150 ? 'green'
    : h < 200 ? 'teal'
    : h < 250 ? 'blue'
    : h < 290 ? 'purple'
    : 'pink';
  const lightness = l < 0.30 ? 'deep' : l > 0.70 ? 'light' : '';
  return lightness ? `${lightness} ${hue}` : hue;
}

export function sanitizeForImageModel(text: string): string {
  if (!text) return text;
  let out = text;
  out = out.replace(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g, (match) => {
    const name = hexToColorName(match);
    if (DEBUG) console.log('[sanitize] Normalized a hex color');
    return name;
  });
  out = out.replace(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)/g, (match, rs, gs, bs) => {
    const r = Math.min(255, parseInt(rs, 10));
    const g = Math.min(255, parseInt(gs, 10));
    const b = Math.min(255, parseInt(bs, 10));
    const name = rgbToColorName(r, g, b);
    if (DEBUG) console.log('[sanitize] Normalized an RGB color');
    return name;
  });
  return out;
}

export async function generateImages(
  prompt: string,
  brandSlang: string | undefined,
  n: number,
  size: ImageSize,
  transparentBackground = false
): Promise<{ images: GeneratedImage[]; partialErrors: PartialError[]; failureStatus: number }> {
  const cleanPrompt = sanitizeForImageModel(prompt);
  const cleanBrand = brandSlang ? sanitizeForImageModel(brandSlang) : '';
  const fullPrompt = cleanBrand.length > 0
    ? `Corporate visual style: ${cleanBrand}\n\n${cleanPrompt}`
    : cleanPrompt;

  console.log(`[imageGen] → n=${n} size=${size} promptLen=${fullPrompt.length}`);

  const results = await Promise.allSettled(
    Array.from({ length: n }, () => generateOne(fullPrompt, size, transparentBackground))
  );

  const images: GeneratedImage[] = [];
  const partialErrors: PartialError[] = [];
  const statuses = new Set<number>();
  results.forEach((r, idx) => {
    if (r.status === 'fulfilled') images.push(r.value);
    else {
      const { status, ...error } = toToastMessage(r.reason);
      statuses.add(status);
      partialErrors.push({ index: idx, ...error });
    }
  });

  const [firstStatus] = statuses;
  return { images, partialErrors, failureStatus: statuses.size === 1 ? firstStatus : 502 };
}
