import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useBudget } from '../context/BudgetContext';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sortField, setSortField] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');
  const [filterAccount, setFilterAccount] = useState('all');
  const [selectedTransactions, setSelectedTransactions] = useState(new Set());
  const [bulkAccountId, setBulkAccountId] = useState('');
  const { activeBudgetOwner, isReadOnly } = useBudget();

  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();

  // Sorting function
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Filter transactions by account
  const filteredTransactions = filterAccount === 'all'
    ? transactions
    : transactions.filter(tx => tx.account_id === parseInt(filterAccount));

  // Sort transactions
  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    let aVal, bVal;

    switch (sortField) {
      case 'date':
        aVal = new Date(a.date);
        bVal = new Date(b.date);
        break;
      case 'description':
        aVal = a.description?.toLowerCase() || '';
        bVal = b.description?.toLowerCase() || '';
        break;
      case 'category':
        aVal = a.category_name?.toLowerCase() || '';
        bVal = b.category_name?.toLowerCase() || '';
        break;
      case 'account':
        aVal = a.account_name?.toLowerCase() || '';
        bVal = b.account_name?.toLowerCase() || '';
        break;
      case 'amount':
        aVal = parseFloat(a.amount);
        bVal = parseFloat(b.amount);
        break;
      default:
        return 0;
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const [form, setForm] = useState({
    type: 'expense',
    category_id: '',
    account_id: '',
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    loadData();
  }, [month, year, activeBudgetOwner?.id]);

  const loadData = async () => {
    try {
      const [txData, catData, accData] = await Promise.all([
        api.getTransactions({ month, year }),
        api.getCategories(),
        api.getAccounts(),
      ]);
      setTransactions(txData);
      setCategories(catData);
      setAccounts(accData.filter(a => a.is_active));
    } catch (error) {
      console.error('Failed to load transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const goToPrevMonth = () => setCurrentDate(new Date(year, month - 2, 1));
  const goToNextMonth = () => setCurrentDate(new Date(year, month, 1));

  const openModal = (tx = null) => {
    if (tx) {
      setEditingTx(tx);
      setForm({
        type: tx.type,
        category_id: tx.category_id || '',
        account_id: tx.account_id || '',
        amount: tx.amount,
        description: tx.description || '',
        date: tx.date.split('T')[0],
      });
    } else {
      setEditingTx(null);
      setForm({
        type: 'expense',
        category_id: '',
        account_id: '',
        amount: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTx(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...form,
        amount: parseFloat(form.amount),
        category_id: form.category_id || null,
        account_id: form.account_id || null,
      };

      if (editingTx) {
        await api.updateTransaction(editingTx.id, data);
      } else {
        await api.createTransaction(data);
      }
      closeModal();
      loadData();
    } catch (error) {
      console.error('Failed to save transaction:', error);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this transaction?')) return;
    try {
      await api.deleteTransaction(id);
      loadData();
    } catch (error) {
      console.error('Failed to delete transaction:', error);
    }
  };

  const filteredCategories = categories.filter((c) => c.type === form.type);

  // Handle bulk move to account
  const handleBulkMoveToAccount = async () => {
    if (!bulkAccountId || selectedTransactions.size === 0) return;

    try {
      // Update each selected transaction
      const promises = Array.from(selectedTransactions).map(txId => {
        const tx = transactions.find(t => t.id === txId);
        if (tx) {
          return api.updateTransaction(txId, {
            ...tx,
            account_id: parseInt(bulkAccountId)
          });
        }
        return Promise.resolve();
      });

      await Promise.all(promises);

      // Clear selection and reload
      setSelectedTransactions(new Set());
      setBulkAccountId('');
      loadData();
    } catch (error) {
      console.error('Failed to update transactions:', error);
      alert('Failed to move transactions to account');
    }
  };

  // Toggle transaction selection
  const toggleTransactionSelection = (txId) => {
    const newSelection = new Set(selectedTransactions);
    if (newSelection.has(txId)) {
      newSelection.delete(txId);
    } else {
      newSelection.add(txId);
    }
    setSelectedTransactions(newSelection);
  };

  // Select/deselect all visible transactions
  const toggleSelectAll = () => {
    if (selectedTransactions.size === sortedTransactions.length) {
      setSelectedTransactions(new Set());
    } else {
      setSelectedTransactions(new Set(sortedTransactions.map(tx => tx.id)));
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Transactions</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button onClick={goToPrevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              <ChevronLeft size={20} />
            </button>
            <span className="font-medium text-gray-900 dark:text-gray-100 min-w-[140px] text-center">
              {months[month - 1]} {year}
            </span>
            <button onClick={goToNextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Account Filter */}
          <select
            value={filterAccount}
            onChange={(e) => setFilterAccount(e.target.value)}
            className="input px-3 py-2"
          >
            <option value="all">All Accounts</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>

          {!isReadOnly && (
            <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
              <Plus size={20} />
              <span>Add Transaction</span>
            </button>
          )}
        </div>
      </div>

      {/* Bulk Actions */}
      {!isReadOnly && selectedTransactions.size > 0 && (
        <div className="card bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="text-sm text-blue-700 dark:text-blue-300">
              {selectedTransactions.size} transaction{selectedTransactions.size !== 1 ? 's' : ''} selected
            </div>
            <div className="flex items-center gap-3">
              <select
                value={bulkAccountId}
                onChange={(e) => setBulkAccountId(e.target.value)}
                className="input px-3 py-2 text-sm"
              >
                <option value="">Select account...</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleBulkMoveToAccount}
                disabled={!bulkAccountId}
                className="btn-primary px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Move to Account
              </button>
              <button
                onClick={() => setSelectedTransactions(new Set())}
                className="btn-secondary px-4 py-2 text-sm"
              >
                Clear Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction list */}
      <div className="card overflow-hidden">
        {transactions.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No transactions this month. Add one to get started!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                <tr>
                  {!isReadOnly && (
                    <th className="px-4 py-3 text-center w-12">
                      <input
                        type="checkbox"
                        checked={selectedTransactions.size === sortedTransactions.length && sortedTransactions.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleSort('date')}
                      className="flex items-center gap-1 font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                    >
                      Date
                      {sortField === 'date' ? (
                        sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                      ) : (
                        <ArrowUpDown size={14} className="text-gray-400" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleSort('description')}
                      className="flex items-center gap-1 font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                    >
                      Description
                      {sortField === 'description' ? (
                        sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                      ) : (
                        <ArrowUpDown size={14} className="text-gray-400" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleSort('account')}
                      className="flex items-center justify-center gap-1 font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                    >
                      Account
                      {sortField === 'account' ? (
                        sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                      ) : (
                        <ArrowUpDown size={14} className="text-gray-400" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleSort('category')}
                      className="flex items-center justify-center gap-1 font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                    >
                      Category
                      {sortField === 'category' ? (
                        sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                      ) : (
                        <ArrowUpDown size={14} className="text-gray-400" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <button
                      onClick={() => handleSort('amount')}
                      className="flex items-center gap-1 font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                    >
                      Amount
                      {sortField === 'amount' ? (
                        sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                      ) : (
                        <ArrowUpDown size={14} className="text-gray-400" />
                      )}
                    </button>
                  </th>
                  {!isReadOnly && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {sortedTransactions.map((tx) => (
                  <tr key={tx.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${selectedTransactions.has(tx.id) ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
                    {!isReadOnly && (
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedTransactions.has(tx.id)}
                          onChange={() => toggleTransactionSelection(tx.id)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="text-gray-900 dark:text-gray-100">
                        {formatDate(tx.date)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={`p-1 rounded ${
                            tx.type === 'income' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
                          }`}
                        >
                          {tx.type === 'income' ? (
                            <TrendingUp className="w-4 h-4 text-green-600" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-red-600" />
                          )}
                        </div>
                        <span className="text-gray-900 dark:text-gray-100">
                          {tx.description || 'No description'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {tx.account_name ? (
                        <span
                          className="px-2 py-1 rounded text-xs font-medium inline-block"
                          style={{
                            backgroundColor: `${tx.account_color}20`,
                            color: tx.account_color,
                          }}
                        >
                          {tx.account_name}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 text-sm">
                          No account
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {tx.category_name ? (
                        <span
                          className="px-2 py-1 rounded-full text-xs font-medium inline-block"
                          style={{
                            backgroundColor: `${tx.category_color}20`,
                            color: tx.category_color,
                          }}
                        >
                          {tx.category_name}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 text-sm">
                          Uncategorized
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-semibold ${
                          tx.type === 'income' ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {tx.type === 'income' ? '+' : '-'}
                        {formatCurrency(tx.amount)}
                      </span>
                    </td>
                    {!isReadOnly && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openModal(tx)}
                            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(tx.id)}
                            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {!isReadOnly && showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold">
                {editingTx ? 'Edit Transaction' : 'New Transaction'}
              </h2>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* Type toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, type: 'expense', category_id: '' })}
                  className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                    form.type === 'expense'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                  }`}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, type: 'income', category_id: '' })}
                  className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                    form.type === 'income'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                  }`}
                >
                  Income
                </button>
              </div>

              <div>
                <label className="label">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="input"
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="label">Account</label>
                <select
                  value={form.account_id}
                  onChange={(e) => setForm({ ...form, account_id: e.target.value })}
                  className="input"
                >
                  <option value="">Select account</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.account_type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Category</label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="input"
                >
                  <option value="">Select category</option>
                  {filteredCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="input"
                  placeholder="Optional description"
                />
              </div>

              <div>
                <label className="label">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="input"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary">
                  {editingTx ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
