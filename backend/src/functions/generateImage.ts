import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getUserContext, requireAuth } from '../middleware/auth';
import {
  validateGenerateRequest,
  validationErrorResponse,
  sanitizedErrorResponse,
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

  try {
    const body = await request.json();
    const parsed = validateGenerateRequest(body);

    context.log(
      `[generateImage] user=${user.userPrincipalName || 'anon'} n=${parsed.n} ` +
      `size=${parsed.size} promptLen=${parsed.prompt.length}`
    );

    const { images, partialErrors } = await generateImages(
      parsed.prompt,
      parsed.brandSlang,
      parsed.n as number,
      parsed.size as ImageSize
    );

    if (images.length === 0) {
      return {
        status: 502,
        jsonBody: {
          error: 'All generations failed',
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
    context.error('[generateImage] error', err);
    return sanitizedErrorResponse(err);
  }
}

app.http('generateImage', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'generate-image',
  handler: generateImage,
});
