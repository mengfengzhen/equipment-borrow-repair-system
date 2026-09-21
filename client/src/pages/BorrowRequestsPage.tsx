import { UploadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, DatePicker, Form, Input, Modal, Select, Space, Switch, Table, Typography, Upload, message } from 'antd';
import { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload/interface';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { http } from '../api/http';
import { StatusTag } from '../components/StatusTag';
import { borrowStatusNames } from '../types/enums';
import { BorrowRequest, Department, User } from '../types/models';
import { formatDateTime } from '../utils/format';
import { parseAttachments, serializeAttachments, uploadFiles } from '../utils/upload';

type Action = 'approve' | 'reject' | 'need-more-info' | 'pickup' | 'return' | 'cancel' | 'supplement';
const borrowStatusOptions = Object.entries(borrowStatusNames).map(([value, label]) => ({ value, label }));

export function BorrowRequestsPage() {
  const [rows, setRows] = useState<BorrowRequest[]>([]);
  const [action, setAction] = useState<{ type: Action; row: BorrowRequest }>();
  const [settings, setSettings] = useState<{ approvalRequired: boolean }>();
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [form] = Form.useForm();
  const [filterForm] = Form.useForm();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = JSON.parse(localStorage.getItem('user') || '{}') as User;
  const statusFilter = searchParams.get('status');
  const applicantFilter = searchParams.get('applicantId') || undefined;
  const departmentFilter = searchParams.get('departmentId') || undefined;
  const startFilter = searchParams.get('borrowStartAt') || undefined;
  const endFilter = searchParams.get('borrowEndAt') || undefined;
  const title = user.role === 'USER' ? '我的借用申请' : user.role === 'MANAGER' ? '部门审批' : '借用交付与归还';
  const subtitle = user.role === 'USER'
    ? '跟踪自己的申请、审批、领取和归还状态。'
    : user.role === 'MANAGER'
      ? '审批本部门设备借用申请，确认用途和时间合理。'
      : '处理已审批申请的设备交付、归还登记和异常维修入口。';

  const load = () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (applicantFilter) params.set('applicantId', applicantFilter);
    if (departmentFilter) params.set('departmentId', departmentFilter);
    if (startFilter) params.set('borrowStartAt', startFilter);
    if (endFilter) params.set('borrowEndAt', endFilter);
    const query = params.toString() ? `?${params.toString()}` : '';
    Promise.all([
      http.get(`/borrow-requests${query}`),
      http.get('/settings'),
      http.get('/departments'),
      user.role === 'ADMIN' ? http.get('/users') : Promise.resolve([]),
    ])
      .then(([borrowRes, settingRes, departmentRes, userRes]) => {
        setRows(borrowRes as unknown as BorrowRequest[]);
        setSettings(settingRes as unknown as { approvalRequired: boolean });
        setDepartments(departmentRes as unknown as Department[]);
        setUsers(userRes as unknown as User[]);
      })
      .catch((error) => message.error((error as Error).message));
  };

  useEffect(() => {
    filterForm.setFieldsValue({
      status: statusFilter || undefined,
      applicantId: applicantFilter,
      departmentId: departmentFilter,
      borrowRange: startFilter && endFilter ? [dayjs(startFilter), dayjs(endFilter)] : undefined,
    });
    load();
  }, [statusFilter, applicantFilter, departmentFilter, startFilter, endFilter]);

  const applyFilters = (values: {
    status?: string;
    applicantId?: string;
    departmentId?: string;
    borrowRange?: [dayjs.Dayjs, dayjs.Dayjs];
  }) => {
    const params: Record<string, string> = {};
    if (values.status) params.status = values.status;
    if (values.applicantId) params.applicantId = values.applicantId;
    if (values.departmentId) params.departmentId = values.departmentId;
    if (values.borrowRange?.[0]) params.borrowStartAt = values.borrowRange[0].startOf('day').toISOString();
    if (values.borrowRange?.[1]) params.borrowEndAt = values.borrowRange[1].endOf('day').toISOString();
    setSearchParams(params);
  };

  const resetFilters = () => {
    filterForm.resetFields();
    setSearchParams({});
  };

  const currentBorrowRows = rows.filter((row) => ['PICKED_UP', 'OVERDUE'].includes(row.status));

  const updateApprovalRequired = async (approvalRequired: boolean) => {
    try {
      const result = await http.patch('/settings', { approvalRequired });
      setSettings(result as unknown as { approvalRequired: boolean });
      message.success(approvalRequired ? '已开启审批流程' : '已关闭审批流程，申请将直接进入待领取');
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const openAction = (type: Action, row: BorrowRequest) => {
    form.resetFields();
    if (type === 'supplement') {
      form.setFieldsValue({ purpose: row.purpose, remark: row.remark });
    }
    if (type === 'return') {
      form.setFieldsValue({
        returnCondition: 'NORMAL',
        returnLocation: row.device.location,
        reportRepair: false,
      });
    }
    setAction({ type, row });
  };

  const submitAction = async (values: Record<string, string | UploadFile[]>) => {
    if (!action) return;
    try {
      if (action.type === 'pickup') {
        await http.patch(`/borrow-requests/${action.row.id}/pickup`);
      } else if (action.type === 'cancel') {
        await http.patch(`/borrow-requests/${action.row.id}/cancel`);
      } else if (action.type === 'return') {
        await http.patch(`/borrow-requests/${action.row.id}/return`, values);
      } else if (action.type === 'supplement') {
        const attachments = (values.attachments as UploadFile[] | undefined) || [];
        const uploadedFiles = await uploadFiles(attachments);
        await http.patch(`/borrow-requests/${action.row.id}/supplement`, {
          purpose: values.purpose,
          remark: values.remark,
          attachmentNames: uploadedFiles.length ? serializeAttachments(uploadedFiles) : action.row.attachmentNames,
        });
      } else {
        await http.patch(`/borrow-requests/${action.row.id}/${action.type}`, values);
      }
      message.success('操作成功');
      setAction(undefined);
      form.resetFields();
      load();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const columns: ColumnsType<BorrowRequest> = [
    { title: '设备', render: (_, row) => row.device.name },
    { title: '申请人', render: (_, row) => row.applicant.name },
    { title: '部门', render: (_, row) => row.department?.name || '-' },
    { title: '借用时间', render: (_, row) => `${formatDateTime(row.borrowStartAt)} 至 ${formatDateTime(row.borrowEndAt)}` },
    { title: '用途', dataIndex: 'purpose' },
    { title: '状态', render: (_, row) => <StatusTag value={row.status} /> },
    {
      title: '操作',
      render: (_, row) => {
        const actions = [];

        if (['ADMIN', 'MANAGER'].includes(user.role) && row.status === 'PENDING_APPROVAL') {
          actions.push(
            <Button key="approve" className="table-action-button" type="primary" onClick={() => openAction('approve', row)}>通过</Button>,
            <Button key="need-more-info" className="table-action-button" onClick={() => openAction('need-more-info', row)}>补充</Button>,
            <Button key="reject" className="table-action-button" danger onClick={() => openAction('reject', row)}>驳回</Button>,
          );
        }

        if (user.role === 'USER' && row.status === 'NEED_MORE_INFO') {
          actions.push(<Button key="supplement" className="table-action-button" type="primary" onClick={() => openAction('supplement', row)}>补充资料</Button>);
        }

        if (user.role === 'USER' && ['PENDING_APPROVAL', 'NEED_MORE_INFO', 'APPROVED'].includes(row.status)) {
          actions.push(<Button key="cancel" className="table-action-button" onClick={() => openAction('cancel', row)}>取消</Button>);
        }

        if (user.role === 'ADMIN' && row.status === 'APPROVED') {
          actions.push(<Button key="pickup" className="table-action-button" onClick={() => openAction('pickup', row)}>确认领取</Button>);
        }

        if (user.role === 'ADMIN' && ['PICKED_UP', 'OVERDUE'].includes(row.status)) {
          actions.push(<Button key="return" className="table-action-button" onClick={() => openAction('return', row)}>登记归还</Button>);
        }

        return actions.length ? <Space wrap>{actions}</Space> : <Typography.Text type="secondary">{emptyActionText(user.role, row.status)}</Typography.Text>;
      },
    },
  ];

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h1 className="page-title">{title}</h1>
          <Typography.Text type="secondary">
            {statusFilter ? `当前筛选：${borrowStatusNames[statusFilter] || statusFilter}` : subtitle}
          </Typography.Text>
        </div>
      </div>
      <div className="content-card">
        {user.role === 'ADMIN' && settings && (
          <Alert
            className="borrow-setting-alert"
            type={settings.approvalRequired ? 'info' : 'warning'}
            showIcon
            message="审批规则配置"
            description={settings.approvalRequired ? '当前启用审批：普通员工提交后进入待审批，审批通过后再由管理员交付。' : '当前关闭审批：普通员工提交后直接进入设备待领取，管理员负责确认交付。'}
            action={(
              <Space>
                <Typography.Text>需要审批</Typography.Text>
                <Switch checked={settings.approvalRequired} onChange={updateApprovalRequired} />
              </Space>
            )}
          />
        )}
        {user.role === 'USER' && (
          <Card className="inner-section-card" title="当前借用设备">
            <Table
              rowKey="id"
              size="small"
              dataSource={currentBorrowRows}
              scroll={{ x: 920 }}
              pagination={false}
              locale={{ emptyText: '暂无正在借用的设备' }}
              columns={[
                { title: '设备', render: (_, row) => row.device.name },
                { title: '设备编号', render: (_, row) => row.device.code },
                { title: '借用时间', render: (_, row) => `${formatDateTime(row.borrowStartAt)} 至 ${formatDateTime(row.borrowEndAt)}` },
                { title: '用途', dataIndex: 'purpose' },
                { title: '状态', render: (_, row) => <StatusTag value={row.status} /> },
              ]}
            />
          </Card>
        )}
        <Form
          form={filterForm}
          className="list-filter-bar"
          layout="inline"
          initialValues={{ status: statusFilter || undefined }}
          onFinish={applyFilters}
        >
          <Form.Item name="status" label="状态">
            <Select allowClear placeholder="全部状态" options={borrowStatusOptions} style={{ width: 150 }} />
          </Form.Item>
          {user.role !== 'USER' && (
            <Form.Item name="applicantId" label="申请人">
              <Select
                allowClear
                showSearch
                placeholder="全部申请人"
                optionFilterProp="label"
                options={(users.length ? users : uniqueApplicants(rows)).map((item) => ({
                  label: `${item.name}${item.username ? ` / ${item.username}` : ''}`,
                  value: item.id,
                }))}
                style={{ width: 160 }}
              />
            </Form.Item>
          )}
          {user.role === 'ADMIN' && (
            <Form.Item name="departmentId" label="部门">
              <Select
                allowClear
                placeholder="全部部门"
                options={departments.map((department) => ({ label: department.name, value: department.id }))}
                style={{ width: 160 }}
              />
            </Form.Item>
          )}
          <Form.Item name="borrowRange" label="借用时间">
            <DatePicker.RangePicker style={{ width: 260 }} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">查询</Button>
              <Button onClick={resetFilters}>重置</Button>
            </Space>
          </Form.Item>
        </Form>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          scroll={{ x: 1180 }}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ['5', '10', '20'],
            showTotal: (total) => `共 ${total} 条申请`,
          }}
          expandable={{ expandedRowRender: (row) => (
            <div>
              <p>备注：{row.remark || '-'}</p>
              <p>附件：{renderAttachments(row.attachmentNames)}</p>
              <p>归还位置：{row.returnLocation || '-'}</p>
              <p>归还备注：{row.returnRemark || '-'}</p>
              <div>审批记录：{renderApprovals(row.approvals)}</div>
            </div>
          ) }}
        />
      </div>
      <Modal
        title={actionTitle(action?.type)}
        open={Boolean(action)}
        onCancel={() => setAction(undefined)}
        onOk={() => ['pickup', 'cancel'].includes(action?.type || '') ? submitAction({}) : form.submit()}
        destroyOnClose
      >
        {action?.type === 'pickup' || action?.type === 'cancel' ? (
          <p>{action.type === 'pickup' ? '确认设备已经交付给申请人？此操作会把设备状态改为借出。' : '确认取消这条申请？如果申请已审批通过，系统会释放对应设备占用。'}</p>
        ) : (
          <Form form={form} layout="vertical" onFinish={submitAction}>
            {action?.type === 'supplement' ? (
              <>
                <Form.Item name="purpose" label="借用用途" rules={[{ required: true, message: '请补充借用用途' }]}>
                  <Input.TextArea rows={3} />
                </Form.Item>
                <Form.Item name="remark" label="备注">
                  <Input.TextArea rows={3} />
                </Form.Item>
                <Form.Item
                  name="attachments"
                  label="补充附件"
                  valuePropName="fileList"
                  getValueFromEvent={(event) => Array.isArray(event) ? event : event?.fileList}
                >
                  <Upload beforeUpload={() => false} maxCount={3}>
                    <Button icon={<UploadOutlined />}>选择附件</Button>
                  </Upload>
                </Form.Item>
              </>
            ) : action?.type === 'return' ? (
              <>
                <Form.Item name="returnCondition" label="归还状态" rules={[{ required: true }]}>
                  <Select
                    onChange={(value) => form.setFieldsValue({ reportRepair: value !== 'NORMAL' })}
                    options={[
                      { label: '正常', value: 'NORMAL' },
                      { label: '损坏', value: 'DAMAGED' },
                      { label: '缺件', value: 'MISSING_PARTS' },
                      { label: '异常', value: 'ABNORMAL' },
                    ]}
                  />
                </Form.Item>
                <Form.Item name="returnLocation" label="归还位置" rules={[{ required: true, message: '请填写归还位置' }]}>
                  <Input placeholder="默认使用设备当前存放地点，可手动修改" />
                </Form.Item>
                <Form.Item name="returnRemark" label="归还备注" rules={[{ required: true }]}>
                  <Input.TextArea rows={3} />
                </Form.Item>
                <Form.Item name="reportRepair" label="是否报修" valuePropName="checked">
                  <Switch />
                </Form.Item>
                <Form.Item shouldUpdate={(prev, current) => prev.reportRepair !== current.reportRepair} noStyle>
                  {({ getFieldValue }) => getFieldValue('reportRepair') ? (
                    <Form.Item name="repairDescription" label="故障描述">
                      <Input.TextArea rows={3} placeholder="不填写时默认使用归还备注生成维修单" />
                    </Form.Item>
                  ) : null}
                </Form.Item>
              </>
            ) : (
              <Form.Item name="comment" label="审批意见" rules={[{ required: true }]}>
                <Input.TextArea rows={3} />
              </Form.Item>
            )}
          </Form>
        )}
      </Modal>
    </div>
  );
}

function uniqueApplicants(rows: BorrowRequest[]) {
  const map = new Map<string, BorrowRequest['applicant']>();
  rows.forEach((row) => map.set(row.applicant.id, row.applicant));
  return Array.from(map.values());
}

function actionTitle(type?: Action) {
  const titles: Record<Action, string> = {
    approve: '审批通过',
    reject: '审批驳回',
    'need-more-info': '要求补充信息',
    pickup: '确认领取',
    return: '登记归还',
    cancel: '取消申请',
    supplement: '补充申请资料',
  };
  return type ? titles[type] : '';
}

function emptyActionText(role: string, status: string) {
  if (role === 'ADMIN') {
    const adminText: Record<string, string> = {
      PENDING_APPROVAL: '待负责人审批',
      NEED_MORE_INFO: '待申请人补充',
      REJECTED: '已结束',
      RETURNED: '已归还',
      CANCELLED: '已取消',
    };
    return adminText[status] || '无需处理';
  }

  if (role === 'MANAGER') {
    const managerText: Record<string, string> = {
      NEED_MORE_INFO: '待申请人补充',
      APPROVED: '已通过',
      REJECTED: '已驳回',
      PICKED_UP: '已交付',
      RETURNED: '已归还',
      CANCELLED: '已取消',
      OVERDUE: '管理员跟进',
    };
    return managerText[status] || '无需处理';
  }

  if (role === 'USER') {
    const userText: Record<string, string> = {
      APPROVED: '待管理员交付',
      PICKED_UP: '使用中',
      RETURNED: '已归还',
      REJECTED: '已驳回',
      CANCELLED: '已取消',
      OVERDUE: '请尽快归还',
    };
    return userText[status] || '等待处理';
  }

  return '无需处理';
}

function renderAttachments(value?: string) {
  const attachments = parseAttachments(value);
  if (!attachments.length) return '-';
  return (
    <Space wrap>
      {attachments.map((file) => (
        file.url ? (
          <a key={`${file.name}-${file.url}`} href={file.url} target="_blank" rel="noreferrer">
            {file.name}
          </a>
        ) : (
          <span key={file.name}>{file.name}</span>
        )
      ))}
    </Space>
  );
}

function renderApprovals(approvals?: BorrowRequest['approvals']) {
  if (!approvals?.length) return '-';

  const resultNames: Record<string, string> = {
    APPROVED: '通过',
    REJECTED: '驳回',
    NEED_MORE_INFO: '要求补充',
  };

  return (
    <Space direction="vertical" size={4}>
      {approvals.map((item) => (
        <span key={item.id}>
          {item.approver.name}（{item.approver.role === 'ADMIN' ? '管理员' : '部门负责人'}）
          {resultNames[item.result] || item.result}
          {' · '}
          {formatDateTime(item.createdAt)}
          ：{item.comment}
        </span>
      ))}
    </Space>
  );
}
