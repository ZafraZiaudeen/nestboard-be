import { z } from "zod";

export const createPropertySchema = z
  .object({
    title: z.string().min(3).max(120),
    description: z.string().min(3).max(2000),
    address: z.string().min(3).max(120),
    city: z.string().min(3).max(120),
    type: z.enum(["HOUSE", "VILLA", "APARTMENT", "HOTEL"]),
    rating: z.number().min(0).max(5),
    amenities: z.array(z.string().max(60)).optional().default([]),
    latitude: z.number().optional().default(0),
    longitude: z.number().optional().default(0),
    imageUrl: z.string().max(500).optional().default(""),
    minStay: z.string().min(1).max(60).optional().default("1 month"),
  })
  .strict();

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = createPropertySchema.partial();
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
