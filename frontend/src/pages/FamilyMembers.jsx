import { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Edit2,
  Trash2,
  DollarSign,
  Calendar,
  Shield,
  AlertCircle,
  Check,
  X,
  Baby,
  UserPlus,
  Wallet,
  TrendingUp,
  Eye
} from 'lucide-react';
import { api } from '../api/client';

export default function FamilyMembers() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [activeTab, setActiveTab] = useState('members'); // members, spending, limits

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    role: 'child',
    email: '',
    birth_date: '',
    allowance_amount: '',
    allowance_frequency: 'weekly',
    spending_limit: '',
    avatar_color: '#0ea5e9'
  });

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      const data = await api.getFamilyMembers();
      setMembers(data);
    } catch (err) {
      setError('Failed to load family members');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingMember) {
        await api.updateFamilyMember(editingMember.id, formData);
      } else {
        await api.createFamilyMember(formData);
      }
      await fetchMembers();
      resetForm();
    } catch (err) {
      setError('Failed to save family member');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to remove this family member?')) {
      try {
        await api.deleteFamilyMember(id);
        await fetchMembers();
      } catch (err) {
        setError('Failed to delete family member');
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      role: 'child',
      email: '',
      birth_date: '',
      allowance_amount: '',
      allowance_frequency: 'weekly',
      spending_limit: '',
      avatar_color: '#0ea5e9'
    });
    setEditingMember(null);
    setShowAddMember(false);
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'parent':
      case 'spouse':
        return <Shield className="w-4 h-4" />;
      case 'child':
        return <Baby className="w-4 h-4" />;
      default:
        return <Users className="w-4 h-4" />;
    }
  };

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'parent':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      case 'spouse':
        return 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300';
      case 'child':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Family Members
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage family members, allowances, and spending limits
          </p>
        </div>
        <button
          onClick={() => setShowAddMember(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <UserPlus size={20} />
          Add Member
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="text-red-600 dark:text-red-400" size={20} />
          <span className="text-red-700 dark:text-red-300">{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'members', label: 'Members', icon: Users },
            { id: 'spending', label: 'Spending', icon: TrendingUp },
            { id: 'limits', label: 'Limits & Allowances', icon: Shield }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors
                ${activeTab === tab.id
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }
              `}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {members.map(member => (
            <div key={member.id} className="card hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
                    style={{ backgroundColor: member.avatar_color }}
                  >
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {member.name}
                    </h3>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(member.role)}`}>
                      {getRoleIcon(member.role)}
                      {member.role}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setFormData(member);
                      setEditingMember(member);
                      setShowAddMember(true);
                    }}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  >
                    <Edit2 size={16} className="text-gray-500" />
                  </button>
                  <button
                    onClick={() => handleDelete(member.id)}
                    className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  >
                    <Trash2 size={16} className="text-red-500" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                {member.email && (
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Email:</span>
                    <span className="truncate">{member.email}</span>
                  </div>
                )}

                {member.spending_limit && (
                  <div className="flex items-center gap-2">
                    <Shield size={14} className="text-orange-500" />
                    <span className="text-gray-600 dark:text-gray-400">
                      Monthly limit: {formatCurrency(member.spending_limit)}
                    </span>
                  </div>
                )}

                {member.allowance_amount && (
                  <div className="flex items-center gap-2">
                    <Wallet size={14} className="text-green-500" />
                    <span className="text-gray-600 dark:text-gray-400">
                      {formatCurrency(member.allowance_amount)} {member.allowance_frequency}
                    </span>
                  </div>
                )}

                <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 dark:text-gray-400">This month:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {formatCurrency(member.current_month_spending)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Spending Tab */}
      {activeTab === 'spending' && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Family Spending Overview</h2>
          <div className="space-y-4">
            {members.map(member => (
              <div key={member.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: member.avatar_color }}
                  >
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{member.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{member.role}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(member.current_month_spending)}
                  </p>
                  {member.spending_limit && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      of {formatCurrency(member.spending_limit)} limit
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Limits Tab */}
      {activeTab === 'limits' && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Spending Limits & Allowances</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 px-4 font-medium text-gray-700 dark:text-gray-300">Member</th>
                  <th className="text-left py-2 px-4 font-medium text-gray-700 dark:text-gray-300">Monthly Limit</th>
                  <th className="text-left py-2 px-4 font-medium text-gray-700 dark:text-gray-300">Allowance</th>
                  <th className="text-left py-2 px-4 font-medium text-gray-700 dark:text-gray-300">Status</th>
                </tr>
              </thead>
              <tbody>
                {members.map(member => (
                  <tr key={member.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                          style={{ backgroundColor: member.avatar_color }}
                        >
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900 dark:text-white">{member.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {member.spending_limit ? formatCurrency(member.spending_limit) : '-'}
                    </td>
                    <td className="py-3 px-4">
                      {member.allowance_amount
                        ? `${formatCurrency(member.allowance_amount)} ${member.allowance_frequency}`
                        : '-'}
                    </td>
                    <td className="py-3 px-4">
                      {member.spending_limit && member.current_month_spending > member.spending_limit ? (
                        <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                          <AlertCircle size={16} />
                          Over limit
                        </span>
                      ) : (
                        <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                          <Check size={16} />
                          Within limit
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Member Modal */}
      {showAddMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-semibold mb-4">
              {editingMember ? 'Edit Family Member' : 'Add Family Member'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input w-full"
                  placeholder="Enter name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="input w-full"
                >
                  <option value="parent">Parent</option>
                  <option value="spouse">Spouse</option>
                  <option value="child">Child</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Email (optional)</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="input w-full"
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Birth Date (optional)</label>
                <input
                  type="date"
                  value={formData.birth_date}
                  onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Monthly Spending Limit (optional)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.spending_limit}
                  onChange={(e) => setFormData({ ...formData, spending_limit: e.target.value })}
                  className="input w-full"
                  placeholder="0.00"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Allowance Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.allowance_amount}
                    onChange={(e) => setFormData({ ...formData, allowance_amount: e.target.value })}
                    className="input w-full"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Frequency</label>
                  <select
                    value={formData.allowance_frequency}
                    onChange={(e) => setFormData({ ...formData, allowance_frequency: e.target.value })}
                    className="input w-full"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Avatar Color</label>
                <input
                  type="color"
                  value={formData.avatar_color}
                  onChange={(e) => setFormData({ ...formData, avatar_color: e.target.value })}
                  className="w-full h-10 rounded cursor-pointer"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  {editingMember ? 'Update' : 'Add'} Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}