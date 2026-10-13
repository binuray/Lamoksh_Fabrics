import { prisma } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { Gender } from '@prisma/client';

export interface UpdateProfileInput {
  name?: string;
  address?: string | null;
  gender?: Gender | null;
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });

  if (!user || user.deletedAt !== null) {
    throw new AppError('User not found', 404);
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    role: user.role.name,
    address: user.address,
    gender: user.gender,
    isVerified: user.isVerified,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function updateProfile(userId: string, data: UpdateProfileInput) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user || user.deletedAt !== null) {
    throw new AppError('User not found', 404);
  }

  const updateData: any = {};
  if (data.name !== undefined) {
    updateData.name = data.name.trim();
  }
  if (data.address !== undefined) {
    updateData.address = data.address === null ? null : data.address.trim();
  }
  if (data.gender !== undefined) {
    updateData.gender = data.gender;
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    include: { role: true },
  });

  return {
    id: updatedUser.id,
    name: updatedUser.name,
    email: updatedUser.email,
    mobile: updatedUser.mobile,
    role: updatedUser.role.name,
    address: updatedUser.address,
    gender: updatedUser.gender,
    isVerified: updatedUser.isVerified,
    createdAt: updatedUser.createdAt,
    updatedAt: updatedUser.updatedAt,
  };
}
