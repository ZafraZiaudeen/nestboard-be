import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { Role } from "../generated/enums.js";
import { verifyJwt, requireRole } from "../middleware/auth.js";
import { env } from "../lib/env.js";
import { Errors } from "../lib/errors.js";

export const uploadsRouter = Router();

fs.mkdirSync(env.UPLOAD_LOCAL_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.UPLOAD_LOCAL_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok: boolean = ["image/jpeg", "image/png", "image/webp"].includes(
      file.mimetype,
    );
    cb(
      ok
        ? null
        : (Errors.validation("Only JPG/PNG/WEBP images are allowed") as any),
      ok,
    );
  },
});

uploadsRouter.post(
  "/cover-image",
  verifyJwt,
  requireRole(Role.ADMIN),
  upload.single("image"),
  (req, res, next) => {
    if (!req.file) {
      next(Errors.validation("Missing image field"));
      return;
    }
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  },
);
