import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getUserContext, requireAuth } from '../middleware/auth';
import {
  validateGenerateRequest,
  validationErrorResponse,
  ValidationError,
} from '../middleware/validation';
import { generateImages } from '../services/imageGen.service';
import { ImageSize } from '../types/contracts';

export async function generateImage(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUserContext(request);
  const authFail = requireAuth(user);
  if (authFail) return authFail;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse(new ValidationError('Request body must be valid JSON'));
  }

  try {
    const parsed = validateGenerateRequest(body);

    context.log(
      `[generateImage] n=${parsed.n} ` +
      `size=${parsed.size} promptLen=${parsed.prompt.length}`
    );

    const { images, partialErrors, failureStatus } = await generateImages(
      parsed.prompt,
      parsed.brandSlang,
      parsed.n as number,
      parsed.size as ImageSize,
      parsed.transparentBackground
    );

    if (images.length === 0) {
      const [first] = partialErrors;
      const sameCause = first && partialErrors.every(error => error.code === first.code);
      // Only attach a single service response to the batch when it applies to
      // every failure, including the request ID if Foundry supplied one.
      const firstResponse = first?.serviceResponse;
      const sameResponse = sameCause && firstResponse && partialErrors.every(
        error => JSON.stringify(error.serviceResponse) === JSON.stringify(firstResponse)
      );
      return {
        status: failureStatus,
        jsonBody: {
          error: 'All generations failed',
          ...(sameCause ? { code: first.code, message: first.message } : {}),
          ...(sameResponse ? { serviceResponse: firstResponse } : {}),
          partialErrors,
        },
      };
    }

    return {
      status: 200,
      jsonBody: {
        images,
        ...(partialErrors.length > 0 ? { partialErrors } : {}),
      },
    };
  } catch (err) {
    if (err instanceof ValidationError) {
      return validationErrorResponse(err);
    }
    context.error('[generateImage] Unexpected generation error');
    return { status: 500, jsonBody: { error: 'Image generation failed' } };
  }
}

app.http('generateImage', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'generate-image',
  handler: generateImage,
});
