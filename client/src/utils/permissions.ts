import { User } from '../types/models';

export type MenuKey = '/' | '/devices' | '/device-dictionaries' | '/borrows' | '/repairs' | '/reports' | '/users' | '/logs';

const roleMenus: Record<string, MenuKey[]> = {
  ADMIN: ['/', '/devices', '/device-dictionaries', '/borrows', '/repairs', '/reports', '/users', '/logs'],
  MANAGER: ['/', '/devices', '/borrows', '/users'],
  USER: ['/', '/devices', '/borrows'],
  REPAIRER: ['/', '/devices', '/repairs'],
};

export function allowedMenus(user?: User): MenuKey[] {
  return roleMenus[user?.role || ''] || ['/'];
}

export function canBorrowDevice(user?: User) {
  return user?.role === 'USER';
}

export function roleHomeCopy(role?: string) {
  const copy: Record<string, { title: string; subtitle: string; primaryAction: string }> = {
    ADMIN: {
      title: '资产运营工作台',
      subtitle: '关注设备可用性、设备交付归还、异常维修和台账状态。',
      primaryAction: '处理交付与归还',
    },
    MANAGER: {
      title: '部门审批工作台',
      subtitle: '优先处理本部门借用申请，确认用途、时间和设备占用是否合理。',
      primaryAction: '查看待审批',
    },
    USER: {
      title: '我的设备借用',
      subtitle: '查看可用设备，提交借用申请，并跟踪审批、领取和归还状态。',
      primaryAction: '申请设备',
    },
    REPAIRER: {
      title: '维修任务工作台',
      subtitle: '处理异常归还和手动登记的维修任务，及时恢复设备可用状态。',
      primaryAction: '处理维修任务',
    },
  };
  return copy[role || ''] || copy.USER;
}
