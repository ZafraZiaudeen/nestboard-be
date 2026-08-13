import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const healthRouter: Router = Router();

healthRouter.get("/live", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get("/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "connected" });
  } catch {
    res.status(503).json({ status: "unavailable", db: "disconnected" });
  }
});
