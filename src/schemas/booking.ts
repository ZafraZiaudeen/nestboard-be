import { z } from "zod";

const monthIso = z.string().regex(/^\d{4}-\d{2}$/, "Expected YYYY-MM");

export const createBookingSchema = z
  .object({
    roomId: z.uuid(),
    seatNumber: z.number().int().min(1).max(20),
    startMonth: monthIso,
    durationMonths: z.union([z.literal(3), z.literal(6)]),
  })
  .strict();

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
