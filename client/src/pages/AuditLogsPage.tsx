import { Table, Typography, message } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import { http } from '../api/http';
import { formatAuditAction, formatAuditTarget } from '../types/enums';
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
    { title: '详情', render: (_, row) => <span className="table-cell-ellipsis">{formatLogDetail(row.detail)}</span> },
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
            rowExpandable: (row) => Boolean(row.detail && formatLogDetail(row.detail).length > 32),
            expandedRowRender: (row) => <pre className="expanded-detail">{formatLogDetail(row.detail)}</pre>,
          }}
        />
      </div>
    </div>
  );
}

function formatLogDetail(detail?: string) {
  if (!detail) return '-';
  try {
    return JSON.stringify(JSON.parse(detail), null, 2);
  } catch {
    return detail;
  }
}
