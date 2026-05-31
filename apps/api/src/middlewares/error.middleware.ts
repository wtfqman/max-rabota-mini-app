import type { ErrorRequestHandler } from 'express';
import { logger } from '@rabst24/config';
import { AppError } from '@rabst24/shared';
import { ZodError } from 'zod';

export const errorMiddleware: ErrorRequestHandler = (error, request, response, next) => {
  void next;
  const requestLogger = request.log ?? logger;

  if (shouldLogAsServerError(error)) {
    requestLogger.error(
      {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof AppError ? error.details : undefined
      },
      'Unhandled HTTP error'
    );
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        message: error.message,
        details: error.details
      }
    });
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        message: 'Validation Error',
        details: error.flatten()
      }
    });
    return;
  }

  response.status(500).json({
    error: {
      message: 'Internal Server Error'
    }
  });
};

function shouldLogAsServerError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.statusCode >= 500;
  }

  if (error instanceof ZodError) {
    return false;
  }

  return true;
}
