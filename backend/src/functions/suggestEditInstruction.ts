import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getUserContext, requireAuth } from '../middleware/auth';
import { validateSuggestEditInstruction, ValidationError, validationErrorResponse } from '../middleware/validation';
import { suggestEditInstruction } from '../services/suggestEditInstruction.service';
import { SuggestEditInstructionResponse } from '../types/contracts';

// Allows JSON escapes for every permitted character while rejecting image-sized uploads before parsing.
const MAX_JSON_BYTES = 48 * 1024;

export async function suggestEditInstructionFn(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const unauthorized = requireAuth(getUserContext(request));
  if (unauthorized) return unauthorized;
  const tooLarge = { status: 413, jsonBody: { error: 'Suggestion request is too large' } };
  if (Number(request.headers.get('content-length')) > MAX_JSON_BYTES) return tooLarge;
  let body: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > MAX_JSON_BYTES) return tooLarge;
    body = JSON.parse(raw);
  } catch {
    return validationErrorResponse(new ValidationError('Request body must be valid JSON'));
  }
  try {
    const parsed = validateSuggestEditInstruction(body);
    const jsonBody: SuggestEditInstructionResponse = { suggestion: await suggestEditInstruction(parsed) };
    return { status: 200, jsonBody };
  } catch (err) {
    if (err instanceof ValidationError) return validationErrorResponse(err);
    // Provider error payloads and JSON parse errors can contain the author's private text.
    context.error('[suggestEditInstruction] suggestion unavailable');
    const limited = typeof err === 'object' && err !== null && 'status' in err && err.status === 429;
    return { status: limited ? 429 : 502, jsonBody: { error: 'Suggestion unavailable', message: 'Could not suggest an edit instruction. Try again.' } };
  }
}

app.http('suggestEditInstruction', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'suggest-edit-instruction',
  handler: suggestEditInstructionFn,
});
