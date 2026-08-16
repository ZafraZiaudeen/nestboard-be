import { z } from "zod";

export const createRoomTypeSchema = z
  .object({
    name: z.string().min(2).max(60),
    pricePerMonth: z.number().min(0),
    seatCapacity: z.number().int().min(1),
    hasAC: z.boolean(),
    amenities: z.array(z.string().max(60)).optional().default([]),
  })
  .strict();

export const createRoomSchema = z
  .object({
    roomLabel: z.string().min(1).max(20),
  })
  .strict();

export type CreateRoomTypeInput = z.infer<typeof createRoomTypeSchema>;
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const updateRoomTypeSchema = createRoomTypeSchema.partial();
export type UpdateRoomTypeInput = z.infer<typeof updateRoomTypeSchema>;
