import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/format';
import {
  Activity, Users, Database, Shield, TrendingUp, AlertTriangle,
  Server, HardDrive, Lock, Mail, DollarSign, Clock,
  CheckCircle, XCircle, AlertCircle, RefreshCw, Download, Cpu
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async () => {
    try {
      setError(null);
      const data = await api.getAdminStats();
      setStats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-600 dark:text-red-400">Error loading admin dashboard: {error}</p>
      </div>
    );
  }

  if (!stats) return null;

  const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  // Prepare chart data
  const userGrowthData = stats.userGrowth || [];
  const storageData = stats.system.storageBreakdown?.slice(0, 6) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">System overview and management</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Security Status */}
      {stats.system.encryptionWarnings?.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-yellow-900 dark:text-yellow-200">Security Warnings</h3>
              <ul className="mt-2 space-y-1">
                {stats.system.encryptionWarnings.map((warning, index) => (
                  <li key={index} className="text-yellow-700 dark:text-yellow-300 text-sm">• {warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users */}
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Total Users</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {stats.users.total}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {stats.users.admins} admins
              </p>
            </div>
            <Users className="w-10 h-10 text-primary-500" />
          </div>
        </div>

        {/* Active Users */}
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Active Users</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {stats.users.active24h}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Last 24 hours
              </p>
            </div>
            <Activity className="w-10 h-10 text-green-500" />
          </div>
        </div>

        {/* Total Transactions */}
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Transactions</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {stats.transactions.total.toLocaleString()}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Total processed
              </p>
            </div>
            <DollarSign className="w-10 h-10 text-yellow-500" />
          </div>
        </div>

        {/* Active Sessions */}
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Active Sessions</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {stats.system.activeSessions}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Current connections
              </p>
            </div>
            <Clock className="w-10 h-10 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Detailed Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Activity */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">User Activity</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Active (24h)</span>
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-900 dark:text-white">{stats.users.active24h}</span>
                <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${(stats.users.active24h / stats.users.total) * 100}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Active (7d)</span>
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-900 dark:text-white">{stats.users.active7d}</span>
                <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${(stats.users.active7d / stats.users.total) * 100}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Active (30d)</span>
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-900 dark:text-white">{stats.users.active30d}</span>
                <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-purple-500 h-2 rounded-full"
                    style={{ width: `${(stats.users.active30d / stats.users.total) * 100}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">MFA Enabled</span>
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-900 dark:text-white">{stats.users.mfaEnabled}</span>
                <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-yellow-500 h-2 rounded-full"
                    style={{ width: `${(stats.users.mfaEnabled / stats.users.total) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Financial Overview */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Financial Overview</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600 dark:text-gray-400">Total Income</span>
                <span className="font-semibold text-green-600 dark:text-green-400">
                  {formatCurrency(stats.transactions.totalIncome)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Total Expenses</span>
                <span className="font-semibold text-red-600 dark:text-red-400">
                  {formatCurrency(stats.transactions.totalExpenses)}
                </span>
              </div>
            </div>
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">Net Balance</span>
                <span className={`font-bold text-lg ${
                  stats.transactions.totalIncome - stats.transactions.totalExpenses >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {formatCurrency(stats.transactions.totalIncome - stats.transactions.totalExpenses)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Growth Chart */}
        {userGrowthData.length > 0 && (
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">User Growth</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={userGrowthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="month" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1F2937',
                    border: 'none',
                    borderRadius: '8px'
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  dot={{ fill: '#0ea5e9' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Storage Breakdown */}
        {storageData.length > 0 && (
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Storage Usage</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={storageData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ tablename, size }) => `${tablename}: ${size}`}
                  outerRadius={70}
                  fill="#8884d8"
                  dataKey="size_bytes"
                >
                  {storageData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1F2937',
                    border: 'none',
                    borderRadius: '8px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* System Information */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Database Status */}
        <div className="card p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Database className="w-6 h-6 text-primary-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Database</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Size</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {stats.system.databaseSize ?
                  (typeof stats.system.databaseSize === 'string' ?
                    stats.system.databaseSize :
                    `${(stats.system.databaseSize / (1024 * 1024)).toFixed(2)} MB`)
                  : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Tables</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {stats.system.storageBreakdown?.length || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Security Status */}
        <div className="card p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Shield className="w-6 h-6 text-green-500" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Security</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">Encryption</span>
              {stats.system.encryptionValid ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 dark:text-gray-400">MFA Users</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {stats.users.mfaEnabled} / {stats.users.total}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button
            onClick={() => window.location.href = '/admin/users'}
            className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Users className="w-8 h-8 text-primary-500 mb-2" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">Manage Users</span>
          </button>
          <button
            onClick={() => window.location.href = '/admin/logs'}
            className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Activity className="w-8 h-8 text-green-500 mb-2" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">View Logs</span>
          </button>
          <button
            onClick={() => window.location.href = '/admin/backup'}
            className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Download className="w-8 h-8 text-blue-500 mb-2" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">Backup</span>
          </button>
          <button
            onClick={() => window.location.href = '/admin/config'}
            className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Server className="w-8 h-8 text-purple-500 mb-2" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">Configuration</span>
          </button>
          <button
            onClick={() => window.location.href = '/admin/ai-settings'}
            className="flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Cpu className="w-8 h-8 text-orange-500 mb-2" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">AI Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
}