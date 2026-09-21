import {
  AuditOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  LockOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Card, Form, Input, Space, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { http } from '../api/http';
import { roleNames } from '../types/enums';

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
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>(fallbackDemoAccounts);

  useEffect(() => {
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
        <Typography.Title level={4}>账号登录</Typography.Title>
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
      </Card>
    </div>
  );
}
