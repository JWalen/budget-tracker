import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Share2, Plus, Trash2, X, UserPlus, Mail, Eye, Pencil, Check } from 'lucide-react';

export default function Sharing() {
  const [shares, setShares] = useState({ myShares: [], sharedWithMe: [] });
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('view');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [sharesData, pendingData] = await Promise.all([
        api.getShares(),
        api.getPendingInvites(),
      ]);
      setShares(sharesData);
      setPendingInvites(pendingData);
    } catch (error) {
      console.error('Failed to load shares:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.inviteShare(inviteEmail, inviteRole);
      setSuccess('Invitation sent successfully!');
      setShowInvite(false);
      setInviteEmail('');
      setInviteRole('view');
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateRole = async (id, role) => {
    try {
      await api.updateShare(id, role);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRevoke = async (id) => {
    if (!confirm('Remove this share?')) return;
    try {
      await api.deleteShare(id);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAccept = async (token) => {
    try {
      await api.acceptInvite(token);
      setSuccess('Invitation accepted!');
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Budget Sharing</h1>
        <button onClick={() => setShowInvite(true)} className="btn-primary flex items-center gap-2">
          <UserPlus size={20} />
          <span>Invite</span>
        </button>
      </div>

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

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Mail size={20} />
            Pending Invitations
          </h2>
          <div className="space-y-3">
            {pendingInvites.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{invite.owner_name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{invite.owner_email} wants to share their budget with you ({invite.role} access)</p>
                </div>
                <button
                  onClick={() => handleAccept(invite.invite_token)}
                  className="btn-primary text-sm flex items-center gap-1"
                >
                  <Check size={16} />
                  Accept
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Shares */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Share2 size={20} />
          People I Share With
        </h2>
        {shares.myShares.length === 0 ? (
          <div className="text-center py-8">
            <Share2 className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">You haven't shared your budget with anyone yet.</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Click "Invite" to share your budget.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {shares.myShares.map((share) => (
              <div key={share.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {share.shared_with_name || share.shared_with_email}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{share.shared_with_email}</p>
                  {share.status === 'pending' && share.invite_token && (
                    <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded">
                      <p className="text-xs text-amber-700 dark:text-amber-300 mb-1">Share this invite link:</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={`${window.location.origin}/invite/${share.invite_token}`}
                          className="flex-1 text-xs px-2 py-1 bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-600 rounded"
                          onClick={(e) => e.target.select()}
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/invite/${share.invite_token}`);
                            setSuccess('Invite link copied!');
                          }}
                          className="text-xs px-2 py-1 bg-amber-600 text-white rounded hover:bg-amber-700"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    share.status === 'pending'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                  }`}>
                    {share.status}
                  </span>
                  <select
                    value={share.role}
                    onChange={(e) => handleUpdateRole(share.id, e.target.value)}
                    className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="view">View only</option>
                    <option value="edit">Can edit</option>
                  </select>
                  <button
                    onClick={() => handleRevoke(share.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                    title="Revoke access"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Shared With Me */}
      {shares.sharedWithMe.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Eye size={20} />
            Budgets Shared With Me
          </h2>
          <div className="space-y-3">
            {shares.sharedWithMe.map((share) => (
              <div key={share.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{share.owner_name}'s Budget</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{share.owner_email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${
                    share.role === 'edit'
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-300'
                  }`}>
                    {share.role === 'edit' ? <><Pencil size={12} /> Edit</> : <><Eye size={12} /> View</>}
                  </span>
                  <button
                    onClick={() => handleRevoke(share.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                    title="Leave shared budget"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Invite to Share</h2>
              <button onClick={() => setShowInvite(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleInvite} className="p-4 space-y-4">
              <div>
                <label className="label">Email Address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="input"
                  placeholder="friend@example.com"
                  required
                />
              </div>

              <div>
                <label className="label">Permission Level</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setInviteRole('view')}
                    className={`flex-1 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                      inviteRole === 'view'
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    <Eye size={16} />
                    View Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviteRole('edit')}
                    className={`flex-1 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                      inviteRole === 'edit'
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                    }`}
                  >
                    <Pencil size={16} />
                    Can Edit
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {inviteRole === 'view'
                    ? 'They can see your transactions, budgets, and categories but cannot make changes.'
                    : 'They can add, edit, and delete transactions, budgets, and categories in your budget.'}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowInvite(false)} className="flex-1 btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary">
                  Send Invite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
