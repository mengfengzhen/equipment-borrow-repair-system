import { PlusOutlined } from '@ant-design/icons';
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
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [filterForm] = Form.useForm();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}') as User;
  const isManager = currentUser.role === 'MANAGER';
  const currentDepartmentId = getDepartmentId(currentUser);

  const departmentOptions = useMemo(
    () => departments.map((department) => ({ label: department.name, value: department.id })),
    [departments],
  );
  const filteredUsers = useMemo(() => {
    const values = filterForm.getFieldsValue() as {
      keyword?: string;
      role?: string;
      departmentId?: string;
      active?: boolean;
    };
    const keyword = values.keyword?.trim().toLowerCase();

    return users.filter((item) => {
      const matchesKeyword = !keyword
        || item.name.toLowerCase().includes(keyword)
        || item.username.toLowerCase().includes(keyword)
        || item.phone?.toLowerCase().includes(keyword)
        || item.email?.toLowerCase().includes(keyword);
      const matchesRole = !values.role || item.role === values.role;
      const matchesDepartment = !values.departmentId || getDepartmentId(item) === values.departmentId;
      const matchesActive = values.active === undefined || (item.active !== false) === values.active;
      return matchesKeyword && matchesRole && matchesDepartment && matchesActive;
    });
  }, [users, departments, filterForm]);

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

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      role: 'USER',
      departmentId: isManager ? currentDepartmentId : undefined,
      active: true,
    });
    setCreateOpen(true);
  };

  const createUser = async () => {
    const values = await form.validateFields();

    setSaving(true);
    try {
      await http.post('/users', values);
      message.success('账号已添加');
      setCreateOpen(false);
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
      <div className="page-heading users-page-heading">
        <div>
          <Typography.Title level={2}>用户管理</Typography.Title>
          <Typography.Paragraph>查看系统账号列表，管理员和部门负责人可在此添加账号。</Typography.Paragraph>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          添加账号
        </Button>
      </div>

      <Card className="table-card">
        <Form
          form={filterForm}
          className="list-filter-bar"
          layout="inline"
          onValuesChange={() => setUsers([...users])}
        >
          <Form.Item name="keyword" label="关键词">
            <Input allowClear placeholder="姓名 / 账号 / 手机 / 邮箱" />
          </Form.Item>
          <Form.Item name="role" label="角色">
            <Select allowClear placeholder="全部角色" options={roleOptions} style={{ width: 150 }} />
          </Form.Item>
          <Form.Item name="departmentId" label="部门">
            <Select allowClear placeholder="全部部门" options={departmentOptions} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="active" label="状态">
            <Select
              allowClear
              placeholder="全部状态"
              style={{ width: 130 }}
              options={[
                { label: '启用', value: true },
                { label: '停用', value: false },
              ]}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" onClick={() => setUsers([...users])}>查询</Button>
              <Button onClick={() => {
                filterForm.resetFields();
                setUsers([...users]);
              }}>重置</Button>
            </Space>
          </Form.Item>
        </Form>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={filteredUsers}
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
          ]}
        />
      </Card>

      <Modal
        title="添加账号"
        open={createOpen}
        width={460}
        onCancel={() => {
          setCreateOpen(false);
          form.resetFields();
        }}
        onOk={createUser}
        confirmLoading={saving}
        okText="添加"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={form} className="user-create-form" layout="vertical">
          <Form.Item name="username" label="账号" rules={[{ required: true, message: '请输入账号' }]}>
            <Input placeholder="建议使用工号或姓名拼音" />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}>
            <Input.Password placeholder="至少 6 位" />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select disabled={isManager} options={isManager ? roleOptions.filter((item) => item.value === 'USER') : roleOptions} />
          </Form.Item>
          <Form.Item name="departmentId" label="部门" rules={[{ required: true, message: '请选择部门' }]}>
            <Select disabled={isManager} options={departmentOptions} />
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
          <Typography.Paragraph className="modal-helper-text" type="secondary">
            {isManager ? '部门负责人只能添加本部门普通员工账号。' : '管理员可以添加普通员工、部门负责人、维修人员和管理员账号。'}
          </Typography.Paragraph>
        </Form>
      </Modal>
    </div>
  );
}
