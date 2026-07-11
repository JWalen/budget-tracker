import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useBudget } from '../context/BudgetContext';
import { useToast } from '../context/ToastContext';
import { Plus, Trash2, X, Target, Zap, FileText, DollarSign, PlayCircle, Edit2 } from 'lucide-react';

export default function MatchRules() {
  const toast = useToast();
  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [bills, setBills] = useState([]);
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [applyingRules, setApplyingRules] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const { isReadOnly } = useBudget();

  const [form, setForm] = useState({
    name: '',
    pattern: '',
    target_type: 'category',
    target_id: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [rulesData, catData, billsData, debtsData] = await Promise.all([
        api.getImportRules(),
        api.getCategories(),
        api.getBills(),
        api.getDebts(),
      ]);
      setRules(rulesData);
      setCategories(catData);
      setBills(billsData.filter(b => b.is_active));
      setDebts(debtsData.filter(d => !d.is_paid));
    } catch (error) {
      toast.error(error.message || 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  };

  const openModal = (rule = null) => {
    if (rule) {
      setEditingRule(rule);
      setForm({
        name: rule.name,
        pattern: rule.pattern,
        target_type: rule.target_type,
        target_id: rule.target_id.toString(),
        category_id: rule.category_id ? rule.category_id.toString() : '',
      });
    } else {
      setEditingRule(null);
      setForm({
        name: '',
        pattern: '',
        target_type: 'category',
        target_id: '',
        category_id: '',
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingRule(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const ruleData = {
        name: form.name,
        pattern: form.pattern,
        target_type: form.target_type,
        target_id: parseInt(form.target_id),
        ...(form.target_type === 'bill' && form.category_id ? { category_id: parseInt(form.category_id) } : {}),
      };

      if (editingRule) {
        // Update existing rule
        await api.updateImportRule(editingRule.id, ruleData);
        toast.success('Rule updated');
      } else {
        // Create new rule
        await api.createImportRule(ruleData);
        toast.success('Rule created');
      }
      closeModal();
      loadData();
    } catch (error) {
      toast.error(error.message || 'Failed to save rule');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this auto-categorization rule?')) return;
    try {
      await api.deleteImportRule(id);
      toast.success('Rule deleted');
      loadData();
    } catch (error) {
      toast.error(error.message || 'Failed to delete rule');
    }
  };

  const applyRulesToExisting = async () => {
    if (!confirm('Apply all rules to uncategorized transactions?\n\nThis will update any transactions that don\'t have a category assigned yet.')) {
      return;
    }

    setApplyingRules(true);
    try {
      const result = await api.applyRulesToExisting();
      if (result.updatedCount > 0) {
        toast.success(`Successfully categorized ${result.updatedCount} transaction(s)!`);
      } else {
        toast.info('No uncategorized transactions matched your rules.');
      }
    } catch (error) {
      toast.error(error.message || 'Failed to apply rules');
    } finally {
      setApplyingRules(false);
    }
  };

  const getTargetName = (rule) => {
    if (rule.target_type === 'category') {
      const cat = categories.find(c => c.id === rule.target_id);
      return cat ? cat.name : 'Unknown Category';
    } else if (rule.target_type === 'bill') {
      const bill = bills.find(b => b.id === rule.target_id);
      let name = bill ? bill.name : 'Unknown Bill';
      // If there's also a category, show it
      if (rule.category_id) {
        const cat = categories.find(c => c.id === rule.category_id);
        if (cat) {
          name += ` + ${cat.name}`;
        }
      }
      return name;
    } else if (rule.target_type === 'debt') {
      const debt = debts.find(d => d.id === rule.target_id);
      return debt ? debt.name : 'Unknown Debt';
    }
    return 'Unknown';
  };

  const getTargetIcon = (type) => {
    switch (type) {
      case 'category':
        return <Target size={16} className="text-blue-600" />;
      case 'bill':
        return <FileText size={16} className="text-green-600" />;
      case 'debt':
        return <DollarSign size={16} className="text-orange-600" />;
      default:
        return null;
    }
  };

  const getTargetOptions = () => {
    if (form.target_type === 'category') {
      return categories;
    } else if (form.target_type === 'bill') {
      return bills;
    } else if (form.target_type === 'debt') {
      return debts;
    }
    return [];
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Auto-Categorization Rules</h1>
        {!isReadOnly && (
          <div className="flex items-center gap-3">
            {rules.length > 0 && (
              <button
                onClick={applyRulesToExisting}
                className="btn-secondary flex items-center gap-2"
                disabled={applyingRules}
              >
                {applyingRules ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                    <span>Applying...</span>
                  </>
                ) : (
                  <>
                    <PlayCircle size={20} />
                    <span>Apply to Existing</span>
                  </>
                )}
              </button>
            )}
            <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
              <Plus size={20} />
              <span>New Rule</span>
            </button>
          </div>
        )}
      </div>

      {/* Info card */}
      <div className="bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="text-primary-600" size={20} />
          <span className="font-semibold text-primary-800 dark:text-primary-300">How it works</span>
        </div>
        <p className="text-primary-700 dark:text-primary-300 text-sm">
          Create rules to automatically categorize transactions when importing. Rules match transaction descriptions
          using patterns and assign them to categories, bills, or debts. For example, "STARBUCKS" → "Coffee" category.
        </p>
      </div>

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="card text-center py-12">
          <Zap className="w-12 h-12 text-gray-300 dark:text-gray-500 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">No auto-categorization rules yet.</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
            Create rules to automatically categorize imported transactions.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rules.map((rule) => (
            <div key={rule.id} className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{rule.name}</h3>
                {!isReadOnly && (
                  <div className="flex items-center gap-1">
                    <button aria-label="Edit rule"
                      onClick={() => openModal(rule)}
                      className="p-2 text-gray-400 dark:text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
                      title="Edit rule"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button aria-label="Delete rule"
                      onClick={() => handleDelete(rule.id)}
                      className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                      title="Delete rule"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400">Pattern:</span>
                  <code className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">
                    {rule.pattern}
                  </code>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400">Action:</span>
                  <div className="flex items-center gap-2">
                    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      rule.target_type === 'category'
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : rule.target_type === 'bill'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                    }`}>
                      {getTargetIcon(rule.target_type)}
                      <span>
                        {rule.target_type === 'category' && 'Categorize as'}
                        {rule.target_type === 'bill' && 'Pay bill'}
                        {rule.target_type === 'debt' && 'Debt payment'}
                      </span>
                    </div>
                    {rule.target_type === 'bill' && rule.category_id && (
                      <>
                        <span className="text-xs text-gray-400">+</span>
                        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                          <Target size={14} />
                          <span>Categorize</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <span className="text-gray-500 dark:text-gray-400">Target:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {getTargetName(rule)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {!isReadOnly && showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-lg font-semibold">{editingRule ? 'Edit' : 'Create'} Auto-Categorization Rule</h2>
              <button aria-label="Close" onClick={closeModal} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="label">Rule Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input"
                  placeholder="e.g., Coffee Shops"
                  required
                />
              </div>

              <div>
                <label className="label">Pattern to Match</label>
                <input
                  type="text"
                  value={form.pattern}
                  onChange={(e) => setForm({ ...form, pattern: e.target.value.toUpperCase() })}
                  className="input"
                  placeholder="e.g., STARBUCKS"
                  required
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Case-insensitive partial match. Will match any transaction containing this text.
                </p>
              </div>

              <div>
                <label className="label">What should this rule do?</label>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input
                      type="radio"
                      name="targetType"
                      value="category"
                      checked={form.target_type === 'category'}
                      onChange={(e) => setForm({ ...form, target_type: e.target.value, target_id: '' })}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Target size={16} className="text-blue-600" />
                        <span className="font-medium">Assign to Category</span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Automatically categorize transactions for budgeting and reports
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input
                      type="radio"
                      name="targetType"
                      value="bill"
                      checked={form.target_type === 'bill'}
                      onChange={(e) => setForm({ ...form, target_type: e.target.value, target_id: '' })}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <FileText size={16} className="text-green-600" />
                        <span className="font-medium">Link to Bill</span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Mark transactions as bill payments for tracking
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                    <input
                      type="radio"
                      name="targetType"
                      value="debt"
                      checked={form.target_type === 'debt'}
                      onChange={(e) => setForm({ ...form, target_type: e.target.value, target_id: '' })}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <DollarSign size={16} className="text-orange-600" />
                        <span className="font-medium">Track Debt Payment</span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Record transactions as debt payments
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="label">
                  Select {form.target_type === 'category' ? 'Category' : form.target_type === 'bill' ? 'Bill' : 'Debt'} to map to:
                </label>
                <select
                  value={form.target_id}
                  onChange={(e) => setForm({ ...form, target_id: e.target.value })}
                  className="input"
                  required
                >
                  <option value="">
                    Choose a {form.target_type === 'category' ? 'category' : form.target_type === 'bill' ? 'bill' : 'debt'}...
                  </option>
                  {getTargetOptions().map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {form.target_type === 'category' && item.type && ` (${item.type})`}
                      {form.target_type === 'bill' && item.amount && ` - ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.amount)}`}
                      {form.target_type === 'debt' && item.balance && ` - Balance: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.balance)}`}
                    </option>
                  ))}
                </select>
                {getTargetOptions().length === 0 && (
                  <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                    No {form.target_type === 'category' ? 'categories' : form.target_type === 'bill' ? 'active bills' : 'unpaid debts'} available.
                    Please create one first.
                  </p>
                )}
              </div>

              {/* Show category selection for bill rules */}
              {form.target_type === 'bill' && form.target_id && (
                <div>
                  <label className="label">
                    Also categorize as (optional):
                  </label>
                  <select
                    value={form.category_id || ''}
                    onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                    className="input"
                  >
                    <option value="">No category (bill payment only)</option>
                    {categories
                      .filter(cat => cat.type === 'expense')
                      .map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Selecting a category will both mark the transaction as a bill payment AND categorize it for budgeting.
                  </p>
                </div>
              )}
              </div>

              <div className="flex gap-3 p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
                <button type="button" onClick={closeModal} className="flex-1 btn-secondary" disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : editingRule ? 'Update Rule' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}