import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  ExclamationCircleOutlined,
  LaptopOutlined,
  ToolOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Col, List, Row, Space, Statistic, Tooltip, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { http } from '../api/http';
import { formatAuditAction } from '../types/enums';
import { User } from '../types/models';
import { formatDateTime } from '../utils/format';
import { roleHomeCopy } from '../utils/permissions';

type Dashboard = {
  totalDevices: number;
  availableDevices: number;
  borrowedDevices: number;
  repairingDevices: number;
  pendingApprovals: number;
  waitingPickup: number;
  activeRepairs: number;
  overdueBorrows: number;
  userPendingBorrows: number;
  userNeedMoreInfo: number;
  userApprovedBorrows: number;
  userActiveBorrows: number;
  userOverdueBorrows: number;
  managerPendingApprovals: number;
  managerNeedMoreInfo: number;
  managerApprovedBorrows: number;
  managerOverdueBorrows: number;
  repairWaitingAccept: number;
  repairMyRepairing: number;
  repairMyWaitingParts: number;
  repairMyFinished: number;
  deviceStatusCounts: Array<{ status: string; count: number }>;
  recentLogs: Array<{ id: string; action: string; createdAt: string; actor?: { name: string } }>;
};

export function DashboardPage() {
  const [data, setData] = useState<Dashboard>();
  const [selectedStatusIndex, setSelectedStatusIndex] = useState(0);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}') as User;
  const role = user.role || 'USER';
  const copy = roleHomeCopy(user.role);

  useEffect(() => {
    http.get('/statistics/dashboard')
      .then((res) => setData(res as unknown as Dashboard))
      .catch((error) => message.error((error as Error).message));
  }, []);

  const statsByRole = {
    ADMIN: [
      { title: '设备总数', value: data?.totalDevices, description: '全部在册资产', icon: <DatabaseOutlined />, accent: 'blue', path: '/devices' },
      { title: '可用设备', value: data?.availableDevices, description: '当前可借用', icon: <CheckCircleOutlined />, accent: 'green', path: '/devices?status=AVAILABLE' },
      { title: '待交付', value: data?.waitingPickup, description: '审批通过待领取', icon: <ClockCircleOutlined />, accent: 'gold', path: '/borrows?status=APPROVED' },
      { title: '已借出', value: data?.borrowedDevices, description: '已完成领取', icon: <LaptopOutlined />, accent: 'orange', path: '/devices?status=BORROWED' },
      { title: '维修中', value: data?.repairingDevices, description: '暂不可借用', icon: <ToolOutlined />, accent: 'purple', path: '/devices?status=REPAIRING' },
      { title: '逾期风险', value: data?.overdueBorrows, description: '超过预计归还', icon: <WarningOutlined />, accent: 'red', path: '/borrows?status=OVERDUE' },
    ],
    MANAGER: [
      { title: '本部门待审批', value: data?.managerPendingApprovals, description: '需要判断用途和时间', icon: <ClockCircleOutlined />, accent: 'gold', path: '/borrows?status=PENDING_APPROVAL' },
      { title: '待补充资料', value: data?.managerNeedMoreInfo, description: '已退回申请人完善', icon: <ExclamationCircleOutlined />, accent: 'cyan', path: '/borrows?status=NEED_MORE_INFO' },
      { title: '已通过待领取', value: data?.managerApprovedBorrows, description: '等待资产管理员交付', icon: <CheckCircleOutlined />, accent: 'green', path: '/borrows?status=APPROVED' },
      { title: '逾期风险', value: data?.managerOverdueBorrows, description: '本部门超期未归还', icon: <WarningOutlined />, accent: 'red', path: '/borrows?status=OVERDUE' },
    ],
    USER: [
      { title: '可用设备', value: data?.availableDevices, description: '当前可以申请', icon: <CheckCircleOutlined />, accent: 'green', path: '/devices?status=AVAILABLE' },
      { title: '我的审批中', value: data?.userPendingBorrows, description: '等待部门负责人审批', icon: <ClockCircleOutlined />, accent: 'gold', path: '/borrows?status=PENDING_APPROVAL' },
      { title: '需补充', value: data?.userNeedMoreInfo, description: '需要重新提交说明', icon: <ExclamationCircleOutlined />, accent: 'cyan', path: '/borrows?status=NEED_MORE_INFO' },
      { title: '待领取', value: data?.userApprovedBorrows, description: '审批通过待领取', icon: <LaptopOutlined />, accent: 'blue', path: '/borrows?status=APPROVED' },
      { title: '我的借用中', value: data?.userActiveBorrows, description: '已领取或逾期', icon: <DatabaseOutlined />, accent: 'orange', path: '/borrows?status=PICKED_UP' },
      { title: '逾期风险', value: data?.userOverdueBorrows, description: '我的超期未归还', icon: <WarningOutlined />, accent: 'red', path: '/borrows?status=OVERDUE' },
    ],
    REPAIRER: [
      { title: '待维修', value: data?.repairWaitingAccept, description: '等待维修人员接单', icon: <ClockCircleOutlined />, accent: 'gold', path: '/repairs?status=WAITING_ACCEPT' },
      { title: '我的维修中', value: data?.repairMyRepairing, description: '已接单正在处理', icon: <ToolOutlined />, accent: 'purple', path: '/repairs?status=REPAIRING' },
      { title: '待配件', value: data?.repairMyWaitingParts, description: '等待备件或外部支持', icon: <ExclamationCircleOutlined />, accent: 'cyan', path: '/repairs?status=WAITING_PARTS' },
      { title: '已完成', value: data?.repairMyFinished, description: '已修复或无法修复', icon: <CheckCircleOutlined />, accent: 'green', path: '/repairs?status=FIXED' },
    ],
  };
  const stats = statsByRole[role as keyof typeof statsByRole] || statsByRole.USER;

  const primaryPath = role === 'REPAIRER' ? '/repairs' : role === 'USER' ? '/devices' : '/borrows';
  const availableRate = data?.totalDevices ? Math.round(((data.availableDevices || 0) / data.totalDevices) * 100) : 0;
  const quickActions = [
    { label: copy.primaryAction, path: primaryPath, type: 'primary' as const },
    { label: '查看设备列表', path: '/devices' },
    ...(role === 'ADMIN' ? [{ label: '查看操作日志', path: '/logs' }] : []),
  ];

  const heroSummaryByRole = {
    ADMIN: [
      ['可用率', `${availableRate}%`],
      ['待交付', Number(data?.waitingPickup || 0)],
      ['风险项', Number(data?.overdueBorrows || 0)],
    ],
    MANAGER: [
      ['待审批', Number(data?.managerPendingApprovals || 0)],
      ['需补充', Number(data?.managerNeedMoreInfo || 0)],
      ['逾期风险', Number(data?.managerOverdueBorrows || 0)],
    ],
    USER: [
      ['可用设备', Number(data?.availableDevices || 0)],
      ['我的申请', Number(data?.userPendingBorrows || 0) + Number(data?.userNeedMoreInfo || 0)],
      ['待领取', Number(data?.userApprovedBorrows || 0)],
    ],
    REPAIRER: [
      ['待维修', Number(data?.repairWaitingAccept || 0)],
      ['维修中', Number(data?.repairMyRepairing || 0)],
      ['待配件', Number(data?.repairMyWaitingParts || 0)],
    ],
  };
  const heroSummary = heroSummaryByRole[role as keyof typeof heroSummaryByRole] || heroSummaryByRole.USER;

  const definitionsByRole = {
    ADMIN: [
      ['待交付', '审批已通过，等待管理员确认领取'],
      ['已借出', '设备已经交付给员工，归还前不可再次申请'],
      ['维修中', '异常归还或手动报修后暂不可借用'],
      ['逾期风险', '超过预计归还时间仍未归还'],
    ],
    MANAGER: [
      ['本部门待审批', '只统计当前负责人所属部门的申请'],
      ['待补充资料', '负责人要求申请人补充用途或时间说明'],
      ['已通过待领取', '审批结束，后续由管理员交付设备'],
      ['逾期风险', '本部门借用超过预计归还时间'],
    ],
    USER: [
      ['我的审批中', '提交后等待部门负责人审批'],
      ['需补充', '申请被要求补充说明，可重新提交'],
      ['待领取', '审批通过后等待管理员确认领取'],
      ['我的借用中', '已领取设备，归还后回到历史记录'],
    ],
    REPAIRER: [
      ['待维修', '还没有维修人员接收的维修单'],
      ['我的维修中', '当前账号已接单并正在处理'],
      ['待配件', '维修受配件或外部条件影响暂缓'],
      ['已完成', '维修人员已提交最终处理结果'],
    ],
  };
  const definitions = definitionsByRole[role as keyof typeof definitionsByRole] || definitionsByRole.USER;
  const definitionMap = Object.fromEntries(definitions);
  const statusCountMap = Object.fromEntries((data?.deviceStatusCounts || []).map((item) => [item.status, item.count]));
  const statusDistribution = [
    { label: '可用', value: Number(statusCountMap.AVAILABLE || 0), color: '#20b26b' },
    { label: '审批/待领取', value: Number(statusCountMap.BORROW_PENDING || 0) + Number(statusCountMap.RESERVED || 0), color: '#6aa2ff' },
    { label: '借出', value: Number(statusCountMap.BORROWED || 0), color: '#8b5cf6' },
    { label: '维修中', value: Number(statusCountMap.REPAIRING || 0), color: '#f97316' },
    { label: '停用/报废', value: Number(statusCountMap.DISABLED || 0) + Number(statusCountMap.SCRAPPED || 0), color: '#94a3b8' },
  ];
  const distributionTotal = statusDistribution.reduce((sum, item) => sum + item.value, 0);
  const selectedStatus = statusDistribution[selectedStatusIndex] || statusDistribution[0];
  const donutCenter = 110;
  const donutRadius = 70;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const pendingWork = role === 'ADMIN'
    ? Number(data?.pendingApprovals || 0) + Number(data?.waitingPickup || 0) + Number(data?.overdueBorrows || 0)
    : role === 'MANAGER'
      ? Number(data?.managerPendingApprovals || 0) + Number(data?.managerNeedMoreInfo || 0)
      : role === 'REPAIRER'
        ? Number(data?.repairWaitingAccept || 0) + Number(data?.repairMyRepairing || 0) + Number(data?.repairMyWaitingParts || 0)
        : Number(data?.userNeedMoreInfo || 0) + Number(data?.userApprovedBorrows || 0) + Number(data?.userOverdueBorrows || 0);
  const pendingWorkPath = role === 'REPAIRER'
    ? '/repairs'
    : role === 'MANAGER'
      ? '/borrows?status=PENDING_APPROVAL'
      : '/borrows';
  const monthFocus = Number(data?.activeRepairs || 0) + Number(data?.waitingPickup || 0);
  const dashboardCards = [
    ...stats,
    {
      title: '待我处理',
      value: pendingWork,
      description: role === 'REPAIRER' ? '待维修 / 维修中 / 待配件' : role === 'USER' ? '补充 / 领取 / 逾期事项' : '审批 / 领取 / 风险事项',
      icon: <ExclamationCircleOutlined />,
      accent: 'cyan',
      path: pendingWorkPath,
    },
    {
      title: '本月关注',
      value: monthFocus,
      description: '维修任务与待领取汇总',
      icon: <WarningOutlined />,
      accent: 'red',
      path: role === 'REPAIRER' ? '/repairs' : role === 'USER' ? '/borrows' : '/repairs',
    },
  ];

  return (
    <div className="dashboard-shell">
      <div className="hero-panel dashboard-hero">
        <div className="dashboard-hero-copy">
          <div className="hero-kicker">设备借用与维修闭环</div>
          <Typography.Title level={2}>{copy.title}</Typography.Title>
          <Typography.Paragraph>{copy.subtitle}</Typography.Paragraph>
          <Space wrap className="hero-actions">
            {quickActions.map((item) => (
              <Button key={item.path} type={item.type} onClick={() => navigate(item.path)}>
                {item.label}
              </Button>
            ))}
          </Space>
        </div>
        <div className="hero-summary">
          {heroSummary.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </div>
      {Number(data?.overdueBorrows || 0) > 0 && (
        <Alert
          className="dashboard-risk-alert"
          type="error"
          showIcon
          message={`${data?.overdueBorrows || 0} 条借用已逾期未归还，请及时处理。`}
          action={<Button type="link" danger onClick={() => navigate('/borrows?status=OVERDUE')}>前往处理</Button>}
        />
      )}
      <Row gutter={[16, 16]}>
        {dashboardCards.map((item) => (
          <Col key={item.title} xs={24} sm={12} lg={6}>
            <Tooltip title={definitionMap[item.title] || item.description} placement="top">
              <Card
                className={`metric-card metric-${item.accent}`}
                hoverable
                role="button"
                tabIndex={0}
                onClick={() => navigate(item.path)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') navigate(item.path);
                }}
              >
                <div className="metric-card-head">
                  <span className="metric-icon">{item.icon}</span>
                </div>
                <Statistic title={item.title} value={Number(item.value || 0)} />
                <Typography.Text type="secondary">{item.description}</Typography.Text>
              </Card>
            </Tooltip>
          </Col>
        ))}
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card
            title="设备状态分布"
            className="section-card status-distribution-card"
            extra={<Typography.Text type="secondary">实时</Typography.Text>}
          >
            <div className="status-distribution-body">
              <div className="status-donut">
                <svg viewBox="0 0 220 220" aria-label="设备状态分布图">
                  <circle className="status-donut-track" cx={donutCenter} cy={donutCenter} r={donutRadius} />
                  {(() => {
                    let offset = 0;
                    return statusDistribution.map((item, index) => {
                      const segmentLength = distributionTotal ? (item.value / distributionTotal) * donutCircumference : 0;
                      const segmentOffset = -offset;
                      offset += segmentLength;

                      return (
                        <circle
                          key={item.label}
                          className={`status-donut-segment ${index === selectedStatusIndex ? 'active' : ''}`}
                          cx={donutCenter}
                          cy={donutCenter}
                          r={donutRadius}
                          stroke={item.color}
                          strokeDasharray={`${segmentLength} ${donutCircumference - segmentLength}`}
                          strokeDashoffset={segmentOffset}
                          onClick={() => setSelectedStatusIndex(index)}
                        >
                          <title>{`${item.label}：${item.value} 台`}</title>
                        </circle>
                      );
                    });
                  })()}
                </svg>
                <div className="status-donut-center">
                  <span className="status-donut-label">{selectedStatus.label}</span>
                  <strong>{selectedStatus.value}</strong>
                  <span>共 {distributionTotal} 台</span>
                </div>
              </div>
              <div className="status-legend compact">
                {statusDistribution.map((item, index) => (
                  <div
                    key={item.label}
                    className={index === selectedStatusIndex ? 'active' : ''}
                  >
                    <span style={{ background: item.color }} />
                    <em>{item.label}</em>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title="最近操作" className="section-card recent-activity-card" extra={user.role === 'ADMIN' ? <Button type="link" onClick={() => navigate('/logs')}>全部日志</Button> : null}>
            <List
              itemLayout="horizontal"
              dataSource={data?.recentLogs || []}
              pagination={{ pageSize: 4, size: 'small', hideOnSinglePage: false }}
              renderItem={(item) => (
                <List.Item className="activity-item">
                  <List.Item.Meta
                    title={`${item.actor?.name || '系统'} ${formatAuditAction(item.action)}`}
                    description={formatDateTime(item.createdAt)}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
