import { Injectable } from '@nestjs/common';
import { BorrowStatus, DeviceStatus, RepairStatus } from '../common/constants';
import { RequestUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(user: RequestUser) {
    const now = new Date();
    const userDepartmentWhere = user.departmentId ? { departmentId: user.departmentId } : { id: '__NO_DEPARTMENT__' };
    const [
      totalDevices,
      availableDevices,
      borrowedDevices,
      repairingDevices,
      pendingApprovals,
      waitingPickup,
      activeRepairs,
      overdueBorrows,
      userPendingBorrows,
      userNeedMoreInfo,
      userApprovedBorrows,
      userActiveBorrows,
      userOverdueBorrows,
      managerPendingApprovals,
      managerNeedMoreInfo,
      managerApprovedBorrows,
      managerOverdueBorrows,
      repairWaitingAccept,
      repairMyRepairing,
      repairMyWaitingParts,
      repairMyFinished,
      recentLogs,
      deviceStatusGroups,
    ] = await Promise.all([
      this.prisma.device.count({ where: { deletedAt: null } }),
      this.prisma.device.count({ where: { deletedAt: null, status: DeviceStatus.AVAILABLE } }),
      this.prisma.device.count({ where: { deletedAt: null, status: DeviceStatus.BORROWED } }),
      this.prisma.device.count({ where: { deletedAt: null, status: DeviceStatus.REPAIRING } }),
      this.prisma.borrowRequest.count({ where: { status: BorrowStatus.PENDING_APPROVAL } }),
      this.prisma.borrowRequest.count({ where: { status: BorrowStatus.APPROVED } }),
      this.prisma.repairRecord.count({
        where: {
          status: { in: [RepairStatus.WAITING_ACCEPT, RepairStatus.REPAIRING, RepairStatus.WAITING_PARTS, RepairStatus.WAITING_CONFIRM] },
        },
      }),
      this.prisma.borrowRequest.count({
        where: {
          status: { in: [BorrowStatus.APPROVED, BorrowStatus.PICKED_UP, BorrowStatus.OVERDUE] },
          borrowEndAt: { lt: now },
        },
      }),
      this.prisma.borrowRequest.count({ where: { applicantId: user.id, status: BorrowStatus.PENDING_APPROVAL } }),
      this.prisma.borrowRequest.count({ where: { applicantId: user.id, status: BorrowStatus.NEED_MORE_INFO } }),
      this.prisma.borrowRequest.count({ where: { applicantId: user.id, status: BorrowStatus.APPROVED } }),
      this.prisma.borrowRequest.count({
        where: { applicantId: user.id, status: { in: [BorrowStatus.PICKED_UP, BorrowStatus.OVERDUE] } },
      }),
      this.prisma.borrowRequest.count({
        where: { applicantId: user.id, status: { in: [BorrowStatus.PICKED_UP, BorrowStatus.OVERDUE] }, borrowEndAt: { lt: now } },
      }),
      this.prisma.borrowRequest.count({ where: { ...userDepartmentWhere, status: BorrowStatus.PENDING_APPROVAL } }),
      this.prisma.borrowRequest.count({ where: { ...userDepartmentWhere, status: BorrowStatus.NEED_MORE_INFO } }),
      this.prisma.borrowRequest.count({ where: { ...userDepartmentWhere, status: BorrowStatus.APPROVED } }),
      this.prisma.borrowRequest.count({
        where: { ...userDepartmentWhere, status: { in: [BorrowStatus.PICKED_UP, BorrowStatus.OVERDUE] }, borrowEndAt: { lt: now } },
      }),
      this.prisma.repairRecord.count({ where: { status: RepairStatus.WAITING_ACCEPT, repairerId: null } }),
      this.prisma.repairRecord.count({ where: { repairerId: user.id, status: RepairStatus.REPAIRING } }),
      this.prisma.repairRecord.count({ where: { repairerId: user.id, status: RepairStatus.WAITING_PARTS } }),
      this.prisma.repairRecord.count({
        where: { repairerId: user.id, status: { in: [RepairStatus.WAITING_CONFIRM, RepairStatus.FIXED, RepairStatus.UNREPAIRABLE] } },
      }),
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: { actor: { select: { name: true, role: true } } },
      }),
      this.prisma.device.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true }),
    ]);

    return {
      totalDevices,
      availableDevices,
      borrowedDevices,
      repairingDevices,
      pendingApprovals,
      waitingPickup,
      activeRepairs,
      overdueBorrows,
      userPendingBorrows,
      userNeedMoreInfo,
      userApprovedBorrows,
      userActiveBorrows,
      userOverdueBorrows,
      managerPendingApprovals,
      managerNeedMoreInfo,
      managerApprovedBorrows,
      managerOverdueBorrows,
      repairWaitingAccept,
      repairMyRepairing,
      repairMyWaitingParts,
      repairMyFinished,
      recentLogs,
      deviceStatusCounts: deviceStatusGroups.map((item) => ({ status: item.status, count: item._count })),
    };
  }

  async deviceStatus() {
    const groups = await this.prisma.device.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true });
    return groups.map((item) => ({ status: item.status, count: item._count }));
  }

  async reports(query: { startAt?: string; endAt?: string; departmentId?: string; type?: string } = {}) {
    const now = new Date();
    const hasOperationalScope = Boolean(query.startAt || query.endAt || query.departmentId);
    const timeWhere = {
      ...(query.startAt || query.endAt
        ? {
            createdAt: {
              ...(query.startAt ? { gte: new Date(query.startAt) } : {}),
              ...(query.endAt ? { lte: new Date(query.endAt) } : {}),
            },
          }
        : {}),
    };
    const deviceTypeWhere = query.type ? { type: query.type } : {};
    const borrowWhere = {
      ...timeWhere,
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.type ? { items: { some: { device: { type: query.type } } } } : {}),
    };
    const repairWhere = {
      ...timeWhere,
      ...(query.departmentId ? { borrowRequest: { departmentId: query.departmentId } } : {}),
      ...(query.type ? { device: { type: query.type } } : {}),
    };
    const overdueWhere = {
      status: { in: [BorrowStatus.PICKED_UP, BorrowStatus.OVERDUE] },
      borrowEndAt: { lt: now },
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.type ? { items: { some: { device: { type: query.type } } } } : {}),
    };
    const monthStarts = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      return date;
    });
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [
      departmentGroups,
      borrowRows,
      repairRows,
      monthlyRows,
      overdueRows,
    ] = await Promise.all([
      this.prisma.borrowRequest.groupBy({ by: ['departmentId'], where: borrowWhere, _count: true }),
      this.prisma.borrowRequest.findMany({
        where: borrowWhere,
        include: {
          items: {
            include: { device: { select: { id: true, name: true, code: true, type: true, brand: true, model: true, status: true } } },
          },
        },
      }),
      this.prisma.repairRecord.findMany({
        where: repairWhere,
        include: { device: { select: { id: true, name: true, code: true, type: true, brand: true, model: true, status: true } } },
      }),
      this.prisma.borrowRequest.findMany({
        where: {
          ...borrowWhere,
          createdAt: {
            gte: query.startAt ? new Date(query.startAt) : monthStarts[0],
            lt: query.endAt ? new Date(query.endAt) : nextMonth,
          },
        },
        select: { createdAt: true },
      }),
      this.prisma.borrowRequest.findMany({
        where: overdueWhere,
        include: {
          items: {
            include: { device: { select: { id: true, name: true, code: true, type: true, brand: true, model: true } } },
          },
          applicant: { select: { id: true, name: true, username: true } },
          department: { select: { id: true, name: true } },
        },
        orderBy: { borrowEndAt: 'asc' },
        take: 10,
      }),
    ]);

    const [statusGroups, typeGroups] = hasOperationalScope
      ? [
          groupDevicesBy(flattenBorrowRows(borrowRows), repairRows, 'status'),
          groupDevicesBy(flattenBorrowRows(borrowRows), repairRows, 'type'),
        ]
      : await Promise.all([
          this.prisma.device.groupBy({ by: ['status'], where: { deletedAt: null, ...deviceTypeWhere }, _count: true })
            .then((rows) => rows.map((item) => ({ name: item.status, count: item._count }))),
          this.prisma.device.groupBy({ by: ['type'], where: { deletedAt: null, ...deviceTypeWhere }, _count: true })
            .then((rows) => rows.map((item) => ({ name: item.type, count: item._count }))),
        ]);

    const departments = await this.prisma.department.findMany({ select: { id: true, name: true } });
    const departmentNameMap = Object.fromEntries(departments.map((department) => [department.id, department.name]));

    return {
      byStatus: statusGroups,
      byType: typeGroups,
      byDepartment: departmentGroups.map((item) => ({
        name: item.departmentId ? departmentNameMap[item.departmentId] || '未知部门' : '未分配部门',
        count: item._count,
      })),
      topBorrowed: topByDevice(flattenBorrowRows(borrowRows), repairRows, 'borrow'),
      topRepaired: topByDevice(flattenBorrowRows(borrowRows), repairRows, 'repair'),
      overdueBorrows: overdueRows.map((row) => ({ ...row, device: row.items[0]?.device })),
      monthlyBorrows: monthStarts.map((monthStart) => {
        const monthKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;
        return {
          month: monthKey,
          count: monthlyRows.filter((row) => {
            const rowKey = `${row.createdAt.getFullYear()}-${String(row.createdAt.getMonth() + 1).padStart(2, '0')}`;
            return rowKey === monthKey;
          }).length,
        };
      }),
    };
  }
}

type RankingDevice = {
  id: string;
  name: string;
  code: string;
  type: string;
  brand?: string | null;
  model?: string | null;
  status: string;
};

type BorrowRankingRow = {
  borrowStartAt: Date;
  borrowEndAt: Date;
  returnedAt: Date | null;
  device: RankingDevice;
};

type BorrowRequestRankingRow = {
  borrowStartAt: Date;
  borrowEndAt: Date;
  returnedAt: Date | null;
  items: Array<{ device: RankingDevice }>;
};

type RepairRankingRow = {
  cost: number | null;
  device: RankingDevice;
};

function groupDevicesBy(
  borrowRows: BorrowRankingRow[],
  repairRows: RepairRankingRow[],
  field: 'status' | 'type',
) {
  const devices = new Map<string, RankingDevice>();
  borrowRows.forEach((row) => devices.set(row.device.id, row.device));
  repairRows.forEach((row) => devices.set(row.device.id, row.device));

  const counts = new Map<string, number>();
  devices.forEach((device) => {
    const key = device[field] || '未分类';
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
}

function flattenBorrowRows(rows: BorrowRequestRankingRow[]): BorrowRankingRow[] {
  return rows.flatMap((row) =>
    row.items.map((item) => ({
      borrowStartAt: row.borrowStartAt,
      borrowEndAt: row.borrowEndAt,
      returnedAt: row.returnedAt,
      device: item.device,
    })),
  );
}

function topByDevice(
  borrowRows: BorrowRankingRow[],
  repairRows: RepairRankingRow[],
  mode: 'borrow' | 'repair',
) {
  const map = new Map<string, {
    name: string;
    code: string;
    type: string;
    status: string;
    deviceCount: number;
    deviceIds: Set<string>;
    count: number;
    borrowCount: number;
    borrowDays: number;
    repairCount: number;
    repairCost: number;
  }>();

  const ensure = (device: RankingDevice) => {
    const groupKey = `${device.type}::${device.brand || ''}::${device.model || device.name}`;
    const current = map.get(groupKey) || {
      name: [device.brand, device.model].filter(Boolean).join(' ') || device.name,
      code: '',
      type: device.type,
      status: device.status,
      deviceCount: 0,
      deviceIds: new Set<string>(),
      count: 0,
      borrowCount: 0,
      borrowDays: 0,
      repairCount: 0,
      repairCost: 0,
    };
    if (!current.deviceIds.has(device.id)) {
      current.deviceIds.add(device.id);
      current.deviceCount += 1;
      current.code = `${device.type} / ${device.model || '未填型号'} / ${current.deviceCount} 台`;
    }
    map.set(groupKey, current);
    return current;
  };

  borrowRows.forEach((row) => {
    const current = ensure(row.device);
    const endAt = row.returnedAt || row.borrowEndAt;
    const days = Math.max(
      1,
      Math.ceil((endAt.getTime() - row.borrowStartAt.getTime()) / (24 * 60 * 60 * 1000)),
    );
    current.borrowCount += 1;
    current.borrowDays += days;
  });

  repairRows.forEach((row) => {
    const current = ensure(row.device);
    current.repairCount += 1;
    current.repairCost += Number(row.cost || 0);
  });

  return Array.from(map.values())
    .map((item) => {
      const { deviceIds, ...rest } = item;
      void deviceIds;
      return {
        ...rest,
        count: mode === 'borrow' ? item.borrowCount : item.repairCount,
      };
    })
    .filter((item) => item.count > 0)
    .sort((a, b) => {
      const primary = mode === 'borrow'
        ? b.borrowCount - a.borrowCount
        : b.repairCount - a.repairCount;
      if (primary) return primary;
      return b.borrowDays - a.borrowDays;
    })
    .slice(0, 6);
}
