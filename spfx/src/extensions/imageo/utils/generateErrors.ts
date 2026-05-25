import * as strings from 'ImageoApplicationCustomizerStrings';
import { BackendError, IPartialError } from '../models/IContracts';

export interface IGenerateErrorInfo {
  title: string;
  body?: string;
  kind: 'content_safety' | 'quota' | 'invalid_prompt' | 'unknown';
}

function firstPartialMessage(err: BackendError): string {
  const body = err.body as { partialErrors?: IPartialError[]; message?: string } | undefined;
  const partial = body?.partialErrors?.[0]?.message;
  if (partial) return partial;
  return body?.message || err.message || '';
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function describeGenerateError(err: BackendError): IGenerateErrorInfo {
  const raw = firstPartialMessage(err);
  const lower = raw.toLowerCase();

  if (lower.includes('content_safety_violation') || lower.includes('content_policy_violation') || lower.includes('safety policies')) {
    return {
      title: strings.ToastContentSafetyTitle,
      body: strings.ToastContentSafetyBody,
      kind: 'content_safety',
    };
  }
  if (err.status === 429 || lower.includes('billing_hard_limit') || lower.includes('rate limit') || lower.includes('quota')) {
    return {
      title: strings.ToastQuotaError,
      kind: 'quota',
    };
  }
  if (lower.includes('invalid_prompt') || lower.includes('invalid_request_error')) {
    return {
      title: strings.ToastInvalidPrompt,
      body: raw ? truncate(raw, 240) : undefined,
      kind: 'invalid_prompt',
    };
  }
  return {
    title: strings.ToastGenerateFailed,
    body: raw ? truncate(raw, 240) : undefined,
    kind: 'unknown',
  };
}
