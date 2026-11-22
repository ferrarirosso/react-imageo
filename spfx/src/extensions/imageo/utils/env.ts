/**
 * Backend wiring is injected at BUILD time by the webpack DefinePlugin patch
 * (config/webpack-patch/env-inject.js), which reads .deploy-output.json (the
 * deployer's output) and replaces the static process.env.SPFX_IMAGEO_*
 * references below with string literals.
 *
 *   SPFX_IMAGEO_BACKEND_URL       e.g. https://<app>.azurewebsites.net/api
 *   SPFX_IMAGEO_BACKEND_RESOURCE  e.g. api://<backend-aad-app-id>
 *
 * Flow: deploy -> build. No separate wiring step.
 */

declare const process: { env: { [key: string]: string | undefined } };

export interface IImageoEndpoints {
  endpointAppId: string;
  endpointGenerate: string;
  endpointRefine: string;
  endpointSuggestInstruction: string;
  endpointAnalyze: string;
  endpointDistill: string;
}

export function resolveEndpoints(
  backendUrl: string | undefined,
  backendApiResource: string | undefined
): IImageoEndpoints {
  const base = (backendUrl || '').replace(/\/+$/, '');
  return {
    endpointAppId: backendApiResource || '',
    endpointGenerate: `${base}/generate-image`,
    endpointRefine: `${base}/refine-image`,
    endpointSuggestInstruction: `${base}/suggest-edit-instruction`,
    endpointAnalyze: `${base}/analyze-page`,
    endpointDistill: `${base}/distill-scope`,
  };
}

export function endpointsConfigured(e: IImageoEndpoints): boolean {
  return Boolean(e.endpointAppId && e.endpointGenerate.startsWith('http'));
}

/**
 * Read the DefinePlugin-injected build-time values. The static member reads
 * are rewritten to string literals when injected; the try/catch keeps a
 * missing-at-build env file from throwing a ReferenceError at runtime.
 */
export function endpointsFromEnv(): IImageoEndpoints {
  let backendUrl: string | undefined;
  let backendApiResource: string | undefined;
  try { backendUrl = process.env.SPFX_IMAGEO_BACKEND_URL; } catch { /* not injected */ }
  try { backendApiResource = process.env.SPFX_IMAGEO_BACKEND_RESOURCE; } catch { /* not injected */ }
  return resolveEndpoints(backendUrl, backendApiResource);
}
