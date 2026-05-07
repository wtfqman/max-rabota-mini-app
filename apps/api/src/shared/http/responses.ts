import type { Response } from 'express';

export interface ApiSuccessResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export function sendOk<T>(
  response: Response,
  data: T,
  meta?: Record<string, unknown>
): void {
  response.status(200).json(buildResponse(data, meta));
}

export function sendCreated<T>(response: Response, data: T): void {
  response.status(201).json(buildResponse(data));
}

export function sendAccepted<T>(response: Response, data: T): void {
  response.status(202).json(buildResponse(data));
}

export function sendNoContent(response: Response): void {
  response.status(204).send();
}

function buildResponse<T>(data: T, meta?: Record<string, unknown>): ApiSuccessResponse<T> {
  return meta ? { data, meta } : { data };
}
