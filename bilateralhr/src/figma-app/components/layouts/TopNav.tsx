import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Sun, Moon, Bell, Settings, LogOut, ChevronDown, User } from 'lucide-react';
import { fetchNotifications, fetchRequests, markNotificationAsRead, markNotificationsAsRead, subscribeToDataChanges } from '../../utils/data';
import type { Notification, Request } from '../../types';
import { SettingsPage } from '../../pages/SettingsPage';
import { NotificationModal } from '../NotificationModal';
import { notificationText } from '../../utils/notificationText';
import { ProfileAvatar } from '../ProfileAvatar';

export function TopNav() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const notificationsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user) return;

    const loadNotifications = async () => {
      const items = await fetchNotifications(user.profileId || user.id);
      setNotifications(items);
    };

    loadNotifications();
    return subscribeToDataChanges(loadNotifications);
  }, [user]);

  useEffect(() => {
    if (!showNotifications) return;

    const handleDocumentClick = (event: MouseEvent) => {
      if (!notificationsRef.current?.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    return () => document.removeEventListener('mousedown', handleDocumentClick);
  }, [showNotifications]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const requestRouteForNotification = (request: Request) => {
    if (request.type === 'hr-message' && user?.role !== 'hr') {
      return `/employee/contact-hr?requestId=${request.id}`;
    }

    if (user?.role === 'hr' && request.routedToRole === 'hr') {
      return `/hr/requests?requestId=${request.id}`;
    }

    if (user?.role === 'manager' && request.routedToRole === 'manager') {
      return `/manager/leave-management?requestId=${request.id}`;
    }

    return undefined;
  };

  const openNotification = async (notification: Notification) => {
    if (notification.relatedRequestId) {
      const requests = await fetchRequests();
      const request = requests.find((item) => item.id === notification.relatedRequestId);
      const route = request ? requestRouteForNotification(request) : undefined;

      if (route) {
        await markNotificationAsRead(notification.id, user.profileId || user.id);
        setShowNotifications(false);
        fetchNotifications(user.profileId || user.id).then(setNotifications);
        navigate(route);
        return;
      }
    }

    setSelectedNotification(notification);
    setShowNotifications(false);
  };

  const handleMarkAllAsRead = async () => {
    await markNotificationsAsRead(user.profileId || user.id);
    const items = await fetchNotifications(user.profileId || user.id);
    setNotifications(items);
  };

  const unreadCount = notifications.filter(n => n.unread).length;

  if (!user) return null;

  return (
    <>
    <nav className="fixed top-0 left-0 right-0 h-16 z-[90] aero-glass border-b-2 border-white/50 dark:border-cyan-400/30 overflow-visible">
      <div className="h-full px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
            <span className="text-white font-bold text-lg">HR</span>
          </div>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
              {t('appName')}
            </h1>
            <p className="text-xs text-cyan-600 dark:text-cyan-300 capitalize font-medium">{t(user.role)} {t('portal')}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="w-10 h-10 rounded-xl aero-glass flex items-center justify-center transition-all hover:scale-110 animate-[glow-pulse_3s_ease-in-out_infinite]"
            title={theme === 'light' ? t('darkMode') : t('lightMode')}
          >
            {theme === 'light' ? (
              <Moon className="w-5 h-5 text-cyan-600 dark:text-cyan-300" />
            ) : (
              <Sun className="w-5 h-5 text-yellow-400" />
            )}
          </button>

          {/* Notifications */}
          <div className="relative" ref={notificationsRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="w-10 h-10 rounded-xl aero-glass flex items-center justify-center transition-all hover:scale-110 relative"
            >
              <Bell className="w-5 h-5 text-cyan-600 dark:text-cyan-300" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-br from-red-400 to-red-600 text-white text-xs rounded-full flex items-center justify-center shadow-lg shadow-red-500/50 border-2 border-white/50">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <>
                <div
                  className="fixed inset-0 z-[60]"
                  onClick={() => setShowNotifications(false)}
                ></div>
                <div className="fixed right-6 top-20 w-96 rounded-2xl z-[70] overflow-hidden border-2 border-white/70 bg-white/95 shadow-2xl shadow-cyan-900/20 backdrop-blur-2xl dark:border-cyan-400/30 dark:bg-cyan-950/95">
                  <div className="flex items-center justify-between gap-3 p-4 border-b-2 border-cyan-300/30 dark:border-cyan-500/20 bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-900/85 dark:to-blue-900/75">
                    <h3 className="font-bold text-cyan-700 dark:text-cyan-200">{t('notifications')}</h3>
                    <button
                      onClick={handleMarkAllAsRead}
                      className="rounded-full border border-cyan-200 bg-white/80 px-3 py-1 text-xs font-black text-cyan-700 shadow-sm transition hover:scale-105 hover:bg-cyan-50 dark:border-cyan-500/30 dark:bg-cyan-950/80 dark:text-cyan-200"
                    >
                      {t('markAllAsRead')}
                    </button>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="p-5 text-sm font-bold text-cyan-700 dark:text-cyan-300">{t('noNotificationsYet')}</p>
                    ) : notifications.map((notif) => {
                      const display = notificationText(notif, t);
                      return (
                        <button
                          key={notif.id}
                          onClick={() => openNotification(notif)}
                          className={`relative p-4 border-b text-left transition-colors ${
                            notif.unread
                              ? 'border-cyan-300/50 bg-gradient-to-r from-cyan-100 via-blue-50 to-white shadow-[inset_5px_0_0_rgba(14,165,233,0.95)] dark:border-cyan-500/30 dark:from-cyan-900/80 dark:via-blue-950/65 dark:to-cyan-950'
                              : 'border-cyan-100 bg-white/70 opacity-70 hover:opacity-100 dark:border-cyan-800/40 dark:bg-cyan-950/55'
                          } w-full text-left`}
                        >
                          <p className={`text-sm text-cyan-800 dark:text-cyan-200 ${notif.unread ? 'font-black' : 'font-semibold'}`}>{display.title}</p>
                          <p className="mt-1 text-sm text-cyan-700 dark:text-cyan-300 font-medium">{display.body}</p>
                          <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-1">{notif.time}</p>
                          {notif.unread && (
                            <span className="absolute right-3 top-4 h-3 w-3 rounded-full bg-gradient-to-b from-red-300 to-red-600 shadow-lg shadow-red-500/40" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => {
                      setShowNotifications(false);
                      navigate('/notifications');
                    }}
                    className="w-full border-t-2 border-cyan-300/30 bg-white/35 px-4 py-3 text-center text-sm font-black text-cyan-700 transition hover:bg-cyan-50/70 dark:border-cyan-500/20 dark:bg-cyan-950/25 dark:text-cyan-200 dark:hover:bg-cyan-900/30"
                  >
                    {t('seeAllNotifications')}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Settings */}
          <button
            onClick={() => {
              setShowProfileMenu(false);
              setShowNotifications(false);
              setShowSettings(true);
            }}
            className="w-10 h-10 rounded-xl aero-glass flex items-center justify-center transition-all hover:scale-110"
          >
            <Settings className="w-5 h-5 text-cyan-600 dark:text-cyan-300" />
          </button>

          {/* User Profile */}
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-3 px-3 py-2 rounded-xl aero-glass transition-all hover:scale-105"
            >
              <ProfileAvatar name={user.name} className="h-8 w-8 rounded-lg text-xs ring-white dark:ring-slate-600" />
              <div className="text-left hidden md:block">
                <p className="text-sm font-bold text-cyan-700 dark:text-cyan-200">{user.name}</p>
                <p className="text-xs text-cyan-600 dark:text-cyan-400 capitalize">{user.role}</p>
              </div>
              <ChevronDown className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            </button>

            {showProfileMenu && (
              <>
                <div
                  className="fixed inset-0 z-[60]"
                  onClick={() => setShowProfileMenu(false)}
                ></div>
                <div className="fixed right-6 top-20 w-64 aero-glass rounded-2xl z-[70] overflow-hidden shadow-2xl">
                  <div className="p-4 border-b-2 border-cyan-300/30 dark:border-cyan-500/20 bg-gradient-to-r from-cyan-50/50 to-blue-50/50 dark:from-cyan-900/20 dark:to-blue-900/20">
                    <div className="flex items-center gap-3">
                      <ProfileAvatar name={user.name} className="h-12 w-12 rounded-xl text-sm ring-cyan-400/50" />
                      <div>
                        <p className="font-bold text-cyan-700 dark:text-cyan-200">{user.name}</p>
                        <p className="text-sm text-cyan-600 dark:text-cyan-400">{user.email}</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-2">
                    <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-cyan-100/50 dark:hover:bg-cyan-800/30 transition-colors text-left">
                      <User className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                      <span className="text-sm text-cyan-700 dark:text-cyan-300 font-semibold">{t('profile')}</span>
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-100/50 dark:hover:bg-red-900/30 transition-colors text-left"
                    >
                      <LogOut className="w-5 h-5 text-red-600 dark:text-red-400" />
                      <span className="text-sm text-red-700 dark:text-red-400 font-semibold">{t('logout')}</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

    </nav>
    {showSettings && (
      <div
        className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-cyan-950/25 px-4 py-8 backdrop-blur-sm"
        onClick={() => setShowSettings(false)}
      >
        <div
          className="aero-glass max-h-[calc(100vh-4rem)] w-full max-w-5xl overflow-y-auto rounded-2xl p-6 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <SettingsPage />
        </div>
      </div>
    )}
    {selectedNotification && (
      <NotificationModal
        notification={selectedNotification}
        user={user}
        onClose={() => setSelectedNotification(null)}
        onChanged={() => fetchNotifications(user.profileId || user.id).then(setNotifications)}
      />
    )}
    </>
  );
}
