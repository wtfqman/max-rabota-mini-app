import { createHmac } from 'node:crypto';
import type { User } from '@rabst24/db';
import type { AuthSessionPayload } from './auth.types.js';

interface SessionTokenPayload {
  sub: string;
  role: string;
  type: 'max-mini-app';
  iat: number;
  exp: number;
}

export interface SessionTokenOptions {
  secret: string;
  ttlSeconds: number;
}

export class SessionTokenService {
  constructor(private readonly options: SessionTokenOptions) {}

  createAccessSession(user: User): AuthSessionPayload {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + this.options.ttlSeconds;
    const payload: SessionTokenPayload = {
      sub: user.id,
      role: user.role.toLowerCase(),
      type: 'max-mini-app',
      iat: issuedAt,
      exp: expiresAt
    };

    return {
      accessToken: this.sign(payload),
      tokenType: 'Bearer',
      expiresIn: this.options.ttlSeconds,
      expiresAt: new Date(expiresAt * 1000).toISOString()
    };
  }

  private sign(payload: SessionTokenPayload): string {
    const encodedHeader = this.base64Url({
      alg: 'HS256',
      typ: 'JWT'
    });
    const encodedPayload = this.base64Url(payload);
    const signature = createHmac('sha256', this.options.secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  private base64Url(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }
}
