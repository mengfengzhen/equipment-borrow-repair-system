import { Button, Card, Col, DatePicker, Form, Progress, Row, Select, Space, Table, Typography, message } from 'antd';
import dayjs from 'dayjs';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { http } from '../api/http';
import { StatusTag } from '../components/StatusTag';
import { deviceTypeOptions } from '../constants/deviceOptions';
import { deviceStatusNames } from '../types/enums';
import type { BorrowRequest, Department } from '../types/models';
import { formatDateTime } from '../utils/format';

type ReportItem = { name: string; count: number };
type TopItem = {
  name: string;
  code: string;
  type: string;
  status: string;
  count: number;
  borrowCount: number;
  borrowDays: number;
  repairCount: number;
  repairCost: number;
};
type Reports = {
  byStatus: ReportItem[];
  byType: ReportItem[];
  byDepartment: ReportItem[];
  topBorrowed: TopItem[];
  topRepaired: TopItem[];
  monthlyBorrows: Array<{ month: string; count: number }>;
  overdueBorrows: BorrowRequest[];
};

const reportPalettes = {
  status: ['#22c55e', '#6aa2ff', '#8b5cf6', '#f97316', '#94a3b8', '#ef4444'],
  type: ['#14b8a6', '#22c55e', '#84cc16', '#06b6d4', '#0ea5e9', '#65a30d'],
  department: ['#f59e0b', '#f97316', '#fb7185', '#eab308', '#d97706', '#facc15'],
};

export function ReportsPage() {
  const [data, setData] = useState<Reports>();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [filterForm] = Form.useForm();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    http.get(`/statistics/reports${query ? `?${query}` : ''}`)
      .then((res) => setData(res as unknown as Reports))
      .catch((error) => message.error((error as Error).message));
    http.get('/departments')
      .then((res) => setDepartments(res as unknown as Department[]))
      .catch(() => setDepartments([]));
    filterForm.setFieldsValue({
      departmentId: searchParams.get('departmentId') || undefined,
      type: searchParams.get('type') || undefined,
      range: searchParams.get('startAt') && searchParams.get('endAt')
        ? [dayjs(searchParams.get('startAt')), dayjs(searchParams.get('endAt'))]
        : undefined,
    });
  }, [searchParams]);

  const applyFilters = (values: { departmentId?: string; type?: string; range?: [dayjs.Dayjs, dayjs.Dayjs] }) => {
    const params: Record<string, string> = {};
    if (values.departmentId) params.departmentId = values.departmentId;
    if (values.type) params.type = values.type;
    if (values.range?.[0]) params.startAt = values.range[0].startOf('day').toISOString();
    if (values.range?.[1]) params.endAt = values.range[1].endOf('day').toISOString();
    setSearchParams(params);
  };

  const resetFilters = () => {
    filterForm.resetFields();
    setSearchParams({});
  };

  return (
    <div className="page-stack reports-page">
      <div className="page-heading">
        <div>
          <h1 className="page-title">统计报表</h1>
          <Typography.Text type="secondary">按状态、类型、部门和历史记录查看设备运营情况。</Typography.Text>
        </div>
      </div>

      <div className="content-card">
        <Form
          form={filterForm}
          className="list-filter-bar"
          layout="inline"
          onFinish={applyFilters}
        >
          <Form.Item name="range" label="时间范围">
            <DatePicker.RangePicker style={{ width: 260 }} />
          </Form.Item>
          <Form.Item name="departmentId" label="部门">
            <Select
              allowClear
              placeholder="全部部门"
              style={{ width: 160 }}
              options={departments.map((department) => ({ label: department.name, value: department.id }))}
            />
          </Form.Item>
          <Form.Item name="type" label="设备类型">
            <Select allowClear placeholder="全部类型" options={deviceTypeOptions} style={{ width: 150 }} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">查询</Button>
              <Button onClick={resetFilters}>重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <ReportCard title="设备状态分布" rows={(data?.byStatus || []).map((item) => ({
            ...item,
            name: deviceStatusNames[item.name] || item.name,
          }))} palette={reportPalettes.status} />
        </Col>
        <Col xs={24} lg={8}>
          <ReportCard title="设备类型分布" rows={data?.byType || []} palette={reportPalettes.type} />
        </Col>
        <Col xs={24} lg={8}>
          <ReportCard title="部门借用分布" rows={data?.byDepartment || []} palette={reportPalettes.department} />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="近 6 个月借用趋势" className="section-card">
            <TrendLine rows={data?.monthlyBorrows || []} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="设备借用 TOP6" className="section-card" extra={<Typography.Text type="secondary">含维修频次</Typography.Text>}>
            <TopDeviceTable rows={data?.topBorrowed || []} mode="borrow" />
          </Card>
        </Col>
      </Row>

      <Card title="设备维修 TOP6" className="section-card" extra={<Typography.Text type="secondary">按维修次数排序</Typography.Text>}>
        <TopDeviceTable rows={data?.topRepaired || []} mode="repair" />
      </Card>

      <Card title="当前逾期未归还设备" className="section-card">
        <Table
          rowKey="id"
          size="small"
          dataSource={data?.overdueBorrows || []}
          scroll={{ x: 980 }}
          pagination={{ pageSize: 5, hideOnSinglePage: true }}
          locale={{ emptyText: '暂无逾期未归还设备' }}
          columns={[
            { title: '设备', render: (_, row) => `${row.device.name}（${row.device.code}）` },
            { title: '设备类型', render: (_, row) => row.device.type },
            { title: '申请人', render: (_, row) => row.applicant.name },
            { title: '部门', render: (_, row) => row.department?.name || '-' },
            { title: '预计归还', render: (_, row) => formatDateTime(row.borrowEndAt) },
            { title: '状态', width: 120, render: (_, row) => <StatusTag value={row.status} /> },
          ]}
        />
      </Card>
    </div>
  );
}

function TrendLine({ rows }: { rows: Array<{ month: string; count: number }> }) {
  const width = 640;
  const height = 220;
  const padding = { top: 34, right: 28, bottom: 42, left: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...rows.map((item) => item.count));
  const points = rows.map((item, index) => {
    const x = padding.left + (rows.length <= 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth);
    const y = padding.top + chartHeight - (item.count / maxValue) * chartHeight;
    return { ...item, x, y };
  });
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = points.length
    ? `${path} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`
    : '';

  return (
    <div className="trend-line-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="近 6 个月借用趋势折线图">
        <line className="trend-axis" x1={padding.left} y1={padding.top + chartHeight} x2={width - padding.right} y2={padding.top + chartHeight} />
        {[0, 0.5, 1].map((ratio) => (
          <line
            key={ratio}
            className="trend-grid"
            x1={padding.left}
            y1={padding.top + chartHeight - ratio * chartHeight}
            x2={width - padding.right}
            y2={padding.top + chartHeight - ratio * chartHeight}
          />
        ))}
        {areaPath && <path className="trend-area" d={areaPath} />}
        {path && <path className="trend-line" d={path} />}
        {points.map((point) => (
          <g key={point.month}>
            <circle className="trend-point" cx={point.x} cy={point.y} r="5" />
            <text className="trend-point-value" x={point.x} y={point.y - 12}>{point.count}</text>
            <text className="trend-month-label" x={point.x} y={height - 12}>{point.month.slice(5)}月</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function ReportCard({ title, rows, palette }: { title: string; rows: ReportItem[]; palette: string[] }) {
  const total = Math.max(1, rows.reduce((sum, row) => sum + row.count, 0));
  return (
    <Card title={title} className="section-card report-card">
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {rows.map((row, index) => {
          const color = palette[index % palette.length];
          return (
            <div key={row.name} className="report-row" style={{ '--report-color': color } as CSSProperties}>
              <div>
                <span className="report-name"><i />{row.name}</span>
                <span className="report-count">{row.count} 条</span>
              </div>
              <Progress percent={Math.round((row.count / total) * 100)} showInfo={false} strokeColor={color} />
            </div>
          );
        })}
        {!rows.length && <Typography.Text type="secondary">暂无数据</Typography.Text>}
      </Space>
    </Card>
  );
}

function TopDeviceTable({ rows, mode }: { rows: TopItem[]; mode: 'borrow' | 'repair' }) {
  return (
    <Table
      rowKey="code"
      size="small"
      className="top-device-table"
      dataSource={rows}
      pagination={false}
      scroll={{ x: 920 }}
      locale={{ emptyText: '暂无数据' }}
      columns={[
        {
          title: '#',
          width: 56,
          render: (_, __, index) => <span className={`top-rank-number ${index < 3 ? 'is-hot' : ''}`}>{index + 1}</span>,
        },
        {
          title: '设备',
          minWidth: 220,
          render: (_, row) => (
            <div className="top-device-name">
              <span>{row.name}</span>
              <em>{row.code}</em>
            </div>
          ),
        },
        { title: '类型', dataIndex: 'type', width: 120 },
        {
          title: mode === 'borrow' ? '借用次数' : '维修次数',
          width: 110,
          render: (_, row) => mode === 'borrow' ? row.borrowCount : row.repairCount,
        },
        { title: '累计天数', width: 110, render: (_, row) => `${row.borrowDays} 天` },
        {
          title: '维修频次',
          width: 150,
          render: (_, row) => row.repairCount
            ? <span className="repair-frequency">{row.repairCount} 次 / ¥{Math.round(row.repairCost || 0).toLocaleString()}</span>
            : <Typography.Text type="secondary">-</Typography.Text>,
        },
        { title: '当前状态', width: 130, render: (_, row) => <StatusTag value={row.status} /> },
      ]}
    />
  );
}
