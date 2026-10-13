import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { SubmitEnquiryInput } from '../validators/enquiry.validator';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AdminEnquiryQueryOptions {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: 'newest' | 'oldest';
}

/**
 * Submit a new contact / enquiry.
 * All fields are optional.
 */
export async function submitEnquiry(data: SubmitEnquiryInput) {
  const enquiry = await prisma.enquiry.create({
    data: {
      name: data.name ?? null,
      email: data.email ?? null,
      mobileNumber: data.mobileNumber ?? null,
      message: data.message ?? null,
    },
  });

  return enquiry;
}

/**
 * Admin view of all enquiries with pagination, searching, and sorting.
 */
export async function getAdminEnquiries(options: AdminEnquiryQueryOptions = {}) {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 10));
  const skip = (page - 1) * limit;

  const where: Prisma.EnquiryWhereInput = {};

  if (options.search && options.search.trim()) {
    const term = options.search.trim();
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
      { mobileNumber: { contains: term, mode: 'insensitive' } },
      { message: { contains: term, mode: 'insensitive' } },
    ];
  }

  const orderBy: Prisma.EnquiryOrderByWithRelationInput = {
    createdAt: options.sortBy === 'oldest' ? 'asc' : 'desc',
  };

  const [enquiries, total] = await Promise.all([
    prisma.enquiry.findMany({
      where,
      skip,
      take: limit,
      orderBy,
    }),
    prisma.enquiry.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    enquiries,
    meta: {
      total,
      page,
      limit,
      totalPages,
    },
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
  };
}

/**
 * Get details of a single enquiry by ID.
 */
export async function getEnquiryById(id: string) {
  if (!id || !UUID_REGEX.test(id)) {
    throw new AppError('Enquiry not found', 404);
  }

  const enquiry = await prisma.enquiry.findUnique({
    where: { id },
  });

  if (!enquiry) {
    throw new AppError('Enquiry not found', 404);
  }

  return enquiry;
}

/**
 * Delete an enquiry permanently by admin.
 */
export async function deleteEnquiry(id: string) {
  if (!id || !UUID_REGEX.test(id)) {
    throw new AppError('Enquiry not found', 404);
  }

  const existing = await prisma.enquiry.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new AppError('Enquiry not found', 404);
  }

  await prisma.enquiry.delete({
    where: { id },
  });

  return { id };
}
