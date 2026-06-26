import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bell, Inbox } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { fetchNotifications, fetchRequests, markNotificationAsRead, subscribeToDataChanges } from '../utils/data';
import { NotificationModal } from '../components/NotificationModal';
import type { Notification } from '../types';
import { notificationText } from '../utils/notificationText';
import { PageInfoButton } from '../components/PageInfoButton';
import { AeroIcon } from '../components/AeroIcon';

export function NotificationsPage() {
  const { user } = useAuth();
  const { t, formatDate } = useLanguage();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);

  useEffect(() => {
    if (!user) return;

    const loadNotifications = async () => {
      const items = await fetchNotifications(user.profileId || user.id);
      setNotifications(items);
    };

    loadNotifications();
    return subscribeToDataChanges(loadNotifications);
  }, [user]);

  if (!user) return null;

  const openNotification = async (notification: Notification) => {
    if (notification.relatedRequestId) {
      const requests = await fetchRequests();
      const request = requests.find((item) => item.id === notification.relatedRequestId);
      const route =
        request && request.type === 'hr-message' && user.role !== 'hr'
          ? `/employee/contact-hr?requestId=${request.id}`
          : request && user.role === 'hr' && request.routedToRole === 'hr'
          ? `/hr/requests?requestId=${request.id}`
          : request && user.role === 'manager' && request.routedToRole === 'manager'
          ? `/manager/leave-management?requestId=${request.id}`
          : undefined;

      if (route) {
        await markNotificationAsRead(notification.id, user.profileId || user.id);
        navigate(route);
        return;
      }
    }

    setSelectedNotification(notification);
  };

  return (
    <div className="relative mx-auto max-w-5xl space-y-6 pt-14">
      <PageInfoButton title={t('notifications')} description={t('notificationsInfo')} />

      <div className="aero-glass overflow-hidden rounded-2xl border-2 border-white/50">
        {notifications.length === 0 ? (
          <div className="p-10 text-center">
            <AeroIcon icon={Inbox} variant="cyan" className="mx-auto mb-4" />
            <p className="font-bold text-cyan-800 dark:text-cyan-200">{t('noNotificationsYet')}</p>
          </div>
        ) : (
          <div className="max-h-[calc(100vh-14rem)] overflow-y-auto overscroll-contain">
            <div>
              {notifications.map((notification) => {
                const display = notificationText(notification, t);
                return (
                  <button
                    key={notification.id}
                    onClick={() => openNotification(notification)}
                    className={`flex w-full items-start gap-4 border-b p-5 text-left transition hover:bg-cyan-50/50 dark:hover:bg-cyan-900/20 ${
                      notification.unread
                        ? 'border-cyan-300/50 bg-gradient-to-r from-cyan-100 via-blue-50 to-white shadow-[inset_6px_0_0_rgba(14,165,233,0.95)] dark:border-cyan-500/30 dark:from-cyan-900/80 dark:via-blue-950/65 dark:to-cyan-950'
                        : 'border-cyan-100/80 bg-white/35 opacity-70 hover:opacity-100 dark:border-cyan-700/20 dark:bg-cyan-950/20'
                    }`}
                  >
                    <span className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/70 bg-gradient-to-b from-cyan-200 to-blue-500 text-white shadow-lg shadow-cyan-500/25">
                      <Bell className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-black text-cyan-900 dark:text-cyan-100">
                        {display.title}
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-cyan-700 dark:text-cyan-300">
                        {display.body}
                      </span>
                      <span className="mt-2 block text-xs font-bold text-cyan-600 dark:text-cyan-400">
                        {formatDate(new Date(notification.date), { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    </span>
                    {notification.unread && (
                      <span className="mt-2 h-3 w-3 rounded-full bg-gradient-to-b from-red-300 to-red-600 shadow-lg shadow-red-500/40" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {selectedNotification && (
        <NotificationModal
          notification={selectedNotification}
          user={user}
          onClose={() => setSelectedNotification(null)}
          onChanged={() => fetchNotifications(user.profileId || user.id).then(setNotifications)}
        />
      )}
    </div>
  );
}
