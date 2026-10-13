import { z } from 'zod';

const mobileRegex = /^[6-9]\d{9}$/;
const pincodeRegex = /^\d{6}$/;

export const checkoutSchema = z.preprocess(
  (val: any) => {
    if (!val || typeof val !== 'object') return val;
    const cloned = { ...val };

    // Support phone number field aliases
    if (!cloned.mobileNumber && (cloned.phoneNumber || cloned.phone || cloned.mobile)) {
      cloned.mobileNumber = cloned.phoneNumber || cloned.phone || cloned.mobile;
    }

    // Support landmark alias
    if (!cloned.landmark && cloned.landMark) {
      cloned.landmark = cloned.landMark;
    }

    // Address & fullAddress fallbacks
    if (!cloned.address && cloned.fullAddress) {
      cloned.address = cloned.fullAddress;
    }
    if (!cloned.fullAddress && cloned.address) {
      cloned.fullAddress = cloned.address;
    }

    // City & District & HomeTown fallbacks
    if (!cloned.city && cloned.district) {
      cloned.city = cloned.district;
    }
    if (!cloned.homeTown && (cloned.district || cloned.city)) {
      cloned.homeTown = cloned.district || cloned.city;
    }
    if (!cloned.district && (cloned.city || cloned.homeTown)) {
      cloned.district = cloned.city || cloned.homeTown;
    }

    // Payment method normalization
    if (cloned.paymentOption && !cloned.paymentMethod) {
      cloned.paymentMethod = cloned.paymentOption;
    }
    if (typeof cloned.paymentMethod === 'string') {
      const pm = cloned.paymentMethod.trim().toUpperCase().replace(/\s+/g, '_');
      if (pm === 'COD' || pm === 'CASH_ON_DELIVERY' || pm === 'CASH') {
        cloned.paymentMethod = 'CASH_ON_DELIVERY';
      } else if (pm === 'ONLINE' || pm === 'NETBANKING' || pm === 'CARD' || pm === 'UPI') {
        cloned.paymentMethod = 'ONLINE';
      }
    } else if (!cloned.paymentMethod) {
      cloned.paymentMethod = 'CASH_ON_DELIVERY';
    }

    return cloned;
  },
  z.object({
    name: z
      .string({ required_error: 'Name is required' })
      .trim()
      .min(2, 'Name must be at least 2 characters long')
      .max(100, 'Name cannot exceed 100 characters'),
    mobileNumber: z
      .string({ required_error: 'Mobile number is required' })
      .trim()
      .regex(mobileRegex, 'Invalid Indian mobile number format. Must be 10 digits starting with 6-9'),
    email: z
      .string()
      .trim()
      .email('Invalid email address format')
      .optional()
      .or(z.literal(''))
      .nullable(),
    address: z
      .string({ required_error: 'Address is required' })
      .trim()
      .min(3, 'Address must be at least 3 characters long')
      .max(500, 'Address cannot exceed 500 characters'),
    fullAddress: z
      .string()
      .trim()
      .max(1000, 'Full address cannot exceed 1000 characters')
      .optional()
      .nullable(),
    landmark: z
      .string()
      .trim()
      .max(150, 'Landmark cannot exceed 150 characters')
      .optional()
      .nullable(),
    district: z
      .string()
      .trim()
      .max(100, 'District cannot exceed 100 characters')
      .optional()
      .nullable(),
    homeTown: z
      .string()
      .trim()
      .max(100, 'Home town cannot exceed 100 characters')
      .optional()
      .nullable(),
    city: z
      .string()
      .trim()
      .max(100, 'City cannot exceed 100 characters')
      .optional()
      .nullable(),
    state: z
      .string({ required_error: 'State is required' })
      .trim()
      .min(2, 'State must be at least 2 characters long')
      .max(100, 'State cannot exceed 100 characters'),
    pincode: z
      .string({ required_error: 'Pincode is required' })
      .trim()
      .regex(pincodeRegex, 'Invalid Indian PIN code format. Must be exactly 6 digits'),
    paymentMethod: z
      .enum(['CASH_ON_DELIVERY', 'ONLINE'], {
        errorMap: () => ({ message: 'Payment method must be either CASH_ON_DELIVERY or ONLINE' }),
      })
      .default('CASH_ON_DELIVERY'),
  })
);

export const updateOrderStatusSchema = z
  .object({
    status: z
      .enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'], {
        errorMap: () => ({ message: 'Invalid order status value' }),
      })
      .optional(),
    paymentStatus: z
      .enum(['PENDING', 'PAID', 'FAILED', 'REFUNDED'], {
        errorMap: () => ({ message: 'Invalid payment status value' }),
      })
      .optional(),
  })
  .refine((data) => data.status !== undefined || data.paymentStatus !== undefined, {
    message: 'At least one of status or paymentStatus must be provided',
  });
