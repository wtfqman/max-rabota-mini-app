import type { RequestHandler } from 'express';

export const notFoundMiddleware: RequestHandler = (request, response) => {
  response.status(404).json({
    error: {
      message: 'Not Found',
      path: request.originalUrl
    }
  });
};
