import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { activeBorrowStatuses, BorrowStatus, DeviceStatus, RepairStatus, Roles } from '../common/constants';
import { RequestUser } from '../common/current-user.decorator';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { BorrowOptionsQueryDto, CreateDeviceDto, DeviceQueryDto, UpdateDeviceDto } from './dto';

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async list(query: DeviceQueryDto, user: RequestUser) {
    const onlyMyDevices = user.role === Roles.USER && query.scope !== 'inventory';
    const where: Prisma.DeviceWhereInput = {
      AND: [
        { deletedAt: null },
        query.keyword
          ? {
              OR: [
                { name: { contains: query.keyword } },
                { code: { contains: query.keyword } },
                { brand: { contains: query.keyword } },
                { model: { contains: query.keyword } },
              ],
            }
          : {},
        query.type ? { type: query.type } : {},
        query.status ? { status: query.status } : {},
        query.brand ? { brand: query.brand } : {},
        query.location ? { location: query.location } : {},
        onlyMyDevices
          ? {
              borrowItems: {
                some: {
                  borrowRequest: { applicantId: user.id },
                  status: { in: [BorrowStatus.APPROVED, BorrowStatus.PICKED_UP, BorrowStatus.OVERDUE] },
                },
              },
            }
          : {},
      ],
    };

    const devices = await this.prisma.device.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        owner: { select: { id: true, name: true, username: true } },
        borrowItems: {
          where: { status: { in: [BorrowStatus.PICKED_UP, BorrowStatus.OVERDUE] } },
          orderBy: { pickedUpAt: 'desc' },
          take: 1,
          include: { borrowRequest: { include: { applicant: { select: { id: true, name: true, username: true } } } } },
        },
        repairRecords: {
          where: { status: RepairStatus.WAITING_CONFIRM },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          include: { repairer: { select: { id: true, name: true, username: true } } },
        },
      },
    });

    return devices.map((device) => {
      const [currentRepair] = device.repairRecords;
      const [activeBorrowItem] = device.borrowItems;
      const { borrowItems, repairRecords, ...rest } = device;
      void repairRecords;
      return {
        ...rest,
        currentBorrower: activeBorrowItem?.borrowRequest.applicant,
        currentRepair,
      };
    });
  }

  async borrowOptions(query: BorrowOptionsQueryDto = {}) {
    const start = query.borrowStartAt ? new Date(query.borrowStartAt) : undefined;
    const end = query.borrowEndAt ? new Date(query.borrowEndAt) : undefined;
    const shouldApplySchedule = start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start < end;
    const devices = await this.prisma.device.findMany({
      where: {
        deletedAt: null,
        status: shouldApplySchedule
          ? { notIn: [DeviceStatus.DISABLED, DeviceStatus.SCRAPPED, DeviceStatus.REPAIRING] }
          : DeviceStatus.AVAILABLE,
      },
      orderBy: [{ type: 'asc' }, { brand: 'asc' }, { model: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        type: true,
        brand: true,
        model: true,
        location: true,
      },
    });

    const groups = new Map<string, {
      groupKey: string;
      name: string;
      type: string;
      brand?: string | null;
      model?: string | null;
      availableCount: number;
      locations: Set<string>;
        sampleDeviceId: string;
      }>();

    const occupiedByGroup = shouldApplySchedule ? await this.countOccupiedByGroup(start, end) : new Map<string, number>();

    devices.forEach((device) => {
      const groupKey = buildDeviceGroupKey(device);
      const current = groups.get(groupKey) || {
        groupKey,
        name: buildDeviceGroupName(device),
        type: device.type,
        brand: device.brand,
        model: device.model,
        availableCount: 0,
        locations: new Set<string>(),
        sampleDeviceId: device.id,
      };
      current.availableCount += 1;
      current.locations.add(device.location);
      groups.set(groupKey, current);
    });

    return Array.from(groups.values()).map((group) => ({
      ...group,
      availableCount: Math.max(0, group.availableCount - (occupiedByGroup.get(group.groupKey) || 0)),
      locations: Array.from(group.locations),
    }));
  }

  private async countOccupiedByGroup(start: Date, end: Date) {
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
    const occupied = new Map<string, number>();
    requests.forEach((request) => {
      const groupKey = [request.requestedType, request.requestedBrand || '', request.requestedModel || ''].join('::');
      occupied.set(groupKey, (occupied.get(groupKey) || 0) + request.quantity);
    });
    return occupied;
  }

  async get(id: string) {
    const device = await this.prisma.device.findUnique({
      where: { id },
      include: { owner: { select: { id: true, name: true } } },
    });
    if (!device || device.deletedAt) {
      throw new NotFoundException('设备不存在');
    }
    return device;
  }

  async create(dto: CreateDeviceDto, user: RequestUser) {
    const { quantity = 1, ...deviceData } = dto;
    const codes = await this.generateDeviceCodes(dto.type, quantity);
    const devices = await this.prisma.$transaction(
      codes.map((code) =>
        this.prisma.device.create({
          data: {
            ...deviceData,
            code,
            purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
            warrantyExpireDate: dto.warrantyExpireDate ? new Date(dto.warrantyExpireDate) : undefined,
          },
        }),
      ),
    );
    await this.auditLogs.record({
      actorId: user.id,
      action: 'CREATE_DEVICE',
      targetType: 'DEVICE',
      targetId: devices[0]?.id,
      detail: { name: dto.name, type: dto.type, quantity, codes },
    });
    return quantity === 1 ? devices[0] : devices;
  }

  async update(id: string, dto: UpdateDeviceDto, user: RequestUser) {
    await this.get(id);
    const device = await this.prisma.device.update({
      where: { id },
      data: {
        ...dto,
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
        warrantyExpireDate: dto.warrantyExpireDate ? new Date(dto.warrantyExpireDate) : undefined,
      },
    });
    await this.auditLogs.record({
      actorId: user.id,
      action: 'UPDATE_DEVICE',
      targetType: 'DEVICE',
      targetId: id,
      detail: dto,
    });
    return device;
  }

  async changeStatus(id: string, status: string, user: RequestUser) {
    const device = await this.get(id);
    if (!([Roles.ADMIN] as string[]).includes(user.role)) {
      throw new BadRequestException('只有管理员可以变更设备状态');
    }
    if (device.status === DeviceStatus.BORROWED && ([DeviceStatus.DISABLED, DeviceStatus.SCRAPPED] as string[]).includes(status)) {
      throw new BadRequestException('借出中的设备不能直接停用或报废');
    }
    const updated = await this.prisma.device.update({ where: { id }, data: { status } });
    await this.auditLogs.record({
      actorId: user.id,
      action: `CHANGE_DEVICE_STATUS_${status}`,
      targetType: 'DEVICE',
      targetId: id,
      detail: { from: device.status, to: status },
    });
    return updated;
  }

  async remove(id: string, user: RequestUser) {
    const device = await this.get(id);
    const blockedStatuses = [
      DeviceStatus.BORROW_PENDING,
      DeviceStatus.RESERVED,
      DeviceStatus.BORROWED,
      DeviceStatus.REPAIRING,
    ] as string[];
    if (blockedStatuses.includes(device.status)) {
      throw new BadRequestException('当前设备存在借用或维修流程，不能删除');
    }

    const deleted = await this.prisma.device.update({
      where: { id },
      data: { deletedAt: new Date(), status: DeviceStatus.DISABLED },
    });
    await this.auditLogs.record({
      actorId: user.id,
      action: 'DELETE_DEVICE',
      targetType: 'DEVICE',
      targetId: id,
      detail: { code: device.code, name: device.name },
    });
    return deleted;
  }

  async history(id: string) {
    await this.get(id);
    const [borrows, repairs] = await Promise.all([
      this.prisma.borrowRequest.findMany({
        where: { items: { some: { deviceId: id } } },
        orderBy: { createdAt: 'desc' },
        include: {
          applicant: { select: { id: true, name: true } },
          approvals: true,
          items: { include: { device: true } },
        },
      }),
      this.prisma.repairRecord.findMany({
        where: { deviceId: id },
        orderBy: { createdAt: 'desc' },
        include: { repairer: { select: { id: true, name: true } } },
      }),
    ]);
    return { borrows, repairs };
  }

  private async generateDeviceCodes(type: string, quantity: number) {
    const prefix = deviceTypePrefixes[type] || 'EQP';
    const year = new Date().getFullYear();
    const codePrefix = `${prefix}-${year}-`;
    const existingDevices = await this.prisma.device.findMany({
      where: { code: { startsWith: codePrefix } },
      select: { code: true },
    });
    const maxSequence = existingDevices.reduce((max, device) => {
      const sequence = Number(device.code.slice(codePrefix.length));
      return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
    }, 0);

    return Array.from({ length: quantity }, (_, index) =>
      `${codePrefix}${String(maxSequence + index + 1).padStart(3, '0')}`,
    );
  }
}

const deviceTypePrefixes: Record<string, string> = {
  摄影器材: 'CAM',
  电脑设备: 'LAP',
  测试设备: 'TST',
  音频设备: 'AUD',
  会议设备: 'MTG',
  办公设备: 'OFF',
  网络设备: 'NET',
  存储设备: 'STO',
  移动设备: 'MOB',
};

export function buildDeviceGroupKey(device: { type: string; brand?: string | null; model?: string | null }) {
  return [device.type, device.brand || '', device.model || ''].join('::');
}

function buildDeviceGroupName(device: { name: string; brand?: string | null; model?: string | null }) {
  const modelName = [device.brand, device.model].filter(Boolean).join(' ');
  return modelName || device.name;
}
