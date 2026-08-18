import z from "zod";

export const registerSchema = z
  .object({
    email: z.email(),
    password: z.string().min(8).max(200),
    displayName: z.string().min(2).max(80).optional(),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z
  .object({
    email: z.email(),
    password: z.string(),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;

export const updateProfileSchema = z
  .object({
    displayName: z.string().min(2).max(80).optional(),
    avatarUrl: z.url().optional(),
  })
  .strict()
  .refine((d) => d.displayName !== undefined || d.avatarUrl !== undefined, {
    message: "At least one of displayName or avatarUrl is required",
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
