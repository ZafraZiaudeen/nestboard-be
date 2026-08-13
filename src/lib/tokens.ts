import { SignJWT, jwtVerify } from "jose";
import { randomBytes, createHash } from "node:crypto";
import { env } from "./env.js";
import type { Role } from "../generated/enums.js";

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

// This file contains functions for generating and verifying JWT access tokens,
// as well as generating and hashing refresh tokens. The access tokens are short-lived and contain user claims,
// while the refresh tokens are opaque and can be used to obtain new access tokens.
export type AccessClaims = { sub: string; role: Role; email: string };

export async function signAccessToken(c: AccessClaims): Promise<string> {
  return new SignJWT({ role: c.role, email: c.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(c.sub)
    .setIssuedAt()
    .setExpirationTime("15m") // short-lived
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, accessSecret);
  return {
    sub: payload.sub as string,
    role: payload.role as Role,
    email: payload.email as string,
  };
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString("hex"); // opaque — NOT a JWT
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex"); // store the hash, never the token
}
