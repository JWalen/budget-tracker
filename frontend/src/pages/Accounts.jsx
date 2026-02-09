import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useBudget } from '../context/BudgetContext';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  CreditCard,
  Building2,
  Wallet,
  TrendingUp,
  DollarSign,
  Check,
  AlertCircle
} from 'lucide-react';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const accountTypes = [
  { value: 'checking', label: 'Checking', icon: Wallet },
  { value: 'savings', label: 'Savings', icon: TrendingUp },
  { value: 'credit', label: 'Credit Card', icon: CreditCard },
  { value: 'investment', label: 'Investment', icon: Building2 }
];

const accountColors = [
  '#0ea5e9', // sky-500
  '#22c55e', // green-500
  '#f97316', // orange-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#f59e0b', // amber-500
  '#6366f1', // indigo-500
];

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const { isReadOnly } = useBudget();

  const [form, setForm] = useState({
    name: '',
    account_type: 'checking',
    account_number_last4: '',
    institution: '',
    balance: '',
    color: '#0ea5e9',
    is_active: true
  });

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const data = await api.getAccounts();
      setAccounts(data);
    } catch (error) {
      console.error('Failed to load accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (account = null) => {
    if (account) {
      setEditingAccount(account);
      setForm({
        name: account.name,
        account_type: account.account_type,
        account_number_last4: account.account_number_last4 || '',
        institution: account.institution || '',
        balance: account.balance || '',
        color: account.color,
        is_active: account.is_active
      });
    } else {
      setEditingAccount(null);
      setForm({
        name: '',
        account_type: 'checking',
        account_number_last4: '',
        institution: '',
        balance: '',
        color: '#0ea5e9',
        is_active: true
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingAccount(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...form,
        balance: parseFloat(form.balance) || 0
      };

      if (editingAccount) {
        await api.updateAccount(editingAccount.id, data);
      } else {
        await api.createAccount(data);
      }
      closeModal();
      loadAccounts();
    } catch (error) {
      console.error('Failed to save account:', error);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this account? Transactions will remain but won\'t be linked to any account.')) return;
    try {
      await api.deleteAccount(id);
      loadAccounts();
    } catch (error) {
      console.error('Failed to delete account:', error);
    }
  };

  const handleReconcile = async (account) => {
    const newBalance = prompt(
      `Enter the current balance for ${account.name}:`,
      account.balance
    );

    if (newBalance !== null && !isNaN(newBalance)) {
      try {
        await api.reconcileAccount(account.id, {
          balance: parseFloat(newBalance),
          date: new Date().toISOString().split('T')[0]
        });
        loadAccounts();
      } catch (error) {
        console.error('Failed to reconcile account:', error);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const activeAccounts = accounts.filter(a => a.is_active);
  const inactiveAccounts = accounts.filter(a => !a.is_active);
  const totalBalance = activeAccounts.reduce((sum, acc) => sum + parseFloat(acc.balance || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Bank Accounts</h1>
        {!isReadOnly && (
          <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
            <Plus size={20} />
            <span>Add Account</span>
          </button>
        )}
      </div>

      {/* Summary Card */}
      <div className="card bg-gradient-to-r from-primary-500 to-primary-600 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-primary-100">Total Balance</p>
            <p className="text-3xl font-bold">{formatCurrency(totalBalance)}</p>
            <p className="text-primary-100 text-sm mt-2">
              {activeAccounts.length} active {activeAccounts.length === 1 ? 'account' : 'accounts'}
            </p>
          </div>
          <DollarSign size={48} className="text-primary-200" />
        </div>
      </div>

      {/* Active Accounts */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Active Accounts</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeAccounts.map((account) => {
            const AccountIcon = accountTypes.find(t => t.value === account.account_type)?.icon || Wallet;
            return (
              <div key={account.id} className="card hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="p-3 rounded-lg"
                      style={{ backgroundColor: `${account.color}20` }}
                    >
                      <AccountIcon size={24} style={{ color: account.color }} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                        {account.name}
                      </h3>
                      {account.institution && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {account.institution}
                        </p>
                      )}
                      {account.account_number_last4 && (
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          ****{account.account_number_last4}
                        </p>
                      )}
                    </div>
                  </div>
                  {!isReadOnly && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openModal(account)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(account.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Balance</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      {formatCurrency(account.balance || 0)}
                    </p>
                  </div>

                  {account.transaction_count > 0 && (
                    <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {account.transaction_count} transactions
                      </p>
                      {account.last_transaction_date && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Last: {new Date(account.last_transaction_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  )}

                  {!isReadOnly && (
                    <button
                      onClick={() => handleReconcile(account)}
                      className="w-full btn-secondary text-sm flex items-center justify-center gap-2"
                    >
                      <Check size={14} />
                      Reconcile
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Inactive Accounts */}
      {inactiveAccounts.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Inactive Accounts</h2>
          <div className="space-y-2">
            {inactiveAccounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg opacity-60"
              >
                <div className="flex items-center gap-3">
                  <AlertCircle size={20} className="text-gray-400" />
                  <span className="text-gray-600 dark:text-gray-400">{account.name}</span>
                  {account.institution && (
                    <span className="text-sm text-gray-400">({account.institution})</span>
                  )}
                </div>
                {!isReadOnly && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openModal(account)}
                      className="text-sm text-primary-600 hover:text-primary-700"
                    >
                      Reactivate
                    </button>
                    <button
                      onClick={() => handleDelete(account.id)}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {!isReadOnly && showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold">
                {editingAccount ? 'Edit Account' : 'New Account'}
              </h2>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="label">Account Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input"
                  placeholder="My Checking Account"
                  required
                />
              </div>

              <div>
                <label className="label">Account Type</label>
                <select
                  value={form.account_type}
                  onChange={(e) => setForm({ ...form, account_type: e.target.value })}
                  className="input"
                  required
                >
                  {accountTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Institution</label>
                <input
                  type="text"
                  value={form.institution}
                  onChange={(e) => setForm({ ...form, institution: e.target.value })}
                  className="input"
                  placeholder="Bank of America"
                />
              </div>

              <div>
                <label className="label">Last 4 Digits</label>
                <input
                  type="text"
                  value={form.account_number_last4}
                  onChange={(e) => setForm({ ...form, account_number_last4: e.target.value.slice(0, 4) })}
                  className="input"
                  placeholder="1234"
                  maxLength="4"
                />
              </div>

              <div>
                <label className="label">Current Balance</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.balance}
                  onChange={(e) => setForm({ ...form, balance: e.target.value })}
                  className="input"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="label">Color</label>
                <div className="flex gap-2">
                  {accountColors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setForm({ ...form, color })}
                      className={`w-8 h-8 rounded-full border-2 ${
                        form.color === color ? 'border-gray-900 dark:border-gray-100' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {editingAccount && (
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm">Account is active</span>
                  </label>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary">
                  {editingAccount ? 'Update' : 'Add'} Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}