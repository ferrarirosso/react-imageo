import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getUserContext, requireAuth } from '../middleware/auth';
import { validateRefineRequest, ValidationError, validationErrorResponse } from '../middleware/validation';
import { refineImage, toToastMessage } from '../services/imageGen.service';

export async function refineImageFn(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const authFail = requireAuth(getUserContext(request));
  if (authFail) return authFail;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse(new ValidationError('Request body must be valid JSON'));
  }

  try {
    const { png, guide, instruction } = validateRefineRequest(body);
    const image = await refineImage(png, instruction, guide);
    return { status: 200, jsonBody: { image } };
  } catch (err) {
    if (err instanceof ValidationError) return validationErrorResponse(err);
    const { status, ...failure } = toToastMessage(err);
    context.error(`[refineImage] ${failure.code}`);
    return {
      status,
      jsonBody: { error: 'Image refinement failed', ...failure },
    };
  }
}

app.http('refineImage', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'refine-image',
  handler: refineImageFn,
});
