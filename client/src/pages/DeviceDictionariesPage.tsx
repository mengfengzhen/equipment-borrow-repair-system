import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Form, Input, Modal, Popconfirm, Segmented, Select, Space, Table, Tag, Typography, message } from 'antd';
import { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { http } from '../api/http';
import { DeviceDictionaryField, DeviceDictionaryGroup, DeviceDictionaryItem } from '../types/deviceDictionary';

const fieldOrder: DeviceDictionaryField[] = ['type', 'brand', 'model', 'location'];

type DictionaryFormValues = {
  value: string;
  type?: string;
  brand?: string;
};

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
  const typeOptions = useMemo(
    () => (groups.find((item) => item.field === 'type')?.items || []).map((item) => ({ label: item.value, value: item.value })),
    [groups],
  );
  const brandOptions = useMemo(
    () => (groups.find((item) => item.field === 'brand')?.items || []).map((item) => ({ label: item.value, value: item.value })),
    [groups],
  );
  const filteredItems = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return (currentGroup?.items || []).filter((item) => {
      const searchableText = [item.type, item.brand, item.value].filter(Boolean).join(' ').toLowerCase();
      const matchesKeyword = !normalizedKeyword || searchableText.includes(normalizedKeyword);
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
    form.setFieldsValue({ value: item.value, type: item.type, brand: item.brand });
    setOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields() as DictionaryFormValues;
    setSaving(true);
    try {
      const payload = field === 'model'
        ? { value: values.value, type: values.type, brand: values.brand }
        : { value: values.value };
      const result = editing
        ? await http.patch(`/devices/dictionaries/${field}`, {
            oldValue: editing.value,
            oldType: editing.type,
            oldBrand: editing.brand,
            ...payload,
          })
        : await http.post(`/devices/dictionaries/${field}`, payload);
      setGroups(result as unknown as DeviceDictionaryGroup[]);
      message.success(editing ? '枚举值已更新' : '枚举值已新增');
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
      const result = await http.delete(`/devices/dictionaries/${field}`, {
        params: field === 'model'
          ? { value: item.value, type: item.type, brand: item.brand }
          : { value: item.value },
      });
      setGroups(result as unknown as DeviceDictionaryGroup[]);
      message.success('枚举值已删除');
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const columns: ColumnsType<DeviceDictionaryItem> = [
    ...(field === 'model'
      ? [
          { title: '设备类型', dataIndex: 'type', width: 180 },
          { title: '品牌', dataIndex: 'brand', width: 180 },
          { title: '型号', dataIndex: 'value' },
        ] as ColumnsType<DeviceDictionaryItem>
      : [{ title: currentGroup?.label || '枚举值', dataIndex: 'value' }] as ColumnsType<DeviceDictionaryItem>),
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
            onChange={(value) => {
              setField(value as DeviceDictionaryField);
              setKeyword('');
              setUsageFilter('all');
            }}
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
          rowKey={(row) => field === 'model' ? `${row.type || ''}::${row.brand || ''}::${row.value}` : row.value}
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
          {field === 'model' && (
            <>
              <Form.Item
                name="type"
                label="设备类型"
                rules={[{ required: true, message: '请选择设备类型' }]}
              >
                <Select showSearch placeholder="选择设备类型" options={typeOptions} optionFilterProp="label" />
              </Form.Item>
              <Form.Item
                name="brand"
                label="品牌"
                rules={[{ required: true, message: '请选择品牌' }]}
              >
                <Select showSearch placeholder="选择品牌" options={brandOptions} optionFilterProp="label" />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="value"
            label={currentGroup?.label || '字典值'}
            rules={[{ required: true, whitespace: true, message: field === 'model' ? '请输入型号' : '请输入字典值' }]}
          >
            <Input placeholder={`请输入${field === 'model' ? '型号' : currentGroup?.label || '字典值'}`} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
