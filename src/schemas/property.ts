import { z } from 'zod';

export const createPropertySchema = z.object({
    id: z.string().startsWith('prop-'),
    title: z.string().min(3).max(120),
    location: z.string().min(3).max(120),
    type: z.enum(['HOUSE', 'VILLA', 'APARTMENT', 'HOTEL']),
    price: z.string(),
    rating: z.number().min(0).max(5),
    image: z.url(),
}).strict()

export type CreatePropertyInput = z.infer<typeof createPropertySchema>
