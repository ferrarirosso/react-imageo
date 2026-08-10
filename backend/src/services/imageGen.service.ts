/**
 * Image generation via Microsoft Foundry's MAI Image API.
 *
 * Endpoint shape (verified against MAI-Image-2.5-Flash, 2026-08):
 *   POST https://{resource}.services.ai.azure.com/mai/v1/images/generations
 *   Headers: api-key: <foundry-key>, Content-Type: application/json
 *   Body:    { prompt, width, height, model }          ← width/height, not size
 *   Returns: { created, model, size, usage, data: [{ b64_json }] }
 *
 * api-version is optional; sent from AZURE_OPENAI_API_VERSION_IMAGE, empty to omit.
 *
 * `n` is NOT supported — the service accepts it and still returns one image, so
 * N images means N parallel requests, each costing one unit of the deployment's
 * per-minute budget (= skuCapacity, capped at 2 by quota).
 *
 * Auth:
 *   - Production: Managed Identity → bearer for
 *     https://cognitiveservices.azure.com/.default, sent as Authorization.
 *     The MAI endpoint accepts both api-key and AAD bearer.
 *   - Local dev: api-key from AZURE_OPENAI_API_KEY (written by setup-local).
 */

import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { GeneratedImage, ImageSize, PartialError } from '../types/contracts';

// Don't swap this for the response's `model` field — that echoes the deployment
// name, not the model. Override via IMAGE_MODEL_LABEL on a different MAI model.
const MODEL_LABEL = process.env.IMAGE_MODEL_LABEL || 'mai-image-2.5-flash';
const AZURE_OPENAI_SCOPE = 'https://cognitiveservices.azure.com/.default';

// Opt-in verbose logging. Off by default so user-derived strings (e.g. the
// color tokens the sanitizer rewrites) never reach App Insights unless asked.
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
    throw new Error('AZURE_OPENAI_API_KEY required for local dev (run `npm run setup` at repo root).');
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
 * Build the generations URL, appending api-version only when configured.
 * Defaults to `preview`; set AZURE_OPENAI_API_VERSION_IMAGE empty to omit.
 */
function generationsUrl(endpoint: string): string {
  const base = `${endpoint}/mai/v1/images/generations`;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION_IMAGE ?? 'preview';
  return apiVersion ? `${base}?api-version=${encodeURIComponent(apiVersion)}` : base;
}

async function generateOne(prompt: string, size: ImageSize): Promise<GeneratedImage> {
  const endpoint = getMaiEndpoint();
  const deployment = getDeployment();
  const { width, height } = sizeToDims(size);
  const url = generationsUrl(endpoint);
  const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
  const body = JSON.stringify({ prompt, width, height, model: deployment });

  const t0 = Date.now();
  const res = await fetch(url, { method: 'POST', headers, body });
  const dt = Date.now() - t0;
  const raw = await res.text();

  if (!res.ok) {
    console.error(`[imageGen] ${dt}ms ${res.status} at ${url}: ${raw.slice(0, 500)}`);
    const err = new Error(`Image generation failed (${res.status}): ${raw.slice(0, 500)}`);
    (err as Error & { status?: number; raw?: string }).status = res.status;
    (err as Error & { raw?: string }).raw = raw;
    throw err;
  }

  let parsed: MaiImageResponse;
  try { parsed = JSON.parse(raw) as MaiImageResponse; } catch {
    throw new Error(`Image API returned non-JSON: ${raw.slice(0, 200)}`);
  }

  const first = parsed.data?.[0];
  if (!first) throw new Error('Image API returned no data');

  let b64 = first.b64_json || '';
  if (!b64 && first.url) {
    console.log('[imageGen] b64_json missing, fetching URL and base64-encoding');
    b64 = await urlToB64(first.url);
  }
  if (!b64) throw new Error('Image API returned neither b64_json nor url');

  console.log(`[imageGen] ← ${dt}ms ${width}x${height} ${(b64.length * 3 / 4 / 1024).toFixed(0)}KB`);
  return { b64, revisedPrompt: first.revised_prompt, model: MODEL_LABEL };
}

function toToastMessage(err: unknown): { message: string; code?: string } {
  if (!err || typeof err !== 'object') return { message: 'Unknown error' };
  const e = err as { status?: number; code?: string; message?: string; raw?: string };
  const raw = e.raw || '';

  if (e.status === 429 || /rate[_ ]limit/i.test(raw)) {
    return { message: 'Rate limited — please try fewer images or wait a moment.', code: 'rate_limit_exceeded' };
  }
  if (/content[_ ]policy/i.test(raw) || e.code === 'content_policy_violation') {
    return { message: 'The prompt was blocked by content policy. Rephrase and try again.', code: 'content_policy_violation' };
  }
  if (e.status === 401 || e.status === 403) {
    return { message: 'Not authorized to generate images. Check backend auth config.', code: 'auth_error' };
  }
  if (e.status && e.status >= 500) {
    return { message: 'Image service temporarily unavailable. Retry in a moment.', code: 'server_error' };
  }
  return { message: e.message || 'Unknown error', code: e.code };
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
    if (DEBUG) console.log(`[sanitize] "${match}" → "${name}"`);
    return name;
  });
  out = out.replace(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)/g, (match, rs, gs, bs) => {
    const r = Math.min(255, parseInt(rs, 10));
    const g = Math.min(255, parseInt(gs, 10));
    const b = Math.min(255, parseInt(bs, 10));
    const name = rgbToColorName(r, g, b);
    if (DEBUG) console.log(`[sanitize] "${match}" → "${name}"`);
    return name;
  });
  return out;
}

export async function generateImages(
  prompt: string,
  brandSlang: string | undefined,
  n: number,
  size: ImageSize
): Promise<{ images: GeneratedImage[]; partialErrors: PartialError[] }> {
  const cleanPrompt = sanitizeForImageModel(prompt);
  const cleanBrand = brandSlang ? sanitizeForImageModel(brandSlang) : '';
  const fullPrompt = cleanBrand.length > 0
    ? `Corporate visual style: ${cleanBrand}\n\n${cleanPrompt}`
    : cleanPrompt;

  console.log(`[imageGen] → n=${n} size=${size} promptLen=${fullPrompt.length}`);

  const results = await Promise.allSettled(
    Array.from({ length: n }, () => generateOne(fullPrompt, size))
  );

  const images: GeneratedImage[] = [];
  const partialErrors: PartialError[] = [];
  results.forEach((r, idx) => {
    if (r.status === 'fulfilled') images.push(r.value);
    else {
      const m = toToastMessage(r.reason);
      partialErrors.push({ index: idx, message: m.message, code: m.code });
    }
  });

  return { images, partialErrors };
}
