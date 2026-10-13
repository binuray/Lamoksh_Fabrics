import { z } from 'zod';

const pincodeRegex = /^\d{6}$/;

export const serviceabilityQuerySchema = z.object({
  delivery_postcode: z
    .string()
    .trim()
    .regex(pincodeRegex, 'Invalid delivery pincode. Must be exactly 6 digits')
    .optional(),
  pickup_postcode: z
    .string()
    .trim()
    .regex(pincodeRegex, 'Invalid pickup pincode. Must be exactly 6 digits')
    .optional(),
  weight: z
    .string()
    .transform((val) => (val ? parseFloat(val) : undefined))
    .pipe(z.number().positive('Weight must be greater than 0').optional())
    .optional(),
  cod: z
    .union([z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
    .transform((val) => (val === '1' || val === 'true' ? 1 : 0))
    .optional(),
  orderId: z.string().uuid('Invalid order ID format').optional(),
});

export const createShipmentSchema = z.object({
  weight: z.number().positive('Weight must be greater than 0').optional(),
  length: z.number().positive('Length must be greater than 0').optional(),
  breadth: z.number().positive('Breadth must be greater than 0').optional(),
  height: z.number().positive('Height must be greater than 0').optional(),
  pickupLocation: z.string().trim().min(1).optional(),
});

export const assignAwbSchema = z.object({
  courierId: z.union([z.number(), z.string().transform((v) => parseInt(v, 10))]).optional(),
  orderId: z.string().uuid('Invalid order ID').optional(),
  shipmentId: z.union([z.string(), z.number()]).optional(),
});

export const generatePickupSchema = z.object({
  orderId: z.string().uuid('Invalid order ID').optional(),
  shipmentId: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]).optional(),
});

export const generateLabelSchema = z.object({
  orderId: z.string().uuid('Invalid order ID').optional(),
  shipmentId: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]).optional(),
});

export const generateManifestSchema = z.object({
  orderId: z.string().uuid('Invalid order ID').optional(),
  shipmentId: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]).optional(),
});

export const cancelShippingSchema = z.object({
  orderId: z.string().uuid('Invalid order ID').optional(),
  awbCode: z.string().trim().optional(),
});
