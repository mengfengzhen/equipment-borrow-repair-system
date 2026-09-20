import {
  AuditOutlined,
  BarChartOutlined,
  DashboardOutlined,
  DesktopOutlined,
  LaptopOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  TeamOutlined,
  ToolOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Layout, Menu, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { http } from '../api/http';
import { User } from '../types/models';
import { roleNames } from '../types/enums';
import { allowedMenus } from '../utils/permissions';

const { Header, Sider, Content } = Layout;

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User>(() => JSON.parse(localStorage.getItem('user') || '{}') as User);
  const [collapsed, setCollapsed] = useState(false);
  const visibleKeys = allowedMenus(user);
  const departmentName = typeof user.department === 'object' ? user.department?.name : user.department;
  const borrowLabel = user.role === 'USER' ? '我的申请' : user.role === 'MANAGER' ? '部门审批' : '借用审批';
  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: '工作台' },
    { key: '/devices', icon: <LaptopOutlined />, label: '设备管理' },
    { key: '/borrows', icon: <UnorderedListOutlined />, label: borrowLabel },
    { key: '/repairs', icon: <ToolOutlined />, label: '维修管理' },
    { key: '/reports', icon: <BarChartOutlined />, label: '统计报表' },
    { key: '/users', icon: <TeamOutlined />, label: '用户管理' },
    { key: '/logs', icon: <AuditOutlined />, label: '操作日志' },
  ];
  const visibleItems = menuItems.filter((item) => visibleKeys.includes(item.key as never));

  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    http.get('/auth/me')
      .then((freshUser) => {
        localStorage.setItem('user', JSON.stringify(freshUser));
        setUser(freshUser as unknown as User);
      })
      .catch(() => undefined);
  }, []);

  const logout = () => {
    localStorage.clear();
    navigate('/login', { replace: true });
  };

  if (!visibleKeys.includes(location.pathname as never)) {
    return <Navigate to="/" replace />;
  }

  return (
    <Layout className="app-shell">
      <Sider width={232} collapsedWidth={72} collapsible trigger={null} collapsed={collapsed} className="app-sider">
        <Button
          type="text"
          className="sider-toggle"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={() => setCollapsed((value) => !value)}
        />
        <div className={`brand-block ${collapsed ? 'brand-collapsed' : ''}`}>
          <div className="brand-mark"><DesktopOutlined /></div>
          {!collapsed && (
            <div>
              <div className="brand-title">设备管理系统</div>
              <div className="brand-subtitle">Borrow & Repair</div>
            </div>
          )}
        </div>
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={visibleItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="header-left">
            <div className="header-title-block">
              <Typography.Text strong className="header-title">设备借用与维修管理系统</Typography.Text>
              <div className="header-subtitle">角色权限、状态流转、维修闭环演示</div>
            </div>
          </div>
          <div className="header-user-area">
            <div className="header-user-card">
              <Avatar className="header-user-avatar">{user.name?.slice(-1) || '用'}</Avatar>
              <div>
                <div className="header-user-name">{user.name}</div>
                <div className="header-user-meta">{roleNames[user.role] || user.role}{departmentName ? ` · ${departmentName}` : ''}</div>
              </div>
            </div>
            <Button icon={<LogoutOutlined />} onClick={logout}>
              退出
            </Button>
          </div>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
