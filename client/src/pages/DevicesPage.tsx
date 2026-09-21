import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { Button, DatePicker, Descriptions, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Typography, Upload, message } from 'antd';
import { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload/interface';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { http } from '../api/http';
import { StatusTag } from '../components/StatusTag';
import { deviceBrandOptions, deviceLocationOptions, deviceModelOptions, deviceTypeOptions } from '../constants/deviceOptions';
import { deviceStatusNames } from '../types/enums';
import { BorrowRequest, Device, User } from '../types/models';
import { money } from '../utils/format';
import { formatDateTime } from '../utils/format';
import { serializeAttachments, uploadFiles } from '../utils/upload';

const activeBorrowStatuses = ['PENDING_APPROVAL', 'NEED_MORE_INFO', 'APPROVED', 'PICKED_UP', 'OVERDUE'];
const deviceStatusOptions = Object.entries(deviceStatusNames).map(([value, label]) => ({ value, label }));
const defaultBorrowDurationHours = 2;

type DeviceHistory = {
  borrows: BorrowRequest[];
  repairs: Array<{ id: string; status: string; faultDescription: string; repairStartAt: string; repairer?: { name: string } }>;
};

export function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [borrowRequests, setBorrowRequests] = useState<BorrowRequest[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device>();
  const [borrowOpen, setBorrowOpen] = useState<Device>();
  const [detailOpen, setDetailOpen] = useState<{ device: Device; history?: DeviceHistory }>();
  const [form] = Form.useForm();
  const [filterForm] = Form.useForm();
  const [borrowForm] = Form.useForm();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = JSON.parse(localStorage.getItem('user') || '{}') as User;
  const canApplyBorrow = user.role === 'USER';
  const canManageDevices = user.role === 'ADMIN';
  const statusFilter = searchParams.get('status');
  const filterValues = {
    keyword: searchParams.get('keyword') || undefined,
    status: statusFilter || undefined,
    type: searchParams.get('type') || undefined,
    brand: searchParams.get('brand') || undefined,
    location: searchParams.get('location') || undefined,
  };

  const buildQuery = () => {
    const params = new URLSearchParams();
    Object.entries(filterValues).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const query = params.toString();
    return query ? `?${query}` : '';
  };

  const load = async () => {
    try {
      const query = buildQuery();
      const [deviceRes, borrowRes, userRes] = await Promise.all([
        http.get(`/devices${query}`),
        canApplyBorrow ? http.get('/borrow-requests') : Promise.resolve([]),
        canManageDevices ? http.get('/users') : Promise.resolve([]),
      ]);
      setDevices(deviceRes as unknown as Device[]);
      setBorrowRequests(borrowRes as unknown as BorrowRequest[]);
      setUsers(userRes as unknown as User[]);
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  useEffect(() => {
    load();
    filterForm.setFieldsValue(filterValues);
  }, [searchParams]);

  const applyFilters = (values: Record<string, string | undefined>) => {
    const params: Record<string, string> = {};
    Object.entries(values).forEach(([key, value]) => {
      if (value) params[key] = value;
    });
    setSearchParams(params);
  };

  const resetFilters = () => {
    filterForm.resetFields();
    setSearchParams({});
  };

  const activeBorrowByDevice = borrowRequests.reduce<Record<string, BorrowRequest>>((acc, request) => {
    if (activeBorrowStatuses.includes(request.status) && request.device?.id) {
      acc[request.device.id] = request;
    }
    return acc;
  }, {});

  const disabledPastDate = (current: dayjs.Dayjs) => {
    return current && current < dayjs().startOf('day');
  };

  const validateBorrowRange = (_: unknown, value?: [dayjs.Dayjs, dayjs.Dayjs]) => {
    if (!value?.[0] || !value?.[1]) {
      return Promise.resolve();
    }
    const now = dayjs();
    const startLooksLikeDateOnlyToday =
      value[0].isSame(now, 'day') && value[0].hour() === 0 && value[0].minute() === 0 && value[0].second() === 0;

    if (value[0].isBefore(now) && !startLooksLikeDateOnlyToday) {
      return Promise.reject(new Error('借用开始时间不能早于当前时间'));
    }
    if (!value[0].isBefore(value[1]) && !startLooksLikeDateOnlyToday) {
      return Promise.reject(new Error('归还时间必须晚于借用开始时间'));
    }
    return Promise.resolve();
  };

  const getBorrowTimeDefaults = () => {
    const start = dayjs().add(5, 'minute').second(0);
    return [start, start.add(defaultBorrowDurationHours, 'hour')] as [dayjs.Dayjs, dayjs.Dayjs];
  };

  const normalizeBorrowRange = (range: [dayjs.Dayjs, dayjs.Dayjs]) => {
    const now = dayjs();
    let start = range[0];
    let end = range[1];

    if (start.isBefore(now)) {
      start = now.add(5, 'minute').second(0);
    }
    if (!end.isAfter(start)) {
      end = start.add(defaultBorrowDurationHours, 'hour');
    }

    return [start, end] as [dayjs.Dayjs, dayjs.Dayjs];
  };

  const disabledBorrowTime = (current: dayjs.Dayjs | null) => {
    const now = dayjs();
    if (!current || !current.isSame(now, 'day')) {
      return {};
    }

    return {
      disabledHours: () => Array.from({ length: now.hour() }, (_, index) => index),
      disabledMinutes: (selectedHour: number) =>
        selectedHour === now.hour() ? Array.from({ length: now.minute() }, (_, index) => index) : [],
      disabledSeconds: (selectedHour: number, selectedMinute: number) =>
        selectedHour === now.hour() && selectedMinute === now.minute()
          ? Array.from({ length: now.second() }, (_, index) => index)
          : [],
    };
  };

  const submitDevice = async (values: Record<string, unknown>) => {
    try {
      const payload: Record<string, unknown> = {
        ...values,
        purchaseDate: values.purchaseDate ? (values.purchaseDate as dayjs.Dayjs).toISOString() : undefined,
        warrantyExpireDate: values.warrantyExpireDate ? (values.warrantyExpireDate as dayjs.Dayjs).toISOString() : undefined,
      };
      if (editingDevice) {
        const { code, quantity, ...updatePayload } = payload;
        void code;
        void quantity;
        await http.patch(`/devices/${editingDevice.id}`, updatePayload);
        message.success('设备已更新');
      } else {
        await http.post('/devices', payload);
        message.success(Number(values.quantity || 1) > 1 ? '设备已批量入库' : '设备已新增');
      }
      setOpen(false);
      setEditingDevice(undefined);
      form.resetFields();
      load();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const openCreateDevice = () => {
    setEditingDevice(undefined);
    form.resetFields();
    form.setFieldsValue({ ownerId: user.id, quantity: 1 });
    setOpen(true);
  };

  const openEditDevice = (device: Device) => {
    setEditingDevice(device);
    form.setFieldsValue({
      code: device.code,
      name: device.name,
      type: device.type,
      brand: device.brand,
      model: device.model,
      location: device.location,
      ownerId: device.owner?.id,
      purchaseDate: device.purchaseDate ? dayjs(device.purchaseDate) : undefined,
      warrantyExpireDate: device.warrantyExpireDate ? dayjs(device.warrantyExpireDate) : undefined,
      value: device.value,
      description: device.description,
    });
    setOpen(true);
  };

  const openDetail = async (device: Device) => {
    setDetailOpen({ device });
    try {
      const [deviceDetail, history] = await Promise.all([
        http.get(`/devices/${device.id}`),
        http.get(`/devices/${device.id}/history`),
      ]);
      setDetailOpen({ device: deviceDetail as unknown as Device, history: history as unknown as DeviceHistory });
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const submitBorrow = async (values: Record<string, string | UploadFile[]>) => {
    try {
      const range = normalizeBorrowRange(values.borrowRange as unknown as [dayjs.Dayjs, dayjs.Dayjs]);
      const attachments = (values.attachments as UploadFile[] | undefined) || [];
      const uploadedFiles = await uploadFiles(attachments);
      await http.post('/borrow-requests', {
        deviceId: borrowOpen?.id,
        borrowStartAt: range[0].toISOString(),
        borrowEndAt: range[1].toISOString(),
        purpose: values.purpose,
        remark: values.remark,
        attachmentNames: serializeAttachments(uploadedFiles),
      });
      message.success('借用申请已提交');
      setBorrowOpen(undefined);
      borrowForm.resetFields();
      load();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const columns: ColumnsType<Device> = [
    { title: '设备编号', dataIndex: 'code' },
    { title: '设备名称', dataIndex: 'name' },
    { title: '类型', dataIndex: 'type' },
    { title: '品牌型号', render: (_, row) => `${row.brand || '-'} ${row.model || ''}` },
    { title: '位置', dataIndex: 'location' },
    { title: '保管人/使用者', render: (_, row) => getKeeperName(row) },
    { title: '价值', render: (_, row) => money(row.value) },
    { title: '状态', render: (_, row) => <StatusTag value={row.status} /> },
    {
      title: '操作',
      width: 320,
      render: (_, row) => {
        const activeBorrow = activeBorrowByDevice[row.id];
        const hasActiveBorrow = Boolean(activeBorrow);
        const deviceUnavailable = row.status !== 'AVAILABLE';
        const disableButtonText = row.status === 'DISABLED' ? '已停用' : '停用';
        const disableUnavailable = ['BORROW_PENDING', 'RESERVED', 'BORROWED', 'DISABLED', 'SCRAPPED'].includes(row.status);
        const scrapUnavailable = ['BORROW_PENDING', 'RESERVED', 'BORROWED', 'DISABLED', 'SCRAPPED'].includes(row.status);

        return (
          <div className="device-action-grid">
            <Button className="table-action-button" icon={<EyeOutlined />} onClick={() => openDetail(row)}>
              详情
            </Button>
            {canApplyBorrow && (
              <Button className="table-action-button" disabled={deviceUnavailable || hasActiveBorrow} onClick={() => setBorrowOpen(row)}>
                申请使用
              </Button>
            )}
            {user.role === 'ADMIN' && (
              <>
                <Button className="table-action-button" icon={<EditOutlined />} onClick={() => openEditDevice(row)}>
                  编辑
                </Button>
                <Popconfirm
                  title="确认停用设备？"
                  description={`停用后「${row.name}」将不能继续申请借用。`}
                  okText="确认停用"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  disabled={disableUnavailable}
                  onConfirm={() => http.patch(`/devices/${row.id}/disable`).then(load).then(() => message.success('设备已停用')).catch((error) => message.error((error as Error).message))}
                >
                  <Button className="table-action-button" danger disabled={disableUnavailable}>
                    {disableButtonText}
                  </Button>
                </Popconfirm>
                <Popconfirm
                  title="确认报废设备？"
                  description={`报废后「${row.name}」将进入报废状态，不能继续借用。`}
                  okText="确认报废"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  disabled={scrapUnavailable}
                  onConfirm={() => http.patch(`/devices/${row.id}/scrap`).then(load).then(() => message.success('设备已报废')).catch((error) => message.error((error as Error).message))}
                >
                  <Button className="table-action-button" danger disabled={scrapUnavailable}>
                    {row.status === 'SCRAPPED' ? '已报废' : '报废'}
                  </Button>
                </Popconfirm>
                <Popconfirm
                  title="确认删除设备？"
                  description={`删除后「${row.name}」将从设备台账默认列表隐藏，历史记录仍保留。`}
                  okText="确认删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  disabled={['BORROW_PENDING', 'RESERVED', 'BORROWED', 'REPAIRING'].includes(row.status)}
                  onConfirm={() => http.delete(`/devices/${row.id}`).then(load).then(() => message.success('设备已删除')).catch((error) => message.error((error as Error).message))}
                >
                  <Button
                    className="table-action-button"
                    icon={<DeleteOutlined />}
                    danger
                    disabled={['BORROW_PENDING', 'RESERVED', 'BORROWED', 'REPAIRING'].includes(row.status)}
                  >
                    删除
                  </Button>
                </Popconfirm>
              </>
            )}
            {!canApplyBorrow && user.role !== 'ADMIN' && <Typography.Text type="secondary">-</Typography.Text>}
          </div>
        );
      },
    },
  ];

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h1 className="page-title">设备管理</h1>
          <Typography.Text type="secondary">
            {searchParams.toString() ? '根据状态、类型、品牌和地点查看设备。' : '查看设备状态、资产信息和可借用情况。'}
          </Typography.Text>
        </div>
        {user.role === 'ADMIN' && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDevice}>
            新增设备
          </Button>
        )}
      </div>
      <div className="content-card">
        <Form
          form={filterForm}
          className="list-filter-bar"
          layout="inline"
          initialValues={filterValues}
          onFinish={applyFilters}
        >
          <Form.Item name="keyword" label="关键词">
            <Input allowClear placeholder="编号 / 名称 / 型号" />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select allowClear placeholder="全部状态" options={deviceStatusOptions} style={{ width: 132 }} />
          </Form.Item>
          <Form.Item name="type" label="类型">
            <Select allowClear placeholder="全部类型" options={deviceTypeOptions} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="brand" label="品牌">
            <Select allowClear placeholder="全部品牌" options={deviceBrandOptions} style={{ width: 132 }} />
          </Form.Item>
          <Form.Item name="location" label="地点">
            <Select allowClear placeholder="全部地点" options={deviceLocationOptions} style={{ width: 160 }} />
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
          dataSource={devices}
          scroll={{ x: 1280 }}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ['5', '10', '20'],
            showTotal: (total) => `共 ${total} 条设备`,
          }}
        />
      </div>
      <Modal
        title={editingDevice ? '编辑设备' : '新增设备'}
        open={open}
        onCancel={() => {
          setOpen(false);
          setEditingDevice(undefined);
        }}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submitDevice}>
          <Form.Item name="name" label="设备名称" rules={[{ required: true }]}><Input /></Form.Item>
          {editingDevice ? (
            <Form.Item name="code" label="设备编号"><Input disabled /></Form.Item>
          ) : (
            <Form.Item
              name="quantity"
              label="入库数量"
              tooltip="数量为 1 时单台入库，大于 1 时按相同信息批量生成多台设备，并自动生成设备编号。"
              rules={[{ required: true, message: '请输入入库数量' }]}
            >
              <InputNumber min={1} max={100} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          )}
          <Form.Item name="type" label="设备类型" rules={[{ required: true, message: '请选择设备类型' }]}>
            <Select placeholder="选择设备类型" options={deviceTypeOptions} />
          </Form.Item>
          <Form.Item name="brand" label="品牌" rules={[{ required: true, message: '请选择品牌' }]}>
            <Select showSearch placeholder="选择品牌" options={deviceBrandOptions} optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="model" label="型号" rules={[{ required: true, message: '请选择型号' }]}>
            <Select showSearch placeholder="选择型号" options={deviceModelOptions} optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="location" label="存放地点" rules={[{ required: true, message: '请选择存放地点' }]}>
            <Select showSearch placeholder="选择存放地点" options={deviceLocationOptions} optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="ownerId" label="默认保管责任人" rules={[{ required: true, message: '请选择默认保管责任人' }]}>
            <Select
              showSearch
              placeholder="选择默认保管责任人"
              optionFilterProp="label"
              options={users.map((item) => ({
                label: `${item.name}（${item.username}）`,
                value: item.id,
              }))}
            />
          </Form.Item>
          <Form.Item name="purchaseDate" label="购买时间">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="warrantyExpireDate" label="保修到期时间">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="value" label="设备价值"><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="description" label="说明"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
      <Drawer
        title="设备详情"
        width={720}
        open={Boolean(detailOpen)}
        onClose={() => setDetailOpen(undefined)}
      >
        {detailOpen && (
          <Space direction="vertical" size={18} style={{ width: '100%' }}>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="设备编号">{detailOpen.device.code}</Descriptions.Item>
              <Descriptions.Item label="设备名称">{detailOpen.device.name}</Descriptions.Item>
              <Descriptions.Item label="当前状态">{deviceStatusNames[detailOpen.device.status] || detailOpen.device.status}</Descriptions.Item>
              <Descriptions.Item label="是否可申请">{detailOpen.device.status === 'AVAILABLE' ? '可申请' : '不可申请'}</Descriptions.Item>
              <Descriptions.Item label="类型">{detailOpen.device.type}</Descriptions.Item>
              <Descriptions.Item label="品牌型号">{`${detailOpen.device.brand || '-'} ${detailOpen.device.model || ''}`}</Descriptions.Item>
              <Descriptions.Item label="位置">{detailOpen.device.location}</Descriptions.Item>
              <Descriptions.Item label="价值">{money(detailOpen.device.value)}</Descriptions.Item>
              <Descriptions.Item label="购买时间">{detailOpen.device.purchaseDate ? dayjs(detailOpen.device.purchaseDate).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
              <Descriptions.Item label="保修到期">{detailOpen.device.warrantyExpireDate ? dayjs(detailOpen.device.warrantyExpireDate).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
              <Descriptions.Item label="保管人/使用者" span={2}>{getKeeperName(detailOpen.device)}</Descriptions.Item>
              <Descriptions.Item label="说明" span={2}>{detailOpen.device.description || '-'}</Descriptions.Item>
            </Descriptions>

            <Typography.Title level={5}>借用记录</Typography.Title>
            <Table
              rowKey="id"
              size="small"
              dataSource={detailOpen.history?.borrows || []}
              scroll={{ x: 760 }}
              pagination={{ pageSize: 5 }}
              columns={[
                { title: '申请人', render: (_, row) => row.applicant?.name || '-' },
                { title: '借用时间', render: (_, row) => `${formatDateTime(row.borrowStartAt)} 至 ${formatDateTime(row.borrowEndAt)}` },
                { title: '状态', render: (_, row) => <StatusTag value={row.status} /> },
              ]}
            />

            <Typography.Title level={5}>维修记录</Typography.Title>
            <Table
              rowKey="id"
              size="small"
              dataSource={detailOpen.history?.repairs || []}
              scroll={{ x: 820 }}
              pagination={{ pageSize: 5 }}
              columns={[
                { title: '故障描述', dataIndex: 'faultDescription' },
                { title: '维修人员', render: (_, row) => row.repairer?.name || '待分配' },
                { title: '开始时间', render: (_, row) => formatDateTime(row.repairStartAt) },
                { title: '状态', render: (_, row) => <StatusTag value={row.status} /> },
              ]}
            />
          </Space>
        )}
      </Drawer>
      <Modal title={`申请借用：${borrowOpen?.name || ''}`} open={Boolean(borrowOpen)} onCancel={() => setBorrowOpen(undefined)} onOk={() => borrowForm.submit()} destroyOnClose>
        <Form form={borrowForm} layout="vertical" onFinish={submitBorrow}>
          <Form.Item
            name="borrowRange"
            label="借用时间"
            rules={[
              { required: true, message: '请选择借用时间' },
              { validator: validateBorrowRange },
            ]}
          >
            <DatePicker.RangePicker
              showTime={{ defaultOpenValue: getBorrowTimeDefaults() }}
              disabledDate={disabledPastDate}
              disabledTime={disabledBorrowTime}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="purpose" label="用途" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item
            name="attachments"
            label="借用附件"
            valuePropName="fileList"
            getValueFromEvent={(event) => Array.isArray(event) ? event : event?.fileList}
          >
            <Upload beforeUpload={() => false} maxCount={3}>
              <Button icon={<UploadOutlined />}>选择附件</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function getKeeperName(device: Device) {
  if (device.status === 'BORROWED' && device.currentBorrower?.name) {
    return `${device.currentBorrower.name}（当前使用）`;
  }
  return device.owner?.name || '-';
}
