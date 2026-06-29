import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './types.js';

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const logger = request.log;

  if (error instanceof AppError) {
    logger.warn({ err: error, code: error.code }, error.message);
    return reply.status(error.statusCode).send({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    });
  }

  // Fastify validation errors (from route schema)
  const fastifyError = error as FastifyError;
  if (fastifyError.validation) {
    logger.warn({ err: error }, 'Request validation failed');
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: fastifyError.validation,
      },
    });
  }

  logger.error({ err: error }, 'Unhandled error');
  return reply.status(500).send({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
