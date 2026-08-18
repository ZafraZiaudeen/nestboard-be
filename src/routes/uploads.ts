import { Router, type RequestHandler } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { Role } from "../generated/enums.js";
import { verifyJwt, requireRole } from "../middleware/auth.js";
import { env } from "../lib/env.js";
import { Errors } from "../lib/errors.js";

export const uploadsRouter = Router();

// ── Cloudinary configuration ─────────────────────────────────────────────────
if (env.UPLOAD_PROVIDER === "cloudinary") {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME ?? "",
    api_key: env.CLOUDINARY_API_KEY ?? "",
    api_secret: env.CLOUDINARY_API_SECRET ?? "",
  });
}

// ── Storage engines ───────────────────────────────────────────────────────────
fs.mkdirSync(env.UPLOAD_LOCAL_DIR, { recursive: true });

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.UPLOAD_LOCAL_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
  },
});

const memoryStorage = multer.memoryStorage();

const imageFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
  cb(
    ok ? null : (Errors.validation("Only JPG/PNG/WEBP images are allowed") as any),
    ok,
  );
};

const diskUpload = multer({
  storage: diskStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFilter,
});

const memoryUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFilter,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function uploadToCloudinary(
  buffer: Buffer,
  mimetype: string,
  folder: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error("Cloudinary upload failed"));
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
}

// ── POST /api/uploads/avatar  (any authenticated user) ───────────────────────
const avatarMiddleware =
  env.UPLOAD_PROVIDER === "cloudinary"
    ? memoryUpload.single("image")
    : diskUpload.single("image");

const handleAvatarUpload: RequestHandler = async (req, res, next) => {
  try {
    if (!req.file) {
      next(Errors.validation("Missing image field"));
      return;
    }

    if (env.UPLOAD_PROVIDER === "cloudinary") {
      const url = await uploadToCloudinary(
        req.file.buffer,
        req.file.mimetype,
        "nestboard/avatars",
      );
      res.status(201).json({ url });
    } else {
      res.status(201).json({ url: `/uploads/${req.file.filename}` });
    }
  } catch (err) {
    next(err);
  }
};

uploadsRouter.post("/avatar", verifyJwt, avatarMiddleware, handleAvatarUpload);

// ── POST /api/uploads/cover-image  (ADMIN only — property images) ─────────────
const coverMiddleware =
  env.UPLOAD_PROVIDER === "cloudinary"
    ? memoryUpload.single("image")
    : diskUpload.single("image");

const handleCoverUpload: RequestHandler = async (req, res, next) => {
  try {
    if (!req.file) {
      next(Errors.validation("Missing image field"));
      return;
    }

    if (env.UPLOAD_PROVIDER === "cloudinary") {
      const url = await uploadToCloudinary(
        req.file.buffer,
        req.file.mimetype,
        "nestboard/covers",
      );
      res.status(201).json({ url });
    } else {
      res.status(201).json({ url: `/uploads/${req.file.filename}` });
    }
  } catch (err) {
    next(err);
  }
};

uploadsRouter.post(
  "/cover-image",
  verifyJwt,
  requireRole(Role.ADMIN),
  coverMiddleware,
  handleCoverUpload,
);
