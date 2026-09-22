import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, SettingOutlined, UploadOutlined } from '@ant-design/icons';
import { Alert, Button, DatePicker, Descriptions, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Typography, Upload, message } from 'antd';
import { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload/interface';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { http } from '../api/http';
import { StatusTag } from '../components/StatusTag';
import { deviceBrandOptions, deviceLocationOptions, deviceModelOptions, deviceTypeOptions } from '../constants/deviceOptions';
import { DeviceDictionaryGroup, DeviceDictionaryItem } from '../types/deviceDictionary';
import { deviceStatusNames, repairStatusNames } from '../types/enums';
import { BorrowRequest, Device, User } from '../types/models';
import { formatDateRange, formatDateTime, money } from '../utils/format';
import { serializeAttachments, uploadFiles } from '../utils/upload';

const activeBorrowStatuses = ['PENDING_APPROVAL', 'NEED_MORE_INFO', 'APPROVED', 'PICKED_UP', 'OVERDUE'];
const deviceStatusOptions = Object.entries(deviceStatusNames).map(([value, label]) => ({ value, label }));
const csvSample = [
  'name,type,quantity,brand,model,location,ownerUsername,purchaseDate,warrantyExpireDate,value,description',
  '索尼 A7M4,摄影器材,2,Sony,A7M4,行政库房 A1,admin,2026-01-10,2028-01-10,12999,全画幅相机',
  'MacBook Pro,电脑设备,1,Apple,M3 Pro,行政库房 A2,admin,2026-02-15,2029-02-15,14999,办公笔记本',
].join('\n');

type DeviceHistory = {
  borrows: BorrowRequest[];
  repairs: Array<{ id: string; status: string; faultDescription: string; repairStartAt: string; repairer?: { name: string } }>;
};

type BorrowOption = {
  groupKey: string;
  name: string;
  type: string;
  brand?: string;
  model?: string;
  availableCount: number;
  locations: string[];
  sampleDeviceId: string;
};

type SelectOption = {
  label: string;
  value: string;
};

type DeviceDictionaryOptions = {
  type: SelectOption[];
  brand: SelectOption[];
  model: DeviceDictionaryItem[];
  location: SelectOption[];
};

const defaultDictionaryOptions: DeviceDictionaryOptions = {
  type: deviceTypeOptions,
  brand: deviceBrandOptions,
  model: deviceModelOptions.map((item) => ({
    value: item.value,
    used: false,
    usageCount: 0,
  })),
  location: deviceLocationOptions,
};

export function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [borrowRequests, setBorrowRequests] = useState<BorrowRequest[]>([]);
  const [borrowOptions, setBorrowOptions] = useState<BorrowOption[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device>();
  const [borrowOpen, setBorrowOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFileList, setImportFileList] = useState<UploadFile[]>([]);
  const [importing, setImporting] = useState(false);
  const [selectedBorrowOptionKey, setSelectedBorrowOptionKey] = useState<string>();
  const [repairConfirmDevice, setRepairConfirmDevice] = useState<Device>();
  const [dictionaryOptions, setDictionaryOptions] = useState<DeviceDictionaryOptions>(defaultDictionaryOptions);
  const [detailOpen, setDetailOpen] = useState<{ device: Device; history?: DeviceHistory }>();
  const [form] = Form.useForm();
  const [filterForm] = Form.useForm();
  const [borrowForm] = Form.useForm();
  const [repairConfirmForm] = Form.useForm();
  const navigate = useNavigate();
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
  const selectedDeviceType = Form.useWatch('type', form);
  const selectedDeviceBrand = Form.useWatch('brand', form);
  const availableBrandOptions = useMemo(() => {
    if (!selectedDeviceType) {
      return dictionaryOptions.brand;
    }
    const brands = new Set(
      dictionaryOptions.model
        .filter((item) => item.type === selectedDeviceType)
        .map((item) => item.brand)
        .filter((value): value is string => Boolean(value)),
    );
    return dictionaryOptions.brand.filter((item) => brands.has(item.value));
  }, [dictionaryOptions.brand, dictionaryOptions.model, selectedDeviceType]);
  const availableModelOptions = useMemo(() => {
    if (!selectedDeviceType || !selectedDeviceBrand) {
      return [];
    }
    return dictionaryOptions.model
      .filter((item) => item.type === selectedDeviceType && item.brand === selectedDeviceBrand)
      .map((item) => ({ label: item.value, value: item.value }));
  }, [dictionaryOptions.model, selectedDeviceBrand, selectedDeviceType]);

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
      const [deviceRes, borrowRes, userRes, optionRes, dictionaryRes] = await Promise.all([
        http.get(`/devices${query}`),
        canApplyBorrow ? http.get('/borrow-requests') : Promise.resolve([]),
        canManageDevices ? http.get('/users') : Promise.resolve([]),
        canApplyBorrow ? http.get('/devices/borrow-options') : Promise.resolve([]),
        canManageDevices ? http.get('/devices/dictionaries') : Promise.resolve([]),
      ]);
      setDevices(deviceRes as unknown as Device[]);
      setBorrowRequests(borrowRes as unknown as BorrowRequest[]);
      setUsers(userRes as unknown as User[]);
      setBorrowOptions(optionRes as unknown as BorrowOption[]);
      if (canManageDevices) {
        setDictionaryOptions(buildDictionaryOptions(dictionaryRes as unknown as DeviceDictionaryGroup[]));
      }
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
    if (activeBorrowStatuses.includes(request.status)) {
      (request.items || []).forEach((item) => {
        acc[item.device.id] = request;
      });
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

    if (value[1].isBefore(value[0], 'day')) {
      return Promise.reject(new Error('归还日期不能早于借用开始日期'));
    }
    return Promise.resolve();
  };

  const getBorrowDateDefaults = () => {
    const today = dayjs().startOf('day');
    return [today, today] as [dayjs.Dayjs, dayjs.Dayjs];
  };

  const normalizeBorrowRange = (range: [dayjs.Dayjs, dayjs.Dayjs]) => {
    return [range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD')] as [string, string];
  };

  const loadBorrowOptionsForRange = async (range?: [dayjs.Dayjs, dayjs.Dayjs]) => {
    if (!canApplyBorrow) return;
    try {
      const params = new URLSearchParams();
      if (range?.[0] && range?.[1]) {
        const normalized = normalizeBorrowRange(range);
        params.set('borrowStartAt', normalized[0]);
        params.set('borrowEndAt', normalized[1]);
      }
      const result = await http.get(`/devices/borrow-options${params.toString() ? `?${params.toString()}` : ''}`);
      const options = result as unknown as BorrowOption[];
      setBorrowOptions(options);

      const selectedGroupKey = borrowForm.getFieldValue('deviceGroupKey');
      const selectedOption = options.find((item) => item.groupKey === selectedGroupKey);
      const quantity = Number(borrowForm.getFieldValue('quantity') || 1);
      if (selectedGroupKey && (!selectedOption || selectedOption.availableCount <= 0)) {
        setSelectedBorrowOptionKey(undefined);
        borrowForm.setFieldsValue({ deviceGroupKey: undefined, quantity: 1 });
        message.warning('当前时间段下原选择的型号已不可用，请重新选择。');
        return;
      }
      if (selectedOption && selectedOption.availableCount > 0 && quantity > selectedOption.availableCount) {
        borrowForm.setFieldsValue({ quantity: selectedOption.availableCount });
      }
    } catch (error) {
      message.error((error as Error).message);
    }
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
    form.setFieldsValue({ quantity: 1 });
    setOpen(true);
  };

  const openImportDevices = () => {
    setImportFileList([]);
    setImportOpen(true);
  };

  const submitImportDevices = async () => {
    const file = importFileList[0]?.originFileObj as File | undefined;
    if (!file) {
      message.error('请先选择 CSV 文件');
      return;
    }
    try {
      setImporting(true);
      const csvText = await readFileAsText(file);
      const result = await http.post('/devices/import', { csvText }) as unknown as {
        importedCount: number;
        rowCount: number;
        skippedCount?: number;
        errors?: string[];
      };
      if (result.importedCount > 0) {
        message.success(`已导入 ${result.importedCount} 台设备，来源 ${result.rowCount} 行 CSV 数据`);
        setImportOpen(false);
        setImportFileList([]);
        load();
      } else {
        message.warning('没有可导入的数据，请按提示修改 CSV 后重试');
      }
      if (result.skippedCount) {
        Modal.warning({
          title: `已跳过 ${result.skippedCount} 行不符合条件的数据`,
          content: (
            <div className="import-error-list">
              {(result.errors || []).map((item, index) => (
                <div key={`${item}-${index}`}>{item}</div>
              ))}
            </div>
          ),
        });
      }
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const downloadCsvSample = () => {
    const blob = new Blob([`\uFEFF${csvSample}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'devices-import-sample.csv';
    link.click();
    URL.revokeObjectURL(url);
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

  const openBorrowModal = () => {
    const defaultRange = getBorrowDateDefaults();
    setBorrowOpen(true);
    setSelectedBorrowOptionKey(undefined);
    borrowForm.resetFields();
    borrowForm.setFieldsValue({ borrowRange: defaultRange, quantity: 1 });
    void loadBorrowOptionsForRange(defaultRange);
  };

  const submitBorrow = async (values: Record<string, string | UploadFile[]>) => {
    try {
      const range = normalizeBorrowRange(values.borrowRange as unknown as [dayjs.Dayjs, dayjs.Dayjs]);
      const selectedOption = borrowOptions.find((item) => item.groupKey === values.deviceGroupKey);
      const attachments = (values.attachments as UploadFile[] | undefined) || [];
      const quantity = Number(values.quantity || 1);
      if (selectedOption && selectedOption.availableCount < quantity) {
        message.error(`该型号在所选时间段可用 ${selectedOption.availableCount} 台，不能申请 ${quantity} 台`);
        return;
      }
      const uploadedFiles = await uploadFiles(attachments);
      await http.post('/borrow-requests', {
        deviceGroupKey: values.deviceGroupKey,
        quantity,
        borrowStartAt: range[0],
        borrowEndAt: range[1],
        purpose: values.purpose,
        remark: values.remark,
        attachmentNames: serializeAttachments(uploadedFiles),
      });
      message.success(quantity > 1 ? `已提交 ${quantity} 台设备借用申请` : '借用申请已提交');
      setBorrowOpen(false);
      setSelectedBorrowOptionKey(undefined);
      borrowForm.resetFields();
      load();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const confirmRepairFromDevice = async (values: Record<string, unknown>) => {
    const repairId = repairConfirmDevice?.currentRepair?.id;
    if (!repairId) return;
    try {
      await http.patch(`/repairs/${repairId}/confirm`, values);
      message.success('维修验收已确认');
      setRepairConfirmDevice(undefined);
      repairConfirmForm.resetFields();
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
    { title: '状态', render: (_, row) => <StatusTag value={row.status} label={deviceStatusLabel(row.status, user.role)} /> },
    {
      title: '操作',
      width: 320,
      render: (_, row) => {
        const activeBorrow = activeBorrowByDevice[row.id];
        const hasActiveBorrow = Boolean(activeBorrow);
        const disableButtonText = row.status === 'DISABLED' ? '已停用' : '停用';
        const disableUnavailable = ['BORROW_PENDING', 'RESERVED', 'BORROWED', 'WAITING_REPAIR', 'REPAIRING', 'DISABLED', 'SCRAPPED'].includes(row.status);
        const scrapUnavailable = ['BORROW_PENDING', 'RESERVED', 'BORROWED', 'WAITING_REPAIR', 'REPAIRING', 'DISABLED', 'SCRAPPED'].includes(row.status);

        return (
          <div className="device-action-grid">
            {canManageDevices && (
              <>
                <Button className="table-action-button" icon={<EyeOutlined />} onClick={() => openDetail(row)}>
                  详情
                </Button>
                <Button className="table-action-button" icon={<EditOutlined />} onClick={() => openEditDevice(row)}>
                  编辑
                </Button>
                {row.currentRepair && (
                  <Button
                    className="table-action-button"
                    type="primary"
                    onClick={() => {
                      setRepairConfirmDevice(row);
                      repairConfirmForm.setFieldsValue({
                        status: repairConfirmStatus(row.currentRepair),
                        result: row.currentRepair?.result,
                        location: row.location,
                      });
                    }}
                  >
                    验收确认
                  </Button>
                )}
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
                  disabled={['BORROW_PENDING', 'RESERVED', 'BORROWED', 'WAITING_REPAIR', 'REPAIRING'].includes(row.status)}
                  onConfirm={() => http.delete(`/devices/${row.id}`).then(load).then(() => message.success('设备已删除')).catch((error) => message.error((error as Error).message))}
                >
                  <Button
                    className="table-action-button"
                    icon={<DeleteOutlined />}
                    danger
                    disabled={['BORROW_PENDING', 'RESERVED', 'BORROWED', 'WAITING_REPAIR', 'REPAIRING'].includes(row.status)}
                  >
                    删除
                  </Button>
                </Popconfirm>
              </>
            )}
            {!canManageDevices && <Typography.Text type="secondary">--</Typography.Text>}
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
            {user.role === 'USER'
              ? '查看自己待领取、已领取和逾期未还的设备，需要新设备时提交借用申请。'
              : searchParams.toString() ? '根据状态、类型、品牌和地点查看设备。' : '查看设备状态、资产信息和可借用情况。'}
          </Typography.Text>
        </div>
        {canApplyBorrow && (
          <Button className="borrow-cta-button" type="primary" size="large" icon={<PlusOutlined />} onClick={openBorrowModal}>
            申请设备
          </Button>
        )}
        {canManageDevices && (
          <Space>
            <Button icon={<SettingOutlined />} onClick={() => navigate('/device-dictionaries')}>
              字段管理
            </Button>
            <Button icon={<UploadOutlined />} onClick={openImportDevices}>
              批量导入设备
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDevice}>
              新增设备
            </Button>
          </Space>
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
            <Select allowClear placeholder="全部类型" options={dictionaryOptions.type} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="brand" label="品牌">
            <Select allowClear placeholder="全部品牌" options={dictionaryOptions.brand} style={{ width: 132 }} />
          </Form.Item>
          <Form.Item name="location" label="地点">
            <Select allowClear placeholder="全部地点" options={dictionaryOptions.location} style={{ width: 160 }} />
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
            <Select
              placeholder="选择设备类型"
              options={dictionaryOptions.type}
              onChange={() => form.setFieldsValue({ brand: undefined, model: undefined })}
            />
          </Form.Item>
          <Form.Item name="brand" label="品牌" rules={[{ required: true, message: '请选择品牌' }]}>
            <Select
              showSearch
              placeholder={selectedDeviceType ? '选择品牌' : '请先选择设备类型'}
              options={availableBrandOptions}
              optionFilterProp="label"
              disabled={!selectedDeviceType}
              onChange={() => form.setFieldsValue({ model: undefined })}
            />
          </Form.Item>
          <Form.Item name="model" label="型号" rules={[{ required: true, message: '请选择型号' }]}>
            <Select
              showSearch
              placeholder={selectedDeviceBrand ? '选择型号' : '请先选择品牌'}
              options={availableModelOptions}
              optionFilterProp="label"
              disabled={!selectedDeviceType || !selectedDeviceBrand}
              notFoundContent="当前类型和品牌下没有可选型号"
            />
          </Form.Item>
          <Form.Item name="location" label="存放地点" rules={[{ required: true, message: '请选择存放地点' }]}>
            <Select showSearch placeholder="选择存放地点" options={dictionaryOptions.location} optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="ownerId" label="默认保管责任人" rules={[{ required: true, message: '请选择默认保管责任人' }]}>
            <Select
              showSearch
              placeholder="选择默认保管责任人"
              optionFilterProp="label"
              options={buildOwnerOptions(users, user).map((item) => ({
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
      <Modal
        title="批量导入设备"
        open={importOpen}
        onCancel={() => {
          setImportOpen(false);
          setImportFileList([]);
        }}
        onOk={submitImportDevices}
        confirmLoading={importing}
        okText="开始导入"
        destroyOnClose
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="CSV 格式说明"
            description="必填列：name、type、brand、model、location。设备类型、品牌、存放地点必须和系统可选项一致，型号必须匹配对应的设备类型和品牌；quantity 不填默认为 1；ownerUsername 填默认保管责任人账号。设备编号由系统按类型自动生成。"
          />
          <div>
            <Typography.Text strong>示例 CSV</Typography.Text>
            <pre className="csv-sample-block">{csvSample}</pre>
            <Button size="small" onClick={downloadCsvSample}>下载示例 CSV</Button>
          </div>
          <Upload.Dragger
            accept=".csv,text/csv"
            maxCount={1}
            fileList={importFileList}
            beforeUpload={(file) => {
              setImportFileList([{
                uid: file.uid,
                name: file.name,
                status: 'done',
                originFileObj: file,
              }]);
              return false;
            }}
            onRemove={() => {
              setImportFileList([]);
            }}
          >
            <p className="ant-upload-drag-icon"><UploadOutlined /></p>
            <p className="ant-upload-text">点击或拖拽 CSV 文件到这里</p>
            <p className="ant-upload-hint">仅导入设备基础信息，状态默认可用。</p>
          </Upload.Dragger>
        </Space>
      </Modal>
      <Modal
        title={`维修验收：${repairConfirmDevice?.name || ''}`}
        open={Boolean(repairConfirmDevice)}
        onCancel={() => {
          setRepairConfirmDevice(undefined);
          repairConfirmForm.resetFields();
        }}
        onOk={() => repairConfirmForm.submit()}
        destroyOnClose
      >
        <Form form={repairConfirmForm} layout="vertical" onFinish={confirmRepairFromDevice}>
          {repairConfirmDevice?.currentRepair?.repairResultStatus && (
            <Typography.Paragraph className="modal-helper-text">
              维修人员提交结果：{repairStatusNames[repairConfirmDevice.currentRepair.repairResultStatus] || repairConfirmDevice.currentRepair.repairResultStatus}
            </Typography.Paragraph>
          )}
          <Form.Item name="status" label="验收结果" rules={[{ required: true, message: '请选择验收结果' }]}>
            <Select
              options={[
                { label: '确认已修复，恢复可用', value: 'FIXED' },
                { label: '确认无法修复，设备报废', value: 'UNREPAIRABLE' },
              ]}
            />
          </Form.Item>
          <Form.Item name="location" label="存放位置" rules={[{ required: true, message: '请选择存放位置' }]}>
            <Select
              showSearch
              placeholder="选择验收后的存放位置"
              optionFilterProp="label"
              options={dictionaryOptions.location}
            />
          </Form.Item>
          <Form.Item name="result" label="验收说明">
            <Input.TextArea rows={3} placeholder="可补充验收意见，不填写则保留维修人员结果" />
          </Form.Item>
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
              <Descriptions.Item label="当前状态">{deviceStatusLabel(detailOpen.device.status, user.role)}</Descriptions.Item>
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
                { title: '借用时间', render: (_, row) => formatDateRange(row.borrowStartAt, row.borrowEndAt) },
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
      <Modal
        title="申请设备"
        open={borrowOpen}
        onCancel={() => {
          setBorrowOpen(false);
          setSelectedBorrowOptionKey(undefined);
        }}
        onOk={() => borrowForm.submit()}
        destroyOnClose
      >
        <Form form={borrowForm} layout="vertical" onFinish={submitBorrow}>
          <Form.Item name="deviceGroupKey" label="设备型号" rules={[{ required: true, message: '请选择设备型号' }]}>
            <Select
              showSearch
              placeholder="选择可申请的设备型号"
              optionFilterProp="label"
              onChange={(value) => {
                setSelectedBorrowOptionKey(value);
                borrowForm.setFieldsValue({ quantity: 1 });
              }}
              options={borrowOptions.filter((item) => item.availableCount > 0).map((item) => ({
                label: `${item.name} / ${item.type} / 所选时间可用 ${item.availableCount} 台`,
                value: item.groupKey,
              }))}
              notFoundContent="所选时间段暂无可申请型号"
            />
          </Form.Item>
          <Form.Item
            name="borrowRange"
            label="借用时间"
            rules={[
              { required: true, message: '请选择借用时间' },
              { validator: validateBorrowRange },
            ]}
          >
            <DatePicker.RangePicker
              disabledDate={disabledPastDate}
              onChange={(value) => {
                if (value?.[0] && value?.[1]) {
                  void loadBorrowOptionsForRange(value as [dayjs.Dayjs, dayjs.Dayjs]);
                }
              }}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item shouldUpdate={(prev, current) => (
            prev.deviceGroupKey !== current.deviceGroupKey
            || prev.quantity !== current.quantity
            || prev.borrowRange !== current.borrowRange
          )} noStyle>
            {({ getFieldValue }) => {
              const option = borrowOptions.find((item) => item.groupKey === (selectedBorrowOptionKey || borrowForm.getFieldValue('deviceGroupKey')));
              const quantity = Number(getFieldValue('quantity') || 1);
              return option ? (
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Typography.Text type="secondary">
                    所选时间可用 {option.availableCount} 台，位置：{option.locations.join('、') || '-'}
                  </Typography.Text>
                  {option.availableCount < quantity && (
                    <Alert
                      type="warning"
                      showIcon
                      message={`该型号在所选时间段已被占用，可用 ${option.availableCount} 台，请调整数量、型号或借用时间。`}
                    />
                  )}
                </Space>
              ) : null;
            }}
          </Form.Item>
          <Form.Item name="quantity" label="借用数量" rules={[{ required: true, message: '请输入借用数量' }]}>
            <InputNumber
              min={1}
              max={borrowOptions.find((item) => item.groupKey === selectedBorrowOptionKey)?.availableCount || 1}
              precision={0}
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

function repairConfirmStatus(repair?: { repairResultStatus?: string; result?: string }) {
  if (['FIXED', 'UNREPAIRABLE'].includes(repair?.repairResultStatus || '')) {
    return repair?.repairResultStatus;
  }

  if (repair?.result && /(无法修复|不可修复|修不好|未修好|报废|unrepairable)/i.test(repair.result)) {
    return 'UNREPAIRABLE';
  }

  if (repair?.result && /(已修复|修复完成|恢复可用|fixed)/i.test(repair.result)) {
    return 'FIXED';
  }

  return undefined;
}

function getKeeperName(device: Device) {
  if (device.status === 'BORROWED' && device.currentBorrower?.name) {
    return `${device.currentBorrower.name}（当前使用）`;
  }
  return device.owner?.name || '-';
}

function deviceStatusLabel(status: string, role: string) {
  if (role === 'USER' && status === 'BORROWED') {
    return '使用中';
  }
  return deviceStatusNames[status] || status;
}

function buildOwnerOptions(users: User[], currentUser: User) {
  if (!currentUser?.id || users.some((item) => item.id === currentUser.id)) {
    return users;
  }
  return [
    ...users,
    {
      id: currentUser.id,
      username: currentUser.username,
      name: currentUser.name,
      role: currentUser.role,
    },
  ];
}

function buildDictionaryOptions(groups: DeviceDictionaryGroup[]) {
  const result: DeviceDictionaryOptions = {
    type: defaultDictionaryOptions.type,
    brand: defaultDictionaryOptions.brand,
    model: defaultDictionaryOptions.model,
    location: defaultDictionaryOptions.location,
  };
  groups.forEach((group) => {
    if (group.field === 'model') {
      result.model = group.items;
      return;
    }
    result[group.field] = group.items.map((item) => ({ label: item.value, value: item.value }));
  });
  return result;
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取 CSV 文件失败'));
    reader.readAsText(file, 'utf-8');
  });
}
