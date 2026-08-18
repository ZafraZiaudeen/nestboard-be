import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  NODE_ENV: z.enum(["dev", "test", "prod"]).default("dev"),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  UPLOAD_PROVIDER: z.enum(["local", "cloudinary"]).default("local"),
  UPLOAD_LOCAL_DIR: z.string().default("./uploads"),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  RATE_LIMIT: z.coerce.number().int().positive().default(100),
  GOOGLE_CLIENT_ID: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_test_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  STRIPE_SUCCESS_URL: z.url().default("http://localhost:5173/bookings/success"),
  STRIPE_CANCEL_URL: z.url().default("http://localhost:5173/bookings/cancel"),
  STRIPE_CURRENCY: z.string().length(3).default("lkr"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid env: ", z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const corsOrigins = parsed.data.CORS_ORIGINS.split(",").map((o) =>
  o.trim(),
);
