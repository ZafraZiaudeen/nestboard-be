import type { ErrorRequestHandler } from "express";
import { AppError } from "../lib/errors.js";
import { z, ZodError } from "zod";
import { logger } from "../lib/logger.js";
// This middleware function handles errors that occur during request processing. 
// It checks the type of error and responds with an appropriate HTTP status code and error message.
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
    if (err instanceof AppError) {
        res.status(err.status).json({
            error: {
                code: err.code,
                message: err.message,
                ...(err.details ? {details: err.details } : {})
            }
        })
        return;
    };
    if (err instanceof ZodError) {
        res.status(422).json({
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Request validation failed',
                details: z.flattenError(err)
            }
        })
        return;
    }
    // Unknown errors (not Zod or App errors)
    logger.error({ err }, 'Unhandled error');
    res.status(500).json({
        error: { code: 'INTERNAL', message: 'Internal server error'}
    });
}