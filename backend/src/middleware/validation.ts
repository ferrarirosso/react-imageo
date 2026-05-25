/**
 * Lightweight request validation — no external dependencies.
 */

import {
  GenerateImageRequest,
  AnalyzePageRequest,
  DistillScopeRequest,
  ImageSize,
} from '../types/contracts';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const ALLOWED_SIZES: ImageSize[] = ['1024x1024', '1792x1024', '1024x1792'];

export function validateGenerateRequest(body: unknown): GenerateImageRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a JSON object');
  }
  const b = body as Record<string, unknown>;

  if (typeof b.prompt !== 'string' || b.prompt.trim().length === 0) {
    throw new ValidationError('prompt (string, non-empty) is required');
  }
  if (b.prompt.length > 4000) {
    throw new ValidationError('prompt must be ≤ 4000 characters');
  }
  if (b.brandSlang !== undefined && typeof b.brandSlang !== 'string') {
    throw new ValidationError('brandSlang must be a string');
  }
  if (b.brandSlang && (b.brandSlang as string).length > 2000) {
    throw new ValidationError('brandSlang must be ≤ 2000 characters');
  }

  let n = 1;
  if (b.n !== undefined) {
    if (typeof b.n !== 'number' || !Number.isInteger(b.n)) {
      throw new ValidationError('n must be an integer');
    }
    n = b.n;
  }
  const maxN = Number(process.env.IMAGE_MAX_N || 6);
  if (n < 1 || n > maxN) {
    throw new ValidationError(`n must be between 1 and ${maxN}`);
  }

  let size: ImageSize = '1024x1024';
  if (b.size !== undefined) {
    if (typeof b.size !== 'string' || !ALLOWED_SIZES.includes(b.size as ImageSize)) {
      throw new ValidationError(`size must be one of [${ALLOWED_SIZES.join(', ')}]`);
    }
    size = b.size as ImageSize;
  }

  return {
    prompt: (b.prompt as string).trim(),
    brandSlang: typeof b.brandSlang === 'string' ? (b.brandSlang as string).trim() : undefined,
    n,
    size,
  };
}

export function validateAnalyzeRequest(body: unknown): AnalyzePageRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a JSON object');
  }
  const b = body as Record<string, unknown>;

  if (b.intent !== 'propose-image-prompts') {
    throw new ValidationError("intent must be 'propose-image-prompts'");
  }

  if (!Array.isArray(b.sections) || b.sections.length === 0) {
    throw new ValidationError('sections must be a non-empty array');
  }
  if (b.sections.length > 50) {
    throw new ValidationError('sections must contain ≤ 50 entries');
  }

  const sections = b.sections.map((raw, idx) => {
    if (!raw || typeof raw !== 'object') {
      throw new ValidationError(`sections[${idx}] must be an object`);
    }
    const s = raw as Record<string, unknown>;
    if (typeof s.id !== 'string' || !s.id) {
      throw new ValidationError(`sections[${idx}].id is required`);
    }
    if (typeof s.text !== 'string') {
      throw new ValidationError(`sections[${idx}].text must be a string`);
    }
    if ((s.text as string).length > 8000) {
      throw new ValidationError(`sections[${idx}].text must be ≤ 8000 characters`);
    }
    return {
      id: s.id,
      heading: typeof s.heading === 'string' ? s.heading : undefined,
      text: s.text as string,
    };
  });

  return {
    intent: 'propose-image-prompts',
    sections,
    pageTitle: typeof b.pageTitle === 'string' ? b.pageTitle : undefined,
  };
}

export function validateDistillRequest(body: unknown): DistillScopeRequest {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body must be a JSON object');
  }
  const b = body as Record<string, unknown>;

  if (b.scope !== 'page' && b.scope !== 'section') {
    throw new ValidationError("scope must be 'page' or 'section'");
  }
  if (!Array.isArray(b.sections) || b.sections.length === 0) {
    throw new ValidationError('sections must be a non-empty array');
  }
  if (b.sections.length > 50) {
    throw new ValidationError('sections must contain ≤ 50 entries');
  }

  let totalTextLength = 0;
  const sections = b.sections.map((raw, idx) => {
    if (!raw || typeof raw !== 'object') {
      throw new ValidationError(`sections[${idx}] must be an object`);
    }
    const s = raw as Record<string, unknown>;
    if (typeof s.id !== 'string' || !s.id) {
      throw new ValidationError(`sections[${idx}].id is required`);
    }
    if (typeof s.text !== 'string') {
      throw new ValidationError(`sections[${idx}].text must be a string`);
    }
    if ((s.text as string).length > 8000) {
      throw new ValidationError(`sections[${idx}].text must be ≤ 8000 characters`);
    }
    totalTextLength += (s.text as string).length;
    return {
      id: s.id,
      heading: typeof s.heading === 'string' ? s.heading : undefined,
      text: s.text as string,
      stats: (s.stats && typeof s.stats === 'object') ? s.stats as DistillScopeRequest['sections'][number]['stats'] : undefined,
    };
  });

  // Aggregate guard: per-section caps still allow 50×8000 = 400 KB. Cap the
  // combined section text so a single distill call can't be used to push an
  // oversized prompt to the model.
  if (totalTextLength > 60_000) {
    throw new ValidationError('Combined section text must be ≤ 60000 characters');
  }

  let pageContext: DistillScopeRequest['pageContext'];
  if (b.pageContext && typeof b.pageContext === 'object') {
    const pc = b.pageContext as Record<string, unknown>;
    const palette = (pc.palette && typeof pc.palette === 'object')
      ? pc.palette as DistillScopeRequest['pageContext'] extends infer T
        ? T extends { palette?: infer P } ? P : never : never
      : undefined;
    const layoutType = typeof pc.layoutType === 'string'
      ? pc.layoutType as NonNullable<DistillScopeRequest['pageContext']>['layoutType']
      : undefined;
    pageContext = {
      palette,
      layoutType,
      hasHeroImage: typeof pc.hasHeroImage === 'boolean' ? pc.hasHeroImage : undefined,
    };
  }

  let locale: string | undefined;
  if (typeof b.locale === 'string' && b.locale.length > 0 && b.locale.length <= 10 && /^[a-z]{2}(-[a-z]{2,4})?$/i.test(b.locale)) {
    locale = b.locale;
  }

  return {
    scope: b.scope as 'page' | 'section',
    pageTitle: typeof b.pageTitle === 'string' ? b.pageTitle : undefined,
    sections,
    pageContext,
    locale,
  };
}

export function validationErrorResponse(err: ValidationError) {
  return {
    status: 400,
    jsonBody: { error: 'Validation error', message: err.message },
  };
}

export function sanitizedErrorResponse(err: unknown) {
  const isProd = !!process.env.WEBSITE_SITE_NAME;
  const message = err instanceof Error ? err.message : 'Unknown error';
  return {
    status: 500,
    jsonBody: {
      error: 'Internal server error',
      message: isProd ? 'An unexpected error occurred' : message,
    },
  };
}
