import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
    NODE_ENV: z.enum(['dev', 'test', 'prod']).default('dev'),
    PORT: z.coerce.number().int().positive().default(3001),
    LOG_LEVEL: z.string().default('info'),
    DATABASE_URL: z.url(),
    JWT_ACCESS_SECRET: z.string().min(32),
})

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    console.error('Invalid env: ', z.flattenError(parsed.error).fieldErrors);
    process.exit(1);
}

export const env = parsed.data