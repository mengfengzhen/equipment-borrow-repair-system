import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  activeBorrowStatuses,
  BorrowStatus,
  DeviceStatus,
  RepairStatus,
  ReturnCondition,
  Roles,
} from '../common/constants';
import { RequestUser } from '../common/current-user.decorator';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { buildDeviceGroupKey } from '../devices/devices.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ApprovalDto, BorrowQueryDto, CreateBorrowRequestDto, ReturnBorrowDto, SupplementDto } from './dto';

@Injectable()
export class BorrowRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly settingsService: SettingsService,
  ) {}

  async list(query: BorrowQueryDto, user: RequestUser) {
    await this.refreshOverdueStatuses();

    const where: Prisma.BorrowRequestWhereInput = {
      status: query.status,
      deviceId: query.deviceId,
      applicantId: query.applicantId,
      departmentId: query.departmentId,
    };

    if (query.borrowStartAt || query.borrowEndAt) {
      where.AND = [
        query.borrowEndAt ? { borrowStartAt: { lte: new Date(query.borrowEndAt) } } : {},
        query.borrowStartAt ? { borrowEndAt: { gte: new Date(query.borrowStartAt) } } : {},
      ];
    }

    if (user.role === Roles.USER) {
      where.applicantId = user.id;
    }
    if (user.role === Roles.MANAGER) {
      where.departmentId = user.departmentId ?? undefined;
    }

    return this.prisma.borrowRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        device: true,
        applicant: { select: { id: true, name: true, username: true } },
        department: true,
        approvals: {
          orderBy: { createdAt: 'desc' },
          include: { approver: { select: { id: true, name: true, role: true } } },
        },
      },
    });
  }

  async get(id: string, user: RequestUser) {
    const request = await this.prisma.borrowRequest.findUnique({
      where: { id },
      include: {
        device: true,
        applicant: { select: { id: true, name: true, username: true, departmentId: true } },
        department: true,
        approvals: {
          orderBy: { createdAt: 'desc' },
          include: { approver: { select: { id: true, name: true, role: true } } },
        },
        repairs: true,
      },
    });
    if (!request) {
      throw new NotFoundException('借用申请不存在');
    }
    this.assertCanRead(request.applicantId, request.departmentId, user);
    return request;
  }

  async cancel(id: string, user: RequestUser) {
    const request = await this.prisma.borrowRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('借用申请不存在');

    const canCancel = user.role === Roles.USER && request.applicantId === user.id;

    if (!canCancel) {
      throw new ForbiddenException('无权取消该申请');
    }

    if (!([BorrowStatus.PENDING_APPROVAL, BorrowStatus.NEED_MORE_INFO, BorrowStatus.APPROVED] as string[]).includes(request.status)) {
      throw new BadRequestException('当前状态不允许取消');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const borrow = await tx.borrowRequest.update({
        where: { id },
        data: { status: BorrowStatus.CANCELLED },
      });

      if ((activeBorrowStatuses as string[]).includes(request.status)) {
        const activeForDevice = await tx.borrowRequest.findFirst({
          where: {
            id: { not: id },
            deviceId: request.deviceId,
            status: { in: activeBorrowStatuses },
          },
        });
        if (!activeForDevice) {
          await tx.device.update({ where: { id: request.deviceId }, data: { status: DeviceStatus.AVAILABLE } });
        }
      }

      return borrow;
    });

    await this.auditLogs.record({
      actorId: user.id,
      action: 'CANCEL_BORROW_REQUEST',
      targetType: 'BORROW_REQUEST',
      targetId: id,
      detail: { previousStatus: request.status },
    });
    return updated;
  }

  async create(dto: CreateBorrowRequestDto, user: RequestUser) {
    const start = new Date(dto.borrowStartAt);
    const end = new Date(dto.borrowEndAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('借用时间格式不正确');
    }
    if (start < new Date()) {
      throw new BadRequestException('借用开始时间不能早于当前时间');
    }
    if (!(start < end)) {
      throw new BadRequestException('借用开始时间必须早于预计归还时间');
    }

    const quantity = dto.quantity || 1;
    const devices = await this.resolveBorrowDevices(dto, quantity);

    for (const device of devices) {
      await this.assertNoTimeConflict(device.id, start, end);
    }

    const approvalRequired = await this.settingsService.getApprovalRequired();
    const nextDeviceStatus = approvalRequired ? DeviceStatus.BORROW_PENDING : DeviceStatus.RESERVED;
    const nextBorrowStatus = approvalRequired ? BorrowStatus.PENDING_APPROVAL : BorrowStatus.APPROVED;

    const created = await this.prisma.$transaction(async (tx) => {
      const createdRequests = [];
      for (const device of devices) {
        await tx.device.update({ where: { id: device.id }, data: { status: nextDeviceStatus } });
        const request = await tx.borrowRequest.create({
          data: {
            deviceId: device.id,
            applicantId: user.id,
            departmentId: user.departmentId,
            borrowStartAt: start,
            borrowEndAt: end,
            purpose: dto.purpose,
            remark: dto.remark,
            attachmentNames: dto.attachmentNames,
            status: nextBorrowStatus,
            approvalRequired,
          },
          include: { device: true },
        });
        createdRequests.push(request);
      }
      return createdRequests;
    });

    await this.auditLogs.record({
      actorId: user.id,
      action: 'CREATE_BORROW_REQUEST',
      targetType: 'BORROW_REQUEST',
      targetId: created[0]?.id,
      detail: {
        deviceIds: devices.map((device) => device.id),
        deviceGroupKey: dto.deviceGroupKey,
        quantity,
        borrowStartAt: start,
        borrowEndAt: end,
      },
    });

    return quantity === 1 ? created[0] : created;
  }

  async supplement(id: string, dto: SupplementDto, user: RequestUser) {
    const request = await this.prisma.borrowRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('借用申请不存在');
    if (request.applicantId !== user.id) throw new ForbiddenException('只能补充自己的申请');
    if (request.status !== BorrowStatus.NEED_MORE_INFO) {
      throw new BadRequestException('当前状态不允许补充信息');
    }

    const updated = await this.prisma.borrowRequest.update({
      where: { id },
      data: {
        purpose: dto.purpose,
        remark: dto.remark,
        attachmentNames: dto.attachmentNames,
        status: BorrowStatus.PENDING_APPROVAL,
      },
    });

    await this.auditLogs.record({
      actorId: user.id,
      action: 'SUPPLEMENT_BORROW_REQUEST',
      targetType: 'BORROW_REQUEST',
      targetId: id,
      detail: dto,
    });
    return updated;
  }

  async approve(id: string, dto: ApprovalDto, user: RequestUser) {
    const request = await this.loadForApproval(id, user);
    if (request.status !== BorrowStatus.PENDING_APPROVAL) {
      throw new BadRequestException('只有待审批申请可以审批通过');
    }
    await this.assertNoTimeConflict(request.deviceId, request.borrowStartAt, request.borrowEndAt, id);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.borrowApproval.create({
        data: { borrowRequestId: id, approverId: user.id, result: 'APPROVED', comment: dto.comment },
      });
      await tx.device.update({ where: { id: request.deviceId }, data: { status: DeviceStatus.RESERVED } });
      return tx.borrowRequest.update({ where: { id }, data: { status: BorrowStatus.APPROVED } });
    });

    await this.auditLogs.record({
      actorId: user.id,
      action: 'APPROVE_BORROW_REQUEST',
      targetType: 'BORROW_REQUEST',
      targetId: id,
      detail: { comment: dto.comment },
    });
    return updated;
  }

  async reject(id: string, dto: ApprovalDto, user: RequestUser) {
    const request = await this.loadForApproval(id, user);
    if (!([BorrowStatus.PENDING_APPROVAL, BorrowStatus.NEED_MORE_INFO] as string[]).includes(request.status)) {
      throw new BadRequestException('当前状态不允许驳回');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.borrowApproval.create({
        data: { borrowRequestId: id, approverId: user.id, result: 'REJECTED', comment: dto.comment },
      });
      const borrow = await tx.borrowRequest.update({ where: { id }, data: { status: BorrowStatus.REJECTED } });
      const activeForDevice = await tx.borrowRequest.findFirst({
        where: {
          id: { not: id },
          deviceId: request.deviceId,
          status: { in: activeBorrowStatuses },
        },
      });
      if (!activeForDevice) {
        await tx.device.update({ where: { id: request.deviceId }, data: { status: DeviceStatus.AVAILABLE } });
      }
      return borrow;
    });
    await this.auditLogs.record({
      actorId: user.id,
      action: 'REJECT_BORROW_REQUEST',
      targetType: 'BORROW_REQUEST',
      targetId: id,
      detail: { comment: dto.comment },
    });
    return updated;
  }

  async needMoreInfo(id: string, dto: ApprovalDto, user: RequestUser) {
    const request = await this.loadForApproval(id, user);
    if (request.status !== BorrowStatus.PENDING_APPROVAL) {
      throw new BadRequestException('只有待审批申请可以要求补充信息');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.borrowApproval.create({
        data: { borrowRequestId: id, approverId: user.id, result: 'NEED_MORE_INFO', comment: dto.comment },
      });
      return tx.borrowRequest.update({ where: { id }, data: { status: BorrowStatus.NEED_MORE_INFO } });
    });
    await this.auditLogs.record({
      actorId: user.id,
      action: 'NEED_MORE_INFO_BORROW_REQUEST',
      targetType: 'BORROW_REQUEST',
      targetId: id,
      detail: { comment: dto.comment },
    });
    return updated;
  }

  async pickup(id: string, user: RequestUser) {
    const request = await this.prisma.borrowRequest.findUnique({ where: { id }, include: { device: true } });
    if (!request) throw new NotFoundException('借用申请不存在');
    if (request.status !== BorrowStatus.APPROVED) throw new BadRequestException('只有审批通过的申请可以领取');
    if (request.device.status === DeviceStatus.REPAIRING) throw new BadRequestException('设备维修中，不能领取');

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.device.update({ where: { id: request.deviceId }, data: { status: DeviceStatus.BORROWED } });
      return tx.borrowRequest.update({
        where: { id },
        data: { status: BorrowStatus.PICKED_UP, pickedUpAt: new Date() },
      });
    });
    await this.auditLogs.record({
      actorId: user.id,
      action: 'PICKUP_DEVICE',
      targetType: 'BORROW_REQUEST',
      targetId: id,
    });
    return updated;
  }

  async returnDevice(id: string, dto: ReturnBorrowDto, user: RequestUser) {
    const request = await this.prisma.borrowRequest.findUnique({ where: { id }, include: { device: true } });
    if (!request) throw new NotFoundException('借用申请不存在');
    if (!([BorrowStatus.PICKED_UP, BorrowStatus.OVERDUE] as string[]).includes(request.status)) {
      throw new BadRequestException('只有已领取或逾期申请可以登记归还');
    }

    const now = new Date();
    const abnormal = dto.returnCondition !== ReturnCondition.NORMAL;
    const reportRepair = dto.reportRepair ?? abnormal;
    const returnLocation = dto.returnLocation || request.device.location;
    const updated = await this.prisma.$transaction(async (tx) => {
      const borrow = await tx.borrowRequest.update({
        where: { id },
        data: {
          status: BorrowStatus.RETURNED,
          returnedAt: now,
          returnCondition: dto.returnCondition,
          returnRemark: dto.returnRemark,
          returnLocation,
        },
      });

      if (reportRepair) {
        await tx.device.update({
          where: { id: request.deviceId },
          data: { status: DeviceStatus.REPAIRING, location: returnLocation },
        });
        await tx.repairRecord.create({
          data: {
            deviceId: request.deviceId,
            borrowRequestId: id,
            faultDescription: dto.repairDescription || dto.returnRemark,
            status: RepairStatus.WAITING_ACCEPT,
          },
        });
      } else {
        const futureApproved = await tx.borrowRequest.findFirst({
          where: {
            id: { not: id },
            deviceId: request.deviceId,
            status: BorrowStatus.APPROVED,
            borrowEndAt: { gt: now },
          },
        });
        const nextStatus = futureApproved ? DeviceStatus.RESERVED : DeviceStatus.AVAILABLE;
        await tx.device.update({
          where: { id: request.deviceId },
          data: { status: nextStatus, location: returnLocation },
        });
      }

      return borrow;
    });

    await this.auditLogs.record({
      actorId: user.id,
      action: abnormal ? 'RETURN_DEVICE_ABNORMAL' : 'RETURN_DEVICE_NORMAL',
      targetType: 'BORROW_REQUEST',
      targetId: id,
      detail: dto,
    });
    return updated;
  }

  private async loadForApproval(id: string, user: RequestUser) {
    const request = await this.prisma.borrowRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('借用申请不存在');
    if (user.role === Roles.ADMIN) {
      return request;
    }
    if (user.role === Roles.MANAGER && request.departmentId !== user.departmentId) {
      throw new ForbiddenException('只能审批本部门申请');
    }
    if (user.role !== Roles.MANAGER) {
      throw new ForbiddenException('没有审批权限');
    }
    return request;
  }

  private assertCanRead(applicantId: string, departmentId: string | null, user: RequestUser) {
    if (user.role === Roles.ADMIN || user.role === Roles.REPAIRER) return;
    if (user.role === Roles.USER && applicantId === user.id) return;
    if (user.role === Roles.MANAGER && departmentId === user.departmentId) return;
    throw new ForbiddenException('无权查看该申请');
  }

  private async resolveBorrowDevices(dto: CreateBorrowRequestDto, quantity: number) {
    if (dto.deviceId) {
      const device = await this.prisma.device.findUnique({ where: { id: dto.deviceId } });
      if (!device) {
        throw new NotFoundException('设备不存在');
      }
      if (device.status !== DeviceStatus.AVAILABLE) {
        throw new BadRequestException('该设备当前不可申请借用');
      }
      if (quantity > 1) {
        const groupKey = buildDeviceGroupKey(device);
        return this.resolveGroupDevices(groupKey, quantity);
      }
      return [device];
    }

    if (!dto.deviceGroupKey) {
      throw new BadRequestException('请选择借用设备');
    }
    return this.resolveGroupDevices(dto.deviceGroupKey, quantity);
  }

  private async resolveGroupDevices(groupKey: string, quantity: number) {
    const devices = await this.prisma.device.findMany({
      where: { deletedAt: null, status: DeviceStatus.AVAILABLE },
      orderBy: { createdAt: 'asc' },
    });
    const matched = devices.filter((device) => buildDeviceGroupKey(device) === groupKey).slice(0, quantity);
    if (matched.length < quantity) {
      throw new BadRequestException(`该型号当前可用库存不足 ${quantity} 台`);
    }
    return matched;
  }

  private async assertNoTimeConflict(deviceId: string, start: Date, end: Date, excludeId?: string) {
    const conflict = await this.prisma.borrowRequest.findFirst({
      where: {
        id: excludeId ? { not: excludeId } : undefined,
        deviceId,
        status: { in: activeBorrowStatuses },
        borrowStartAt: { lt: end },
        borrowEndAt: { gt: start },
      },
    });
    if (conflict) {
      throw new BadRequestException('该设备在所选时间段已被预约或借出');
    }
  }

  private async refreshOverdueStatuses() {
    await this.prisma.borrowRequest.updateMany({
      where: {
        status: { in: [BorrowStatus.APPROVED, BorrowStatus.PICKED_UP] },
        borrowEndAt: { lt: new Date() },
      },
      data: { status: BorrowStatus.OVERDUE },
    });
  }
}
