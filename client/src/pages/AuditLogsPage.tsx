import { Table, Typography, message } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import { http } from '../api/http';
import { borrowStatusNames, deviceStatusNames, formatAuditAction, formatAuditTarget, repairStatusNames } from '../types/enums';
import { formatDateTime } from '../utils/format';

type AuditLog = {
  id: string;
  action: string;
  targetType: string;
  targetId?: string;
  detail?: string;
  createdAt: string;
  actor?: { name: string; role: string };
};

export function AuditLogsPage() {
  const [rows, setRows] = useState<AuditLog[]>([]);

  useEffect(() => {
    http.get('/audit-logs')
      .then((res) => setRows(res as unknown as AuditLog[]))
      .catch((error) => message.error((error as Error).message));
  }, []);

  const columns: ColumnsType<AuditLog> = [
    { title: '操作人', width: 140, render: (_, row) => row.actor?.name || '系统' },
    { title: '动作', dataIndex: 'action', width: 280, render: (value) => <span className="table-cell-ellipsis">{formatAuditAction(value)}</span> },
    { title: '对象', width: 220, render: (_, row) => formatAuditTarget(row.targetType, row.targetId) },
    { title: '时间', width: 170, render: (_, row) => formatDateTime(row.createdAt) },
    { title: '详情', render: (_, row) => <span className="table-cell-ellipsis">{formatLogDetail(row)}</span> },
  ];

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h1 className="page-title">操作日志</h1>
          <Typography.Text type="secondary">记录设备、申请、审批、归还和维修的关键操作。</Typography.Text>
        </div>
      </div>
      <div className="content-card">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          tableLayout="fixed"
          scroll={{ x: 1080 }}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ['5', '10', '20', '50'],
            showTotal: (total) => `共 ${total} 条日志`,
          }}
          expandable={{
            rowExpandable: (row) => Boolean(row.detail && formatLogDetail(row).length > 32),
            expandedRowRender: (row) => <pre className="expanded-detail">{formatLogDetail(row)}</pre>,
          }}
        />
      </div>
    </div>
  );
}

function formatLogDetail(row: AuditLog) {
  if (!row.detail) return '-';
  try {
    const detail = JSON.parse(row.detail) as Record<string, unknown>;
    const summary = buildChineseDetail(detail);
    return summary || '-';
  } catch {
    return row.detail;
  }
}

function buildChineseDetail(detail: Record<string, unknown>) {
  const entries = Object.entries(detail)
    .map(([key, value]) => {
      const label = detailLabelMap[key] || key;
      const text = formatDetailValue(key, value);
      return text ? `${label}：${text}` : '';
    })
    .filter(Boolean);

  return entries.join('；');
}

function formatDetailValue(key: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (key === 'from' || key === 'to' || key === 'previousStatus' || key === 'status') {
    return deviceStatusNames[String(value)] || borrowStatusNames[String(value)] || repairStatusNames[String(value)] || String(value);
  }
  if (key === 'returnCondition') return returnConditionNames[String(value)] || String(value);
  if (key.endsWith('At') || key.endsWith('Date')) return formatDateTime(String(value));
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const detailLabelMap: Record<string, string> = {
  code: '设备编号',
  name: '名称',
  deviceId: '设备',
  borrowStartAt: '借用开始时间',
  borrowEndAt: '预计归还时间',
  purpose: '借用用途',
  remark: '备注',
  comment: '审批意见',
  previousStatus: '原状态',
  from: '原状态',
  to: '新状态',
  returnCondition: '归还状态',
  returnRemark: '归还备注',
  faultDescription: '故障描述',
  repairerId: '维修人员',
  status: '状态',
  result: '维修结果',
  cost: '维修费用',
};

const returnConditionNames: Record<string, string> = {
  NORMAL: '正常',
  DAMAGED: '损坏',
  MISSING_PARTS: '缺件',
  ABNORMAL: '异常',
};
