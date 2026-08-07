import { PrismaPostgresAdapter } from "@prisma/adapter-ppg";
import { PrismaClient } from "../generated/client.js"
import { env } from "./env.js";

// global pattern
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const adapter = new PrismaPostgresAdapter({
    connectionString: env.DATABASE_URL
})

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
    adapter,
    log: env.NODE_ENV === 'dev' ? ['warn', 'error'] : ['error'],
})

if (env.NODE_ENV !== 'prod') {
    globalForPrisma.prisma = prisma
}