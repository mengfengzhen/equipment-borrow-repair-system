import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { AuditLogsPage } from '../pages/AuditLogsPage';
import { BorrowRequestsPage } from '../pages/BorrowRequestsPage';
import { DashboardPage } from '../pages/DashboardPage';
import { DevicesPage } from '../pages/DevicesPage';
import { LoginPage } from '../pages/LoginPage';
import { ReportsPage } from '../pages/ReportsPage';
import { RepairsPage } from '../pages/RepairsPage';
import { UsersPage } from '../pages/UsersPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth />}>
        <Route index element={<DashboardPage />} />
        <Route path="devices" element={<DevicesPage />} />
        <Route path="borrows" element={<BorrowRequestsPage />} />
        <Route path="repairs" element={<RepairsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="logs" element={<AuditLogsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function RequireAuth() {
  const location = useLocation();
  const token = localStorage.getItem('token');

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <AppLayout />;
}
