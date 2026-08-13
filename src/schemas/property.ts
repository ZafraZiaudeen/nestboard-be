import { z } from "zod";

export const createPropertySchema = z
  .object({
    title: z.string().min(3).max(120),
    description: z.string().min(3).max(120),
    address: z.string().min(3).max(120),
    city: z.string().min(3).max(120),
    type: z.enum(["HOUSE", "VILLA", "APARTMENT", "HOTEL"]),
    rating: z.number().min(0).max(5),
    latitude: z.float32(),
    longitude: z.float32(),
    imageUrl: z.url(),
  })
  .strict();

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
