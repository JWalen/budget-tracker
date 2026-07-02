import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useBudget } from '../context/BudgetContext';
import {
  Plus,
  Trash2,
  X,
  Target,
  ChevronLeft,
  ChevronRight,
  Copy,
  Calendar,
  Check,
  Edit2,
} from 'lucide-react';

import { formatCurrency, MONTHS } from '../utils/format';

export default function Budgets() {
  const [budgets, setBudgets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState(null);
  const [editForm, setEditForm] = useState({
    amount_limit: '',
    applyToAllMonths: true,  // Default to syncing across all months
  });
  const [currentDate, setCurrentDate] = useState(new Date());
  const { activeBudgetOwner, isReadOnly } = useBudget();

  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();

  const [form, setForm] = useState({
    category_id: '',
    amount_limit: '',
  });

  // Copy modal state
  const [copyForm, setCopyForm] = useState({
    targetMonths: [],
    copyMode: 'rest-of-year', // 'rest-of-year', 'all-year', 'specific'
  });

  useEffect(() => {
    loadData();
  }, [month, year, activeBudgetOwner?.id]);

  const loadData = async () => {
    try {
      const [budgetData, catData] = await Promise.all([
        api.getBudgets({ month, year }),
        api.getCategories(),
      ]);
      setBudgets(budgetData);
      setCategories(catData.filter((c) => c.type === 'expense'));
    } catch (error) {
      console.error('Failed to load budgets:', error);
    } finally {
      setLoading(false);
    }
  };

  const goToPrevMonth = () => setCurrentDate(new Date(year, month - 2, 1));
  const goToNextMonth = () => setCurrentDate(new Date(year, month, 1));

  const openModal = () => {
    setForm({ category_id: '', amount_limit: '' });
    setShowModal(true);
  };

  const closeModal = () => setShowModal(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.createBudget({
        category_id: parseInt(form.category_id),
        amount_limit: parseFloat(form.amount_limit),
        month,
        year,
      });
      closeModal();
      loadData();
    } catch (error) {
      console.error('Failed to create budget:', error);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this budget limit?')) return;
    try {
      await api.deleteBudget(id);
      loadData();
    } catch (error) {
      console.error('Failed to delete budget:', error);
    }
  };

  const openEditModal = (budget) => {
    setEditingBudget(budget);
    setEditForm({
      amount_limit: budget.amount_limit,
      applyToAllMonths: true,
    });
    setShowEditModal(true);
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    try {
      if (editForm.applyToAllMonths) {
        // Update this category's budget for all months in the year
        await api.updateBudgetAllMonths({
          category_id: editingBudget.category_id,
          amount_limit: parseFloat(editForm.amount_limit),
          year,
        });
      } else {
        // Update only this month's budget
        await api.updateBudget(editingBudget.id, {
          amount_limit: parseFloat(editForm.amount_limit),
        });
      }
      setShowEditModal(false);
      loadData();

      if (editForm.applyToAllMonths) {
        alert(`Budget updated for all months in ${year}`);
      }
    } catch (error) {
      console.error('Failed to update budget:', error);
      alert('Failed to update budget. Please try again.');
    }
  };

  const handleCopyBudgets = async () => {
    try {
      let targetMonths = [];

      if (copyForm.copyMode === 'rest-of-year') {
        // Copy to all remaining months in the year
        for (let m = month + 1; m <= 12; m++) {
          targetMonths.push(m);
        }
      } else if (copyForm.copyMode === 'all-year') {
        // Copy to all months except current
        for (let m = 1; m <= 12; m++) {
          if (m !== month) targetMonths.push(m);
        }
      } else if (copyForm.copyMode === 'specific') {
        // Use selected months
        targetMonths = copyForm.targetMonths;
      }

      if (targetMonths.length === 0) {
        alert('Please select at least one month to copy to.');
        return;
      }

      // Copy budgets to each selected month
      await api.copyBudgets({
        sourceMonth: month,
        sourceYear: year,
        targetMonths,
        targetYear: year,
      });

      setShowCopyModal(false);
      setCopyForm({ targetMonths: [], copyMode: 'rest-of-year' });

      // Show success message
      alert(`Budgets copied to ${targetMonths.length} month(s) successfully!`);
    } catch (error) {
      console.error('Failed to copy budgets:', error);
      alert('Failed to copy budgets. Please try again.');
    }
  };

  // Categories that don't have a budget yet
  const availableCategories = categories.filter(
    (c) => !budgets.find((b) => b.category_id === c.id)
  );

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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Budgets</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button onClick={goToPrevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              <ChevronLeft size={20} />
            </button>
            <span className="font-medium text-gray-900 dark:text-gray-100 min-w-[140px] text-center">
              {MONTHS[month - 1]} {year}
            </span>
            <button onClick={goToNextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              <ChevronRight size={20} />
            </button>
          </div>
          {!isReadOnly && availableCategories.length > 0 && (
            <button onClick={openModal} className="btn-primary flex items-center gap-2">
              <Plus size={20} />
              <span>Set Budget</span>
            </button>
          )}
        </div>
      </div>

      {/* Info card */}
      <div className="bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700 rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <p className="text-primary-800 dark:text-primary-300">
            Set spending limits for your categories. Budgets are optional - only set them where you want to track spending.
          </p>
          {!isReadOnly && budgets.length > 0 && (
            <button
              onClick={() => setShowCopyModal(true)}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Copy size={16} />
              <span>Copy to Other Months</span>
            </button>
          )}
        </div>
      </div>

      {/* Budget list */}
      {budgets.length === 0 ? (
        <div className="card text-center py-12">
          <Target className="w-12 h-12 text-gray-300 dark:text-gray-500 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">No budgets set for this month.</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
            Click "Set Budget" to add spending limits.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {budgets.map((budget) => {
            const spent = parseFloat(budget.spent);
            const limit = parseFloat(budget.amount_limit);
            const percent = Math.min((spent / limit) * 100, 100);
            const remaining = limit - spent;
            const isOver = spent > limit;

            return (
              <div key={budget.id} className="card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: budget.category_color }}
                    />
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{budget.category_name}</h3>
                  </div>
                  {!isReadOnly && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(budget)}
                        className="p-2 text-gray-400 dark:text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
                        title="Edit budget"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(budget.id)}
                        className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                        title="Delete budget"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="mb-2">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">Spent</span>
                    <span className={isOver ? 'text-red-600 font-medium' : 'text-gray-900 dark:text-gray-100'}>
                      {formatCurrency(spent)}
                    </span>
                  </div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isOver
                          ? 'bg-red-500'
                          : percent > 80
                          ? 'bg-amber-500'
                          : 'bg-green-500'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Budget: {formatCurrency(limit)}</span>
                  <span className={isOver ? 'text-red-600' : 'text-green-600'}>
                    {isOver ? 'Over by ' : 'Left: '}
                    {formatCurrency(Math.abs(remaining))}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {!isReadOnly && showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Set Budget Limit</h2>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="label">Category</label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="input"
                  required
                >
                  <option value="">Select category</option>
                  {availableCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Monthly Limit</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount_limit}
                  onChange={(e) => setForm({ ...form, amount_limit: e.target.value })}
                  className="input"
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary">
                  Set Budget
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Budget Modal */}
      {!isReadOnly && showEditModal && editingBudget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Edit Budget</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEdit} className="p-4 space-y-4">
              <div>
                <label className="label">Category</label>
                <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-900 rounded">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: editingBudget.category_color }}
                  />
                  <span className="font-medium">{editingBudget.category_name}</span>
                </div>
              </div>

              <div>
                <label className="label">Monthly Limit</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.amount_limit}
                  onChange={(e) => setEditForm({ ...editForm, amount_limit: e.target.value })}
                  className="input"
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={editForm.applyToAllMonths}
                    onChange={(e) => setEditForm({ ...editForm, applyToAllMonths: e.target.checked })}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-medium text-blue-900 dark:text-blue-100">
                      Apply to all months in {year}
                    </div>
                    <div className="text-sm text-blue-700 dark:text-blue-300">
                      Automatically update this category's budget for every month where it exists
                    </div>
                  </div>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowEditModal(false)} className="flex-1 btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary">
                  Update Budget
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Copy Budgets Modal */}
      {!isReadOnly && showCopyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Copy Budgets to Other Months</h2>
              <button
                onClick={() => setShowCopyModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Copy all budgets from {MONTHS[month - 1]} {year} to:
              </div>

              <div className="space-y-3">
                <label className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="copyMode"
                    value="rest-of-year"
                    checked={copyForm.copyMode === 'rest-of-year'}
                    onChange={(e) => setCopyForm({ ...copyForm, copyMode: e.target.value })}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-medium">Rest of {year}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Copy to all remaining months in {year}
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="copyMode"
                    value="all-year"
                    checked={copyForm.copyMode === 'all-year'}
                    onChange={(e) => setCopyForm({ ...copyForm, copyMode: e.target.value })}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-medium">Entire Year</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Copy to all 12 months of {year}
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="copyMode"
                    value="specific"
                    checked={copyForm.copyMode === 'specific'}
                    onChange={(e) => setCopyForm({ ...copyForm, copyMode: e.target.value })}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-medium">Specific Months</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Choose which months to copy to
                    </div>
                  </div>
                </label>
              </div>

              {copyForm.copyMode === 'specific' && (
                <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  {MONTHS.map((monthName, idx) => {
                    const monthNum = idx + 1;
                    const isCurrentMonth = monthNum === month;
                    const isSelected = copyForm.targetMonths.includes(monthNum);

                    return (
                      <label
                        key={monthNum}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                          isCurrentMonth
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isCurrentMonth}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCopyForm({
                                ...copyForm,
                                targetMonths: [...copyForm.targetMonths, monthNum],
                              });
                            } else {
                              setCopyForm({
                                ...copyForm,
                                targetMonths: copyForm.targetMonths.filter((m) => m !== monthNum),
                              });
                            }
                          }}
                        />
                        <span className="text-sm">{monthName.slice(0, 3)}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowCopyModal(false)}
                  className="flex-1 btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCopyBudgets}
                  className="flex-1 btn-primary flex items-center justify-center gap-2"
                >
                  <Check size={16} />
                  <span>Copy Budgets</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
