import * as strings from 'ImageoApplicationCustomizerStrings';
import { BackendError, IImageServiceResponse } from '../models/IContracts';

export interface IGenerateErrorInfo {
  title: string;
  body?: string;
  kind: 'content_safety' | 'quota' | 'invalid_prompt' | 'unknown';
}

// Mirrors the public diagnostic fields emitted by the image Function.
const PROVIDER_CODES = new Set([
  'content_safety_violation', 'content_policy_violation', 'content_filter', 'ResponsibleAIPolicyViolation',
  'BadRequest', 'invalid_request_error', 'unsupported_parameter', 'rate_limit_exceeded', 'TooManyRequests',
]);
const OUTPUT_DIAGNOSTIC = 'Output content violated safety policies. Violation categories: disallowed.';
const REQUEST_ID = /^(?:[\da-f]{32}|[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12})$/i;
const OUTPUT_MESSAGE = 'Foundry blocked the generated image. No image was returned.';
const SERVICE_MESSAGES = new Set([
  'Foundry rejected the background setting. Turn off Transparent background and try again.',
  'This deployment does not support transparent backgrounds.',
  'Foundry rejected the requested image size. Choose another size and try again.',
  'Foundry rejected the prompt. Shorten or rephrase it and try again.',
  'Foundry rejected the image request (HTTP 400). Contact support if the issue persists.',
  'Foundry could not authorize the image service. Contact your administrator.',
  'The image service is temporarily unavailable. Retry in a moment.',
  'The image service could not complete the request. Contact support if the issue persists.',
]);
const VALIDATION_MESSAGES = new Set([
  'Request body must be a JSON object', 'Request body must be valid JSON',
  'prompt (string, non-empty) is required', 'prompt must be ≤ 4000 characters',
  'brandSlang must be a string', 'brandSlang must be ≤ 2000 characters',
  'n must be an integer', 'transparentBackground must be a boolean',
  'Refinement accepts only instruction and imageBase64',
  'Unexpected field in image edit', 'The selection guide must match the source image dimensions',
  'instruction must be non-empty text of at most 4000 characters',
  'imageBase64 must contain one base64-encoded PNG of at most 36 MiB',
  'imageBase64 must contain bare PNG base64', 'imageBase64 must be a PNG with a valid header',
  'The source PNG must contain between 1 and 4194304 pixels', 'The PNG is missing image data or is incomplete',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function safeServiceResponse(value: unknown): IImageServiceResponse | undefined {
  if (!isRecord(value)) return undefined;
  const status = value.httpStatus;
  if (typeof status !== 'number' || !Number.isInteger(status) || status < 400 || status > 599) return undefined;
  const result: IImageServiceResponse = { httpStatus: status };
  if (typeof value.providerCode === 'string' && PROVIDER_CODES.has(value.providerCode)) result.providerCode = value.providerCode;
  if (value.stage === 'input' || value.stage === 'output') result.stage = value.stage;
  if (value.category === 'disallowed') result.category = value.category;
  if (value.message === OUTPUT_DIAGNOSTIC) result.message = OUTPUT_DIAGNOSTIC;
  if (typeof value.requestId === 'string' && REQUEST_ID.test(value.requestId)) result.requestId = value.requestId;
  return result;
}

function primaryFailure(body: Record<string, unknown>): Record<string, unknown> {
  const failures = Array.isArray(body.partialErrors) ? body.partialErrors.slice(0, 16).filter(isRecord) : [];
  const withResponse = failures.find((failure) => safeServiceResponse(failure.serviceResponse));
  if (withResponse) return withResponse;
  if (safeServiceResponse(body.serviceResponse)) return body;
  return failures.find((failure) => typeof failure.message === 'string' || typeof failure.code === 'string') || body;
}

export function getImageServiceResponse(err: BackendError): IImageServiceResponse | undefined {
  return isRecord(err?.body) ? safeServiceResponse(primaryFailure(err.body).serviceResponse) : undefined;
}

export function describeGenerateError(err: BackendError, serviceResponse = getImageServiceResponse(err)): IGenerateErrorInfo {
  const body = isRecord(err?.body) ? err.body : {};
  const failure = primaryFailure(body);
  const raw = typeof failure.message === 'string' ? failure.message : '';
  const code = failure.code || err?.code;
  if (err?.status === 400 && body.error === 'Validation error') {
    const known = VALIDATION_MESSAGES.has(raw) || /^n must be between 1 and \d{1,3}$/.test(raw) ||
      /^size must be one of \[\d{3,4}x\d{3,4}(?:, \d{3,4}x\d{3,4}){0,9}\]$/.test(raw);
    return { title: strings.ToastGenerateFailed, body: known ? raw : undefined, kind: 'unknown' };
  }
  if (!err?.status && typeof err?.message === 'string' && /failed to fetch|load failed|network\s?(?:request failed|error)/i.test(err.message.slice(0, 300))) {
    return { title: strings.ToastGenerateFailed, body: strings.ToastConnectionFailed, kind: 'unknown' };
  }
  const [message, idSuffix] = raw.slice(0, 1024).split(' Request ID: ');
  const id = idSuffix?.replace(/\.$/, '');
  const oldReference = id && REQUEST_ID.test(id) && id !== serviceResponse?.requestId
    ? strings.ServiceRequestId.replace('{0}', id) : undefined;
  const lower = message.toLowerCase();

  if (code === 'output_content_filtered' || message === OUTPUT_MESSAGE || serviceResponse?.message === OUTPUT_DIAGNOSTIC) {
    return { title: strings.ToastOutputBlocked, body: oldReference, kind: 'content_safety' };
  }
  if (code === 'content_policy_violation' || lower.includes('content_safety_violation') ||
      lower.includes('content_policy_violation') || lower.includes('safety policies')) {
    return { title: strings.ToastContentSafetyTitle, body: strings.ToastContentSafetyBody, kind: 'content_safety' };
  }
  if ((serviceResponse?.httpStatus || err?.status) === 429 || code === 'rate_limit_exceeded' || lower.includes('billing_hard_limit') ||
      lower.includes('rate limit') || lower.includes('quota')) {
    return { title: strings.ToastQuotaError, kind: 'quota' };
  }
  if (code === 'invalid_prompt' || lower.includes('invalid_prompt') || lower.includes('invalid_request_error')) {
    return { title: strings.ToastInvalidPrompt, body: oldReference, kind: 'invalid_prompt' };
  }
  // Older Function versions return only a short explanation. Keep known
  // explanations and references without displaying arbitrary exception text.
  const safeBody = [SERVICE_MESSAGES.has(message) ? message : undefined, oldReference].filter(Boolean).join(' ');
  return { title: strings.ToastGenerateFailed, body: safeBody || undefined, kind: 'unknown' };
}
