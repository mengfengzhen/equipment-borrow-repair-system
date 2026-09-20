import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    actorId?: string;
    action: string;
    targetType: string;
    targetId?: string;
    detail?: unknown;
  }) {
    return this.prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        detail: params.detail === undefined ? undefined : JSON.stringify(params.detail),
      },
    });
  }

  async list() {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, name: true, username: true, role: true } } },
      take: 200,
    });
  }
}
