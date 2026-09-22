import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parseBorrowDate } from '../common/borrow-date';
import { activeBorrowStatuses, BorrowStatus, DeviceStatus, RepairStatus, Roles } from '../common/constants';
import { RequestUser } from '../common/current-user.decorator';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDeviceDictionaryDto,
  BorrowOptionsQueryDto,
  CreateDeviceDto,
  DeviceQueryDto,
  ImportDevicesDto,
  UpdateDeviceDictionaryDto,
  UpdateDeviceDto,
} from './dto';

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

  async dictionaries() {
    const dictionary = await this.getDeviceDictionaryValues();
    const usage = await this.getDictionaryUsage();

    return dictionaryFields.map((field) => ({
      field,
      label: dictionaryFieldLabels[field],
      items: field === 'model'
        ? dictionary.model.map((item) => {
            const key = buildModelDictionaryKey(item);
            return {
              ...item,
              used: (usage.model.get(key) || 0) > 0,
              usageCount: usage.model.get(key) || 0,
            };
          })
        : dictionary[field].map((value) => ({
            value,
            used: (usage[field].get(value) || 0) > 0,
            usageCount: usage[field].get(value) || 0,
          })),
    }));
  }

  async createDictionaryValue(field: DeviceDictionaryField, dto: CreateDeviceDictionaryDto, user: RequestUser) {
    const value = normalizeDictionaryValue(dto.value);
    if (!value) {
      throw new BadRequestException('请输入字典值');
    }

    const dictionary = await this.getDeviceDictionaryValues();
    if (field === 'model') {
      const item = this.normalizeModelDictionaryDto(dto, dictionary);
      if (dictionary.model.some((model) => buildModelDictionaryKey(model) === buildModelDictionaryKey(item))) {
        throw new BadRequestException('型号组合已存在');
      }
      dictionary.model.push(item);
    } else {
      if (dictionary[field].includes(value)) {
        throw new BadRequestException('字典值已存在');
      }
      dictionary[field].push(value);
    }

    await this.saveDeviceDictionaryValues(dictionary);
    await this.auditLogs.record({
      actorId: user.id,
      action: 'CREATE_DEVICE_DICTIONARY_VALUE',
      targetType: 'DEVICE_DICTIONARY',
      detail: { field, value, type: dto.type, brand: dto.brand },
    });
    return this.dictionaries();
  }

  async updateDictionaryValue(field: DeviceDictionaryField, dto: UpdateDeviceDictionaryDto, user: RequestUser) {
    const oldValue = normalizeDictionaryValue(dto.oldValue);
    const value = normalizeDictionaryValue(dto.value);
    if (!oldValue || !value) {
      throw new BadRequestException('请输入字典值');
    }
    if (field !== 'model' && oldValue === value) {
      return this.dictionaries();
    }

    const dictionary = await this.getDeviceDictionaryValues();
    if (field === 'model') {
      const oldItem = this.normalizeModelDictionaryDto({ value: oldValue, type: dto.oldType, brand: dto.oldBrand }, dictionary);
      const nextItem = this.normalizeModelDictionaryDto(dto, dictionary);
      const oldKey = buildModelDictionaryKey(oldItem);
      const nextKey = buildModelDictionaryKey(nextItem);
      if (!dictionary.model.some((model) => buildModelDictionaryKey(model) === oldKey)) {
        throw new BadRequestException('原型号组合不存在');
      }
      if (oldKey !== nextKey && dictionary.model.some((model) => buildModelDictionaryKey(model) === nextKey)) {
        throw new BadRequestException('新型号组合已存在');
      }
      await this.assertDictionaryValueUnused(field, oldKey, '当前型号组合已被使用，不能编辑');
      dictionary.model = dictionary.model.map((item) => (buildModelDictionaryKey(item) === oldKey ? nextItem : item));
    } else {
      if (!dictionary[field].includes(oldValue)) {
        throw new BadRequestException('原字典值不存在');
      }
      if (dictionary[field].includes(value)) {
        throw new BadRequestException('新字典值已存在');
      }
      await this.assertDictionaryValueUnused(field, oldValue, '当前字典值已被使用，不能编辑');
      this.assertDictionaryValueNotReferenced(dictionary, field, oldValue, '当前字典值已被型号组合引用，不能编辑');
      dictionary[field] = dictionary[field].map((item) => (item === oldValue ? value : item));
    }

    await this.saveDeviceDictionaryValues(dictionary);
    await this.auditLogs.record({
      actorId: user.id,
      action: 'UPDATE_DEVICE_DICTIONARY_VALUE',
      targetType: 'DEVICE_DICTIONARY',
      detail: { field, from: oldValue, to: value, oldType: dto.oldType, oldBrand: dto.oldBrand, type: dto.type, brand: dto.brand },
    });
    return this.dictionaries();
  }

  async deleteDictionaryValue(field: DeviceDictionaryField, dto: { value: string; type?: string; brand?: string }, user: RequestUser) {
    const value = normalizeDictionaryValue(dto.value);
    if (!value) {
      throw new BadRequestException('请选择要删除的字典值');
    }

    const dictionary = await this.getDeviceDictionaryValues();
    if (field === 'model') {
      const item = this.normalizeModelDictionaryDto(dto, dictionary);
      const key = buildModelDictionaryKey(item);
      if (!dictionary.model.some((model) => buildModelDictionaryKey(model) === key)) {
        throw new BadRequestException('型号组合不存在');
      }
      await this.assertDictionaryValueUnused(field, key, '当前型号组合已被使用，不能删除');
      dictionary.model = dictionary.model.filter((model) => buildModelDictionaryKey(model) !== key);
    } else {
      if (!dictionary[field].includes(value)) {
        throw new BadRequestException('字典值不存在');
      }
      await this.assertDictionaryValueUnused(field, value, '当前字典值已被使用，不能删除');
      this.assertDictionaryValueNotReferenced(dictionary, field, value, '当前字典值已被型号组合引用，不能删除');
      dictionary[field] = dictionary[field].filter((item) => item !== value);
    }

    await this.saveDeviceDictionaryValues(dictionary);
    await this.auditLogs.record({
      actorId: user.id,
      action: 'DELETE_DEVICE_DICTIONARY_VALUE',
      targetType: 'DEVICE_DICTIONARY',
      detail: { field, value, type: dto.type, brand: dto.brand },
    });
    return this.dictionaries();
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
    const dictionary = await this.getDeviceDictionaryValues();
    validateDeviceDictionaryValues(dto, dictionary);
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

    const dictionary = await this.getDeviceDictionaryValues();
    const normalizedRows = parsed.rows.map((row) => {
      const errors: string[] = [];
      return {
        row: normalizeImportRow(row, parsed.headers, errors, dictionary),
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
    const current = await this.get(id);
    const dictionary = await this.getDeviceDictionaryValues();
    validateDeviceDictionaryValues({
      type: dto.type ?? current.type,
      brand: dto.brand ?? current.brand ?? undefined,
      model: dto.model ?? current.model ?? undefined,
      location: dto.location ?? current.location,
    }, dictionary);
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

  private async getDeviceDictionaryValues(): Promise<DeviceDictionaryValues> {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key: deviceDictionarySettingKey } });
    if (!setting) {
      const dictionary = cloneDefaultDeviceDictionary();
      const enriched = await this.enrichDictionaryWithExistingDevices(dictionary);
      await this.saveDeviceDictionaryValues(enriched);
      return enriched;
    }

    try {
      const dictionary = sanitizeDeviceDictionary(JSON.parse(setting.value));
      const enriched = await this.enrichDictionaryWithExistingDevices(dictionary);
      if (JSON.stringify(enriched) !== JSON.stringify(dictionary)) {
        await this.saveDeviceDictionaryValues(enriched);
      }
      return enriched;
    } catch {
      const dictionary = cloneDefaultDeviceDictionary();
      const enriched = await this.enrichDictionaryWithExistingDevices(dictionary);
      await this.saveDeviceDictionaryValues(enriched);
      return enriched;
    }
  }

  private async saveDeviceDictionaryValues(dictionary: DeviceDictionaryValues) {
    const sanitized = sanitizeDeviceDictionary(dictionary);
    await this.prisma.systemSetting.upsert({
      where: { key: deviceDictionarySettingKey },
      create: {
        key: deviceDictionarySettingKey,
        value: JSON.stringify(sanitized),
      },
      update: {
        value: JSON.stringify(sanitized),
      },
    });
  }

  private async getDictionaryUsage(): Promise<Record<DeviceDictionaryField, Map<string, number>>> {
    const usage = createEmptyDictionaryUsage();
    const dictionary = await this.getDeviceDictionaryValues();
    const devices = await this.prisma.device.findMany({
      where: { deletedAt: null },
      select: { type: true, brand: true, model: true, location: true },
    });

    devices.forEach((device) => {
      addUsage(usage.type, device.type);
      addUsage(usage.brand, device.brand);
      addUsage(usage.model, buildModelDictionaryKey({ type: device.type, brand: device.brand || '', value: device.model || '' }));
      addUsage(usage.location, device.location);
    });

    dictionary.model.forEach((item) => {
      addUsage(usage.type, item.type);
      addUsage(usage.brand, item.brand);
    });

    return usage;
  }

  private async assertDictionaryValueUnused(field: DeviceDictionaryField, value: string, message: string) {
    const usage = await this.getDictionaryUsage();
    if ((usage[field].get(value) || 0) > 0) {
      throw new BadRequestException(message);
    }
  }

  private async enrichDictionaryWithExistingDevices(dictionary: DeviceDictionaryValues) {
    const next = sanitizeDeviceDictionary(dictionary);
    const devices = await this.prisma.device.findMany({
      where: { deletedAt: null },
      select: { type: true, brand: true, model: true, location: true },
    });
    devices.forEach((device) => {
      pushUnique(next.type, device.type);
      pushUnique(next.brand, device.brand);
      pushUnique(next.location, device.location);
      const model = normalizeDictionaryValue(device.model);
      const brand = normalizeDictionaryValue(device.brand);
      const type = normalizeDictionaryValue(device.type);
      if (type && brand && model) {
        pushUniqueModel(next.model, { type, brand, value: model });
      }
    });
    return next;
  }

  private normalizeModelDictionaryDto(
    dto: { value?: string; type?: string; brand?: string },
    dictionary: DeviceDictionaryValues,
  ): DeviceModelDictionaryItem {
    const type = normalizeDictionaryValue(dto.type);
    const brand = normalizeDictionaryValue(dto.brand);
    const value = normalizeDictionaryValue(dto.value);
    if (!type) {
      throw new BadRequestException('请选择设备类型');
    }
    if (!brand) {
      throw new BadRequestException('请选择品牌');
    }
    if (!value) {
      throw new BadRequestException('请输入型号');
    }
    if (!dictionary.type.includes(type)) {
      throw new BadRequestException(`设备类型不在字典范围内：${type}`);
    }
    if (!dictionary.brand.includes(brand)) {
      throw new BadRequestException(`品牌不在字典范围内：${brand}`);
    }
    return { type, brand, value };
  }

  private assertDictionaryValueNotReferenced(
    dictionary: DeviceDictionaryValues,
    field: DeviceDictionaryField,
    value: string,
    message: string,
  ) {
    if (field === 'type' && dictionary.model.some((item) => item.type === value)) {
      throw new BadRequestException(message);
    }
    if (field === 'brand' && dictionary.model.some((item) => item.brand === value)) {
      throw new BadRequestException(message);
    }
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

type DeviceDictionaryField = 'type' | 'brand' | 'model' | 'location';

type DeviceModelDictionaryItem = {
  type: string;
  brand: string;
  value: string;
};

type DeviceDictionaryValues = {
  type: string[];
  brand: string[];
  model: DeviceModelDictionaryItem[];
  location: string[];
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

function normalizeImportRow(
  row: RawCsvRow,
  headers: string[],
  errors: string[],
  dictionary: DeviceDictionaryValues,
): NormalizedImportRow {
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
  if (type && !dictionary.type.includes(type)) {
    errors.push(`${line} 设备类型不在可选范围内：${type}`);
  }
  if (brand && !dictionary.brand.includes(brand)) {
    errors.push(`${line} 品牌不在可选范围内：${brand}`);
  }
  if (type && brand && model && !hasModelDictionaryItem(dictionary, { type, brand, value: model })) {
    errors.push(`${line} 型号组合不在可选范围内：${type} / ${brand} / ${model}`);
  }
  if (location && !dictionary.location.includes(location)) {
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

const deviceDictionarySettingKey = 'DEVICE_DICTIONARY_VALUES';

const dictionaryFields: DeviceDictionaryField[] = ['type', 'brand', 'model', 'location'];

const dictionaryFieldLabels: Record<DeviceDictionaryField, string> = {
  type: '设备类型',
  brand: '品牌',
  model: '型号组合',
  location: '存放地点',
};

const defaultDeviceDictionary: DeviceDictionaryValues = {
  type: ['摄影器材', '电脑设备', '测试设备', '音频设备', '会议设备', '办公设备', '网络设备', '存储设备', '移动设备'],
  brand: ['Sony', 'Apple', 'Fluke', 'Jabra', 'Epson', 'Lenovo', 'DJI', 'Brother', 'H3C', 'SanDisk', 'Xiaomi', 'Honeywell'],
  model: [
    { type: '摄影器材', brand: 'Sony', value: 'A7M4' },
    { type: '电脑设备', brand: 'Apple', value: 'M3 Pro' },
    { type: '测试设备', brand: 'Fluke', value: 'LinkIQ' },
    { type: '音频设备', brand: 'Jabra', value: 'Speak2 75' },
    { type: '会议设备', brand: 'Epson', value: 'CB-FH52' },
    { type: '会议设备', brand: 'Lenovo', value: 'ThinkVision M14' },
    { type: '摄影器材', brand: 'DJI', value: 'RS 4' },
    { type: '音频设备', brand: 'Sony', value: 'ICD-UX570F' },
    { type: '办公设备', brand: 'Brother', value: 'PT-P900' },
    { type: '网络设备', brand: 'H3C', value: 'Magic BE18000' },
    { type: '存储设备', brand: 'SanDisk', value: 'Extreme Pro' },
    { type: '移动设备', brand: 'Xiaomi', value: '14 Pro' },
    { type: '办公设备', brand: 'Honeywell', value: '1950GHD' },
  ],
  location: ['行政库房 A1', '行政库房 A2', '行政库房 A3', '行政库房 B1', '行政库房 B2', '行政库房 B3', '行政库房 B4', '行政库房 D1', '行政库房 D2', '实验室 C1', '实验室 C3', '产品部'],
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

function cloneDefaultDeviceDictionary(): DeviceDictionaryValues {
  return sanitizeDeviceDictionary(defaultDeviceDictionary);
}

function sanitizeDeviceDictionary(input: unknown): DeviceDictionaryValues {
  const source = typeof input === 'object' && input ? input as Partial<DeviceDictionaryValues> : {};
  return {
    type: sanitizeStringDictionary(source.type, defaultDeviceDictionary.type),
    brand: sanitizeStringDictionary(source.brand, defaultDeviceDictionary.brand),
    location: sanitizeStringDictionary(source.location, defaultDeviceDictionary.location),
    model: sanitizeModelDictionary(source.model, source.type, source.brand),
  };
}

function normalizeDictionaryValue(value: unknown) {
  return String(value || '').trim();
}

function sanitizeStringDictionary(values: unknown, defaults: string[]) {
  const source = Array.isArray(values) ? values : defaults;
  return Array.from(new Set(source.map((item) => normalizeDictionaryValue(item)).filter(Boolean)));
}

function sanitizeModelDictionary(values: unknown, rawTypes: unknown, rawBrands: unknown) {
  const models = Array.isArray(values) ? values : defaultDeviceDictionary.model;
  const types = sanitizeStringDictionary(rawTypes, defaultDeviceDictionary.type);
  const brands = sanitizeStringDictionary(rawBrands, defaultDeviceDictionary.brand);
  const fallbackType = types[0] || defaultDeviceDictionary.type[0];
  const fallbackBrand = brands[0] || defaultDeviceDictionary.brand[0];
  const mapped = models.map((item) => {
    if (typeof item === 'object' && item) {
      const model = item as Partial<DeviceModelDictionaryItem>;
      return {
        type: normalizeDictionaryValue(model.type) || fallbackType,
        brand: normalizeDictionaryValue(model.brand) || fallbackBrand,
        value: normalizeDictionaryValue(model.value),
      };
    }

    const value = normalizeDictionaryValue(item);
    const defaultModel = defaultDeviceDictionary.model.find((model) => model.value === value);
    return {
      type: defaultModel?.type || fallbackType,
      brand: defaultModel?.brand || fallbackBrand,
      value,
    };
  }).filter((item) => item.type && item.brand && item.value);

  return Array.from(
    new Map(mapped.map((item) => [buildModelDictionaryKey(item), item])).values(),
  );
}

function validateDeviceDictionaryValues(
  dto: Partial<Pick<CreateDeviceDto, 'type' | 'brand' | 'model' | 'location'>>,
  dictionary: DeviceDictionaryValues,
) {
  validateDictionaryValue('type', dto.type, dictionary);
  validateDictionaryValue('brand', dto.brand, dictionary);
  validateDictionaryValue('location', dto.location, dictionary);
  validateModelDictionaryValue(dto, dictionary);
}

function validateDictionaryValue(field: Exclude<DeviceDictionaryField, 'model'>, value: string | undefined, dictionary: DeviceDictionaryValues) {
  const normalized = normalizeDictionaryValue(value);
  if (!normalized) {
    throw new BadRequestException(`请选择${dictionaryFieldLabels[field]}`);
  }
  if (!dictionary[field].includes(normalized)) {
    throw new BadRequestException(`${dictionaryFieldLabels[field]}不在字典范围内：${normalized}`);
  }
}

function validateModelDictionaryValue(
  dto: Partial<Pick<CreateDeviceDto, 'type' | 'brand' | 'model'>>,
  dictionary: DeviceDictionaryValues,
) {
  const type = normalizeDictionaryValue(dto.type);
  const brand = normalizeDictionaryValue(dto.brand);
  const value = normalizeDictionaryValue(dto.model);
  if (!value) {
    throw new BadRequestException('请选择型号');
  }
  if (!hasModelDictionaryItem(dictionary, { type, brand, value })) {
    throw new BadRequestException(`型号组合不在字典范围内：${type} / ${brand} / ${value}`);
  }
}

function createEmptyDictionaryUsage(): Record<DeviceDictionaryField, Map<string, number>> {
  return dictionaryFields.reduce((acc, field) => {
    acc[field] = new Map<string, number>();
    return acc;
  }, {} as Record<DeviceDictionaryField, Map<string, number>>);
}

function addUsage(usage: Map<string, number>, value?: string | null) {
  const normalized = normalizeDictionaryValue(value);
  if (!normalized) return;
  usage.set(normalized, (usage.get(normalized) || 0) + 1);
}

function buildModelDictionaryKey(item: { type?: string | null; brand?: string | null; value?: string | null }) {
  return [
    normalizeDictionaryValue(item.type),
    normalizeDictionaryValue(item.brand),
    normalizeDictionaryValue(item.value),
  ].join('::');
}

function hasModelDictionaryItem(dictionary: DeviceDictionaryValues, item: DeviceModelDictionaryItem) {
  const key = buildModelDictionaryKey(item);
  return dictionary.model.some((model) => buildModelDictionaryKey(model) === key);
}

function pushUnique(values: string[], value?: string | null) {
  const normalized = normalizeDictionaryValue(value);
  if (normalized && !values.includes(normalized)) {
    values.push(normalized);
  }
}

function pushUniqueModel(values: DeviceModelDictionaryItem[], item: DeviceModelDictionaryItem) {
  if (!values.some((model) => buildModelDictionaryKey(model) === buildModelDictionaryKey(item))) {
    values.push(item);
  }
}

export function buildDeviceGroupKey(device: { type: string; brand?: string | null; model?: string | null }) {
  return [device.type, device.brand || '', device.model || ''].join('::');
}

function buildDeviceGroupName(device: { name: string; brand?: string | null; model?: string | null }) {
  const modelName = [device.brand, device.model].filter(Boolean).join(' ');
  return modelName || device.name;
}
