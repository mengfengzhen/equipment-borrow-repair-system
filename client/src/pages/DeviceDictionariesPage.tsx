import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Form, Input, Modal, Popconfirm, Segmented, Select, Space, Table, Tag, Typography, message } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { http } from '../api/http';
import { DeviceDictionaryField, DeviceDictionaryGroup, DeviceDictionaryItem } from '../types/deviceDictionary';

const fieldOrder: DeviceDictionaryField[] = ['type', 'brand', 'model', 'location'];

export function DeviceDictionariesPage() {
  const [groups, setGroups] = useState<DeviceDictionaryGroup[]>([]);
  const [field, setField] = useState<DeviceDictionaryField>('type');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DeviceDictionaryItem>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [usageFilter, setUsageFilter] = useState<'all' | 'used' | 'unused'>('all');
  const [form] = Form.useForm();

  const currentGroup = useMemo(
    () => groups.find((item) => item.field === field),
    [groups, field],
  );
  const filteredItems = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return (currentGroup?.items || []).filter((item) => {
      const matchesKeyword = !normalizedKeyword || item.value.toLowerCase().includes(normalizedKeyword);
      const matchesUsage = usageFilter === 'all'
        || (usageFilter === 'used' && item.used)
        || (usageFilter === 'unused' && !item.used);
      return matchesKeyword && matchesUsage;
    });
  }, [currentGroup, keyword, usageFilter]);

  const load = async () => {
    setLoading(true);
    try {
      const result = await http.get('/devices/dictionaries') as unknown as DeviceDictionaryGroup[];
      setGroups(result);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(undefined);
    form.resetFields();
    setOpen(true);
  };

  const openEdit = (item: DeviceDictionaryItem) => {
    setEditing(item);
    form.setFieldsValue({ value: item.value });
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields() as { value: string };
    setSaving(true);
    try {
      const result = editing
        ? await http.patch(`/devices/dictionaries/${field}`, { oldValue: editing.value, value: values.value })
        : await http.post(`/devices/dictionaries/${field}`, { value: values.value });
      setGroups(result as unknown as DeviceDictionaryGroup[]);
      message.success(editing ? '字典值已更新' : '字典值已新增');
      setOpen(false);
      setEditing(undefined);
      form.resetFields();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: DeviceDictionaryItem) => {
    try {
      const result = await http.delete(`/devices/dictionaries/${field}`, { params: { value: item.value } });
      setGroups(result as unknown as DeviceDictionaryGroup[]);
      message.success('字典值已删除');
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const columns: ColumnsType<DeviceDictionaryItem> = [
    { title: currentGroup?.label || '字典值', dataIndex: 'value' },
    {
      title: '使用状态',
      width: 180,
      render: (_, row) => row.used
        ? <Tag color="green">已使用 {row.usageCount}</Tag>
        : <Tag>未使用</Tag>,
    },
    {
      title: '操作',
      width: 220,
      render: (_, row) => (
        <Space>
          <Button icon={<EditOutlined />} disabled={row.used} onClick={() => openEdit(row)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除该字典值？"
            description="删除后新增设备和 CSV 导入将不能再使用该值。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            disabled={row.used}
            onConfirm={() => remove(row)}
          >
            <Button icon={<DeleteOutlined />} danger disabled={row.used}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <h1 className="page-title">设备字典管理</h1>
          <Typography.Text type="secondary">
            管理设备类型、品牌、型号和存放地点。已被设备使用的字典值不能编辑或删除。
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新增枚举值
        </Button>
      </div>

      <div className="content-card">
        <div className="dictionary-toolbar">
          <Segmented
            value={field}
            options={fieldOrder.map((item) => ({
              label: groups.find((group) => group.field === item)?.label || item,
              value: item,
            }))}
            onChange={(value) => setField(value as DeviceDictionaryField)}
          />
          <Space wrap>
            <Input.Search
              allowClear
              placeholder={`搜索${currentGroup?.label || '字典值'}`}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              style={{ width: 240 }}
            />
            <Select
              value={usageFilter}
              onChange={setUsageFilter}
              style={{ width: 132 }}
              options={[
                { label: '全部状态', value: 'all' },
                { label: '已使用', value: 'used' },
                { label: '未使用', value: 'unused' },
              ]}
            />
          </Space>
        </div>
        <Table
          rowKey="value"
          loading={loading}
          columns={columns}
          dataSource={filteredItems}
          pagination={{ pageSize: 10, showTotal: (total) => `共 ${total} 个枚举值` }}
        />
      </div>

      <Modal
        title={editing ? `编辑${currentGroup?.label || '字典值'}` : `新增${currentGroup?.label || '字典值'}`}
        open={open}
        onCancel={() => {
          setOpen(false);
          setEditing(undefined);
          form.resetFields();
        }}
        onOk={submit}
        confirmLoading={saving}
        okText={editing ? '保存' : '新增'}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="value"
            label={currentGroup?.label || '字典值'}
            rules={[{ required: true, whitespace: true, message: '请输入字典值' }]}
          >
            <Input placeholder={`请输入${currentGroup?.label || '字典值'}`} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
