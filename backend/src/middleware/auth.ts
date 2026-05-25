/**
 * Authentication Middleware
 *
 * Extracts user identity from one of two sources (in priority order):
 *   1. EasyAuth headers (`x-ms-client-principal-*`) — injected by the App
 *      Service platform AFTER it validates the AAD token. These are the ONLY
 *      trusted identity source in production: the platform strips any
 *      client-supplied copies, so they can't be spoofed from outside.
 *   2. Bearer JWT — local dev only. `decodeJwtPayload` does NOT verify the
 *      signature, so this branch is deliberately gated behind
 *      `allowDevBearerTokens()` → `!isRunningInAzure()`. It is unreachable in
 *      Azure (where `WEBSITE_SITE_NAME` is always set), so an unsigned/forged
 *      JWT can never authenticate against the deployed backend.
 *
 * No permission checks beyond authenticated tenant user — image generation
 * is open to anyone who can obtain a valid token for our AAD app.
 */

import { HttpRequest } from '@azure/functions';

export interface UserContext {
  userId: string;
  userPrincipalName: string;
  accessToken: string;
  isAuthenticated: boolean;
}

function isTruthy(v: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(v || '');
}

function isRunningInAzure(): boolean {
  return !!process.env.WEBSITE_SITE_NAME;
}

function allowLocalAnonymous(): boolean {
  return !isRunningInAzure() && !isTruthy(process.env.REQUIRE_AUTH);
}

function allowDevBearerTokens(): boolean {
  return !isRunningInAzure() && isTruthy(process.env.ALLOW_DEV_BEARER_TOKENS);
}

function decodeJwtPayload(token: string): { oid?: string; upn?: string; preferred_username?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export function getUserContext(request: HttpRequest): UserContext {
  const userId = request.headers.get('x-ms-client-principal-id') || '';
  const userPrincipalName = request.headers.get('x-ms-client-principal-name') || '';
  const accessToken = request.headers.get('x-ms-token-aad-access-token') || '';

  if (userId) {
    return { userId, userPrincipalName, accessToken, isAuthenticated: true };
  }

  const authHeader = request.headers.get('authorization') || '';
  if (allowDevBearerTokens() && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const claims = decodeJwtPayload(token);
    if (claims?.oid) {
      return {
        userId: claims.oid,
        userPrincipalName: claims.upn || claims.preferred_username || '',
        accessToken: token,
        isAuthenticated: true,
      };
    }
  }

  return {
    userId: '',
    userPrincipalName: 'local-dev@localhost',
    accessToken: '',
    isAuthenticated: false,
  };
}

export function requireAuth(ctx: UserContext): { status: number; jsonBody: object } | null {
  if (!ctx.isAuthenticated && !allowLocalAnonymous()) {
    return {
      status: 401,
      jsonBody: {
        error: 'Authentication required',
        message: 'Provide a valid AAD token via EasyAuth headers (production) or Bearer token (dev with ALLOW_DEV_BEARER_TOKENS=true).',
      },
    };
  }
  return null;
}
