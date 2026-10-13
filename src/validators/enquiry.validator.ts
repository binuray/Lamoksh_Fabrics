import { z } from 'zod';

export const submitEnquirySchema = z.preprocess(
  (data: any) => {
    if (data && typeof data === 'object') {
      // Allow fallback if mobile is provided instead of mobileNumber
      if (data.mobileNumber === undefined && data.mobile !== undefined) {
        data.mobileNumber = data.mobile;
      }
    }
    return data;
  },
  z.object({
    name: z
      .union([z.string(), z.null(), z.undefined()])
      .optional()
      .transform((val) => {
        if (typeof val !== 'string') return null;
        const trimmed = val.trim();
        return trimmed.length > 0 ? trimmed : null;
      })
      .refine((val) => val === null || val.length <= 100, {
        message: 'Name cannot exceed 100 characters',
      }),
    email: z
      .union([z.string(), z.null(), z.undefined()])
      .optional()
      .transform((val) => {
        if (typeof val !== 'string') return null;
        const trimmed = val.trim();
        return trimmed.length > 0 ? trimmed : null;
      })
      .refine(
        (val) => {
          if (val === null) return true;
          return z.string().email().safeParse(val).success;
        },
        { message: 'Invalid email address format' }
      )
      .transform((val) => (val ? val.toLowerCase() : null)),
    mobileNumber: z
      .union([z.string(), z.number(), z.null(), z.undefined()])
      .optional()
      .transform((val) => {
        if (val === null || val === undefined) return null;
        const str = String(val).trim();
        return str.length > 0 ? str : null;
      })
      .refine(
        (val) => {
          if (val === null) return true;
          const cleaned = val.replace(/[\s\-()]/g, '');
          const isValidIndian = /^(?:\+?91|0)?[6-9]\d{9}$/.test(cleaned);
          const isValidGeneral = /^\+?[1-9]\d{6,14}$/.test(cleaned);
          return isValidIndian || isValidGeneral;
        },
        { message: 'Invalid mobile number format' }
      ),
    message: z
      .union([z.string(), z.null(), z.undefined()])
      .optional()
      .transform((val) => {
        if (typeof val !== 'string') return null;
        const trimmed = val.trim();
        return trimmed.length > 0 ? trimmed : null;
      })
      .refine((val) => val === null || val.length <= 5000, {
        message: 'Message cannot exceed 5000 characters',
      }),
  })
);

export const getEnquiriesQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10)),
  search: z.string().trim().optional(),
  sortBy: z.enum(['newest', 'oldest']).optional().default('newest'),
});

export type SubmitEnquiryInput = z.infer<typeof submitEnquirySchema>;
export type GetEnquiriesQueryInput = z.infer<typeof getEnquiriesQuerySchema>;
