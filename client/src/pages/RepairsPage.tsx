import { PlusOutlined } from '@ant-design/icons';
import { Button, Form, Input, InputNumber, Modal, Select, Space, Table, Typography, message } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { http } from '../api/http';
import { StatusTag } from '../components/StatusTag';
import { deviceLocationOptions, deviceTypeOptions } from '../constants/deviceOptions';
import { Device, RepairRecord, User } from '../types/models';
import { deviceStatusNames, repairStatusNames } from '../types/enums';
import { formatDateTime, money } from '../utils/format';

export function RepairsPage() {
  const [rows, setRows] = useState<RepairRecord[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [current, setCurrent] = useState<RepairRecord>();
  const [confirming, setConfirming] = useState<RepairRecord>();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const [confirmForm] = Form.useForm();
  const [createForm] = Form.useForm();
  const [filterForm] = Form.useForm();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = JSON.parse(localStorage.getItem('user') || '{}') as User;
  const statusFilter = searchParams.get('status');
  const deviceTypeFilter = searchParams.get('deviceType');
  const repairerFilter = searchParams.get('repairerId');
  const title = user.role === 'REPAIRER' ? '我的维修任务' : '维修管理';
  const isRepairer = user.role === 'REPAIRER';
  const subtitle = user.role === 'REPAIRER'
    ? '查看分配给自己的任务，也可以接收待分配维修单。'
    : '查看维修记录、处理异常归还和设备维修闭环。';

  const load = () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (deviceTypeFilter) params.set('deviceType', deviceTypeFilter);
    if (repairerFilter) params.set('repairerId', repairerFilter);
    const query = params.toString() ? `?${params.toString()}` : '';
    http.get(`/repairs${query}`)
      .then((res) => setRows(res as unknown as RepairRecord[]))
      .catch((error) => message.error((error as Error).message));
  };

  const loadOptions = () => {
    if (user.role !== 'ADMIN') return;
    Promise.all([http.get('/devices'), http.get('/users')])
      .then(([deviceRes, userRes]) => {
        setDevices(deviceRes as unknown as Device[]);
        setUsers(userRes as unknown as User[]);
      })
      .catch((error) => message.error((error as Error).message));
  };

  useEffect(() => {
    filterForm.setFieldsValue({
      status: statusFilter || undefined,
      deviceType: deviceTypeFilter || undefined,
      repairerId: repairerFilter || undefined,
    });
    load();
    loadOptions();
  }, [statusFilter, deviceTypeFilter, repairerFilter]);

  const applyFilters = (values: { status?: string; deviceType?: string; repairerId?: string }) => {
    const params: Record<string, string> = {};
    if (values.status) params.status = values.status;
    if (values.deviceType) params.deviceType = values.deviceType;
    if (values.repairerId) params.repairerId = values.repairerId;
    setSearchParams(params);
  };

  const resetFilters = () => {
    filterForm.resetFields();
    setSearchParams({});
  };

  const createRepair = async (values: Record<string, unknown>) => {
    try {
      await http.post('/repairs', values);
      message.success('维修单已提交');
      setCreateOpen(false);
      createForm.resetFields();
      load();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const update = async (values: Record<string, unknown>) => {
    if (!current) return;
    try {
      await http.patch(`/repairs/${current.id}/status`, values);
      message.success('维修状态已更新');
      setCurrent(undefined);
      form.resetFields();
      load();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const confirmRepair = async (values: Record<string, unknown>) => {
    if (!confirming) return;
    try {
      await http.patch(`/repairs/${confirming.id}/confirm`, values);
      message.success('维修验收已确认');
      setConfirming(undefined);
      confirmForm.resetFields();
      load();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const acceptRepair = async (row: RepairRecord) => {
    try {
      await http.patch(`/repairs/${row.id}/accept`);
      message.success('维修任务已接单');
      load();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const openUpdate = (row: RepairRecord) => {
    setCurrent(row);
    form.resetFields();
  };

  const openConfirm = (row: RepairRecord) => {
    setConfirming(row);
    confirmForm.setFieldsValue({
      status: row.repairResultStatus || 'FIXED',
      result: row.result,
      location: row.device.location,
    });
  };

  const columns: ColumnsType<RepairRecord> = [
    { title: '设备', render: (_, row) => row.device.name },
    { title: '故障描述', dataIndex: 'faultDescription' },
    { title: '维修人员', render: (_, row) => row.repairer?.name || '待分配' },
    { title: '来源', render: (_, row) => row.borrowRequest ? `${row.borrowRequest.applicant.name} 异常归还` : '后台创建' },
    { title: '开始时间', render: (_, row) => formatDateTime(row.repairStartAt) },
    { title: '费用', render: (_, row) => money(row.cost) },
    { title: '状态', render: (_, row) => <StatusTag value={row.status} /> },
    {
      title: '操作',
      render: (_, row) => {
        if (user.role === 'ADMIN' && row.status === 'WAITING_CONFIRM') {
          return (
            <Button className="table-action-button" type="primary" onClick={() => openConfirm(row)}>
              验收确认
            </Button>
          );
        }

        if (!isRepairer || ['WAITING_CONFIRM', 'FIXED', 'UNREPAIRABLE'].includes(row.status)) {
          return <Typography.Text type="secondary">-</Typography.Text>;
        }

        if (!row.repairer) {
          return (
            <Button className="table-action-button" onClick={() => acceptRepair(row)}>
              接单
            </Button>
          );
        }

        return (
          <Button className="table-action-button" onClick={() => openUpdate(row)}>
            更新
          </Button>
        );
      },
    },
  ];

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h1 className="page-title">{title}</h1>
          <Typography.Text type="secondary">
            {statusFilter ? `当前筛选：${repairStatusNames[statusFilter] || statusFilter}` : subtitle}
          </Typography.Text>
        </div>
        {user.role === 'ADMIN' && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            提交维修
          </Button>
        )}
      </div>
      <div className="content-card">
        <Form
          form={filterForm}
          className="list-filter-bar"
          layout="inline"
          initialValues={{
            status: statusFilter || undefined,
            deviceType: deviceTypeFilter || undefined,
          }}
          onFinish={applyFilters}
        >
          <Form.Item name="status" label="状态">
            <Select
              allowClear
              placeholder="全部状态"
              options={Object.entries(repairStatusNames).map(([value, label]) => ({ value, label }))}
              style={{ width: 150 }}
            />
          </Form.Item>
          <Form.Item name="deviceType" label="设备类型">
            <Select allowClear placeholder="全部类型" options={deviceTypeOptions} style={{ width: 150 }} />
          </Form.Item>
          {user.role === 'ADMIN' && (
            <Form.Item name="repairerId" label="维修人员">
              <Select
                allowClear
                showSearch
                placeholder="全部人员"
                optionFilterProp="label"
                options={users
                  .filter((item) => item.role === 'REPAIRER')
                  .map((item) => ({ label: `${item.name} / ${item.username}`, value: item.id }))}
                style={{ width: 160 }}
              />
            </Form.Item>
          )}
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
          scroll={{ x: 1120 }}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ['5', '10', '20'],
            showTotal: (total) => `共 ${total} 条维修记录`,
          }}
          expandable={{ expandedRowRender: (row) => (
            <div>
              <p>维修结论：{row.repairResultStatus ? repairStatusNames[row.repairResultStatus] || row.repairResultStatus : '-'}</p>
              <p>维修说明：{row.result || '-'}</p>
              <p>结束时间：{formatDateTime(row.repairEndAt)}</p>
              <p>关联借用：{row.borrowRequest ? `${row.borrowRequest.applicant.name} / ${row.borrowRequest.purpose}` : '-'}</p>
            </div>
          ) }}
        />
      </div>
      <Modal title="填写维修处理结果" open={Boolean(current)} onCancel={() => setCurrent(undefined)} onOk={() => form.submit()} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={update}>
          <Form.Item name="status" label="维修状态" rules={[{ required: true }]}>
            <Select
              placeholder="请选择本次处理结果"
              options={[
                { label: '待配件', value: 'WAITING_PARTS' },
                { label: '已修复，提交管理员验收', value: 'FIXED' },
                { label: '无法修复，提交管理员确认', value: 'UNREPAIRABLE' },
              ]}
            />
          </Form.Item>
          <Form.Item name="result" label="维修结果"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="cost" label="维修费用"><InputNumber style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
      <Modal
        title="维修验收确认"
        open={Boolean(confirming)}
        onCancel={() => setConfirming(undefined)}
        onOk={() => confirmForm.submit()}
        destroyOnClose
      >
        <Form form={confirmForm} layout="vertical" onFinish={confirmRepair}>
          {confirming?.repairResultStatus && (
            <Typography.Paragraph>
              维修人员提交结果：{repairStatusNames[confirming.repairResultStatus] || confirming.repairResultStatus}
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
              options={deviceLocationOptions}
            />
          </Form.Item>
          <Form.Item name="result" label="验收说明">
            <Input.TextArea rows={3} placeholder="可补充验收意见，不填写则保留维修人员结果" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal title="提交维修单" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => createForm.submit()} destroyOnClose>
        <Form form={createForm} layout="vertical" onFinish={createRepair}>
          <Form.Item name="deviceId" label="维修设备" rules={[{ required: true, message: '请选择维修设备' }]}>
            <Select
              showSearch
              placeholder="只显示当前可用设备"
              optionFilterProp="label"
              options={devices
                .filter((device) => device.status === 'AVAILABLE')
                .map((device) => ({
                  label: `${device.code} / ${device.name} / ${deviceStatusNames[device.status] || device.status}`,
                  value: device.id,
                }))}
            />
          </Form.Item>
          <Form.Item name="repairerId" label="维修人员">
            <Select
              allowClear
              showSearch
              placeholder="可先不分配，由维修人员接单"
              optionFilterProp="label"
              options={users
                .filter((item) => item.role === 'REPAIRER')
                .map((item) => ({ label: `${item.name} / ${item.username}`, value: item.id }))}
            />
          </Form.Item>
          <Form.Item name="faultDescription" label="故障描述" rules={[{ required: true, message: '请填写故障描述' }]}>
            <Input.TextArea rows={4} placeholder="例如：开机无反应、接口松动、归还时发现配件缺失等" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
