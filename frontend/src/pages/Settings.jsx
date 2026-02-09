import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { Shield, ShieldCheck, ShieldOff, Key, X, Download, Upload, AlertTriangle } from 'lucide-react';

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // MFA setup state
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [mfaData, setMfaData] = useState(null);
  const [mfaCode, setMfaCode] = useState('');

  // MFA disable state
  const [showMfaDisable, setShowMfaDisable] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');

  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Backup/restore state
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

  const handleSetupMfa = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.setupMfa();
      setMfaData(data);
      setShowMfaSetup(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEnableMfa = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.enableMfa(mfaCode);
      setSuccess('Two-factor authentication enabled successfully!');
      setShowMfaSetup(false);
      setMfaCode('');
      setMfaData(null);
      await refreshUser();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDisableMfa = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.disableMfa(disableCode, disablePassword);
      setSuccess('Two-factor authentication disabled.');
      setShowMfaDisable(false);
      setDisableCode('');
      setDisablePassword('');
      await refreshUser();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setSuccess('Password changed successfully!');
      setShowPasswordChange(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExportBackup = async () => {
    setBackupLoading(true);
    setError('');
    try {
      const { blob, filename } = await api.exportBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSuccess('Backup downloaded successfully!');
    } catch (err) {
      setError(err.message);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setRestoreFile(file);
      setShowRestoreConfirm(true);
    }
    e.target.value = '';
  };

  const handleRestoreBackup = async () => {
    if (!restoreFile) return;
    setRestoreLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', restoreFile);
      const result = await api.restoreBackup(formData);
      setSuccess(`Backup restored successfully! ${result.totalRestored} items imported.`);
      setShowRestoreConfirm(false);
      setRestoreFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setRestoreLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300 rounded-lg text-sm">
          {success}
        </div>
      )}

      {/* Security Section */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Security
        </h2>

        <div className="space-y-4">
          {/* Two-Factor Authentication */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div className="flex items-center gap-3">
              {user?.mfa_enabled ? (
                <ShieldCheck className="w-6 h-6 text-green-600" />
              ) : (
                <ShieldOff className="w-6 h-6 text-gray-400 dark:text-gray-500" />
              )}
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">Two-Factor Authentication</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {user?.mfa_enabled
                    ? 'Your account is protected with 2FA'
                    : 'Add an extra layer of security to your account'}
                </p>
              </div>
            </div>
            {user?.mfa_enabled ? (
              <button
                onClick={() => setShowMfaDisable(true)}
                className="btn-secondary text-sm"
                disabled={loading}
              >
                Disable
              </button>
            ) : (
              <button
                onClick={handleSetupMfa}
                className="btn-primary text-sm"
                disabled={loading}
              >
                Enable
              </button>
            )}
          </div>

          {/* Change Password */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div className="flex items-center gap-3">
              <Key className="w-6 h-6 text-gray-400 dark:text-gray-500" />
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">Password</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Change your account password</p>
              </div>
            </div>
            <button
              onClick={() => setShowPasswordChange(true)}
              className="btn-secondary text-sm"
            >
              Change
            </button>
          </div>
        </div>
      </div>

      {/* Data Section */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Download className="w-5 h-5" />
          Data
        </h2>

        <div className="space-y-4">
          {/* Export Backup */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div className="flex items-center gap-3">
              <Download className="w-6 h-6 text-blue-600" />
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">Export Backup</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Download all your data as a .sql backup file
                </p>
              </div>
            </div>
            <button
              onClick={handleExportBackup}
              className="btn-primary text-sm"
              disabled={backupLoading}
            >
              {backupLoading ? 'Downloading...' : 'Download'}
            </button>
          </div>

          {/* Restore Backup */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div className="flex items-center gap-3">
              <Upload className="w-6 h-6 text-gray-400 dark:text-gray-500" />
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">Restore Backup</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Import data from a previously exported backup file
                </p>
              </div>
            </div>
            <label className="btn-secondary text-sm cursor-pointer">
              Choose File
              <input
                type="file"
                accept=".sql"
                onChange={handleRestoreFileSelect}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Account Info */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Account</h2>
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-gray-500 dark:text-gray-400">Name:</span>{' '}
            <span className="font-medium">{user?.name}</span>
          </p>
          <p>
            <span className="text-gray-500 dark:text-gray-400">Email:</span>{' '}
            <span className="font-medium">{user?.email}</span>
          </p>
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      {showRestoreConfirm && restoreFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Restore Backup</h2>
              <button
                onClick={() => {
                  setShowRestoreConfirm(false);
                  setRestoreFile(null);
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  This will add data from the backup file to your existing data. Existing records will not be deleted or overwritten.
                </p>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm">
                <p><span className="text-gray-500 dark:text-gray-400">File:</span> {restoreFile.name}</p>
                <p><span className="text-gray-500 dark:text-gray-400">Size:</span> {(restoreFile.size / 1024).toFixed(1)} KB</p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowRestoreConfirm(false);
                    setRestoreFile(null);
                  }}
                  className="flex-1 btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRestoreBackup}
                  disabled={restoreLoading}
                  className="flex-1 btn-primary"
                >
                  {restoreLoading ? 'Restoring...' : 'Restore'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MFA Setup Modal */}
      {showMfaSetup && mfaData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Set Up Two-Factor Authentication</h2>
              <button
                onClick={() => {
                  setShowMfaSetup(false);
                  setMfaCode('');
                  setMfaData(null);
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEnableMfa} className="p-4 space-y-4">
              <div className="text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                </p>
                <img
                  src={mfaData.qrCode}
                  alt="QR Code"
                  className="mx-auto w-48 h-48 border rounded-lg"
                />
                <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                  Or enter this code manually:{' '}
                  <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{mfaData.secret}</code>
                </p>
              </div>

              <div>
                <label className="label">Enter the 6-digit code from your app</label>
                <input
                  type="text"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="input text-center text-2xl tracking-widest"
                  placeholder="000000"
                  maxLength={6}
                  required
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowMfaSetup(false);
                    setMfaCode('');
                    setMfaData(null);
                  }}
                  className="flex-1 btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || mfaCode.length !== 6}
                  className="flex-1 btn-primary"
                >
                  {loading ? 'Verifying...' : 'Enable 2FA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MFA Disable Modal */}
      {showMfaDisable && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Disable Two-Factor Authentication</h2>
              <button
                onClick={() => {
                  setShowMfaDisable(false);
                  setDisableCode('');
                  setDisablePassword('');
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleDisableMfa} className="p-4 space-y-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Disabling 2FA will make your account less secure. Confirm by entering your password and current 2FA code.
                </p>
              </div>

              <div>
                <label className="label">Password</label>
                <input
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  className="input"
                  placeholder="Your password"
                  required
                />
              </div>

              <div>
                <label className="label">Authentication Code</label>
                <input
                  type="text"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="input text-center text-2xl tracking-widest"
                  placeholder="000000"
                  maxLength={6}
                  required
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowMfaDisable(false);
                    setDisableCode('');
                    setDisablePassword('');
                  }}
                  className="flex-1 btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 btn-danger"
                >
                  {loading ? 'Disabling...' : 'Disable 2FA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Change Modal */}
      {showPasswordChange && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Change Password</h2>
              <button
                onClick={() => {
                  setShowPasswordChange(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="p-4 space-y-4">
              <div>
                <label className="label">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="label">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input"
                  required
                  minLength={8}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Min 8 characters with uppercase, lowercase, and number
                </p>
              </div>

              <div>
                <label className="label">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input"
                  required
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordChange(false);
                    setCurrentPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                  }}
                  className="flex-1 btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 btn-primary"
                >
                  {loading ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
