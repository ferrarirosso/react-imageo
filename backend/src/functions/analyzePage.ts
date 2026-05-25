import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getUserContext, requireAuth } from '../middleware/auth';
import {
  validateAnalyzeRequest,
  validationErrorResponse,
  sanitizedErrorResponse,
  ValidationError,
} from '../middleware/validation';
import { analyzePage } from '../services/analyze.service';

export async function analyzePageFn(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const user = getUserContext(request);
  const authFail = requireAuth(user);
  if (authFail) return authFail;

  try {
    const body = await request.json();
    const parsed = validateAnalyzeRequest(body);

    context.log(
      `[analyzePage] user=${user.userPrincipalName || 'anon'} sections=${parsed.sections.length}`
    );

    const sections = await analyzePage(parsed.sections, parsed.pageTitle);

    return {
      status: 200,
      jsonBody: { sections },
    };
  } catch (err) {
    if (err instanceof ValidationError) {
      return validationErrorResponse(err);
    }
    context.error('[analyzePage] error', err);
    return sanitizedErrorResponse(err);
  }
}

app.http('analyzePage', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'analyze-page',
  handler: analyzePageFn,
});
