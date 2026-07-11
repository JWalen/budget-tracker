import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useBudget } from '../context/BudgetContext';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  RefreshCw,
  Play,
  Pause,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

import { formatCurrency, formatDateOnly } from '../utils/format';
import { useToast } from '../context/ToastContext';

const frequencies = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

export default function Recurring() {
  const [recurring, setRecurring] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  const { activeBudgetOwner, isReadOnly } = useBudget();
  const toast = useToast();

  const [form, setForm] = useState({
    type: 'expense',
    category_id: '',
    amount: '',
    description: '',
    frequency: 'monthly',
    next_date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    loadData();
  }, [activeBudgetOwner?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [recData, catData] = await Promise.all([
        api.getRecurring(),
        api.getCategories(),
      ]);
      setRecurring(recData);
      setCategories(catData);
    } catch (err) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (item = null) => {
    if (item) {
      setEditing(item);
      setForm({
        type: item.type,
        category_id: item.category_id || '',
        amount: item.amount,
        description: item.description || '',
        frequency: item.frequency,
        next_date: item.next_date
          ? item.next_date.split('T')[0]
          : new Date().toISOString().split('T')[0],
      });
    } else {
      setEditing(null);
      setForm({
        type: 'expense',
        category_id: '',
        amount: '',
        description: '',
        frequency: 'monthly',
        next_date: new Date().toISOString().split('T')[0],
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const data = {
        ...form,
        amount: parseFloat(form.amount) || 0,
        category_id: form.category_id || null,
      };

      if (editing) {
        await api.updateRecurring(editing.id, { ...data, active: editing.active });
        toast.success('Recurring transaction updated');
      } else {
        await api.createRecurring(data);
        toast.success('Recurring transaction created');
      }
      closeModal();
      loadData();
    } catch (err) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (item) => {
    if (togglingId === item.id) return;
    setTogglingId(item.id);
    try {
      await api.updateRecurring(item.id, {
        ...item,
        active: !item.active,
      });
      toast.success(item.active ? 'Recurring paused' : 'Recurring resumed');
      loadData();
    } catch (err) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this recurring transaction?')) return;
    try {
      await api.deleteRecurring(id);
      toast.success('Recurring transaction deleted');
      loadData();
    } catch (err) {
      toast.error(err.message || 'Something went wrong');
    }
  };

  const handleProcess = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      const result = await api.processRecurring();
      if (result.processed > 0) {
        toast.success(`Created ${result.processed} transaction(s) from recurring items.`);
      } else {
        toast.info('No recurring transactions are due yet.');
      }
      loadData();
    } catch (err) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setProcessing(false);
    }
  };

  const filteredCategories = categories.filter((c) => c.type === form.type);

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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Recurring Transactions</h1>
        <div className="flex items-center gap-3">
          {!isReadOnly && (
            <button onClick={handleProcess} disabled={processing} className="btn-secondary flex items-center gap-2 disabled:opacity-50">
              <RefreshCw size={20} />
              <span>{processing ? 'Processing...' : 'Process Due'}</span>
            </button>
          )}
          {!isReadOnly && (
            <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
              <Plus size={20} />
              <span>Add Recurring</span>
            </button>
          )}
        </div>
      </div>

      {/* Info card */}
      <div className="bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700 rounded-xl p-4">
        <p className="text-primary-800 dark:text-primary-300">
          Set up recurring transactions for regular income or expenses. Click "Process Due" to create transactions from items that are due.
        </p>
      </div>

      {/* Recurring list */}
      {recurring.length === 0 ? (
        <div className="card text-center py-12">
          <RefreshCw className="w-12 h-12 text-gray-300 dark:text-gray-500 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">No recurring transactions set up.</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
            Add recurring income or expenses that happen regularly.
          </p>
        </div>
      ) : (
        <div className="card p-0 divide-y divide-gray-100 dark:divide-gray-700">
          {recurring.map((item) => (
            <div
              key={item.id}
              className={`flex items-center justify-between p-4 ${
                !item.active ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`p-2 rounded-lg ${
                    item.type === 'income' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
                  }`}
                >
                  {item.type === 'income' ? (
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-red-600" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {item.description || item.category_name || 'Uncategorized'}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <span className="capitalize">{item.frequency}</span>
                    <span>•</span>
                    <span>Next: {formatDateOnly(item.next_date)}</span>
                    {item.category_name && (
                      <>
                        <span>•</span>
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: `${item.category_color}20`,
                            color: item.category_color,
                          }}
                        >
                          {item.category_name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span
                  className={`font-semibold ${
                    item.type === 'income' ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {item.type === 'income' ? '+' : '-'}
                  {formatCurrency(item.amount)}
                </span>
                {!isReadOnly && (
                  <div className="flex items-center gap-1">
                    <button aria-label="Toggle recurring transaction"
                      onClick={() => handleToggleActive(item)}
                      disabled={togglingId === item.id}
                      className={`p-2 rounded-lg disabled:opacity-50 ${
                        item.active
                          ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30'
                          : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                      title={item.active ? 'Pause' : 'Resume'}
                    >
                      {item.active ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <button aria-label="Edit recurring transaction"
                      onClick={() => openModal(item)}
                      className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    >
                      <Pencil size={16} />
                    </button>
                    <button aria-label="Delete recurring transaction"
                      onClick={() => handleDelete(item.id)}
                      className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {!isReadOnly && showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold">
                {editing ? 'Edit Recurring' : 'New Recurring Transaction'}
              </h2>
              <button aria-label="Close" onClick={closeModal} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
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
                  placeholder="e.g., Netflix subscription"
                />
              </div>

              <div>
                <label className="label">Frequency</label>
                <select
                  value={form.frequency}
                  onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                  className="input"
                  required
                >
                  {frequencies.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Next Due Date</label>
                <input
                  type="date"
                  value={form.next_date}
                  onChange={(e) => setForm({ ...form, next_date: e.target.value })}
                  className="input"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : editing ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
