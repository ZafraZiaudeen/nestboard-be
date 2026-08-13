import { buildApp } from "./app.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";

const app = buildApp();

const server = app.listen(env.PORT, () => {
  console.log(`Server running on http://localhost:${env.PORT}`);
});

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down gracefully");
  server.close(async (err) => {
    if (err) {
      logger.error({ err }, "Error closing server");
      process.exit(1);
    }
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("Forcing shutdown after 10s");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
