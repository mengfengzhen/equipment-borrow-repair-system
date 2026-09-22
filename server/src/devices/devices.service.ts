import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parseBorrowDate } from '../common/borrow-date';
import { activeBorrowStatuses, BorrowStatus, DeviceStatus, RepairStatus, Roles } from '../common/constants';
import { RequestUser } from '../common/current-user.decorator';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { BorrowOptionsQueryDto, CreateDeviceDto, DeviceQueryDto, ImportDevicesDto, UpdateDeviceDto } from './dto';

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
    const start = query.borrowStartAt ? parseBorrowDate(query.borrowStartAt, 'start') : undefined;
    const end = query.borrowEndAt ? parseBorrowDate(query.borrowEndAt, 'end') : undefined;
    const shouldApplySchedule = start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start < end;
    const devices = await this.prisma.device.findMany({
      where: {
        deletedAt: null,
        status: shouldApplySchedule
          ? { notIn: [DeviceStatus.DISABLED, DeviceStatus.SCRAPPED, DeviceStatus.WAITING_REPAIR, DeviceStatus.REPAIRING] }
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

  async importFromCsv(dto: ImportDevicesDto, user: RequestUser) {
    const parsed = parseDeviceCsv(dto.csvText);
    if (!parsed.rows.length) {
      throw new BadRequestException('CSV 中没有可导入的数据行');
    }

    const normalizedRows = parsed.rows.map((row) => {
      const errors: string[] = [];
      return {
        row: normalizeImportRow(row, parsed.headers, errors),
        errors,
      };
    });

    const ownerUsernames = Array.from(new Set(
      normalizedRows
        .filter((item) => !item.errors.length)
        .map((item) => item.row.ownerUsername)
        .filter((value): value is string => Boolean(value)),
    ));
    const owners = ownerUsernames.length
      ? await this.prisma.user.findMany({ where: { username: { in: ownerUsernames } }, select: { id: true, username: true } })
      : [];
    const ownerByUsername = new Map(owners.map((owner) => [owner.username, owner.id]));
    normalizedRows.forEach((item) => {
      const username = item.row.ownerUsername;
      if (username && !ownerByUsername.has(username)) {
        item.errors.push(`第 ${item.row.lineNumber} 行 默认保管责任人账号不存在：${username}`);
      }
    });

    const importableRows = normalizedRows.filter((item) => !item.errors.length).map((item) => item.row);
    const skippedErrors = normalizedRows.flatMap((item) => item.errors);
    if (!importableRows.length) {
      return {
        rowCount: parsed.rows.length,
        importedCount: 0,
        skippedCount: normalizedRows.length,
        errors: skippedErrors.slice(0, 50),
      };
    }

    const expandedRows = importableRows.flatMap((row) =>
      Array.from({ length: row.quantity }, () => ({
        name: row.name,
        type: row.type,
        brand: row.brand,
        model: row.model,
        location: row.location,
        ownerId: row.ownerUsername ? ownerByUsername.get(row.ownerUsername) : undefined,
        purchaseDate: row.purchaseDate,
        warrantyExpireDate: row.warrantyExpireDate,
        value: row.value,
        description: row.description,
      })),
    );

    const codeAllocators = await this.createCodeAllocators(Array.from(new Set(expandedRows.map((row) => row.type))));
    const created = await this.prisma.$transaction(
      expandedRows.map((row) => {
        const nextCode = codeAllocators.get(row.type);
        if (!nextCode) {
          throw new BadRequestException(`无法生成设备编号：${row.type}`);
        }
        return this.prisma.device.create({
          data: {
            ...row,
            code: nextCode(),
          },
        });
      }),
    );

    await this.auditLogs.record({
      actorId: user.id,
      action: 'IMPORT_DEVICES',
      targetType: 'DEVICE',
      targetId: created[0]?.id,
      detail: {
        rowCount: parsed.rows.length,
        importedCount: created.length,
        skippedCount: skippedErrors.length ? normalizedRows.length - importableRows.length : 0,
      },
    });

    return {
      rowCount: parsed.rows.length,
      importedCount: created.length,
      skippedCount: normalizedRows.length - importableRows.length,
      errors: skippedErrors.slice(0, 50),
    };
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
    const protectedStatuses = [
      DeviceStatus.BORROW_PENDING,
      DeviceStatus.RESERVED,
      DeviceStatus.BORROWED,
      DeviceStatus.WAITING_REPAIR,
      DeviceStatus.REPAIRING,
    ] as string[];
    if (protectedStatuses.includes(device.status) && ([DeviceStatus.DISABLED, DeviceStatus.SCRAPPED] as string[]).includes(status)) {
      throw new BadRequestException('当前设备存在借用或维修流程，不能直接停用或报废');
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
      DeviceStatus.WAITING_REPAIR,
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

  private async createCodeAllocators(types: string[]) {
    const allocators = new Map<string, () => string>();
    await Promise.all(types.map(async (type) => {
      const prefix = deviceTypePrefixes[type] || 'EQP';
      const year = new Date().getFullYear();
      const codePrefix = `${prefix}-${year}-`;
      const existingDevices = await this.prisma.device.findMany({
        where: { code: { startsWith: codePrefix } },
        select: { code: true },
      });
      let sequence = existingDevices.reduce((max, device) => {
        const current = Number(device.code.slice(codePrefix.length));
        return Number.isFinite(current) ? Math.max(max, current) : max;
      }, 0);
      allocators.set(type, () => {
        sequence += 1;
        return `${codePrefix}${String(sequence).padStart(3, '0')}`;
      });
    }));
    return allocators;
  }
}

type RawCsvRow = {
  lineNumber: number;
  values: string[];
};

type NormalizedImportRow = {
  lineNumber: number;
  name: string;
  type: string;
  quantity: number;
  brand?: string;
  model?: string;
  location: string;
  ownerUsername?: string;
  purchaseDate?: Date;
  warrantyExpireDate?: Date;
  value?: number;
  description?: string;
};

function parseDeviceCsv(csvText: string) {
  const table = parseCsv(csvText.replace(/^\uFEFF/, ''));
  if (table.length < 2) {
    throw new BadRequestException('CSV 至少需要包含表头和一行数据');
  }
  const headers = table[0].map((header) => normalizeHeader(header));
  const rows: RawCsvRow[] = table
    .slice(1)
    .map((values, index) => ({ lineNumber: index + 2, values }))
    .filter((row) => row.values.some((value) => value.trim()));
  return { headers, rows };
}

function normalizeImportRow(row: RawCsvRow, headers: string[], errors: string[]): NormalizedImportRow {
  const read = (key: string) => {
    const index = headers.indexOf(key);
    return index >= 0 ? (row.values[index] || '').trim() : '';
  };
  const line = `第 ${row.lineNumber} 行`;
  const name = read('name');
  const type = read('type');
  const brand = read('brand');
  const model = read('model');
  const location = read('location');
  const quantityText = read('quantity') || '1';
  const quantity = Number(quantityText);
  const purchaseDate = parseOptionalDate(read('purchaseDate'), `${line} 购买时间`, errors);
  const warrantyExpireDate = parseOptionalDate(read('warrantyExpireDate'), `${line} 保修到期时间`, errors);
  const value = parseOptionalNumber(read('value'), `${line} 设备价值`, errors);

  if (!name) errors.push(`${line} 缺少设备名称`);
  if (!type) errors.push(`${line} 缺少设备类型`);
  if (!brand) errors.push(`${line} 缺少品牌`);
  if (!model) errors.push(`${line} 缺少型号`);
  if (!location) errors.push(`${line} 缺少存放地点`);
  if (type && !allowedDeviceTypes.has(type)) {
    errors.push(`${line} 设备类型不在可选范围内：${type}`);
  }
  if (brand && !allowedDeviceBrands.has(brand)) {
    errors.push(`${line} 品牌不在可选范围内：${brand}`);
  }
  if (model && !allowedDeviceModels.has(model)) {
    errors.push(`${line} 型号不在可选范围内：${model}`);
  }
  if (location && !allowedDeviceLocations.has(location)) {
    errors.push(`${line} 存放地点不在可选范围内：${location}`);
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    errors.push(`${line} 入库数量必须是 1-100 的整数`);
  }

  return {
    lineNumber: row.lineNumber,
    name,
    type,
    quantity: Number.isInteger(quantity) ? quantity : 1,
    brand: brand || undefined,
    model: model || undefined,
    location,
    ownerUsername: read('ownerUsername') || undefined,
    purchaseDate,
    warrantyExpireDate,
    value,
    description: read('description') || undefined,
  };
}

function parseOptionalDate(value: string, label: string, errors: string[]) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    errors.push(`${label}格式不正确，请使用 YYYY-MM-DD`);
    return undefined;
  }
  return date;
}

function parseOptionalNumber(value: string, label: string, errors: string[]) {
  if (!value) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    errors.push(`${label}必须是数字`);
    return undefined;
  }
  return number;
}

function parseCsv(csvText: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      currentRow.push(current);
      rows.push(currentRow);
      currentRow = [];
      current = '';
      continue;
    }

    current += char;
  }

  currentRow.push(current);
  rows.push(currentRow);
  return rows.filter((row) => row.some((value) => value.trim()));
}

function normalizeHeader(header: string) {
  const key = header.trim().replace(/\s+/g, '').toLowerCase();
  return headerAliases[key] || key;
}

const headerAliases: Record<string, string> = {
  name: 'name',
  设备名称: 'name',
  type: 'type',
  设备类型: 'type',
  quantity: 'quantity',
  入库数量: 'quantity',
  数量: 'quantity',
  brand: 'brand',
  品牌: 'brand',
  model: 'model',
  型号: 'model',
  location: 'location',
  存放地点: 'location',
  位置: 'location',
  ownerusername: 'ownerUsername',
  保管人账号: 'ownerUsername',
  责任人账号: 'ownerUsername',
  默认保管责任人账号: 'ownerUsername',
  purchasedate: 'purchaseDate',
  购买时间: 'purchaseDate',
  warrantyexpiredate: 'warrantyExpireDate',
  保修到期时间: 'warrantyExpireDate',
  value: 'value',
  设备价值: 'value',
  价值: 'value',
  description: 'description',
  说明: 'description',
  备注: 'description',
};

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

const allowedDeviceTypes = new Set(Object.keys(deviceTypePrefixes));

const allowedDeviceBrands = new Set([
  'Sony',
  'Apple',
  'Fluke',
  'Jabra',
  'Epson',
  'Lenovo',
  'DJI',
  'Brother',
  'H3C',
  'SanDisk',
  'Xiaomi',
  'Honeywell',
]);

const allowedDeviceModels = new Set([
  'A7M4',
  'M3 Pro',
  'LinkIQ',
  'Speak2 75',
  'CB-FH52',
  'ThinkVision M14',
  'RS 4',
  'ICD-UX570F',
  'PT-P900',
  'Magic BE18000',
  'Extreme Pro',
  '14 Pro',
  '1950GHD',
]);

const allowedDeviceLocations = new Set([
  '行政库房 A1',
  '行政库房 A2',
  '行政库房 A3',
  '行政库房 B1',
  '行政库房 B2',
  '行政库房 B3',
  '行政库房 B4',
  '行政库房 D1',
  '行政库房 D2',
  '实验室 C1',
  '实验室 C3',
  '产品部',
]);

export function buildDeviceGroupKey(device: { type: string; brand?: string | null; model?: string | null }) {
  return [device.type, device.brand || '', device.model || ''].join('::');
}

function buildDeviceGroupName(device: { name: string; brand?: string | null; model?: string | null }) {
  const modelName = [device.brand, device.model].filter(Boolean).join(' ');
  return modelName || device.name;
}
