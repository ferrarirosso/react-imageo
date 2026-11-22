import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

export async function health(
  _request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('Health check');
  return {
    status: 200,
    jsonBody: {
      status: 'healthy',
      service: 'imageo-backend',
      version: '0.5.2',
      timestamp: new Date().toISOString(),
    },
  };
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: health,
});
