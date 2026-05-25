import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getUserContext, requireAuth } from '../middleware/auth';
import {
  validateDistillRequest,
  validationErrorResponse,
  sanitizedErrorResponse,
  ValidationError,
} from '../middleware/validation';
import { distillScope } from '../services/distill.service';

export async function distillScopeFn(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUserContext(request);
  const authFail = requireAuth(user);
  if (authFail) return authFail;

  try {
    const body = await request.json();
    const parsed = validateDistillRequest(body);

    context.log(
      `[distillScope] user=${user.userPrincipalName || 'anon'} scope=${parsed.scope} ` +
      `sections=${parsed.sections.length}`
    );

    const result = await distillScope(parsed);
    return { status: 200, jsonBody: result };
  } catch (err) {
    if (err instanceof ValidationError) return validationErrorResponse(err);
    context.error('[distillScope] error', err);
    return sanitizedErrorResponse(err);
  }
}

app.http('distillScope', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'distill-scope',
  handler: distillScopeFn,
});
