import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/AuthContext';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToInserts,
  type AppNotification,
} from '@/features/dispatch/dispatchService';
import { Bell, CheckCheck } from 'lucide-react';
import { APP_LOCALE } from '@/lib/format';

export function NotificationCenter({ onNavigate }: { onNavigate?: (pageId: string) => void }) {
  const { user, organization } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);

  const orgId = organization?.id ?? null;
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchNotifications(userId)
      .then((rows) => {
        if (!cancelled) setNotifications(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId, orgId]);

  useEffect(() => {
    if (!userId) return;
    const unsubscribe = subscribeToInserts('notifications', `user_id=eq.${userId}`, (row) => {
      const n = row as AppNotification;
      setNotifications((rows) => [n, ...rows.filter((r) => r.id !== n.id)]);
    });
    return unsubscribe;
  }, [userId]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read_at).length, [notifications]);

  const markRead = async (n: AppNotification) => {
    if (n.read_at) return;
    setNotifications((rows) =>
      rows.map((r) => (r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r)),
    );
    try {
      await markNotificationRead(n.id);
    } catch {
      setNotifications((rows) => rows.map((r) => (r.id === n.id ? { ...r, read_at: null } : r)));
    }
  };

  const openNotification = async (n: AppNotification) => {
    setOpen(false);
    void markRead(n);
    // Assignment notices lead to My Jobs; ticket notices to the ticket list.
    if (n.kind === 'assignment') onNavigate?.('myjobs');
    else if (n.ticket_id) onNavigate?.('tickets');
  };

  const markAll = async () => {
    if (!userId || unreadCount === 0) return;
    const now = new Date().toISOString();
    setNotifications((rows) => rows.map((r) => ({ ...r, read_at: r.read_at ?? now })));
    try {
      await markAllNotificationsRead(userId);
    } catch {
      // refetch happens on next mount; optimistic state is fine for now
    }
  };

  if (!userId) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-8 w-8 items-center justify-center rounded-full bg-ink-800 text-ink-300 ring-1 ring-ink-600 transition-colors hover:text-ink-100 hover:ring-green-500/50"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell size={14} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-green-500 px-1 text-[9px] font-bold text-ink-950">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-ink-700 bg-ink-900 shadow-pop animate-scale-in">
            <div className="flex items-center justify-between border-b border-ink-800 px-3.5 py-2.5">
              <p className="text-xs font-bold text-ink-100">Notifications</p>
              {unreadCount > 0 && (
                <button
                  onClick={() => void markAll()}
                  className="inline-flex items-center gap-1 text-2xs font-semibold text-green-400 hover:text-green-300"
                >
                  <CheckCheck size={11} /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto p-1.5">
              {notifications.length === 0 ? (
                <p className="px-3 py-6 text-center text-2xs text-ink-500">
                  Nothing yet — new job assignments land here.
                </p>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => void openNotification(n)}
                    className={`block w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-ink-800 ${
                      n.read_at ? 'opacity-60' : 'bg-green-500/5'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-xs font-semibold ${n.read_at ? 'text-ink-300' : 'text-ink-50'}`}>
                        {n.title}
                      </p>
                      {!n.read_at && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" />}
                    </div>
                    {n.body && <p className="mt-0.5 text-2xs text-ink-400">{n.body}</p>}
                    <p className="mt-1 text-2xs text-ink-600">
                      {new Date(n.created_at).toLocaleDateString(APP_LOCALE, { month: 'short', day: 'numeric' })}
                      {' · '}
                      {new Date(n.created_at).toLocaleTimeString(APP_LOCALE, { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
