import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DeviceStatus, RepairStatus, Roles } from '../common/constants';
import { RequestUser } from '../common/current-user.decorator';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRepairDto, RepairQueryDto, UpdateRepairStatusDto } from './dto';

@Injectable()
export class RepairsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async list(query: RepairQueryDto, user: RequestUser) {
    return this.prisma.repairRecord.findMany({
      where: {
        status: query.status,
        repairerId: user.role === Roles.ADMIN ? query.repairerId : undefined,
        device: query.deviceType ? { type: query.deviceType } : undefined,
        OR: user.role === Roles.REPAIRER ? [{ repairerId: user.id }, { repairerId: null }] : undefined,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        device: true,
        repairer: { select: { id: true, name: true, username: true } },
        borrowRequest: { include: { applicant: { select: { id: true, name: true } } } },
      },
    });
  }

  async create(dto: CreateRepairDto, user: RequestUser) {
    const device = await this.prisma.device.findUnique({ where: { id: dto.deviceId } });
    if (!device) throw new NotFoundException('设备不存在');
    if (([DeviceStatus.SCRAPPED, DeviceStatus.DISABLED] as string[]).includes(device.status)) {
      throw new BadRequestException('报废或停用设备不能创建维修任务');
    }
    if (dto.repairerId) {
      const repairer = await this.prisma.user.findUnique({ where: { id: dto.repairerId } });
      if (!repairer || repairer.role !== Roles.REPAIRER) {
        throw new BadRequestException('维修人员不存在');
      }
    }

    const repair = await this.prisma.$transaction(async (tx) => {
      await tx.device.update({ where: { id: dto.deviceId }, data: { status: DeviceStatus.REPAIRING } });
      return tx.repairRecord.create({
        data: {
          deviceId: dto.deviceId,
          repairerId: dto.repairerId,
          faultDescription: dto.faultDescription,
          status: dto.repairerId ? RepairStatus.REPAIRING : RepairStatus.WAITING_ACCEPT,
        },
      });
    });

    await this.auditLogs.record({
      actorId: user.id,
      action: 'CREATE_REPAIR_RECORD',
      targetType: 'REPAIR_RECORD',
      targetId: repair.id,
      detail: dto,
    });
    return repair;
  }

  async updateStatus(id: string, dto: UpdateRepairStatusDto, user: RequestUser) {
    const repair = await this.prisma.repairRecord.findUnique({ where: { id }, include: { device: true } });
    if (!repair) throw new NotFoundException('维修记录不存在');
    if (!repair.repairerId) {
      throw new BadRequestException('请先接单后再更新维修状态');
    }
    if (repair.repairerId !== user.id) {
      throw new ForbiddenException('只能处理分配给自己的维修任务');
    }
    if (([RepairStatus.FIXED, RepairStatus.UNREPAIRABLE] as string[]).includes(repair.status)) {
      throw new BadRequestException('已结束的维修任务不能再次更新');
    }

    const terminal = ([RepairStatus.FIXED, RepairStatus.UNREPAIRABLE] as string[]).includes(dto.status);
    const updated = await this.prisma.$transaction(async (tx) => {
      const record = await tx.repairRecord.update({
        where: { id },
        data: {
          status: dto.status,
          result: dto.result,
          cost: dto.cost,
          repairEndAt: terminal ? new Date() : undefined,
        },
      });

      if (dto.status === RepairStatus.FIXED) {
        await tx.device.update({ where: { id: repair.deviceId }, data: { status: DeviceStatus.AVAILABLE } });
      }
      if (dto.status === RepairStatus.UNREPAIRABLE) {
        await tx.device.update({ where: { id: repair.deviceId }, data: { status: DeviceStatus.SCRAPPED } });
      }

      return record;
    });

    await this.auditLogs.record({
      actorId: user.id,
      action: `UPDATE_REPAIR_STATUS_${dto.status}`,
      targetType: 'REPAIR_RECORD',
      targetId: id,
      detail: dto,
    });
    return updated;
  }

  async accept(id: string, user: RequestUser) {
    const repair = await this.prisma.repairRecord.findUnique({ where: { id }, include: { device: true } });
    if (!repair) throw new NotFoundException('维修记录不存在');
    if (([RepairStatus.FIXED, RepairStatus.UNREPAIRABLE] as string[]).includes(repair.status)) {
      throw new BadRequestException('已结束的维修任务不能接单');
    }
    if (repair.repairerId && repair.repairerId !== user.id) {
      throw new ForbiddenException('该维修任务已分配给其他维修人员');
    }
    if (repair.repairerId === user.id && repair.status === RepairStatus.REPAIRING) {
      throw new BadRequestException('该维修任务已接单');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.device.update({ where: { id: repair.deviceId }, data: { status: DeviceStatus.REPAIRING } });
      return tx.repairRecord.update({
        where: { id },
        data: {
          repairerId: user.id,
          status: RepairStatus.REPAIRING,
          repairEndAt: null,
        },
      });
    });

    await this.auditLogs.record({
      actorId: user.id,
      action: 'ACCEPT_REPAIR_TASK',
      targetType: 'REPAIR_RECORD',
      targetId: id,
      detail: { status: RepairStatus.REPAIRING },
    });
    return updated;
  }
}
