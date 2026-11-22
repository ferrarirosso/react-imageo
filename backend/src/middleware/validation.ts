/**
 * Lightweight request validation — no external dependencies.
 */

import {
  GenerateImageRequest,
  AnalyzePageRequest,
  DistillScopeRequest,
  SuggestEditInstructionRequest,
  ImageSize,
  IMAGE_SIZES,
} from '../types/contracts';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

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
  // Each image adds one concurrent Foundry request to this batch.
  const maxN = Number(process.env.IMAGE_MAX_N || 2);
  if (n < 1 || n > maxN) {
    throw new ValidationError(`n must be between 1 and ${maxN}`);
  }

  let size: ImageSize = '1024x1024';
  if (b.size !== undefined) {
    if (typeof b.size !== 'string' || !IMAGE_SIZES.includes(b.size as ImageSize)) {
      throw new ValidationError(`size must be one of [${IMAGE_SIZES.join(', ')}]`);
    }
    size = b.size as ImageSize;
  }
  if (b.transparentBackground !== undefined && typeof b.transparentBackground !== 'boolean') {
    throw new ValidationError('transparentBackground must be a boolean');
  }

  return {
    prompt: (b.prompt as string).trim(),
    brandSlang: typeof b.brandSlang === 'string' ? (b.brandSlang as string).trim() : undefined,
    n,
    size,
    transparentBackground: b.transparentBackground,
  };
}

// A full 2048×2048, 16-bit RGBA image needs 32 MiB before PNG encoding.
const MAX_PNG_BYTES = 36 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const PNG_IEND_CRC = 0xae426082;

export function validateRefineRequest(body: unknown): { png: Buffer; guide?: Buffer; instruction: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be a JSON object');
  }
  const b = body as Record<string, unknown>;
  if (Object.keys(b).some(key => !['instruction', 'imageBase64', 'guideBase64'].includes(key))) {
    throw new ValidationError('Unexpected field in image edit');
  }
  if (typeof b.instruction !== 'string' || !b.instruction.trim() || b.instruction.length > 4000) {
    throw new ValidationError('instruction must be non-empty text of at most 4000 characters');
  }
  const png = decodeEditPng(b.imageBase64);
  const guide = b.guideBase64 === undefined ? undefined : decodeEditPng(b.guideBase64);
  if (guide && !png.subarray(16, 24).equals(guide.subarray(16, 24))) {
    throw new ValidationError('The selection guide must match the source image dimensions');
  }
  return { png, guide, instruction: b.instruction.trim() };
}

function decodeEditPng(encoded: unknown): Buffer {
  if (typeof encoded !== 'string' || !encoded.length || encoded.length > 4 * Math.ceil(MAX_PNG_BYTES / 3)) {
    throw new ValidationError('imageBase64 must contain one base64-encoded PNG of at most 36 MiB');
  }
  if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new ValidationError('imageBase64 must contain bare PNG base64');
  }

  const png = Buffer.from(encoded, 'base64');
  if (png.length > MAX_PNG_BYTES) {
    throw new ValidationError('imageBase64 must contain one base64-encoded PNG of at most 36 MiB');
  }
  if (png.length < 45 || !png.subarray(0, 8).equals(PNG_SIGNATURE) ||
      png.readUInt32BE(8) !== 13 || png.toString('latin1', 12, 16) !== 'IHDR') {
    throw new ValidationError('imageBase64 must be a PNG with a valid header');
  }
  const pixels = png.readUInt32BE(16) * png.readUInt32BE(20);
  if (!pixels || pixels > 4_194_304) {
    throw new ValidationError('The source PNG must contain between 1 and 4194304 pixels');
  }
  // Walk the PNG chunks without decompressing pixels. Reject truncated uploads
  // before making a paid edit request. Foundry decodes the image itself.
  let hasImageData = false;
  for (let offset = 33; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > png.length) break;
    const type = png.toString('latin1', offset + 4, offset + 8);
    if (type === 'IDAT' && length) hasImageData = true;
    if (type === 'IEND') {
      if (length === 0 && hasImageData && png.readUInt32BE(end - 4) === PNG_IEND_CRC) {
        // Some saved model outputs include bytes after the complete PNG datastream.
        // Send Foundry only the original chunks through the verified IEND.
        return png.subarray(0, end);
      }
      break;
    }
    offset = end;
  }
  throw new ValidationError('The PNG is missing image data or is incomplete');
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

export function validateSuggestEditInstruction(body: unknown): SuggestEditInstructionRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Expected a JSON object');
  const b = body as Record<string, unknown>;
  if (Object.keys(b).some(key => !['brief', 'actions', 'pageBrief'].includes(key))) {
    throw new ValidationError('Only brief, actions and pageBrief are accepted');
  }
  function text(value: unknown, max: number, field: string): string {
    if (typeof value !== 'string' || value.length > max || /data:image\/|iVBORw0KGgo/i.test(value)) {
      throw new ValidationError(field + ' must be plain text of at most ' + max + ' characters');
    }
    return value.trim();
  }
  const brief = text(b.brief, 1000, 'brief');
  if (b.actions !== undefined && (!Array.isArray(b.actions) || b.actions.length > 8)) {
    throw new ValidationError('actions must be an array of at most 8 items');
  }
  const actions = (b.actions as unknown[] | undefined)?.map(item => text(item, 600, 'action')).filter(Boolean);
  const pageBrief = b.pageBrief === undefined ? undefined : text(b.pageBrief, 1200, 'pageBrief');
  if (!brief && !actions?.length) throw new ValidationError('Enter an edit brief or choose an action');
  return { brief, actions, pageBrief };
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
