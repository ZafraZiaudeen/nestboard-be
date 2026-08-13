import type { RequestHandler } from "express";
import type { z } from "zod";
//this function returns a middleware function that validates the request body against the provided Zod schema.
//  If the validation passes, it assigns the parsed body to req.body and calls next() to proceed to the next middleware or route handler.
// If the validation fails, it will throw an error, which can be handled by an error-handling middleware.
export function validateBody<S extends z.ZodType>(schema: S): RequestHandler {
  return (req, res, next) => {
    req.body = schema.parse(req.body);
    next();
  };
}

export function validateParams<S extends z.ZodType>(schema: S): RequestHandler {
  return (req, _res, next) => {
    req.params = schema.parse(req.params) as never;
    next();
  };
}
