import type { RequestHandler } from 'express';
import type { Role } from '../generated/enums.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { Errors } from '../lib/errors.js';

type AuthUser = { id: string; role: Role; email: string };
declare module 'express-serve-static-core' {
  interface Request { user?: AuthUser; }
}

export const verifyJwt: RequestHandler = async (req, _res, next) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return next(Errors.unauthenticated('Missing Bearer token'));
  try {
    const claims = await verifyAccessToken(header.slice('Bearer '.length).trim());
    req.user = { id: claims.sub, role: claims.role, email: claims.email };
    next();
  } catch {
    next(Errors.unauthenticated('Invalid or expired token'));
  }
};

export const requireRole = (role: Role): RequestHandler => (req, _res, next) => {
  if (!req.user) return next(Errors.unauthenticated());
  if (req.user.role !== role) return next(Errors.forbidden(`Requires role ${role}`));
  next();
};