export type ErrorCode = 'VALIDATION_ERROR' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL';

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(args: { status: number; code: ErrorCode; message: string; details?: unknown }) {
    super(args.message);
    this.status = args.status;
    this.code = args.code;
    this.details = args.details;
  }
}

export const Errors = {
  validation: (message: string, details?: unknown) =>
    new AppError({ status: 422, code: 'VALIDATION_ERROR', message, details }),
  unauthenticated: (message = 'Authentication required') =>
    new AppError({ status: 401, code: 'UNAUTHENTICATED', message }),
  forbidden: (resource: string) =>
    new AppError({ status: 403, code: 'FORBIDDEN', message: `Forbidden: ${resource}` }),
  notFound: (resource: string) =>
    new AppError({ status: 404, code: 'NOT_FOUND', message: `${resource} not found` }),
  conflict: (message: string) =>
    new AppError({ status: 409, code: 'CONFLICT', message }),
};