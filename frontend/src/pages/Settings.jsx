import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import { Shield, ShieldCheck, ShieldOff, Key, X, Download, Upload, AlertTriangle, HardDrive, RefreshCw } from 'lucide-react';
import { APP_VERSION } from '../version';

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // Check GitHub for a newer release. If one exists, open the release page so the
  // user can download the installer (the desktop app can't self-install unsigned).
  const handleCheckUpdate = async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    try {
      const data = await api.checkUpdates();
      if (data.hasUpdate) {
        const go = window.confirm(`Version ${data.latestVersion} is available (you have ${data.currentVersion}). Open the download page?`);
        if (go) window.open(data.releaseUrl || 'https://github.com/JWalen/budget-tracker/releases/latest', '_blank', 'noopener,noreferrer');
      } else {
        toast.success(`You're on the latest version (v${data.currentVersion || APP_VERSION}).`);
      }
    } catch (err) {
      toast.error(err.message || 'Could not check for updates');
    } finally {
      setCheckingUpdate(false);
    }
  };

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


  const handleSetupMfa = async () => {
    setLoading(true);
    try {
      const data = await api.setupMfa();
      setMfaData(data);
      setShowMfaSetup(true);
    } catch (err) {
      toast.error(err.message || 'Failed to start 2FA setup');
    } finally {
      setLoading(false);
    }
  };

  const handleEnableMfa = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.enableMfa(mfaCode);
      toast.success('Two-factor authentication enabled successfully!');
      setShowMfaSetup(false);
      setMfaCode('');
      setMfaData(null);
      await refreshUser();
    } catch (err) {
      toast.error(err.message || 'Failed to enable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handleDisableMfa = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.disableMfa(disableCode, disablePassword);
      toast.success('Two-factor authentication disabled.');
      setShowMfaDisable(false);
      setDisableCode('');
      setDisablePassword('');
      await refreshUser();
    } catch (err) {
      toast.error(err.message || 'Failed to disable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully!');
      setShowPasswordChange(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>

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

      {/* Data & Backups — now a single home on the Backups page */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <HardDrive className="w-5 h-5" />
          Data & Backups
        </h2>
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg gap-4 flex-wrap">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Backing up, downloading, restoring, and scheduling backups all live on the Backups page.
          </p>
          <Link to="/backups" className="btn-primary text-sm flex items-center gap-2 whitespace-nowrap">
            <HardDrive className="w-4 h-4" />
            Go to Backups
          </Link>
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

      {/* About & Updates */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">About</h2>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="text-sm">
            <p className="font-medium text-gray-900 dark:text-gray-100">Budget Tracker</p>
            <p className="text-gray-500 dark:text-gray-400">Version {APP_VERSION}</p>
          </div>
          {user?.is_admin && (
            <button
              onClick={handleCheckUpdate}
              disabled={checkingUpdate}
              className="btn-secondary text-sm flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${checkingUpdate ? 'animate-spin' : ''}`} />
              {checkingUpdate ? 'Checking…' : 'Check for Updates'}
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          The desktop app also checks automatically on launch, and you can check anytime from the <strong>File → Check for Updates…</strong> menu.
        </p>
      </div>

      {/* MFA Setup Modal */}
      {showMfaSetup && mfaData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Set Up Two-Factor Authentication</h2>
              <button aria-label="Close"
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
              <button aria-label="Close"
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
              <button aria-label="Close"
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
