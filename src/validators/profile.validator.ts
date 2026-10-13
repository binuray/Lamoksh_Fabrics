import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters long')
    .max(100, 'Name cannot exceed 100 characters')
    .optional(),
  address: z
    .string()
    .trim()
    .max(500, 'Address cannot exceed 500 characters')
    .nullable()
    .optional(),
  gender: z
    .enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'], {
      errorMap: () => ({ message: 'Invalid gender value' }),
    })
    .nullable()
    .optional(),
});
