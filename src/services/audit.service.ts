import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export interface AuditLogData {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, any> | null;
}

export async function logAuditEvent(data: AuditLogData): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: data.userId || null,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId || null,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
        metadata: data.metadata ? (data.metadata as any) : undefined,
      },
    });
  } catch (error) {
    logger.error({ error, data }, 'Failed to record audit log entry');
  }
}
