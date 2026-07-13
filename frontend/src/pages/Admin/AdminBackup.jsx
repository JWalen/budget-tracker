import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/format';
import {
  Database, Download, Upload, RefreshCw, HardDrive, Shield,
  Clock, Trash2, AlertTriangle, CheckCircle, Archive, Server, XCircle
} from 'lucide-react';

export default function AdminBackup() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cleaning, setCleaning] = useState(false);
  const [activity, setActivity] = useState(null);
  const [config, setConfig] = useState(null);
  const [transactionOverview, setTransactionOverview] = useState(null);
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [cleanupType, setCleanupType] = useState('logs');
  const [cleanupDays, setCleanupDays] = useState(30);

  const fetchData = async () => {
    try {
      setError(null);
      const [activityData, configData, transactionsData] = await Promise.all([
        api.getAdminActivity(),
        api.getAdminConfig(),
        api.getAdminTransactionsOverview()
      ]);

      setActivity(activityData);
      setConfig(configData);
      setTransactionOverview(transactionsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const cleanupLabels = {
    logs: 'old log files',
    sessions: 'expired sessions',
    login_attempts: 'old login attempts',
  };

  const handleCleanup = async () => {
    if (cleaning) return;
    const days = parseInt(cleanupDays) || 30;
    const label = cleanupLabels[cleanupType] || cleanupType;
    if (!window.confirm(`This will permanently delete ${label} older than ${days} days. This action cannot be undone. Continue?`)) return;

    setCleaning(true);
    try {
      const result = await api.adminCleanup(cleanupType, days);
      toast.success(result.message || 'Cleanup completed');
      setShowCleanupModal(false);
      fetchData();
    } catch (err) {
      toast.error('Failed to perform cleanup: ' + err.message);
    } finally {
      setCleaning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">System Management</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">System info & maintenance</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowCleanupModal(true)}
            className="flex items-center space-x-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <Trash2 className="w-4 h-4" />
            <span>Cleanup</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400">Error: {error}</p>
        </div>
      )}

      {/* System Configuration */}
      {config && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">System Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Database */}
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                <Database className="w-4 h-4 mr-2 text-blue-500" />
                Database
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Host</span>
                  <span className="font-medium text-gray-900 dark:text-white">{config.database.host}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Port</span>
                  <span className="font-medium text-gray-900 dark:text-white">{config.database.port}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Database</span>
                  <span className="font-medium text-gray-900 dark:text-white">{config.database.name}</span>
                </div>
              </div>
            </div>

            {/* Security */}
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                <Shield className="w-4 h-4 mr-2 text-green-500" />
                Security
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">JWT</span>
                  {config.security.jwtConfigured ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Encryption</span>
                  {config.security.encryptionConfigured ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">MFA Keys</span>
                  {config.security.mfaEncryptionConfigured ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  )}
                </div>
              </div>
            </div>

            {/* Features */}
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                <Server className="w-4 h-4 mr-2 text-purple-500" />
                Features
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">MFA</span>
                  {config.features.mfaEnabled ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-gray-400" />
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">AI Assistant</span>
                  {config.features.aiEnabled ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-gray-400" />
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Email</span>
                  {config.email.configured ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Backups moved to their own page */}
      <div className="card p-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
            <Archive className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Backups</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Create, download, restore, and schedule backups — all in one place.</p>
          </div>
        </div>
        <Link to="/backups" className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
          <HardDrive className="w-4 h-4" />
          <span>Go to Backups</span>
        </Link>
      </div>

      {/* Transaction Overview */}
      {transactionOverview && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Transaction Analysis</h3>

          {/* Potential Duplicates */}
          {transactionOverview.potentialDuplicates?.length > 0 && (
            <div className="mb-6">
              <h4 className="font-medium text-gray-900 dark:text-white mb-2 flex items-center">
                <AlertTriangle className="w-4 h-4 mr-2 text-yellow-500" />
                Potential Duplicate Transactions
              </h4>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Found {transactionOverview.potentialDuplicates.length} potential duplicate transactions
                </p>
              </div>
            </div>
          )}

          {/* Large Transactions */}
          {transactionOverview.largeTransactions?.length > 0 && (
            <div className="mb-6">
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">Large Transactions (&gt; $5,000)</h4>
              <div className="space-y-2">
                {transactionOverview.largeTransactions.slice(0, 5).map((tx, idx) => (
                  <div key={idx} className="flex justify-between items-center text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      {tx.user_name || tx.email} - {tx.category_name || 'Uncategorized'}
                    </span>
                    <span className={`font-medium ${tx.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                      ${Math.abs(tx.amount).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Category Breakdown */}
          {transactionOverview.categoryBreakdown?.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">Top Categories</h4>
              <div className="space-y-2">
                {transactionOverview.categoryBreakdown.slice(0, 5).map((cat) => (
                  <div key={cat.category} className="flex justify-between items-center text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      {cat.category} ({cat.transaction_count} transactions)
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {cat.users} users
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent Activity */}
      {activity && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recent Activity</h3>

          {/* Recent Signups */}
          {activity.recentSignups?.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">New Users</h4>
              <div className="space-y-1">
                {activity.recentSignups.slice(0, 5).map((user) => (
                  <div key={user.id} className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      {user.name || user.email}
                    </span>
                    <span className="text-gray-500 dark:text-gray-500">
                      {formatDate(user.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suspicious Activity */}
          {activity.suspiciousActivity?.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
              <h4 className="font-medium text-red-800 dark:text-red-200 mb-2 flex items-center">
                <AlertTriangle className="w-4 h-4 mr-2" />
                Suspicious Login Attempts
              </h4>
              <div className="space-y-1">
                {activity.suspiciousActivity.map((item, idx) => (
                  <div key={idx} className="text-sm text-red-700 dark:text-red-300">
                    {item.email} - {item.attempt_count} failed attempts from {item.ip_address}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cleanup Modal */}
      {showCleanupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">System Cleanup</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Cleanup Type
                </label>
                <select
                  value={cleanupType}
                  onChange={(e) => setCleanupType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="logs">Old Log Files</option>
                  <option value="sessions">Expired Sessions</option>
                  <option value="login_attempts">Old Login Attempts</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Older Than (days)
                </label>
                <input
                  type="number"
                  value={cleanupDays}
                  onChange={(e) => setCleanupDays(e.target.value)}
                  min="1"
                  max="365"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowCleanupModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCleanup}
                disabled={cleaning}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {cleaning ? 'Cleaning...' : 'Start Cleanup'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}