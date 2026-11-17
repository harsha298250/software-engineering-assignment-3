import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext.tsx';
import { AuthProvider, useAuth } from './contexts/AuthContext.tsx';
import { ToastProvider } from './contexts/ToastContext.tsx';
import { UserRole } from './shared/types.ts';

import { LandingPage } from './pages/LandingPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { RegisterPage } from './pages/RegisterPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { FacilitiesPage } from './pages/FacilitiesPage.tsx';
import { FacilityDetailPage } from './pages/FacilityDetailPage.tsx';
import { BookRoomPage } from './pages/BookRoomPage.tsx';
import { MyBookingsPage } from './pages/MyBookingsPage.tsx';
import { MaintenanceRequestFormPage } from './pages/MaintenanceRequestFormPage.tsx';
import { MyMaintenanceRequestsPage } from './pages/MyMaintenanceRequestsPage.tsx';
import { AdminApprovalsPage } from './pages/AdminApprovalsPage.tsx';
import { AdminFacilitiesPage } from './pages/AdminFacilitiesPage.tsx';
import { AdminUsersPage } from './pages/AdminUsersPage.tsx';
import { StaffMaintenanceDashboardPage } from './pages/StaffMaintenanceDashboardPage.tsx';
import { ReportsPage } from './pages/ReportsPage.tsx';
import { NotificationsPage } from './pages/NotificationsPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';

function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5] dark:bg-[#09111E]">
        <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Verifying campus session...
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />

              {/* Authenticated Routes */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/facilities"
                element={
                  <ProtectedRoute>
                    <FacilitiesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/facilities/:id"
                element={
                  <ProtectedRoute>
                    <FacilityDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/bookings/new"
                element={
                  <ProtectedRoute>
                    <BookRoomPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/bookings/mine"
                element={
                  <ProtectedRoute>
                    <MyBookingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/maintenance/new"
                element={
                  <ProtectedRoute>
                    <MaintenanceRequestFormPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/maintenance/mine"
                element={
                  <ProtectedRoute>
                    <MyMaintenanceRequestsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/staff/maintenance"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN', 'MAINTENANCE_STAFF']}>
                    <StaffMaintenanceDashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/approvals"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminApprovalsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/facilities"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminFacilitiesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <ProtectedRoute allowedRoles={['ADMIN']}>
                    <AdminUsersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <ProtectedRoute>
                    <ReportsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/notifications"
                element={
                  <ProtectedRoute>
                    <NotificationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
