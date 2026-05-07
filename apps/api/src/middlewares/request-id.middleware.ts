import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export const requestIdMiddleware: RequestHandler = (request, response, next) => {
  const requestId = request.header('x-request-id') ?? randomUUID();

  response.setHeader('x-request-id', requestId);
  request.id = requestId;

  next();
};
