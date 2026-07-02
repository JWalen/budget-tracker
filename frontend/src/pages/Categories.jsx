import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Plus, Pencil, Trash2, X, Tags } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { useToast } from '../context/ToastContext';

const colorOptions = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981',
  '#14b8a6', '#06b6d4', '#0ea5e9', '#6366f1', '#8b5cf6',
  '#a855f7', '#ec4899', '#f43f5e', '#6b7280',
];

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const { activeBudgetOwner, isReadOnly } = useBudget();
  const toast = useToast();

  const [form, setForm] = useState({
    name: '',
    type: 'expense',
    color: '#6366f1',
    exclude_from_income: false,
  });

  useEffect(() => {
    loadData();
  }, [activeBudgetOwner?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.getCategories();
      setCategories(data);
    } catch (err) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (cat = null) => {
    if (cat) {
      setEditing(cat);
      setForm({
        name: cat.name,
        type: cat.type,
        color: cat.color,
        exclude_from_income: cat.exclude_from_income || false,
      });
    } else {
      setEditing(null);
      setForm({
        name: '',
        type: 'expense',
        color: '#6366f1',
        exclude_from_income: false,
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
      if (editing) {
        await api.updateCategory(editing.id, form);
        toast.success('Category updated');
      } else {
        await api.createCategory(form);
        toast.success('Category created');
      }
      closeModal();
      loadData();
    } catch (err) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this category? Transactions using it will become uncategorized.')) return;
    try {
      await api.deleteCategory(id);
      toast.success('Category deleted');
      loadData();
    } catch (err) {
      toast.error(err.message || 'Something went wrong');
    }
  };

  const incomeCategories = categories.filter((c) => c.type === 'income');
  const expenseCategories = categories.filter((c) => c.type === 'expense');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const CategorySection = ({ title, items, color }) => (
    <div>
      <h2 className={`text-lg font-semibold mb-3 ${color}`}>{title}</h2>
      {items.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">No categories yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="font-medium text-gray-900 dark:text-gray-100">{cat.name}</span>
                {cat.exclude_from_income && (
                  <span className="ml-2 text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded">
                    excluded
                  </span>
                )}
              </div>
              {!isReadOnly && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openModal(cat)}
                    className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(cat.id)}
                    className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Categories</h1>
        {!isReadOnly && (
          <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
            <Plus size={20} />
            <span>Add Category</span>
          </button>
        )}
      </div>

      {/* Info card */}
      <div className="bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700 rounded-xl p-4">
        <p className="text-primary-800 dark:text-primary-300">
          Customize your categories to match how you think about your money. Add, edit, or remove categories anytime.
        </p>
      </div>

      {/* Category lists */}
      <div className="card space-y-8">
        <CategorySection title="Income Categories" items={incomeCategories} color="text-green-600" />
        <CategorySection title="Expense Categories" items={expenseCategories} color="text-red-600" />
      </div>

      {/* Modal */}
      {!isReadOnly && showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold">
                {editing ? 'Edit Category' : 'New Category'}
              </h2>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="label">Category Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input"
                  placeholder="e.g., Groceries"
                  required
                />
              </div>

              {!editing && (
                <div>
                  <label className="label">Type</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, type: 'expense' })}
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
                      onClick={() => setForm({ ...form, type: 'income' })}
                      className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                        form.type === 'income'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                      }`}
                    >
                      Income
                    </button>
                  </div>
                </div>
              )}

              {form.type === 'income' && (
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="exclude_from_income"
                    checked={form.exclude_from_income}
                    onChange={(e) => setForm({ ...form, exclude_from_income: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label htmlFor="exclude_from_income" className="text-sm text-gray-700 dark:text-gray-300">
                    Exclude from income totals
                  </label>
                </div>
              )}

              <div>
                <label className="label">Color</label>
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setForm({ ...form, color })}
                      className={`w-8 h-8 rounded-full transition-transform ${
                        form.color === color ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
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
