import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { config } from '@rabst24/config';
import { AppError } from '@rabst24/shared';

interface SessionClaims {
  sub: string;
  role: string;
  type: string;
  iat: number;
  exp: number;
}

export const requireAuth: RequestHandler = (request, _response, next) => {
  try {
    const header = request.header('authorization');

    if (!header?.startsWith('Bearer ')) {
      throw new AppError('Authentication required', 401);
    }

    const claims = verifySessionToken(header.slice('Bearer '.length));

    request.auth = {
      userId: claims.sub,
      role: claims.role
    };

    next();
  } catch (error) {
    next(error);
  }
};

export function requireRole(roles: string[]): RequestHandler {
  return (request, _response, next) => {
    try {
      if (!request.auth) {
        throw new AppError('Authentication required', 401);
      }

      if (!roles.includes(request.auth.role)) {
        throw new AppError('Forbidden', 403, {
          requiredRoles: roles
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

function verifySessionToken(token: string): SessionClaims {
  const [encodedHeader, encodedPayload, signature] = token.split('.');

  if (!encodedHeader || !encodedPayload || !signature) {
    throw new AppError('Invalid session token', 401);
  }

  const expectedSignature = createHmac('sha256', config.session.secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  if (!safeCompare(signature, expectedSignature)) {
    throw new AppError('Invalid session token signature', 401);
  }

  const claims = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SessionClaims;

  if (claims.type !== 'max-mini-app' || !claims.sub || claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new AppError('Session expired', 401);
  }

  return claims;
}

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
