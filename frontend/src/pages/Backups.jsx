import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Save,
  Download,
  Clock,
  HardDrive,
  Cloud,
  FolderOpen,
  Settings,
  Play,
  Pause,
  Trash2,
  CheckCircle,
  AlertCircle,
  Calendar,
  Shield,
  X,
} from 'lucide-react';

export default function Backups() {
  const { user } = useAuth();
  const toast = useToast();
  const [backups, setBackups] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingStorage, setSavingStorage] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [storageConfig, setStorageConfig] = useState({
    type: 'server',
    path: '',
    credentials: {},
  });
  const [loading, setLoading] = useState(true);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [backupInProgress, setBackupInProgress] = useState(false);

  const [scheduleForm, setScheduleForm] = useState({
    name: '',
    frequency: 'daily',
    time: '03:00',
    storageType: 'server',
    enabled: true,
    retentionDays: 30,
  });

  const [storageForm, setStorageForm] = useState({
    type: 'server',
    serverPath: '/var/backups/budget',
    localPath: '',
    networkPath: '',
    networkUsername: '',
    networkPassword: '',
    s3Bucket: '',
    s3Region: 'us-east-1',
    s3AccessKey: '',
    s3SecretKey: '',
    googleDriveFolder: '',
    googleDriveCredentials: '',
    dropboxToken: '',
    dropboxFolder: '/backups',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [backupData, scheduleData, configData] = await Promise.all([
        api.getBackupHistory(),
        api.getBackupSchedules(),
        api.getBackupConfig(),
      ]);
      setBackups(backupData || []);
      setSchedules(scheduleData || []);
      setStorageConfig(configData || { type: 'local', path: '', credentials: {} });
    } catch (error) {
      toast.error(error.message || 'Failed to load backup data');
    } finally {
      setLoading(false);
    }
  };

  const performBackup = async (downloadOnly = false) => {
    setBackupInProgress(true);
    try {
      if (downloadOnly) {
        // Direct download backup
        const response = await api.downloadBackupNow({
          isAdminBackup: user?.is_admin,
        });

        // Create download link
        const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = response.filename || `backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        toast.success('Backup downloaded successfully!');
      } else {
        // Save to configured storage
        const result = await api.createBackup({
          storageType: storageConfig.type,
          isAdminBackup: user?.is_admin,
        });
        toast.success(`Backup created successfully! File: ${result.filename}`);
        loadData();
      }
    } catch (error) {
      toast.error(error.message || 'Backup failed. Please check your storage configuration.');
    } finally {
      setBackupInProgress(false);
    }
  };

  const handleCreateSchedule = async (e) => {
    e.preventDefault();
    if (savingSchedule) return;
    setSavingSchedule(true);
    try {
      await api.createBackupSchedule(scheduleForm);
      toast.success('Backup schedule created');
      setShowScheduleModal(false);
      loadData();
    } catch (error) {
      toast.error(error.message || 'Failed to create schedule');
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleSaveStorage = async (e) => {
    e.preventDefault();
    if (savingStorage) return;
    setSavingStorage(true);
    try {
      const config = {
        type: storageForm.type,
        credentials: {},
      };

      switch (storageForm.type) {
        case 'server':
          config.path = storageForm.serverPath || '/var/backups/budget';
          break;
        case 'local':
          config.path = storageForm.localPath;
          break;
        case 'network':
          config.path = storageForm.networkPath;
          config.credentials = {
            username: storageForm.networkUsername,
            password: storageForm.networkPassword,
          };
          break;
        case 's3':
          config.credentials = {
            bucket: storageForm.s3Bucket,
            region: storageForm.s3Region,
            accessKey: storageForm.s3AccessKey,
            secretKey: storageForm.s3SecretKey,
          };
          break;
        case 'gdrive':
          config.credentials = {
            folder: storageForm.googleDriveFolder,
            credentials: storageForm.googleDriveCredentials,
          };
          break;
        case 'dropbox':
          config.credentials = {
            token: storageForm.dropboxToken,
            folder: storageForm.dropboxFolder,
          };
          break;
      }

      await api.saveBackupConfig(config);
      setStorageConfig(config);
      setShowStorageModal(false);
      toast.success('Storage configuration saved successfully!');
    } catch (error) {
      toast.error(error.message || 'Failed to save storage configuration');
    } finally {
      setSavingStorage(false);
    }
  };

  const toggleSchedule = async (id, enabled) => {
    try {
      await api.updateBackupSchedule(id, { enabled });
      loadData();
    } catch (error) {
      toast.error(error.message || 'Failed to update schedule');
    }
  };

  const deleteSchedule = async (id) => {
    if (!confirm('Delete this backup schedule?')) return;
    try {
      await api.deleteBackupSchedule(id);
      toast.success('Schedule deleted');
      loadData();
    } catch (error) {
      toast.error(error.message || 'Failed to delete schedule');
    }
  };

  const getStorageIcon = (type) => {
    switch (type) {
      case 'server':
        return <HardDrive size={16} />;
      case 'local':
        return <FolderOpen size={16} />;
      case 'network':
        return <FolderOpen size={16} />;
      case 's3':
      case 'gdrive':
      case 'dropbox':
        return <Cloud size={16} />;
      default:
        return <Save size={16} />;
    }
  };

  const getFrequencyText = (frequency) => {
    switch (frequency) {
      case 'hourly':
        return 'Every hour';
      case 'daily':
        return 'Daily';
      case 'weekly':
        return 'Weekly';
      case 'monthly':
        return 'Monthly';
      default:
        return frequency;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Backup & Restore</h1>
          {user?.is_admin && (
            <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium flex items-center gap-1">
              <Shield size={12} />
              Admin
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowStorageModal(true)}
            className="btn-secondary flex items-center gap-2"
          >
            <Settings size={20} />
            <span>Storage Settings</span>
          </button>
          <button
            onClick={() => setShowScheduleModal(true)}
            className="btn-secondary flex items-center gap-2"
          >
            <Clock size={20} />
            <span>Schedule</span>
          </button>
          <button
            onClick={() => performBackup(true)}
            className="btn-secondary flex items-center gap-2"
            disabled={backupInProgress}
          >
            <Download size={20} />
            <span>Download Backup</span>
          </button>
          <button
            onClick={() => performBackup(false)}
            className="btn-primary flex items-center gap-2"
            disabled={backupInProgress}
          >
            {backupInProgress ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Creating...</span>
              </>
            ) : (
              <>
                <Save size={20} />
                <span>Save to {storageConfig.type === 'server' ? 'Server' : storageConfig.type}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Current Storage Config */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Current Storage Configuration</h2>
          {getStorageIcon(storageConfig.type)}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          <p>Storage Type: <span className="font-medium text-gray-900 dark:text-gray-100">{storageConfig.type}</span></p>
          {storageConfig.path && (
            <p>Path: <span className="font-medium text-gray-900 dark:text-gray-100">{storageConfig.path}</span></p>
          )}
        </div>
      </div>

      {/* Scheduled Backups */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Scheduled Backups</h2>
        {schedules.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">
            No scheduled backups configured. Click "Schedule Backup" to set one up.
          </p>
        ) : (
          <div className="space-y-3">
            {schedules.map((schedule) => (
              <div key={schedule.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleSchedule(schedule.id, !schedule.enabled)}
                    className={`p-2 rounded-lg ${
                      schedule.enabled
                        ? 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                    }`}
                  >
                    {schedule.enabled ? <Play size={16} /> : <Pause size={16} />}
                  </button>
                  <div>
                    <p className="font-medium">{schedule.name}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {getFrequencyText(schedule.frequency)} at {schedule.time} • {schedule.storageType} storage
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => deleteSchedule(schedule.id)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Backup History */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Backup History</h2>
        {backups.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">
            No backups found. Create your first backup now!
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-600 dark:text-gray-400 border-b dark:border-gray-700">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Size</th>
                  <th className="pb-2">Storage</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {backups.map((backup) => (
                  <tr key={backup.id} className="border-b dark:border-gray-700">
                    <td className="py-3">
                      {new Date(backup.created_at).toLocaleString()}
                    </td>
                    <td className="py-3">
                      {backup.is_admin ? (
                        <span className="text-purple-600 dark:text-purple-400 font-medium">Full</span>
                      ) : (
                        <span className="text-blue-600 dark:text-blue-400">User</span>
                      )}
                    </td>
                    <td className="py-3">{backup.size}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        {getStorageIcon(backup.storage_type)}
                        <span>{backup.storage_type}</span>
                      </div>
                    </td>
                    <td className="py-3">
                      {backup.status === 'success' ? (
                        <CheckCircle size={16} className="text-green-500" />
                      ) : (
                        <AlertCircle size={16} className="text-red-500" />
                      )}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => api.downloadBackup(backup.id)}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                          title="Download"
                        >
                          <Download size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Restore Section */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Restore Data</h2>
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-1" size={20} />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200 mb-1">
                  Important: Restoring will replace your current data
                </p>
                <ul className="text-amber-700 dark:text-amber-300 space-y-1 list-disc list-inside">
                  <li>All existing data will be permanently replaced</li>
                  <li>This action cannot be undone</li>
                  <li>Consider creating a backup before restoring</li>
                </ul>
              </div>
            </div>
          </div>

          <div>
            <label className="label">Upload Backup File</label>
            <input
              type="file"
              accept=".json"
              disabled={restoring}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                if (!confirm('Are you sure you want to restore this backup? All current data will be replaced.')) {
                  e.target.value = '';
                  return;
                }

                const reader = new FileReader();
                reader.onload = async (event) => {
                  try {
                    const backupData = JSON.parse(event.target.result);

                    // Validate backup structure
                    if (!backupData.version || !backupData.data) {
                      toast.error('Invalid backup file format');
                      return;
                    }

                    setRestoring(true);
                    const formData = new FormData();
                    formData.append('backup', file);

                    await api.restoreBackup(formData);
                    toast.success('Backup restored successfully! The page will reload.');
                    window.location.reload();
                  } catch (error) {
                    toast.error(error.message || 'Failed to restore backup. Please check the file and try again.');
                  } finally {
                    setRestoring(false);
                    e.target.value = '';
                  }
                };
                reader.readAsText(file);
              }}
              className="input"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Select a .json backup file created by this application
            </p>
          </div>
        </div>
      </div>

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold">Schedule Backup</h2>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateSchedule} className="p-4 space-y-4">
              <div>
                <label className="label">Schedule Name</label>
                <input
                  type="text"
                  value={scheduleForm.name}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, name: e.target.value })}
                  className="input"
                  placeholder="e.g., Daily Backup"
                  required
                />
              </div>

              <div>
                <label className="label">Frequency</label>
                <select
                  value={scheduleForm.frequency}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, frequency: e.target.value })}
                  className="input"
                >
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              <div>
                <label className="label">Time</label>
                <input
                  type="time"
                  value={scheduleForm.time}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, time: e.target.value })}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="label">Storage Location</label>
                <select
                  value={scheduleForm.storageType}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, storageType: e.target.value })}
                  className="input"
                >
                  <option value="local">Local</option>
                  <option value="network">Network Share</option>
                  <option value="s3">Amazon S3</option>
                  <option value="gdrive">Google Drive</option>
                  <option value="dropbox">Dropbox</option>
                </select>
              </div>

              <div>
                <label className="label">Retention (days)</label>
                <input
                  type="number"
                  value={scheduleForm.retentionDays}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, retentionDays: parseInt(e.target.value) })}
                  className="input"
                  min="1"
                  max="365"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="flex-1 btn-secondary"
                  disabled={savingSchedule}
                >
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary" disabled={savingSchedule}>
                  {savingSchedule ? 'Creating...' : 'Create Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Storage Configuration Modal */}
      {showStorageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
              <h2 className="text-lg font-semibold">Storage Configuration</h2>
              <button
                onClick={() => setShowStorageModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveStorage} className="p-4 space-y-4">
              <div>
                <label className="label">Storage Type</label>
                <select
                  value={storageForm.type}
                  onChange={(e) => setStorageForm({ ...storageForm, type: e.target.value })}
                  className="input"
                >
                  <option value="server">Server Storage (Default)</option>
                  <option value="local">Local Directory</option>
                  <option value="network">Network File Share (SMB/CIFS)</option>
                  <option value="s3">Amazon S3</option>
                  <option value="gdrive">Google Drive</option>
                  <option value="dropbox">Dropbox</option>
                </select>
              </div>

              {/* Server Storage */}
              {storageForm.type === 'server' && (
                <div>
                  <label className="label">Server Backup Directory</label>
                  <input
                    type="text"
                    value={storageForm.serverPath}
                    onChange={(e) => setStorageForm({ ...storageForm, serverPath: e.target.value })}
                    className="input"
                    placeholder="/var/backups/budget"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Backups will be stored on the server in this directory. Default: /var/backups/budget
                  </p>
                </div>
              )}

              {/* Local Storage */}
              {storageForm.type === 'local' && (
                <div>
                  <label className="label">Backup Directory Path</label>
                  <input
                    type="text"
                    value={storageForm.localPath}
                    onChange={(e) => setStorageForm({ ...storageForm, localPath: e.target.value })}
                    className="input"
                    placeholder="/path/to/backups"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Absolute path to local directory for backups
                  </p>
                </div>
              )}

              {/* Network Share */}
              {storageForm.type === 'network' && (
                <>
                  <div>
                    <label className="label">Network Path</label>
                    <input
                      type="text"
                      value={storageForm.networkPath}
                      onChange={(e) => setStorageForm({ ...storageForm, networkPath: e.target.value })}
                      className="input"
                      placeholder="\\server\share\backups or //server/share/backups"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Username (optional)</label>
                    <input
                      type="text"
                      value={storageForm.networkUsername}
                      onChange={(e) => setStorageForm({ ...storageForm, networkUsername: e.target.value })}
                      className="input"
                      placeholder="domain\username"
                    />
                  </div>
                  <div>
                    <label className="label">Password (optional)</label>
                    <input
                      type="password"
                      value={storageForm.networkPassword}
                      onChange={(e) => setStorageForm({ ...storageForm, networkPassword: e.target.value })}
                      className="input"
                    />
                  </div>
                </>
              )}

              {/* Amazon S3 */}
              {storageForm.type === 's3' && (
                <>
                  <div>
                    <label className="label">S3 Bucket Name</label>
                    <input
                      type="text"
                      value={storageForm.s3Bucket}
                      onChange={(e) => setStorageForm({ ...storageForm, s3Bucket: e.target.value })}
                      className="input"
                      placeholder="my-backup-bucket"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">AWS Region</label>
                    <select
                      value={storageForm.s3Region}
                      onChange={(e) => setStorageForm({ ...storageForm, s3Region: e.target.value })}
                      className="input"
                    >
                      <option value="us-east-1">US East (N. Virginia)</option>
                      <option value="us-west-2">US West (Oregon)</option>
                      <option value="eu-west-1">EU (Ireland)</option>
                      <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Access Key ID</label>
                    <input
                      type="text"
                      value={storageForm.s3AccessKey}
                      onChange={(e) => setStorageForm({ ...storageForm, s3AccessKey: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Secret Access Key</label>
                    <input
                      type="password"
                      value={storageForm.s3SecretKey}
                      onChange={(e) => setStorageForm({ ...storageForm, s3SecretKey: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                </>
              )}

              {/* Google Drive */}
              {storageForm.type === 'gdrive' && (
                <>
                  <div>
                    <label className="label">Drive Folder Path</label>
                    <input
                      type="text"
                      value={storageForm.googleDriveFolder}
                      onChange={(e) => setStorageForm({ ...storageForm, googleDriveFolder: e.target.value })}
                      className="input"
                      placeholder="/Backups/BudgetApp"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Service Account Credentials (JSON)</label>
                    <textarea
                      value={storageForm.googleDriveCredentials}
                      onChange={(e) => setStorageForm({ ...storageForm, googleDriveCredentials: e.target.value })}
                      className="input"
                      rows="4"
                      placeholder="Paste service account JSON here"
                      required
                    />
                  </div>
                </>
              )}

              {/* Dropbox */}
              {storageForm.type === 'dropbox' && (
                <>
                  <div>
                    <label className="label">Access Token</label>
                    <input
                      type="password"
                      value={storageForm.dropboxToken}
                      onChange={(e) => setStorageForm({ ...storageForm, dropboxToken: e.target.value })}
                      className="input"
                      placeholder="Your Dropbox access token"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Folder Path</label>
                    <input
                      type="text"
                      value={storageForm.dropboxFolder}
                      onChange={(e) => setStorageForm({ ...storageForm, dropboxFolder: e.target.value })}
                      className="input"
                      placeholder="/Backups"
                      required
                    />
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowStorageModal(false)}
                  className="flex-1 btn-secondary"
                  disabled={savingStorage}
                >
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary" disabled={savingStorage}>
                  {savingStorage ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}