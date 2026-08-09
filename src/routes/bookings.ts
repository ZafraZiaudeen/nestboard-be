import { Router } from "express";
import { z } from "zod";
import { Role } from "../generated/enums.js";
import { verifyJwt, requireRole } from "../middleware/auth.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { createBookingSchema } from "../schemas/booking.js";
import * as ctrl from "../controllers/booking-controller.js";

export const bookingsRouter = Router();
bookingsRouter.use(verifyJwt);

const idParam = z.object({ id: z.uuid() });

bookingsRouter.post(
  "/",
  requireRole(Role.USER),
  validateBody(createBookingSchema),
  ctrl.create,
);

bookingsRouter.post(
  "/:id/confirm",
  requireRole(Role.USER),
  validateParams(idParam),
  ctrl.confirm,
);

bookingsRouter.get("/my", requireRole(Role.USER), ctrl.myBookings);