import { UploadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, DatePicker, Form, Input, Modal, Select, Space, Switch, Table, Typography, Upload, message } from 'antd';
import { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload/interface';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { http } from '../api/http';
import { StatusTag } from '../components/StatusTag';
import { deviceLocationOptions } from '../constants/deviceOptions';
import { borrowStatusNames } from '../types/enums';
import { BorrowRequest, Department, Device, User } from '../types/models';
import { formatDateRange, formatDateTime } from '../utils/format';
import { parseAttachments, serializeAttachments, uploadFiles } from '../utils/upload';

type Action = 'approve' | 'reject' | 'need-more-info' | 'pickup' | 'return' | 'cancel' | 'supplement';
const borrowStatusOptions = Object.entries(borrowStatusNames).map(([value, label]) => ({ value, label }));

export function BorrowRequestsPage() {
  const [rows, setRows] = useState<BorrowRequest[]>([]);
  const [action, setAction] = useState<{ type: Action; row: BorrowRequest }>();
  const [settings, setSettings] = useState<{ approvalRequired: boolean }>();
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [availableDevices, setAvailableDevices] = useState<Device[]>([]);
  const [form] = Form.useForm();
  const [filterForm] = Form.useForm();
  const pickupLoadSeq = useRef(0);
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
    if (values.borrowRange?.[0]) params.borrowStartAt = values.borrowRange[0].format('YYYY-MM-DD');
    if (values.borrowRange?.[1]) params.borrowEndAt = values.borrowRange[1].format('YYYY-MM-DD');
    setSearchParams(params);
  };

  const resetFilters = () => {
    filterForm.resetFields();
    setSearchParams({});
  };

  const currentBorrowRows = rows.filter((row) => ['PICKED_UP', 'OVERDUE'].includes(row.status));
  const totalRequestedQuantity = rows.reduce((sum, row) => sum + (row.quantity || 1), 0);

  const updateApprovalRequired = async (approvalRequired: boolean) => {
    try {
      const result = await http.patch('/settings', { approvalRequired });
      setSettings(result as unknown as { approvalRequired: boolean });
      message.success(approvalRequired ? '已开启审批流程' : '已关闭审批流程，申请将直接进入待领取');
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const loadPickupDevices = async (row: BorrowRequest, seq: number) => {
    if (user.role !== 'ADMIN') return;
    try {
      const result = await http.get(`/borrow-requests/${row.id}/available-devices`);
      if (seq !== pickupLoadSeq.current) return;
      const devices = result as unknown as Device[];
      setAvailableDevices(devices);
      if ((row.quantity || 1) === 1 && devices.length === 1) {
        form.setFieldsValue({ deviceIds: [devices[0].id] });
      } else {
        form.setFieldsValue({ deviceIds: undefined });
      }
    } catch (error) {
      if (seq !== pickupLoadSeq.current) return;
      setAvailableDevices([]);
      message.error((error as Error).message);
    }
  };

  const closeAction = () => {
    pickupLoadSeq.current += 1;
    setAction(undefined);
    setAvailableDevices([]);
    form.resetFields();
  };

  const openAction = (type: Action, row: BorrowRequest) => {
    const seq = pickupLoadSeq.current + 1;
    pickupLoadSeq.current = seq;
    form.resetFields();
    setAvailableDevices([]);
    setAction({ type, row });
    if (type === 'supplement') {
      form.setFieldsValue({ purpose: row.purpose, remark: row.remark });
    }
    if (type === 'pickup') {
      void loadPickupDevices(row, seq);
    }
    if (type === 'return') {
      const returnItems = (row.items || []).map((item) => ({
        deviceId: item.device.id,
        returnCondition: 'NORMAL',
        returnLocation: item.device.location,
        returnRemark: '正常归还',
        reportRepair: false,
      }));
      form.setFieldsValue({
        items: returnItems,
      });
    }
  };

  const submitAction = async (values: Record<string, unknown>) => {
    if (!action) return;
    try {
      if (action.type === 'pickup') {
        const pickupValues = { ...values };
        const deviceIds = pickupValues.deviceIds as string[] | undefined;
        if (!deviceIds?.length && (action.row.quantity || 1) === 1 && availableDevices.length === 1) {
          pickupValues.deviceIds = [availableDevices[0].id];
        }
        const updated = await http.patch(`/borrow-requests/${action.row.id}/pickup`, pickupValues) as unknown as BorrowRequest;
        setRows((currentRows) => {
          const nextRows = currentRows.map((row) => row.id === action.row.id ? { ...row, ...updated } : row);
          return statusFilter === 'APPROVED' ? nextRows.filter((row) => row.id !== action.row.id) : nextRows;
        });
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
      closeAction();
      load();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const columns: ColumnsType<BorrowRequest> = [
    { title: '申请设备', render: (_, row) => requestDeviceText(row) },
    { title: '数量', width: 80, render: (_, row) => `${row.quantity || 1} 台` },
    { title: '申请人', render: (_, row) => row.applicant.name },
    { title: '部门', render: (_, row) => row.department?.name || '-' },
    { title: '借用时间', render: (_, row) => formatDateRange(row.borrowStartAt, row.borrowEndAt) },
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
          actions.push(<Button key="pickup" className="table-action-button" onClick={() => openAction('pickup', row)}>确认交付</Button>);
        }

        if (user.role === 'ADMIN' && ['PICKED_UP', 'OVERDUE'].includes(row.status)) {
          actions.push(<Button key="return" className="table-action-button" onClick={() => openAction('return', row)}>登记归还</Button>);
        }

        return actions.length ? <Space wrap>{actions}</Space> : <Typography.Text type="secondary">--</Typography.Text>;
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
                { title: '申请设备', render: (_, row) => requestDeviceText(row) },
                { title: '设备编号', render: (_, row) => renderItemCodes(row) },
                { title: '借用时间', render: (_, row) => formatDateRange(row.borrowStartAt, row.borrowEndAt) },
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
            showTotal: (total) => `共 ${total} 条申请 / ${totalRequestedQuantity} 台设备`,
          }}
          expandable={{ expandedRowRender: (row) => (
            <div>
              <p>备注：{row.remark || '-'}</p>
              <p>附件：{renderAttachments(row.attachmentNames)}</p>
              <p>已交付设备：{renderBorrowItems(row)}</p>
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
        onCancel={closeAction}
        onOk={() => action?.type === 'cancel' ? submitAction({}) : form.submit()}
        destroyOnClose
      >
        {action?.type === 'cancel' ? (
          <p>确认取消这条申请？</p>
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
            ) : action?.type === 'pickup' ? (
              <>
                <Alert
                  type="info"
                  showIcon
                  message={`需要交付 ${action.row.quantity || 1} 台：${requestDeviceText(action.row)}`}
                  style={{ marginBottom: 16 }}
                />
                <Form.Item
                  name="deviceIds"
                  label="选择设备"
                  rules={[
                    {
                      validator: (_, value?: string[]) => {
                        const quantity = action.row.quantity || 1;
                        const isSingleAutoSelected = quantity === 1 && availableDevices.length === 1;
                        if (isSingleAutoSelected) return Promise.resolve();
                        if (!value?.length) return Promise.reject(new Error('请选择交付设备'));
                        if (value.length !== quantity) return Promise.reject(new Error(`需要选择 ${quantity} 台设备`));
                        return Promise.resolve();
                      },
                    },
                  ]}
                >
                  <Select
                    allowClear
                    mode="multiple"
                    showSearch
                    placeholder="搜索编号 / 名称 / 位置选择设备"
                    maxCount={action.row.quantity || 1}
                    optionFilterProp="label"
                    options={availableDevices.map((device) => ({
                      label: `${device.name} / ${device.code} / ${device.location}`,
                      value: device.id,
                    }))}
                  />
                </Form.Item>
              </>
            ) : action?.type === 'return' ? (
              <>
                <Typography.Text className="modal-helper-text" type="secondary">
                  逐台登记归还状态、位置和是否报修。
                </Typography.Text>
                <Form.List name="items">
                  {(fields) => (
                    <Space direction="vertical" size={14} style={{ width: '100%' }}>
                      {fields.map((field, index) => {
                        const borrowItem = action.row.items?.[index];
                        return (
                          <div key={field.key} className="return-item-panel">
                            <Typography.Text strong>
                              {borrowItem ? `${borrowItem.device.name}（${borrowItem.device.code}）` : `设备 ${index + 1}`}
                            </Typography.Text>
                            <Form.Item name={[field.name, 'deviceId']} hidden>
                              <Input />
                            </Form.Item>
                            <Form.Item name={[field.name, 'returnCondition']} label="归还状态" rules={[{ required: true }]}>
                              <Select
                                onChange={(value) => {
                                  const items = form.getFieldValue('items') || [];
                                  items[index] = { ...items[index], reportRepair: value !== 'NORMAL' };
                                  form.setFieldsValue({ items });
                                }}
                                options={[
                                  { label: '正常', value: 'NORMAL' },
                                  { label: '损坏', value: 'DAMAGED' },
                                  { label: '缺件', value: 'MISSING_PARTS' },
                                  { label: '异常', value: 'ABNORMAL' },
                                ]}
                              />
                            </Form.Item>
                            <Form.Item name={[field.name, 'returnLocation']} label="归还位置" rules={[{ required: true, message: '请选择归还位置' }]}>
                              <Select
                                showSearch
                                placeholder="选择归还位置"
                                optionFilterProp="label"
                                options={deviceLocationOptions}
                              />
                            </Form.Item>
                            <Form.Item name={[field.name, 'returnRemark']} label="归还备注" rules={[{ required: true, message: '请填写归还备注' }]}>
                              <Input.TextArea rows={2} />
                            </Form.Item>
                            <Form.Item shouldUpdate={(prev, current) => prev.items?.[index]?.returnCondition !== current.items?.[index]?.returnCondition} noStyle>
                              {({ getFieldValue }) => {
                                const condition = getFieldValue(['items', index, 'returnCondition']);
                                return (
                                  <Form.Item name={[field.name, 'reportRepair']} label="是否报修" valuePropName="checked">
                                    <Switch disabled={condition !== 'NORMAL'} />
                                  </Form.Item>
                                );
                              }}
                            </Form.Item>
                            <Form.Item shouldUpdate={(prev, current) => prev.items?.[index]?.reportRepair !== current.items?.[index]?.reportRepair} noStyle>
                              {({ getFieldValue }) => getFieldValue(['items', index, 'reportRepair']) ? (
                                <Form.Item name={[field.name, 'repairDescription']} label="故障描述">
                                  <Input.TextArea rows={2} placeholder="不填写时默认使用归还备注生成维修单" />
                                </Form.Item>
                              ) : null}
                            </Form.Item>
                          </div>
                        );
                      })}
                    </Space>
                  )}
                </Form.List>
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

function requestDeviceText(row: BorrowRequest) {
  const modelName = [row.requestedBrand, row.requestedModel].filter(Boolean).join(' ');
  return `${modelName || row.requestedName || row.requestedType} / ${row.requestedType}`;
}

function renderItemCodes(row: BorrowRequest) {
  const codes = (row.items || []).map((item) => item.device.code);
  return codes.length ? codes.join('、') : '-';
}

function renderBorrowItems(row: BorrowRequest) {
  if (!row.items?.length) return '-';
  return (
    <Space direction="vertical" size={2}>
      {row.items.map((item) => (
        <span key={item.id}>
          {item.device.name}（{item.device.code} / {item.device.location}）
        </span>
      ))}
    </Space>
  );
}

function actionTitle(type?: Action) {
  const titles: Record<Action, string> = {
    approve: '审批通过',
    reject: '审批驳回',
    'need-more-info': '要求补充信息',
    pickup: '确认交付',
    return: '登记归还',
    cancel: '取消申请',
    supplement: '补充申请资料',
  };
  return type ? titles[type] : '';
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
