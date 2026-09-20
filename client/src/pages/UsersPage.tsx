import { EditOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { http } from '../api/http';
import { roleNames, tagColors } from '../types/enums';
import type { Department, User } from '../types/models';

const roleOptions = [
  { label: roleNames.ADMIN, value: 'ADMIN' },
  { label: roleNames.MANAGER, value: 'MANAGER' },
  { label: roleNames.USER, value: 'USER' },
  { label: roleNames.REPAIRER, value: 'REPAIRER' },
];

function getDepartmentId(user: User) {
  return typeof user.department === 'object' ? user.department?.id : user.departmentId;
}

function getDepartmentName(user: User) {
  if (typeof user.department === 'object') return user.department?.name || '-';
  return user.department || '-';
}

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const departmentOptions = useMemo(
    () => departments.map((department) => ({ label: department.name, value: department.id })),
    [departments],
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const [userData, departmentData] = await Promise.all([
        http.get('/users'),
        http.get('/departments'),
      ]);
      setUsers(userData as unknown as User[]);
      setDepartments((departmentData as unknown as Department[]).map((department) => ({
        id: department.id,
        name: department.name,
      })));
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openEdit = (user: User) => {
    setEditingUser(user);
    form.setFieldsValue({
      name: user.name,
      role: user.role,
      departmentId: getDepartmentId(user),
      phone: user.phone,
      email: user.email,
      active: user.active !== false,
    });
  };

  const saveUser = async () => {
    const values = await form.validateFields();
    if (!editingUser) return;

    setSaving(true);
    try {
      await http.patch(`/users/${editingUser.id}`, values);
      message.success('用户权限已更新');
      setEditingUser(null);
      form.resetFields();
      loadData();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-heading">
        <Typography.Title level={2}>用户管理</Typography.Title>
        <Typography.Paragraph>新注册用户默认普通员工，管理员统一维护角色、部门和账号状态。</Typography.Paragraph>
      </div>

      <Card className="table-card">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={users}
          scroll={{ x: 1120 }}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 个用户` }}
          columns={[
            { title: '账号', dataIndex: 'username', width: 150 },
            { title: '姓名', dataIndex: 'name', width: 140 },
            {
              title: '角色',
              dataIndex: 'role',
              width: 150,
              render: (role: string) => <Tag color={tagColors[role] || 'blue'}>{roleNames[role] || role}</Tag>,
            },
            {
              title: '部门',
              width: 160,
              render: (_, user) => getDepartmentName(user),
            },
            { title: '手机号', dataIndex: 'phone', width: 160, render: (value?: string) => value || '-' },
            { title: '邮箱', dataIndex: 'email', width: 220, render: (value?: string) => value || '-' },
            {
              title: '状态',
              dataIndex: 'active',
              width: 120,
              render: (active?: boolean) => (
                <Tag color={active === false ? 'default' : 'green'}>{active === false ? '停用' : '启用'}</Tag>
              ),
            },
            {
              title: '操作',
              width: 150,
              render: (_, user) => (
                <Button icon={<EditOutlined />} onClick={() => openEdit(user)}>
                  编辑权限
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="编辑用户权限"
        open={Boolean(editingUser)}
        onCancel={() => {
          setEditingUser(null);
          form.resetFields();
        }}
        onOk={saveUser}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select options={roleOptions} />
          </Form.Item>
          <Form.Item name="departmentId" label="部门" rules={[{ required: true, message: '请选择部门' }]}>
            <Select options={departmentOptions} />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '请输入正确邮箱' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="active" label="账号状态" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
          <Typography.Paragraph type="secondary">
            普通员工可自助注册；部门负责人、维修人员和管理员由管理员分配，避免用户自行提升权限。
          </Typography.Paragraph>
        </Form>
      </Modal>
    </div>
  );
}
