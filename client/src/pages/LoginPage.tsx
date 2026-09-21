import {
  AuditOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  LockOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Card, Form, Input, Select, Space, Tabs, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { http } from '../api/http';
import { roleNames } from '../types/enums';
import type { Department } from '../types/models';

type DemoAccount = {
  username: string;
  name: string;
  role: string;
  active?: boolean;
  password: string;
};

const demoPasswords: Record<string, string> = {
  admin: 'admin123',
  manager: 'manager123',
  user: 'user123',
  repair: 'repair123',
};

const fallbackDemoAccounts: DemoAccount[] = [
  { name: '张辰', username: 'admin', role: 'ADMIN', password: demoPasswords.admin },
  { name: '林知夏', username: 'manager', role: 'MANAGER', password: demoPasswords.manager },
  { name: '许一诺', username: 'user', role: 'USER', password: demoPasswords.user },
  { name: '沈明远', username: 'repair', role: 'REPAIRER', password: demoPasswords.repair },
];

export function LoginPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [registerForm] = Form.useForm();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>(fallbackDemoAccounts);

  useEffect(() => {
    http
      .get('/auth/departments')
      .then((data) => setDepartments(data as unknown as Department[]))
      .catch(() => setDepartments([]));
    http
      .get('/auth/demo-accounts')
      .then((data) => {
        const accounts = (data as unknown as Array<Omit<DemoAccount, 'password'>>)
          .map((account) => ({
            ...account,
            password: demoPasswords[account.username],
          }))
          .filter((account) => account.password);
        setDemoAccounts(accounts.length ? accounts : fallbackDemoAccounts);
      })
      .catch(() => setDemoAccounts(fallbackDemoAccounts));
  }, []);

  const login = async (values: { username: string; password: string }) => {
    try {
      const result = await http.post('/auth/login', values) as unknown as { token: string; user: unknown };
      localStorage.setItem('token', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));
      navigate('/', { replace: true });
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const register = async (values: {
    username: string;
    password: string;
    name: string;
    departmentId: string;
    phone?: string;
    email?: string;
  }) => {
    try {
      const result = await http.post('/auth/register', values) as unknown as { token: string; user: unknown };
      localStorage.setItem('token', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));
      message.success('注册成功，已按普通员工身份登录');
      navigate('/', { replace: true });
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  return (
    <div className="login-page">
      <div className="login-left">
        <section className="login-hero">
          <h1 className="login-title">设备借用与维修管理系统</h1>
        </section>
        <section className="login-feature-panel">
          <div className="login-feature-grid">
            <div>
              <AppstoreOutlined />
              <span>设备管理</span>
              <em>设备台账、状态监控、生命周期管理</em>
            </div>
            <div>
              <FileTextOutlined />
              <span>借用申请</span>
              <em>在线申请、设备查询、提交审批</em>
            </div>
            <div>
              <AuditOutlined />
              <span>审批流转</span>
              <em>多级审批、流程追踪、实时通知</em>
            </div>
            <div>
              <ToolOutlined />
              <span>维修记录</span>
              <em>故障登记、维修记录、维护提醒</em>
            </div>
          </div>
        </section>
      </div>
      <Card className="login-card">
        <Tabs
          items={[
            {
              key: 'login',
              label: '账号登录',
              children: (
                <>
                  <Typography.Title level={4}>演示登录</Typography.Title>
                  <Typography.Paragraph type="secondary">选择不同角色可以看到不同菜单和待处理任务。</Typography.Paragraph>
                  <Space wrap className="login-demo-list">
                    {demoAccounts.map((account) => (
                      <Button
                        key={account.username}
                        className="login-demo-button"
                        disabled={account.active === false}
                        onClick={() => {
                          form.setFieldsValue({ username: account.username, password: account.password });
                          login({ username: account.username, password: account.password });
                        }}
                      >
                        <CheckCircleOutlined />
                        <span className="login-demo-copy">
                          <span>{account.name}</span>
                          <em>{roleNames[account.role] || account.role}{account.active === false ? '（已停用）' : ''}</em>
                        </span>
                      </Button>
                    ))}
                  </Space>
                  <Form form={form} layout="vertical" onFinish={login}>
                    <Form.Item name="username" label="账号" rules={[{ required: true, message: '请输入账号' }]}>
                      <Input prefix={<UserOutlined />} placeholder="username" />
                    </Form.Item>
                    <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
                      <Input.Password prefix={<LockOutlined />} placeholder="password" />
                    </Form.Item>
                    <Button block type="primary" htmlType="submit">
                      登录
                    </Button>
                  </Form>
                </>
              ),
            },
            {
              key: 'register',
              label: '员工注册',
              children: (
                <>
                  <Typography.Title level={4}>普通员工注册</Typography.Title>
                  <Typography.Paragraph type="secondary">注册后默认普通员工，管理员可在用户管理中分配角色。</Typography.Paragraph>
                  <Form form={registerForm} layout="vertical" onFinish={register}>
                    <Form.Item name="username" label="账号" rules={[{ required: true, message: '请输入账号' }]}>
                      <Input prefix={<UserOutlined />} placeholder="建议使用工号或姓名拼音" />
                    </Form.Item>
                    <Form.Item name="password" label="密码" rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}>
                      <Input.Password prefix={<LockOutlined />} placeholder="至少 6 位" />
                    </Form.Item>
                    <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
                      <Input placeholder="真实姓名" />
                    </Form.Item>
                    <Form.Item name="departmentId" label="部门" rules={[{ required: true, message: '请选择部门' }]}>
                      <Select
                        placeholder="选择所属部门"
                        options={departments.map((department) => ({ label: department.name, value: department.id }))}
                      />
                    </Form.Item>
                    <Form.Item name="phone" label="手机号">
                      <Input placeholder="选填" />
                    </Form.Item>
                    <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '请输入正确邮箱' }]}>
                      <Input placeholder="选填" />
                    </Form.Item>
                    <Button block type="primary" htmlType="submit">
                      注册并登录
                    </Button>
                  </Form>
                </>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
