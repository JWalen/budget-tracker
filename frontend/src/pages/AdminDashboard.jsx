import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Users, ArrowLeftRight, TrendingUp, TrendingDown, Database, Download, Upload, Mail, Send, Settings, Check, X } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [emailConfig, setEmailConfig] = useState(null);
  const [emailStats, setEmailStats] = useState(null);
  const [showEmailConfig, setShowEmailConfig] = useState(false);
  const [emailForm, setEmailForm] = useState({});
  const [testEmail, setTestEmail] = useState('');
  const [emailMessage, setEmailMessage] = useState({ type: '', text: '' });
  const [savingEmail, setSavingEmail] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getAdminStats(),
      api.getEmailConfig(),
      api.getEmailStats()
    ])
      .then(([statsData, emailConfigData, emailStatsData]) => {
        setStats(statsData);
        setEmailConfig(emailConfigData);
        setEmailForm(emailConfigData);
        setEmailStats(emailStatsData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleAdminExport = async () => {
    setBackupLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const { blob, filename } = await api.adminExportBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: 'Full backup downloaded successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleAdminRestoreFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setRestoreFile(file);
      setShowRestoreConfirm(true);
      setConfirmText('');
    }
    e.target.value = '';
  };

  const handleAdminRestore = async () => {
    if (!restoreFile) return;
    setRestoreLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const formData = new FormData();
      formData.append('file', restoreFile);
      const result = await api.adminRestoreBackup(formData);
      setMessage({ type: 'success', text: `Database restored! ${result.statementsExecuted} statements executed.` });
      setShowRestoreConfirm(false);
      setRestoreFile(null);
      setConfirmText('');
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleSaveEmailConfig = async () => {
    setSavingEmail(true);
    setEmailMessage({ type: '', text: '' });
    try {
      await api.updateEmailConfig(emailForm);
      setEmailMessage({ type: 'success', text: 'Email configuration saved successfully!' });
      setEmailConfig(emailForm);
      setTimeout(() => setEmailMessage({ type: '', text: '' }), 3000);
    } catch (err) {
      setEmailMessage({ type: 'error', text: err.message });
    } finally {
      setSavingEmail(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    setEmailMessage({ type: '', text: '' });
    try {
      const result = await api.testEmailConfig(testEmail || emailForm.from);
      setEmailMessage({ type: 'success', text: result.message });
      setTimeout(() => setEmailMessage({ type: '', text: '' }), 5000);
    } catch (err) {
      setEmailMessage({ type: 'error', text: err.error || err.message });
    } finally {
      setTestingEmail(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Total Transactions', value: stats.totalTransactions, icon: ArrowLeftRight, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/30' },
    { label: 'Total Income', value: formatCurrency(stats.totalIncome), icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/30' },
    { label: 'Total Expenses', value: formatCurrency(stats.totalExpenses), icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/30' },
  ];

  const chartData = stats.userGrowth.map((item) => ({
    month: item.month,
    users: parseInt(item.count),
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Admin Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-4">
              <div className={`${bg} p-3 rounded-lg`}>
                <Icon className={color} size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {chartData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">User Growth (Last 6 Months)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="users" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Database Backup & Restore */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mt-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Database className="w-5 h-5" />
          Database Backup & Restore
        </h2>

        {message.text && (
          <div className={`p-3 mb-4 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Export */}
          <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg text-center">
            <Download className="w-8 h-8 text-blue-600 mx-auto mb-2" />
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Export Database</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Download a full backup of all users and data
            </p>
            <button
              onClick={handleAdminExport}
              className="btn-primary text-sm w-full"
              disabled={backupLoading}
            >
              {backupLoading ? 'Downloading...' : 'Download Full Backup'}
            </button>
          </div>

          {/* Restore */}
          <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg text-center">
            <Upload className="w-8 h-8 text-red-600 mx-auto mb-2" />
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Restore Database</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Replace the entire database from a backup file
            </p>
            <label className="btn-danger text-sm w-full inline-block cursor-pointer text-center">
              {restoreLoading ? 'Restoring...' : 'Choose Backup File'}
              <input
                type="file"
                accept=".sql"
                onChange={handleAdminRestoreFileSelect}
                className="hidden"
                disabled={restoreLoading}
              />
            </label>
          </div>
        </div>
      </div>

      {/* Email Configuration */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Email Configuration
          </h2>
          <button
            onClick={() => setShowEmailConfig(!showEmailConfig)}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            <Settings size={16} />
            {showEmailConfig ? 'Hide' : 'Configure'}
          </button>
        </div>

        {/* Email Stats */}
        {emailStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <p className="text-xs text-gray-500 dark:text-gray-400">Pending Invites</p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{emailStats.pending_invites}</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <p className="text-xs text-gray-500 dark:text-gray-400">Accepted</p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{emailStats.accepted_invites}</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <p className="text-xs text-gray-500 dark:text-gray-400">Last 24h</p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{emailStats.invites_last_24h}</p>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <p className="text-xs text-gray-500 dark:text-gray-400">Last 7 days</p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{emailStats.invites_last_7d}</p>
            </div>
          </div>
        )}

        {/* Current Configuration */}
        <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Current Provider:</span>
            <span className={`text-sm font-medium px-2 py-1 rounded-full ${
              emailConfig?.provider === 'none'
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
            }`}>
              {emailConfig?.provider === 'none' ? 'Not Configured' : emailConfig?.provider?.toUpperCase()}
            </span>
            {emailConfig?.provider !== 'none' && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                From: {emailConfig?.from}
              </span>
            )}
          </div>
        </div>

        {/* Configuration Form */}
        {showEmailConfig && (
          <div className="space-y-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            {emailMessage.text && (
              <div className={`p-3 rounded-lg text-sm ${
                emailMessage.type === 'success'
                  ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300'
                  : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300'
              }`}>
                {emailMessage.text}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Email Provider</label>
                <select
                  value={emailForm.provider || 'none'}
                  onChange={(e) => setEmailForm({...emailForm, provider: e.target.value})}
                  className="input"
                >
                  <option value="none">None (Disabled)</option>
                  <option value="sendgrid">SendGrid</option>
                  <option value="gmail">Gmail</option>
                  <option value="smtp">SMTP</option>
                  <option value="resend">Resend</option>
                </select>
              </div>

              <div>
                <label className="label">From Email</label>
                <input
                  type="email"
                  value={emailForm.from || ''}
                  onChange={(e) => setEmailForm({...emailForm, from: e.target.value})}
                  className="input"
                  placeholder="noreply@example.com"
                />
              </div>

              <div>
                <label className="label">From Name</label>
                <input
                  type="text"
                  value={emailForm.fromName || ''}
                  onChange={(e) => setEmailForm({...emailForm, fromName: e.target.value})}
                  className="input"
                  placeholder="Budget Tracker"
                />
              </div>

              {emailForm.provider === 'sendgrid' && (
                <div>
                  <label className="label">SendGrid API Key</label>
                  <input
                    type="password"
                    value={emailForm.sendgridApiKey || ''}
                    onChange={(e) => setEmailForm({...emailForm, sendgridApiKey: e.target.value})}
                    className="input"
                    placeholder="SG.xxxxxxxxxxxx"
                  />
                </div>
              )}

              {(emailForm.provider === 'gmail' || emailForm.provider === 'smtp') && (
                <>
                  {emailForm.provider === 'smtp' && (
                    <>
                      <div>
                        <label className="label">SMTP Host</label>
                        <input
                          type="text"
                          value={emailForm.smtpHost || ''}
                          onChange={(e) => setEmailForm({...emailForm, smtpHost: e.target.value})}
                          className="input"
                          placeholder="smtp.example.com"
                        />
                      </div>
                      <div>
                        <label className="label">SMTP Port</label>
                        <input
                          type="text"
                          value={emailForm.smtpPort || ''}
                          onChange={(e) => setEmailForm({...emailForm, smtpPort: e.target.value})}
                          className="input"
                          placeholder="587"
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="label">{emailForm.provider === 'gmail' ? 'Gmail Address' : 'SMTP Username'}</label>
                    <input
                      type="text"
                      value={emailForm.smtpUser || ''}
                      onChange={(e) => setEmailForm({...emailForm, smtpUser: e.target.value})}
                      className="input"
                      placeholder={emailForm.provider === 'gmail' ? 'your@gmail.com' : 'username'}
                    />
                  </div>
                  <div>
                    <label className="label">{emailForm.provider === 'gmail' ? 'App Password' : 'SMTP Password'}</label>
                    <input
                      type="password"
                      value={emailForm.smtpPass || ''}
                      onChange={(e) => setEmailForm({...emailForm, smtpPass: e.target.value})}
                      className="input"
                      placeholder="••••••••"
                    />
                    {emailForm.provider === 'gmail' && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Use an App Password, not your Gmail password.
                        <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline ml-1">
                          Create one here
                        </a>
                      </p>
                    )}
                  </div>
                </>
              )}

              {emailForm.provider === 'resend' && (
                <div>
                  <label className="label">Resend API Key</label>
                  <input
                    type="password"
                    value={emailForm.resendApiKey || ''}
                    onChange={(e) => setEmailForm({...emailForm, resendApiKey: e.target.value})}
                    className="input"
                    placeholder="re_xxxxxxxxxxxx"
                  />
                </div>
              )}
            </div>

            {/* Test Email Section */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <label className="label">Send Test Email To:</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="input flex-1"
                  placeholder={emailForm.from || 'test@example.com'}
                />
                <button
                  onClick={handleTestEmail}
                  disabled={testingEmail || emailForm.provider === 'none'}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Send size={16} />
                  {testingEmail ? 'Sending...' : 'Send Test'}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => {
                  setEmailForm(emailConfig);
                  setShowEmailConfig(false);
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEmailConfig}
                disabled={savingEmail}
                className="btn-primary flex items-center gap-2"
              >
                {savingEmail ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Save Configuration
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Admin Restore Confirmation Modal */}
      {showRestoreConfirm && restoreFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-red-600">Restore Database</h2>
              <button
                onClick={() => {
                  setShowRestoreConfirm(false);
                  setRestoreFile(null);
                  setConfirmText('');
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <span className="text-xl">&times;</span>
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-300 font-medium">
                  This will completely wipe and replace the entire database. All existing data will be permanently deleted. This action cannot be undone.
                </p>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm">
                <p><span className="text-gray-500 dark:text-gray-400">File:</span> {restoreFile.name}</p>
                <p><span className="text-gray-500 dark:text-gray-400">Size:</span> {(restoreFile.size / 1024).toFixed(1)} KB</p>
              </div>

              <div>
                <label className="label">Type RESTORE to confirm</label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="input"
                  placeholder="RESTORE"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowRestoreConfirm(false);
                    setRestoreFile(null);
                    setConfirmText('');
                  }}
                  className="flex-1 btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdminRestore}
                  disabled={confirmText !== 'RESTORE' || restoreLoading}
                  className="flex-1 btn-danger"
                >
                  {restoreLoading ? 'Restoring...' : 'Restore Database'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
