import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { Mail, Save, Send, AlertCircle, CheckCircle, Server, Key } from 'lucide-react';

export default function AdminEmailSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [testEmail, setTestEmail] = useState('');
  
  const [config, setConfig] = useState({
    provider: 'none',
    from: '',
    fromName: 'Budget Tracker',
    sendgridApiKey: '',
    smtpHost: '',
    smtpPort: '587',
    smtpUser: '',
    smtpPass: '',
    resendApiKey: ''
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const data = await api.getAdminEmailConfig();
      setConfig(prev => ({
        ...prev,
        ...data,
        // Don't overwrite with empty/masked values if we're editing
        sendgridApiKey: data.sendgridConfigured ? '********' : '',
        smtpPass: data.smtpConfigured ? '********' : '',
        resendApiKey: data.resendConfigured ? '********' : ''
      }));
    } catch (err) {
      setError('Failed to load email configuration');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Filter out masked values so we don't save asterisks
      const dataToSave = { ...config };
      if (dataToSave.sendgridApiKey === '********') delete dataToSave.sendgridApiKey;
      if (dataToSave.smtpPass === '********') delete dataToSave.smtpPass;
      if (dataToSave.resendApiKey === '********') delete dataToSave.resendApiKey;

      await api.updateAdminEmailConfig(dataToSave);
      setSuccess('Email configuration saved successfully');
      loadConfig(); // Reload to get updated status
    } catch (err) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async (e) => {
    e.preventDefault();
    if (!testEmail) return;

    setTesting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await api.testAdminEmailConfig(testEmail);
      setSuccess(result.message);
    } catch (err) {
      setError(err.message || 'Failed to send test email');
    } finally {
      setTesting(false);
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
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
          <Mail className="w-6 h-6 text-primary-600 dark:text-primary-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Email Configuration</h1>
          <p className="text-gray-600 dark:text-gray-400">Configure how the system sends emails for notifications and invites.</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
          <p className="text-green-700 dark:text-green-300">{success}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Server className="w-4 h-4" />
              Provider Settings
            </h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email Provider
              </label>
              <select
                name="provider"
                value={config.provider}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="none">None (Disable Emails)</option>
                <option value="gmail">Gmail</option>
                <option value="smtp">SMTP Server</option>
                <option value="sendgrid">SendGrid</option>
                <option value="resend">Resend</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                From Email
              </label>
              <input
                type="email"
                name="from"
                value={config.from}
                onChange={handleChange}
                placeholder="noreply@yourdomain.com"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                From Name
              </label>
              <input
                type="text"
                name="fromName"
                value={config.fromName}
                onChange={handleChange}
                placeholder="Budget Tracker"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Key className="w-4 h-4" />
              Credentials
            </h3>

            {(config.provider === 'gmail' || config.provider === 'smtp') && (
              <>
                {config.provider === 'smtp' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        SMTP Host
                      </label>
                      <input
                        type="text"
                        name="smtpHost"
                        value={config.smtpHost}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        SMTP Port
                      </label>
                      <input
                        type="text"
                        name="smtpPort"
                        value={config.smtpPort}
                        onChange={handleChange}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                )}
                {config.provider === 'gmail' && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Uses Gmail SMTP (smtp.gmail.com:587). Requires a Google App Password — not your regular password.
                  </p>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {config.provider === 'gmail' ? 'Gmail Address' : 'SMTP User'}
                  </label>
                  <input
                    type="text"
                    name="smtpUser"
                    value={config.smtpUser}
                    onChange={handleChange}
                    placeholder={config.provider === 'gmail' ? 'you@gmail.com' : ''}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {config.provider === 'gmail' ? 'App Password' : 'SMTP Password'}
                  </label>
                  <input
                    type="password"
                    name="smtpPass"
                    value={config.smtpPass}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </>
            )}

            {config.provider === 'sendgrid' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  SendGrid API Key
                </label>
                <input
                  type="password"
                  name="sendgridApiKey"
                  value={config.sendgridApiKey}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            )}

            {config.provider === 'resend' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Resend API Key
                </label>
                <input
                  type="password"
                  name="resendApiKey"
                  value={config.resendApiKey}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            )}

            {config.provider === 'none' && (
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm text-gray-500 dark:text-gray-400">
                Email functionality is currently disabled. Select a provider to enable email notifications.
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
          </button>
        </div>
      </form>

      {/* Test Email Section */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Send className="w-4 h-4" />
          Test Configuration
        </h3>
        <form onSubmit={handleTestEmail} className="flex gap-4">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="Enter email address to send test to"
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            required
          />
          <button
            type="submit"
            disabled={testing || config.provider === 'none'}
            className="px-6 py-2 bg-gray-900 dark:bg-gray-600 text-white rounded-lg hover:bg-gray-800 dark:hover:bg-gray-500 disabled:opacity-50"
          >
            {testing ? 'Sending...' : 'Send Test Email'}
          </button>
        </form>
      </div>
    </div>
  );
}
