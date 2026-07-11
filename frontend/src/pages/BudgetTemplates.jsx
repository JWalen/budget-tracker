import { useState, useEffect } from 'react';
import { Sparkles, Loader2, Check } from 'lucide-react';
import api from '../api/client';
import { useToast } from '../context/ToastContext';

export default function BudgetTemplates() {
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [income, setIncome] = useState('');
  const [applyingId, setApplyingId] = useState(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await api.getBudgetTemplates();
      setTemplates(data);
    } catch (error) {
      console.error('Failed to load templates:', error);
      toast.error(error.message || 'Could not load templates');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyTemplate = async (template) => {
    // Percentage-based templates need a monthly income to compute amounts.
    const needsIncome = template.type !== 'envelope';
    const incomeValue = Number(income);
    if (needsIncome && (!Number.isFinite(incomeValue) || incomeValue <= 0)) {
      toast.error('Enter your monthly income first to apply this template');
      return;
    }

    const now = new Date();
    setApplyingId(template.id);
    try {
      const result = await api.applyBudgetTemplate(template.id, {
        income: needsIncome ? incomeValue : undefined,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      });
      toast.success(result.message || 'Template applied successfully');
    } catch (error) {
      console.error('Failed to apply template:', error);
      toast.error(error.message || 'Failed to apply template');
    } finally {
      setApplyingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Budget Templates</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Choose a pre-built budgeting strategy
        </p>
      </div>

      <div className="card">
        <label htmlFor="template-income" className="label">Monthly income</label>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
          Used to calculate percentage-based budgets (e.g. 50/30/20). Applied to the current month.
        </p>
        <div className="relative max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
          <input
            id="template-income"
            type="number"
            min="0"
            step="0.01"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
            placeholder="0.00"
            className="input pl-7"
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {templates.map((template) => (
          <div key={template.id} className="card">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-12 h-12 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-6 h-6 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {template.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {template.description}
                </p>
              </div>
            </div>

            {template.rules && (
              <div className="space-y-2 mb-4">
                {Object.entries(template.rules).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">
                      {key}: {value}%
                    </span>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => handleApplyTemplate(template)}
              disabled={applyingId === template.id}
              className="btn-primary w-full"
            >
              {applyingId === template.id ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Applying…
                </>
              ) : (
                'Apply Template'
              )}
            </button>
          </div>
        ))}
      </div>

      {templates.length === 0 && (
        <div className="card text-center py-12">
          <Sparkles className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            No Templates Available
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            No templates available yet
          </p>
        </div>
      )}
    </div>
  );
}
