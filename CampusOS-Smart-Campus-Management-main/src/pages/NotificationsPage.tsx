import { useCallback, useEffect, useState } from 'react';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout.tsx';
import { useToast } from '../contexts/ToastContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { AppNotification } from '../shared/types.ts';

export function NotificationsPage() {
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{
        notifications: AppNotification[];
        unreadCount: number;
      }>('/api/notifications');
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch (err: unknown) {
      showToast({
        title: 'Unable to load notifications',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const markRead = async (id: number) => {
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  const markAllRead = async () => {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'PATCH' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      showToast({ title: 'All notifications marked as read', variant: 'success' });
    } catch {
      // ignore
    }
  };

  const visible =
    filter === 'UNREAD' ? notifications.filter((n) => !n.isRead) : notifications;

  return (
    <DashboardLayout
      title="Notifications"
      subtitle="Booking status alerts, maintenance dispatches, and system updates."
      actions={
        unreadCount > 0 ? (
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-2 rounded-lg border border-[#E5DFD3] bg-white px-3.5 py-2 text-xs font-semibold hover:bg-[#F3EFE7] dark:border-[#1E2E4A] dark:bg-[#101B2E]"
          >
            <CheckCheck className="h-4 w-4" />
            <span>Mark all as read ({unreadCount})</span>
          </button>
        ) : undefined
      }
    >
      <div className="mb-5 flex items-center gap-1 rounded-lg border border-[#E5DFD3] bg-white p-1 w-fit dark:border-[#1E2E4A] dark:bg-[#101B2E]">
        <button
          type="button"
          onClick={() => setFilter('ALL')}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
            filter === 'ALL'
              ? 'bg-[#0F2342] text-[#FAF8F5] dark:bg-[#EAB308] dark:text-[#09111E]'
              : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          All ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('UNREAD')}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
            filter === 'UNREAD'
              ? 'bg-[#0F2342] text-[#FAF8F5] dark:bg-[#EAB308] dark:text-[#09111E]'
              : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          Unread ({unreadCount})
        </button>
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border border-[#E5DFD3] bg-white dark:border-[#1E2E4A] dark:bg-[#101B2E]"
            />
          ))
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-[#E5DFD3] bg-white p-12 text-center dark:border-[#1E2E4A] dark:bg-[#101B2E]">
            <Bell className="mx-auto h-6 w-6 text-slate-400" />
            <p className="mt-2 font-semibold">No notifications to display</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Updates will appear here when bookings or maintenance tickets change status.
            </p>
          </div>
        ) : (
          visible.map((item) => (
            <div
              key={item.id}
              className={`flex items-start justify-between gap-4 rounded-xl border p-4 transition-colors ${
                item.isRead
                  ? 'border-[#E5DFD3] bg-white/70 dark:border-[#1E2E4A] dark:bg-[#101B2E]/60'
                  : 'border-[#0F2342]/30 bg-white dark:border-[#EAB308]/40 dark:bg-[#101B2E]'
              }`}
            >
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-[#2B4C7E] dark:text-[#EAB308]">
                    {item.type}
                  </span>
                  <span>·</span>
                  <span className="font-mono-tabular">
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                  {!item.isRead && (
                    <>
                      <span>·</span>
                      <span className="font-semibold text-[#0F2342] dark:text-[#EAB308]">
                        Unread
                      </span>
                    </>
                  )}
                </div>
                <p className="mt-1 text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {item.message}
                </p>
              </div>

              {!item.isRead && (
                <button
                  type="button"
                  onClick={() => markRead(item.id)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#E5DFD3] px-3 py-1.5 text-xs font-semibold hover:bg-[#FAF8F5] dark:border-[#1E2E4A] dark:hover:bg-[#16233B]"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Mark read</span>
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </DashboardLayout>
  );
}
