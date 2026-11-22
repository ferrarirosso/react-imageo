/**
 * Foundry client factory.
 * Production: Managed Identity via DefaultAzureCredential.
 * Local dev: API key fallback.
 *
 * Chat uses Azure OpenAI v1. Explicit dated API versions use the deployment URL.
 */

import OpenAI, { AzureOpenAI } from 'openai';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';

const AZURE_OPENAI_SCOPE = 'https://cognitiveservices.azure.com/.default';

function isRunningInAzure(): boolean {
  return !!process.env.WEBSITE_SITE_NAME;
}

function getEndpoint(): string {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  if (!endpoint) {
    throw new Error('AZURE_OPENAI_ENDPOINT is not configured');
  }
  return endpoint.replace(/\/+$/, '');
}

function getCredential(scope: string): string | (() => Promise<string>) {
  if (isRunningInAzure()) {
    return getBearerTokenProvider(new DefaultAzureCredential(), scope);
  }

  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'AZURE_OPENAI_API_KEY required for local dev (run `npm run setup` at repo root).'
    );
  }
  return apiKey;
}

function buildClient(apiVersion: string): AzureOpenAI {
  const endpoint = getEndpoint();
  const credential = getCredential(AZURE_OPENAI_SCOPE);
  return typeof credential === 'string'
    ? new AzureOpenAI({ endpoint, apiVersion, apiKey: credential })
    : new AzureOpenAI({ endpoint, apiVersion, azureADTokenProvider: credential });
}

export function getImageClient(): AzureOpenAI {
  return buildClient(process.env.AZURE_OPENAI_API_VERSION_IMAGE || '2025-04-01-preview');
}

export function getChatClient(): OpenAI {
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION_ANALYZE || process.env.AZURE_OPENAI_API_VERSION_CHAT;
  if (apiVersion && apiVersion !== 'v1') return buildClient(apiVersion);

  // The deployer returns the Cognitive Services resource URL. Azure OpenAI v1
  // uses the Foundry services host and reads the deployment name from the body.
  const endpoint = getEndpoint().replace(/\.cognitiveservices\.azure\.com$/i, '.services.ai.azure.com');
  return new OpenAI({
    baseURL: `${endpoint}/openai/v1`,
    apiKey: getCredential('https://ai.azure.com/.default'),
  });
}

export function getImageDeployment(): string {
  const d = process.env.AZURE_OPENAI_DEPLOYMENT_IMAGE;
  if (!d) throw new Error('AZURE_OPENAI_DEPLOYMENT_IMAGE is not configured');
  return d;
}

export function getAnalyzeDeployment(): string {
  const d = process.env.AZURE_OPENAI_DEPLOYMENT_ANALYZE;
  if (!d) throw new Error('AZURE_OPENAI_DEPLOYMENT_ANALYZE is not configured');
  return d;
}
