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
import { ApprovalDto, BorrowQueryDto, CreateBorrowRequestDto, PickupBorrowDto, ReturnBorrowDto, ReturnBorrowItemDto, SupplementDto } from './dto';

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
      items: query.deviceId ? { some: { deviceId: query.deviceId } } : undefined,
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
        items: {
          orderBy: { createdAt: 'asc' },
          include: { device: true },
        },
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
        items: {
          orderBy: { createdAt: 'asc' },
          include: { device: true },
        },
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

  async availableDevicesForPickup(id: string, location: string | undefined, user: RequestUser) {
    const request = await this.prisma.borrowRequest.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!request) {
      throw new NotFoundException('借用申请不存在');
    }
    this.assertCanRead(request.applicantId, request.departmentId, user);
    if (request.status !== BorrowStatus.APPROVED) {
      throw new BadRequestException('只有审批通过的申请可以分配设备');
    }
    if (request.items.length) {
      throw new BadRequestException('该申请已分配设备');
    }

    return this.findAssignableDevices(request, location);
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

    const updated = await this.prisma.borrowRequest.update({
      where: { id },
      data: { status: BorrowStatus.CANCELLED },
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
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    if (start < todayStart) {
      throw new BadRequestException('借用开始时间不能早于当前时间');
    }
    if (!(start < end)) {
      throw new BadRequestException('借用开始时间必须早于预计归还时间');
    }

    const quantity = dto.quantity || 1;
    const requestDevice = await this.resolveRequestedDevice(dto);
    await this.assertGroupScheduleAvailability(buildDeviceGroupKey(requestDevice), quantity, start, end);

    const approvalRequired = await this.settingsService.getApprovalRequired();
    const nextBorrowStatus = approvalRequired ? BorrowStatus.PENDING_APPROVAL : BorrowStatus.APPROVED;

    const created = await this.prisma.borrowRequest.create({
      data: {
        requestedName: requestDevice.name,
        requestedType: requestDevice.type,
        requestedBrand: requestDevice.brand,
        requestedModel: requestDevice.model,
        quantity,
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
    });

    await this.auditLogs.record({
      actorId: user.id,
      action: 'CREATE_BORROW_REQUEST',
      targetType: 'BORROW_REQUEST',
      targetId: created.id,
      detail: {
        deviceGroupKey: dto.deviceGroupKey,
        quantity,
        borrowStartAt: start,
        borrowEndAt: end,
      },
    });

    return created;
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
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.borrowApproval.create({
        data: { borrowRequestId: id, approverId: user.id, result: 'APPROVED', comment: dto.comment },
      });
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
      return tx.borrowRequest.update({ where: { id }, data: { status: BorrowStatus.REJECTED } });
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

  async pickup(id: string, dto: PickupBorrowDto, user: RequestUser) {
    const request = await this.prisma.borrowRequest.findUnique({
      where: { id },
      include: { items: { include: { device: true } } },
    });
    if (!request) throw new NotFoundException('借用申请不存在');
    if (request.status !== BorrowStatus.APPROVED) throw new BadRequestException('只有审批通过的申请可以领取');
    if (request.items.length) throw new BadRequestException('该申请已分配设备，不能重复领取');

    const devices = dto.deviceIds?.length
      ? await this.resolveSelectedDevices(request, dto.deviceIds)
      : await this.resolveGroupDevices(buildRequestGroupKey(request), request.quantity, dto.preferredLocation);

    for (const device of devices) {
      await this.assertNoTimeConflict(device.id, request.borrowStartAt, request.borrowEndAt, id);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const device of devices) {
        await tx.device.update({ where: { id: device.id }, data: { status: DeviceStatus.BORROWED } });
        await tx.borrowItem.create({
          data: {
            borrowRequestId: id,
            deviceId: device.id,
            status: BorrowStatus.PICKED_UP,
            pickedUpAt: new Date(),
          },
        });
      }
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
    const request = await this.prisma.borrowRequest.findUnique({
      where: { id },
      include: { items: { include: { device: true } } },
    });
    if (!request) throw new NotFoundException('借用申请不存在');
    if (!([BorrowStatus.PICKED_UP, BorrowStatus.OVERDUE] as string[]).includes(request.status)) {
      throw new BadRequestException('只有已领取或逾期申请可以登记归还');
    }
    if (!request.items.length) {
      throw new BadRequestException('该申请还没有交付设备，不能登记归还');
    }

    const now = new Date();
    const returnItems = this.normalizeReturnItems(request.items, dto);
    const updated = await this.prisma.$transaction(async (tx) => {
      const borrow = await tx.borrowRequest.update({
        where: { id },
        data: {
          status: BorrowStatus.RETURNED,
          returnedAt: now,
          returnCondition: returnItems.some((item) => item.returnCondition !== ReturnCondition.NORMAL) ? ReturnCondition.ABNORMAL : ReturnCondition.NORMAL,
          returnRemark: dto.returnRemark || summarizeReturnRemarks(returnItems),
          returnLocation: dto.returnLocation || summarizeReturnLocations(returnItems),
        },
      });

      for (const item of returnItems) {
        await tx.borrowItem.update({
          where: { id: item.itemId },
          data: {
            status: BorrowStatus.RETURNED,
            returnedAt: now,
            returnCondition: item.returnCondition,
            returnRemark: item.returnRemark,
            returnLocation: item.returnLocation,
          },
        });
        if (item.reportRepair) {
          await tx.device.update({
            where: { id: item.deviceId },
            data: { status: DeviceStatus.REPAIRING, location: item.returnLocation },
          });
          await tx.repairRecord.create({
            data: {
              deviceId: item.deviceId,
              borrowRequestId: id,
              faultDescription: item.repairDescription || item.returnRemark,
              status: RepairStatus.WAITING_ACCEPT,
            },
          });
          continue;
        }
        const futureApproved = await tx.borrowRequest.findFirst({
          where: {
            id: { not: id },
            status: BorrowStatus.APPROVED,
            borrowEndAt: { gt: now },
            items: { some: { deviceId: item.deviceId } },
          },
        });
        const nextStatus = futureApproved ? DeviceStatus.RESERVED : DeviceStatus.AVAILABLE;
        await tx.device.update({
          where: { id: item.deviceId },
          data: { status: nextStatus, location: item.returnLocation },
        });
      }

      return borrow;
    });

    await this.auditLogs.record({
      actorId: user.id,
      action: returnItems.some((item) => item.returnCondition !== ReturnCondition.NORMAL) ? 'RETURN_DEVICE_ABNORMAL' : 'RETURN_DEVICE_NORMAL',
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

  private async resolveRequestedDevice(dto: CreateBorrowRequestDto) {
    if (dto.deviceId) {
      const device = await this.prisma.device.findUnique({ where: { id: dto.deviceId } });
      if (!device) {
        throw new NotFoundException('设备不存在');
      }
      if (([DeviceStatus.DISABLED, DeviceStatus.SCRAPPED, DeviceStatus.REPAIRING] as string[]).includes(device.status)) {
        throw new BadRequestException('该设备当前不可申请借用');
      }
      return device;
    }

    if (!dto.deviceGroupKey) {
      throw new BadRequestException('请选择借用设备');
    }
    const devices = await this.prisma.device.findMany({
      where: {
        deletedAt: null,
        status: { notIn: [DeviceStatus.DISABLED, DeviceStatus.SCRAPPED, DeviceStatus.REPAIRING] },
      },
      orderBy: { createdAt: 'asc' },
    });
    const device = devices.find((item) => buildDeviceGroupKey(item) === dto.deviceGroupKey);
    if (!device) {
      throw new BadRequestException('该型号暂无可申请设备');
    }
    return device;
  }

  private async resolveGroupDevices(groupKey: string, quantity: number, preferredLocation?: string) {
    const devices = await this.prisma.device.findMany({
      where: { deletedAt: null, status: DeviceStatus.AVAILABLE },
      orderBy: { createdAt: 'asc' },
    });
    const sameGroup = devices.filter((device) => buildDeviceGroupKey(device) === groupKey);
    const sorted = preferredLocation
      ? [
          ...sameGroup.filter((device) => device.location === preferredLocation),
          ...sameGroup.filter((device) => device.location !== preferredLocation),
        ]
      : sameGroup;
    const matched = sorted.slice(0, quantity);
    if (matched.length < quantity) {
      throw new BadRequestException(`该型号当前可用库存不足 ${quantity} 台`);
    }
    return matched;
  }

  private async assertGroupAvailability(groupKey: string, quantity: number) {
    await this.resolveGroupDevices(groupKey, quantity);
  }

  private async assertGroupScheduleAvailability(groupKey: string, quantity: number, start: Date, end: Date) {
    const devices = await this.prisma.device.findMany({
      where: {
        deletedAt: null,
        status: { notIn: [DeviceStatus.DISABLED, DeviceStatus.SCRAPPED, DeviceStatus.REPAIRING] },
      },
    });
    const total = devices.filter((device) => buildDeviceGroupKey(device) === groupKey).length;
    const occupied = await this.countOccupiedQuantity(groupKey, start, end);
    const available = Math.max(0, total - occupied);
    if (available < quantity) {
      throw new BadRequestException(`该型号在所选时间段已被占用，可用 ${available} 台，无法申请 ${quantity} 台`);
    }
  }

  private async countOccupiedQuantity(groupKey: string, start: Date, end: Date) {
    const requests = await this.prisma.borrowRequest.findMany({
      where: {
        status: { in: activeBorrowStatuses },
        borrowStartAt: { lt: end },
        borrowEndAt: { gt: start },
      },
      select: {
        requestedType: true,
        requestedBrand: true,
        requestedModel: true,
        quantity: true,
      },
    });
    return requests
      .filter((request) => buildRequestGroupKey(request) === groupKey)
      .reduce((sum, request) => sum + request.quantity, 0);
  }

  private async resolveSelectedDevices(
    request: { requestedType: string; requestedBrand: string | null; requestedModel: string | null; quantity: number },
    deviceIds: string[],
  ) {
    if (deviceIds.length !== request.quantity) {
      throw new BadRequestException(`请选择 ${request.quantity} 台设备`);
    }
    if (new Set(deviceIds).size !== deviceIds.length) {
      throw new BadRequestException('不能重复选择同一台设备');
    }

    const devices = await this.prisma.device.findMany({
      where: { id: { in: deviceIds }, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (devices.length !== deviceIds.length) {
      throw new BadRequestException('选择的设备不存在或已删除');
    }
    const groupKey = buildRequestGroupKey(request);
    const invalid = devices.find((device) => buildDeviceGroupKey(device) !== groupKey);
    if (invalid) {
      throw new BadRequestException('选择的设备与申请型号不一致');
    }
    const unavailable = devices.find((device) => device.status !== DeviceStatus.AVAILABLE);
    if (unavailable) {
      throw new BadRequestException(`${unavailable.name}（${unavailable.code}）当前不可交付`);
    }
    return devices;
  }

  private async findAssignableDevices(
    request: { id: string; requestedType: string; requestedBrand: string | null; requestedModel: string | null; borrowStartAt: Date; borrowEndAt: Date },
    location?: string,
  ) {
    const groupKey = buildRequestGroupKey(request);
    const devices = await this.prisma.device.findMany({
      where: {
        deletedAt: null,
        status: DeviceStatus.AVAILABLE,
        location: location || undefined,
      },
      orderBy: [{ location: 'asc' }, { createdAt: 'asc' }],
    });

    const matched = devices.filter((device) => buildDeviceGroupKey(device) === groupKey);
    const availability = await Promise.all(
      matched.map(async (device) => ({
        device,
        hasConflict: await this.hasTimeConflict(device.id, request.borrowStartAt, request.borrowEndAt, request.id),
      })),
    );
    return availability.filter((item) => !item.hasConflict).map((item) => item.device);
  }

  private normalizeReturnItems(
    items: Array<{ id: string; deviceId: string; device: { location: string } }>,
    dto: ReturnBorrowDto,
  ) {
    const knownDeviceIds = new Set(items.map((item) => item.deviceId));
    const providedDeviceIds = (dto.items || []).map((item) => item.deviceId);
    if (new Set(providedDeviceIds).size !== providedDeviceIds.length) {
      throw new BadRequestException('归还明细不能重复选择同一台设备');
    }
    const unknownDeviceId = providedDeviceIds.find((deviceId) => !knownDeviceIds.has(deviceId));
    if (unknownDeviceId) {
      throw new BadRequestException('归还明细包含不属于该申请的设备');
    }

    const providedMap = new Map((dto.items || []).map((item) => [item.deviceId, item]));
    return items.map((item) => {
      const provided = providedMap.get(item.deviceId);
      if (!provided && (!dto.returnCondition || !dto.returnRemark)) {
        throw new BadRequestException('请填写每台设备的归还状态和备注');
      }
      const payload: ReturnBorrowItemDto = provided || {
        deviceId: item.deviceId,
        returnCondition: dto.returnCondition as string,
        returnRemark: dto.returnRemark as string,
        returnLocation: dto.returnLocation,
        reportRepair: dto.reportRepair,
        repairDescription: dto.repairDescription,
      };
      const abnormal = payload.returnCondition !== ReturnCondition.NORMAL;
      return {
        itemId: item.id,
        deviceId: item.deviceId,
        returnCondition: payload.returnCondition,
        returnRemark: payload.returnRemark,
        returnLocation: payload.returnLocation || item.device.location,
        reportRepair: payload.reportRepair ?? abnormal,
        repairDescription: payload.repairDescription,
      };
    });
  }

  private async assertNoTimeConflict(deviceId: string, start: Date, end: Date, excludeId?: string) {
    const conflict = await this.hasTimeConflict(deviceId, start, end, excludeId);
    if (conflict) {
      throw new BadRequestException('该设备在所选时间段已被预约或借出');
    }
  }

  private async hasTimeConflict(deviceId: string, start: Date, end: Date, excludeId?: string) {
    const conflict = await this.prisma.borrowRequest.findFirst({
      where: {
        id: excludeId ? { not: excludeId } : undefined,
        status: { in: activeBorrowStatuses },
        borrowStartAt: { lt: end },
        borrowEndAt: { gt: start },
        items: { some: { deviceId } },
      },
    });
    return Boolean(conflict);
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

function buildRequestGroupKey(request: { requestedType: string; requestedBrand?: string | null; requestedModel?: string | null }) {
  return [request.requestedType, request.requestedBrand || '', request.requestedModel || ''].join('::');
}

function summarizeReturnRemarks(items: Array<{ deviceId: string; returnRemark: string }>) {
  return items.map((item) => `${item.deviceId}: ${item.returnRemark}`).join('；');
}

function summarizeReturnLocations(items: Array<{ returnLocation: string }>) {
  return Array.from(new Set(items.map((item) => item.returnLocation).filter(Boolean))).join('、') || undefined;
}
