import { useState, useEffect } from 'react';
import { Bell, Check, X, Settings as SettingsIcon } from 'lucide-react';
import api from '../api/client';
import { useToast } from '../context/ToastContext';

export default function Notifications() {
  const toast = useToast();
  const [notifications, setNotifications] = useState([]);
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [notifs, prefs] = await Promise.all([
        api.getNotifications(),
        api.getNotificationPreferences(),
      ]);
      setNotifications(notifs.notifications || []);
      setPreferences(prefs);
    } catch (error) {
      console.error('Failed to load notifications:', error);
      toast.error(error.message || 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id) => {
    try {
      await api.markNotificationAsRead(id);
      setNotifications(notifications.map(n =>
        n.id === id ? { ...n, is_read: true } : n
      ));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.markAllNotificationsAsRead();
      setNotifications(notifications.map(n => ({ ...n, is_read: true })));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handlePreferenceChange = async (key) => {
    const updated = { ...preferences, [key]: !preferences[key] };
    setPreferences(updated);
    try {
      await api.updateNotificationPreferences(updated);
    } catch (error) {
      console.error('Failed to update preferences:', error);
      setPreferences(preferences);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Notifications</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
          </p>
        </div>
        {unreadCount > 0 && (
          <button onClick={handleMarkAllAsRead} className="btn btn-secondary">
            <Check size={18} />
            Mark All Read
          </button>
        )}
      </div>

      <div className="space-y-3">
        {notifications.length === 0 ? (
          <div className="card text-center py-12">
            <Bell className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              No Notifications
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              You're all caught up!
            </p>
          </div>
        ) : (
          notifications.map((notif) => (
            <div
              key={notif.id}
              className={`card flex items-start gap-4 ${
                !notif.is_read ? 'border-l-4 border-primary-500' : ''
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                !notif.is_read
                  ? 'bg-primary-100 dark:bg-primary-900/30'
                  : 'bg-gray-100 dark:bg-gray-800'
              }`}>
                <Bell className={`w-5 h-5 ${
                  !notif.is_read
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-gray-400'
                }`} />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                  {notif.title}
                </h4>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                  {notif.message}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                  {new Date(notif.created_at).toLocaleString()}
                </p>
              </div>
              {!notif.is_read && (
                <button aria-label="Mark as read"
                  onClick={() => handleMarkAsRead(notif.id)}
                  className="btn btn-secondary btn-sm"
                >
                  <Check size={14} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {preferences && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <SettingsIcon size={20} />
            Notification Preferences
          </h3>
          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-gray-700 dark:text-gray-300">Email Notifications</span>
              <input type="checkbox" checked={!!preferences.email_enabled} onChange={() => handlePreferenceChange('email_enabled')} className="toggle" />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-gray-700 dark:text-gray-300">Budget Alerts</span>
              <input type="checkbox" checked={!!preferences.budget_alerts} onChange={() => handlePreferenceChange('budget_alerts')} className="toggle" />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-gray-700 dark:text-gray-300">Transaction Alerts</span>
              <input type="checkbox" checked={!!preferences.transaction_alerts} onChange={() => handlePreferenceChange('transaction_alerts')} className="toggle" />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-gray-700 dark:text-gray-300">Collaboration Alerts</span>
              <input type="checkbox" checked={!!preferences.collaboration_alerts} onChange={() => handlePreferenceChange('collaboration_alerts')} className="toggle" />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
