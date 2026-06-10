import { createBrowserRouter, Navigate } from 'react-router';
import { RootLayout } from './components/layouts/RootLayout';
import { LoginPage } from './pages/LoginPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { HRDashboard } from './pages/hr/HRDashboard';
import { AddEmployee } from './pages/hr/AddEmployee';
import { ViewEmployees } from './pages/hr/ViewEmployees';
import { OrgChart } from './pages/hr/OrgChart';
import { ManageDepartments } from './pages/hr/ManageDepartments';
import { Announcements } from './pages/hr/Announcements';
import { HRRequests } from './pages/hr/HRRequests';
import { Reports } from './pages/hr/Reports';
import { EmployeeDashboard } from './pages/employee/EmployeeDashboard';
import { MakeRequest } from './pages/employee/MakeRequest';
import { ContactHR } from './pages/employee/ContactHR';
import { EmployeeCalendar } from './pages/employee/EmployeeCalendar';
import { EmployeeAttendance } from './pages/employee/EmployeeAttendance';
import { AnswerRequests } from './pages/manager/AnswerRequests';
import { CalendarView } from './pages/manager/CalendarView';
import { ManagerAttendance } from './pages/manager/ManagerAttendance';
import { ManagerReports } from './pages/manager/ManagerReports';
import { SettingsPage } from './pages/SettingsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { NotFound } from './pages/NotFound';

export const router = createBrowserRouter([
  {
    path: '/login',
    Component: LoginPage,
  },
  {
    path: '/',
    Component: RootLayout,
    children: [
      {
        index: true,
        element: (
          <ProtectedRoute>
            <HRDashboard />
          </ProtectedRoute>
        ),
      },
      {
        path: 'hr/dashboard',
        element: (
          <ProtectedRoute allowedRoles={['hr']}>
            <HRDashboard />
          </ProtectedRoute>
        ),
      },
      {
        path: 'hr/add-employee',
        element: (
          <ProtectedRoute allowedRoles={['hr']}>
            <AddEmployee />
          </ProtectedRoute>
        ),
      },
      {
        path: 'hr/employees',
        element: (
          <ProtectedRoute allowedRoles={['hr']}>
            <ViewEmployees />
          </ProtectedRoute>
        ),
      },
      {
        path: 'hr/org-chart',
        element: (
          <ProtectedRoute allowedRoles={['hr']}>
            <OrgChart />
          </ProtectedRoute>
        ),
      },
      {
        path: 'hr/departments',
        element: (
          <ProtectedRoute allowedRoles={['hr']}>
            <ManageDepartments />
          </ProtectedRoute>
        ),
      },
      {
        path: 'hr/announcements',
        element: (
          <ProtectedRoute allowedRoles={['hr']}>
            <Announcements />
          </ProtectedRoute>
        ),
      },
      {
        path: 'hr/requests',
        element: (
          <ProtectedRoute allowedRoles={['hr']}>
            <HRRequests />
          </ProtectedRoute>
        ),
      },
      {
        path: 'hr/calendar',
        element: (
          <ProtectedRoute allowedRoles={['hr']}>
            <CalendarView />
          </ProtectedRoute>
        ),
      },
      {
        path: 'hr/reports',
        element: (
          <ProtectedRoute allowedRoles={['hr']}>
            <Reports />
          </ProtectedRoute>
        ),
      },
      {
        path: 'employee/dashboard',
        element: (
          <ProtectedRoute allowedRoles={['employee', 'manager']}>
            <EmployeeDashboard />
          </ProtectedRoute>
        ),
      },
      {
        path: 'employee/make-request',
        element: (
          <ProtectedRoute allowedRoles={['employee', 'manager']}>
            <MakeRequest />
          </ProtectedRoute>
        ),
      },
      {
        path: 'employee/contact-hr',
        element: (
          <ProtectedRoute allowedRoles={['employee', 'manager']}>
            <ContactHR />
          </ProtectedRoute>
        ),
      },
      {
        path: 'employee/calendar',
        element: (
          <ProtectedRoute allowedRoles={['employee', 'manager']}>
            <EmployeeCalendar />
          </ProtectedRoute>
        ),
      },
      {
        path: 'employee/attendance',
        element: (
          <ProtectedRoute allowedRoles={['employee', 'manager']}>
            <EmployeeAttendance />
          </ProtectedRoute>
        ),
      },
      {
        path: 'manager/leave-management',
        element: (
          <ProtectedRoute allowedRoles={['manager']}>
            <AnswerRequests />
          </ProtectedRoute>
        ),
      },
      {
        path: 'manager/calendar',
        element: (
          <ProtectedRoute allowedRoles={['manager']}>
            <Navigate to="/employee/calendar" replace />
          </ProtectedRoute>
        ),
      },
      {
        path: 'manager/attendance',
        element: (
          <ProtectedRoute allowedRoles={['manager']}>
            <ManagerAttendance />
          </ProtectedRoute>
        ),
      },
      {
        path: 'manager/reports',
        element: (
          <ProtectedRoute allowedRoles={['manager']}>
            <ManagerReports />
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings',
        element: (
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'notifications',
        element: (
          <ProtectedRoute>
            <NotificationsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: '*',
        Component: NotFound,
      },
    ],
  },
]);
