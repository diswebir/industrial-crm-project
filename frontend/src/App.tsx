import { lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { ProtectedRoute } from './layouts/MainLayout'
import { PermissionRoute } from './components/common/PermissionRoute'
import { useAuthStore } from './store/useAuthStore'

// Route-level code splitting
const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Customers = lazy(() => import('./pages/Customers'))
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'))
const Parts = lazy(() => import('./pages/Parts'))
const Inventory = lazy(() => import('./pages/Inventory'))
const SmsCenter = lazy(() => import('./pages/SmsCenter'))
const SmsSettingsPage = lazy(() => import('./pages/settings/SmsSettingsPage'))
const UsersAclPage = lazy(() => import('./pages/settings/UsersAclPage'))
const CreateUserPage = lazy(() => import('./pages/settings/CreateUserPage'))
const EditUserPage = lazy(() => import('./pages/settings/EditUserPage'))
const MyProfilePage = lazy(() => import('./pages/settings/MyProfilePage'))
const SystemSettingsPage = lazy(() => import('./pages/settings/SystemSettingsPage'))
import AccessDenied from './pages/AccessDenied'
const NotFound = lazy(() => import('./pages/NotFound'))

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
})

export default function App() {
  const initAuth = useAuthStore((s) => s.initAuth)

  useEffect(() => {
    initAuth()
  }, [initAuth])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route index element={<Dashboard />} />

            <Route
              path="customers"
              element={
                <PermissionRoute permission="customers.view">
                  <Customers />
                </PermissionRoute>
              }
            />
            <Route
              path="customers/:id"
              element={
                <PermissionRoute permission="customers.view">
                  <CustomerDetail />
                </PermissionRoute>
              }
            />
            <Route
              path="parts"
              element={
                <PermissionRoute permission="parts.view">
                  <Parts />
                </PermissionRoute>
              }
            />
            <Route path="inventory" element={<PermissionRoute permission="parts.view"><Inventory /></PermissionRoute>} />
            <Route
              path="sms"
              element={
                <PermissionRoute permission="sms.send">
                  <SmsCenter />
                </PermissionRoute>
              }
            />

            {/* Separated Settings Pages - Redirect root settings to sms */}
            <Route path="settings" element={<Navigate to="/settings/sms" replace />} />
            <Route
              path="settings/sms"
              element={
                <PermissionRoute permission="settings.manage">
                  <SmsSettingsPage />
                </PermissionRoute>
              }
            />
            <Route
              path="settings/users"
              element={
                <PermissionRoute permission="users.manage">
                  <UsersAclPage />
                </PermissionRoute>
              }
            />
            <Route
              path="settings/users/create"
              element={
                <PermissionRoute permission="users.manage">
                  <CreateUserPage />
                </PermissionRoute>
              }
            />
            <Route
              path="settings/users/:id/edit"
              element={
                <PermissionRoute permission="users.manage">
                  <EditUserPage />
                </PermissionRoute>
              }
            />
            <Route path="settings/profile" element={<MyProfilePage />} />
            <Route
              path="settings/system"
              element={
                <PermissionRoute permission="settings.manage">
                  <SystemSettingsPage />
                </PermissionRoute>
              }
            />
            <Route path="profile" element={<Navigate to="/settings/profile" replace />} />

            <Route path="403" element={<AccessDenied />} />
            <Route path="access-denied" element={<AccessDenied />} />
            <Route path="404" element={<NotFound />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster
        position="bottom-left"
        toastOptions={{
          duration: 3500,
          style: {
            fontFamily: 'var(--font-sans)',
            background: 'var(--color-base-100)',
            color: 'var(--color-base-content)',
            border: '1px solid var(--color-base-300)',
            borderRadius: '14px',
            direction: 'rtl',
          },
        }}
      />
    </QueryClientProvider>
  )
}
