import { useState, useEffect } from 'react';
import { Building2, Mail, MoreVertical, Trash2 } from 'lucide-react';
import api from '../api/client';
import { useToast } from '../context/ToastContext';

export default function Organizations() {
  const toast = useToast();
  const [organizations, setOrganizations] = useState([]);
  const [currentOrg, setCurrentOrg] = useState(null);
  const [members, setMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [creating, setCreating] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);

  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async () => {
    try {
      const data = await api.getOrganizations();
      setOrganizations(data);
      if (data.length > 0) {
        setCurrentOrg(data[0]);
        loadMembers(data[0].id);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to load households');
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async (orgId) => {
    try {
      const data = await api.getOrganizationMembers(orgId);
      setMembers(data);
    } catch (err) {
      toast.error(err.message || 'Failed to load members');
    }
  };

  const handleCreateOrg = async (e) => {
    e.preventDefault();
    if (!newOrgName.trim() || creating) return;

    setCreating(true);
    try {
      await api.createOrganization(newOrgName);
      toast.success('Household created');
      setShowCreateModal(false);
      setNewOrgName('');
      await loadOrganizations();
    } catch (err) {
      toast.error(err.message || 'Failed to create household');
    } finally {
      setCreating(false);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!currentOrg || !inviteEmail || inviting) return;

    setInviting(true);
    try {
      await api.inviteOrganizationMember(currentOrg.id, inviteEmail, inviteRole);
      toast.success('Invitation sent');
      setInviteEmail('');
      loadMembers(currentOrg.id);
    } catch (err) {
      toast.error(err.message || 'Failed to send invitation');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
    setOpenMenuId(null);
    if (!currentOrg) return;
    if (!window.confirm('Remove this member from the household?')) return;

    try {
      await api.removeOrganizationMember(currentOrg.id, memberId);
      toast.success('Member removed');
      loadMembers(currentOrg.id);
    } catch (err) {
      toast.error(err.message || 'Failed to remove member');
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Households</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage household collaboration and permissions
          </p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
          <Building2 size={18} />
          Create Household
        </button>
      </div>

      {organizations.length === 0 ? (
        <div className="card text-center py-12">
          <Building2 className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            No Households Yet
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Create a household to collaborate with your family or roommates
          </p>
          <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
            Create Household
          </button>
        </div>
      ) : (
        <>
          {currentOrg && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {currentOrg.name}
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {members.length} members
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  Invite Household Member
                </h3>
                <form onSubmit={handleInvite} className="flex gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="Email address"
                    className="input flex-1"
                    required
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="input w-32"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button type="submit" className="btn btn-primary" disabled={inviting}>
                    <Mail size={18} />
                    {inviting ? 'Sending...' : 'Invite'}
                  </button>
                </form>
              </div>
            </div>
          )}

          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Household Members
            </h3>
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center font-semibold">
                      {member.username?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {member.username}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {member.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      member.role === 'owner' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' :
                      member.role === 'admin' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                      member.role === 'member' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                      'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300'
                    }`}>
                      {member.role}
                    </span>
                    {member.role !== 'owner' && (
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === member.id ? null : member.id)}
                          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                          aria-label="Member actions"
                          aria-haspopup="menu"
                          aria-expanded={openMenuId === member.id}
                        >
                          <MoreVertical size={16} />
                        </button>
                        {openMenuId === member.id && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setOpenMenuId(null)}
                            />
                            <div
                              role="menu"
                              className="absolute right-0 mt-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 py-1"
                            >
                              <button
                                role="menuitem"
                                onClick={() => handleRemoveMember(member.id)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                <Trash2 size={14} />
                                Remove member
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Create Household Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Create Household
            </h3>
            <form onSubmit={handleCreateOrg}>
              <div className="mb-4">
                <label className="label">Household Name</label>
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  className="input w-full"
                  placeholder="e.g., Smith Family, Home Budget"
                  required
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewOrgName('');
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1" disabled={creating}>
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
