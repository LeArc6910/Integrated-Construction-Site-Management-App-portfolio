import { createBrowserRouter, Navigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/routing/ProtectedRoute'
import RoleRoute from './components/routing/RoleRoute'
import LoginPage from './pages/auth/LoginPage'
import SignupPage from './pages/auth/SignupPage'
import PersonalPage from './pages/personal/PersonalPage'
import DashboardTab from './pages/personal/DashboardTab'
import AttendanceTab from './pages/personal/AttendanceTab'
import ExpenseTab from './pages/personal/ExpenseTab'
import SiteListPage from './pages/sites/SiteListPage'
import SiteDetailPage from './pages/sites/SiteDetailPage'
import PaymentPage from './pages/payment/PaymentPage'
import PaymentSitesTab from './pages/payment/PaymentSitesTab'
import PaymentLaborTab from './pages/payment/PaymentLaborTab'
import PaymentSiteDetailPage from './pages/payment/PaymentSiteDetailPage'
import PaymentLaborDetailPage from './pages/payment/PaymentLaborDetailPage'
import HrListPage from './pages/hr/HrListPage'
import HrDetailPage from './pages/hr/HrDetailPage'
import UpcomingPage from './pages/upcoming/UpcomingPage'
import SettingsPage from './pages/settings/SettingsPage'
import DevPage from './pages/dev/DevPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/personal" replace /> },

          // 개인 (전체)
          {
            path: 'personal',
            element: <PersonalPage />,
            children: [
              { index: true, element: <Navigate to="dashboard" replace /> },
              { path: 'dashboard', element: <DashboardTab /> },
              { path: 'attendance', element: <AttendanceTab /> },
              { path: 'expense', element: <ExpenseTab /> },
            ],
          },

          // 현장관리 (전체)
          { path: 'sites', element: <SiteListPage /> },
          { path: 'sites/:siteId', element: <SiteDetailPage /> },

          // 결제 (팀장, 개발자)
          {
            element: <RoleRoute menuKey="payment" />,
            children: [
              {
                path: 'payment',
                element: <PaymentPage />,
                children: [
                  { index: true, element: <Navigate to="sites" replace /> },
                  { path: 'sites', element: <PaymentSitesTab /> },
                  { path: 'labor', element: <PaymentLaborTab /> },
                ],
              },
              { path: 'payment/sites/:siteId', element: <PaymentSiteDetailPage /> },
              { path: 'payment/labor/:userId', element: <PaymentLaborDetailPage /> },
            ],
          },

          // 인사관리 (팀장, 개발자)
          {
            element: <RoleRoute menuKey="hr" />,
            children: [
              { path: 'hr', element: <HrListPage /> },
              { path: 'hr/:userId', element: <HrDetailPage /> },
            ],
          },

          // 예정현장 (팀장, 개발자)
          {
            element: <RoleRoute menuKey="upcoming" />,
            children: [{ path: 'upcoming', element: <UpcomingPage /> }],
          },

          // 설정 (전체)
          { path: 'settings', element: <SettingsPage /> },

          // 개발자 페이지 (개발자)
          {
            element: <RoleRoute menuKey="dev" />,
            children: [{ path: 'dev', element: <DevPage /> }],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
