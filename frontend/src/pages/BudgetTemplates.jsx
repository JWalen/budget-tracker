import { useState, useEffect } from 'react';
import { Sparkles, Loader2, Check } from 'lucide-react';
import api from '../api/client';

export default function BudgetTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await api.getBudgetTemplates();
      setTemplates(data);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyTemplate = async (templateId) => {
    try {
      await api.applyBudgetTemplate(templateId);
      alert('Template applied successfully!');
    } catch (error) {
      console.error('Failed to apply template:', error);
      alert('Failed to apply template');
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
              onClick={() => handleApplyTemplate(template.id)}
              className="btn btn-primary w-full"
            >
              Apply Template
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
            Budget templates are available on Pro and Business plans
          </p>
        </div>
      )}
    </div>
  );
}
