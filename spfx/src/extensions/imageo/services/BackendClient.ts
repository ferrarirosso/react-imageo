import { AadHttpClient, AadHttpClientFactory, HttpClientResponse } from '@microsoft/sp-http';
import { IImageoEndpoints } from '../utils/env';
import { logger } from '../utils/logger';
import {
  IGenerateRequest,
  IGenerateResponse,
  IRefineRequest,
  IRefineResponse,
  ISuggestInstructionRequest,
  ISuggestInstructionResponse,
  IAnalyzeRequest,
  IAnalyzeResponse,
  IDistillRequest,
  IDistillResponse,
  BackendError,
} from '../models/IContracts';

export class BackendClient {
  private readonly factory: AadHttpClientFactory;
  private readonly endpoints: IImageoEndpoints;
  private clientPromise: Promise<AadHttpClient> | undefined;

  public constructor(factory: AadHttpClientFactory, endpoints: IImageoEndpoints) {
    this.factory = factory;
    this.endpoints = endpoints;
  }

  private async getClient(): Promise<AadHttpClient> {
    if (!this.clientPromise) {
      this.clientPromise = this.factory.getClient(this.endpoints.endpointAppId);
    }
    return this.clientPromise;
  }

  public async generate(
    req: IGenerateRequest,
    signal?: AbortSignal
  ): Promise<IGenerateResponse> {
    return this.post<IGenerateResponse>(this.endpoints.endpointGenerate, req, 'generate', signal);
  }

  public async refine(req: IRefineRequest, signal?: AbortSignal): Promise<IRefineResponse> {
    return this.post<IRefineResponse>(this.endpoints.endpointRefine, req, 'refine', signal);
  }

  public suggestInstruction(req: ISuggestInstructionRequest, signal: AbortSignal): Promise<ISuggestInstructionResponse> {
    return this.post<ISuggestInstructionResponse>(this.endpoints.endpointSuggestInstruction, req, 'suggest instruction', signal);
  }

  private async post<T>(
    url: string, req: IGenerateRequest | IRefineRequest | ISuggestInstructionRequest, label: string, signal?: AbortSignal
  ): Promise<T> {
    const client = await this.getClient();
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const res = await client.post(url, AadHttpClient.configurations.v1, {
      body: JSON.stringify(req),
      signal,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    });
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return this.parseJson<T>(res, label);
  }

  public async analyze(req: IAnalyzeRequest): Promise<IAnalyzeResponse> {
    const client = await this.getClient();
    const res = await client.post(this.endpoints.endpointAnalyze, AadHttpClient.configurations.v1, {
      body: JSON.stringify(req),
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    });
    return this.parseJson<IAnalyzeResponse>(res, 'analyze');
  }

  public async distill(req: IDistillRequest): Promise<IDistillResponse> {
    const client = await this.getClient();
    const res = await client.post(this.endpoints.endpointDistill, AadHttpClient.configurations.v1, {
      body: JSON.stringify(req),
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    });
    return this.parseJson<IDistillResponse>(res, 'distill');
  }

  private async parseJson<T>(res: HttpClientResponse, label: string): Promise<T> {
    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = await res.text().catch(() => '');
      }
      const code = (body as { error?: string; code?: string })?.code;
      const message = (body as { message?: string })?.message || `${label} request failed (${res.status})`;
      logger.error(`${label} failed`, res.status);
      throw new BackendError(message, res.status, code, body);
    }
    return (await res.json()) as T;
  }
}
