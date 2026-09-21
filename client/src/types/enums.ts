export const roleNames: Record<string, string> = {
  ADMIN: '管理员',
  MANAGER: '部门负责人',
  USER: '普通员工',
  REPAIRER: '维修人员',
};

export const deviceStatusNames: Record<string, string> = {
  AVAILABLE: '可用',
  BORROW_PENDING: '审批占用中',
  RESERVED: '设备待领取',
  BORROWED: '借出',
  WAITING_REPAIR: '待维修',
  REPAIRING: '维修中',
  SCRAPPED: '报废',
  DISABLED: '停用',
};

export const borrowStatusNames: Record<string, string> = {
  PENDING_APPROVAL: '待审批',
  NEED_MORE_INFO: '需补充',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  PICKED_UP: '已领取',
  RETURNED: '已归还',
  CANCELLED: '已取消',
  OVERDUE: '逾期',
};

export const repairStatusNames: Record<string, string> = {
  WAITING_ACCEPT: '待维修',
  REPAIRING: '维修中',
  WAITING_PARTS: '待配件',
  WAITING_CONFIRM: '待验收',
  FIXED: '已修复',
  UNREPAIRABLE: '无法修复',
};

export const tagColors: Record<string, string> = {
  AVAILABLE: 'green',
  BORROW_PENDING: 'gold',
  RESERVED: 'blue',
  BORROWED: 'orange',
  WAITING_REPAIR: 'gold',
  REPAIRING: 'purple',
  SCRAPPED: 'default',
  DISABLED: 'default',
  PENDING_APPROVAL: 'gold',
  NEED_MORE_INFO: 'cyan',
  APPROVED: 'blue',
  REJECTED: 'red',
  PICKED_UP: 'orange',
  RETURNED: 'green',
  OVERDUE: 'red',
  WAITING_ACCEPT: 'gold',
  WAITING_PARTS: 'magenta',
  WAITING_CONFIRM: 'blue',
  FIXED: 'green',
  UNREPAIRABLE: 'red',
};

export const auditActionNames: Record<string, string> = {
  SEED_INITIAL_DATA: '初始化演示数据',
  CREATE_DEVICE: '创建设备',
  UPDATE_DEVICE: '更新设备信息',
  DELETE_DEVICE: '删除设备',
  CREATE_BORROW_REQUEST: '提交借用申请',
  SUPPLEMENT_BORROW_REQUEST: '补充借用申请',
  APPROVE_BORROW_REQUEST: '通过借用审批',
  REJECT_BORROW_REQUEST: '驳回借用审批',
  NEED_MORE_INFO_BORROW_REQUEST: '要求补充借用申请',
  CANCEL_BORROW_REQUEST: '取消借用申请',
  PICKUP_DEVICE: '确认领取设备',
  RETURN_DEVICE_NORMAL: '登记正常归还',
  RETURN_DEVICE_ABNORMAL: '登记异常归还',
  CREATE_REPAIR_RECORD: '提交维修单',
  ACCEPT_REPAIR_TASK: '接收维修任务',
  CONFIRM_REPAIR_FIXED: '确认维修已修复',
  CONFIRM_REPAIR_UNREPAIRABLE: '确认维修无法修复',
};

export function formatAuditAction(action: string) {
  if (auditActionNames[action]) return auditActionNames[action];

  if (action.startsWith('CHANGE_DEVICE_STATUS_')) {
    const status = action.replace('CHANGE_DEVICE_STATUS_', '');
    return `变更设备状态为${deviceStatusNames[status] || status}`;
  }

  if (action.startsWith('UPDATE_REPAIR_STATUS_')) {
    const status = action.replace('UPDATE_REPAIR_STATUS_', '');
    return `更新维修状态为${repairStatusNames[status] || status}`;
  }

  return action;
}

export const auditTargetTypeNames: Record<string, string> = {
  SYSTEM: '系统',
  DEVICE: '设备',
  BORROW_REQUEST: '借用申请',
  REPAIR_RECORD: '维修记录',
  USER: '用户',
};

export function formatAuditTarget(targetType: string, targetId?: string) {
  void targetId;
  const label = auditTargetTypeNames[targetType] || targetType;
  return label;
}
