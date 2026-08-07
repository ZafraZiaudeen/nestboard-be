import { z } from 'zod';

export const roomTypeSchema = z.object({
    name: z.string().min(2).max(80),
    seatCount: z.number().int(),
    pricePerMonth: z.string().min(1),
}).strict().refine((data) => data.seatCount >= 1, {
    message: 'seatCount must be at least 1',
    path: ['seatCount'],
});

export type RoomTypeInput = z.infer<typeof roomTypeSchema>;
