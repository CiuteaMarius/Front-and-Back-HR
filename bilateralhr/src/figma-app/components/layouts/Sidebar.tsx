import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  UserPlus,
  Users,
  Network,
  Building2,
  Megaphone,
  FileText,
  Home,
  ClipboardList,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MessageCircle,
  FileSpreadsheet,
} from 'lucide-react';

const navItems = [
  { path: '/hr/dashboard', labelKey: 'dashboard', icon: Home, roles: ['hr'] },
  { path: '/hr/add-employee', labelKey: 'addEmployee', icon: UserPlus, roles: ['hr'] },
  { path: '/hr/employees', labelKey: 'viewEmployees', icon: Users, roles: ['hr'] },
  { path: '/hr/org-chart', labelKey: 'orgChart', icon: Network, roles: ['hr'] },
  { path: '/hr/departments', labelKey: 'departments', icon: Building2, roles: ['hr'] },
  { path: '/hr/announcements', labelKey: 'announcements', icon: Megaphone, roles: ['hr'] },
  { path: '/hr/requests', labelKey: 'answerRequests', icon: FileText, roles: ['hr'] },
  { path: '/hr/calendar', labelKey: 'calendar', icon: Calendar, roles: ['hr'] },
  { path: '/hr/reports', labelKey: 'reports', icon: FileText, roles: ['hr'] },
  { path: '/employee/dashboard', labelKey: 'home', icon: Home, roles: ['employee', 'manager'] },
  { path: '/manager/leave-management', labelKey: 'leaveManagement', icon: FileText, roles: ['manager'] },
  { path: '/manager/attendance', labelKey: 'teamAttendance', icon: Clock3, roles: ['manager'] },
  { path: '/manager/reports', labelKey: 'teamReports', icon: FileSpreadsheet, roles: ['manager'] },
  { path: '/employee/make-request', labelKey: 'makeRequest', icon: ClipboardList, roles: ['employee', 'manager'] },
  { path: '/employee/contact-hr', labelKey: 'contactHr', icon: MessageCircle, roles: ['employee', 'manager'] },
  { path: '/employee/calendar', labelKey: 'myCalendar', icon: Calendar, roles: ['employee', 'manager'] },
  { path: '/employee/attendance', labelKey: 'myAttendance', icon: Clock3, roles: ['employee', 'manager'] },
];

export function Sidebar() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!user) return null;

  const filteredItems = navItems.filter(item => item.roles.includes(user.role));

  return (
    <aside
      className={`fixed left-0 top-16 h-[calc(100vh-4rem)] aero-glass border-r-2 border-white/50 dark:border-cyan-400/30 transition-all duration-300 z-40 overflow-visible ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      <div className="h-full flex flex-col">
        {/* Navigation Items */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all group relative ${
                  isActive
                    ? 'aero-button text-white shadow-lg shadow-cyan-500/50'
                    : 'aero-glass hover:scale-105 text-cyan-700 dark:text-cyan-200'
                }`}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-cyan-600 dark:text-cyan-300'}`} />
                {!isCollapsed && (
                  <span className="text-sm font-medium truncate">{t(item.labelKey)}</span>
                )}
                {isCollapsed && (
                  <div className="absolute left-full ml-2 px-3 py-2 aero-glass text-cyan-800 dark:text-cyan-100 text-sm font-bold rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity shadow-xl z-50">
                    {t(item.labelKey)}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Collapse Toggle */}
        <div className="p-4 border-t border-cyan-300/30 dark:border-cyan-500/20">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl aero-glass transition-all hover:scale-105"
          >
            {isCollapsed ? (
              <ChevronRight className="w-5 h-5 text-cyan-600 dark:text-cyan-300" />
            ) : (
              <>
                <ChevronLeft className="w-5 h-5 text-cyan-600 dark:text-cyan-300" />
                <span className="text-sm text-cyan-700 dark:text-cyan-300 font-semibold">{t('collapse')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
