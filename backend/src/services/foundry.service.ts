/**
 * Foundry client factory.
 * Production: Managed Identity via DefaultAzureCredential.
 * Local dev: API key fallback.
 *
 * Two client variants — one per api-version — because image and chat
 * endpoints evolve independently on Azure OpenAI / AI Foundry.
 */

import { AzureOpenAI } from 'openai';
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

function buildClient(apiVersion: string): AzureOpenAI {
  const endpoint = getEndpoint();

  if (isRunningInAzure()) {
    const azureADTokenProvider = getBearerTokenProvider(
      new DefaultAzureCredential(),
      AZURE_OPENAI_SCOPE
    );
    return new AzureOpenAI({ endpoint, apiVersion, azureADTokenProvider });
  }

  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'AZURE_OPENAI_API_KEY required for local dev (run `npm run setup` at repo root).'
    );
  }
  return new AzureOpenAI({ endpoint, apiVersion, apiKey });
}

export function getImageClient(): AzureOpenAI {
  return buildClient(process.env.AZURE_OPENAI_API_VERSION_IMAGE || '2025-04-01-preview');
}

export function getChatClient(): AzureOpenAI {
  // Role "analyze" in deploy.config.json → AZURE_OPENAI_API_VERSION_ANALYZE.
  // Fall back to the legacy _CHAT name for older local.settings.json files.
  return buildClient(
    process.env.AZURE_OPENAI_API_VERSION_ANALYZE ||
    process.env.AZURE_OPENAI_API_VERSION_CHAT ||
    '2024-10-21'
  );
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
