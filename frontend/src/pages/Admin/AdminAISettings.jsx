import { useState, useEffect } from 'react';
import { Power, Save, CheckCircle, AlertCircle, KeyRound, Trash2, Sparkles } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

const DEFAULT_CONFIG = { ai_enabled: 'false', ai_provider: 'claude', ai_model: '' };

const CUSTOM = '__custom__';

const PROVIDERS = [
  {
    id: 'claude',
    name: 'Claude (Anthropic)',
    defaultModel: 'claude-opus-4-8',
    keyField: 'anthropic_api_key',
    keyLabel: 'Anthropic API key',
    keyPlaceholder: 'sk-ant-...',
    models: [
      { value: 'claude-opus-4-8', label: 'Claude Opus 4.8 — most capable' },
      { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — balanced' },
      { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — fastest & cheapest' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    defaultModel: 'gpt-4o',
    keyField: 'openai_api_key',
    keyLabel: 'OpenAI API key',
    keyPlaceholder: 'sk-...',
    models: [
      { value: 'gpt-4o', label: 'GPT-4o — balanced' },
      { value: 'gpt-4o-mini', label: 'GPT-4o mini — fastest & cheapest' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    ],
  },
];

export default function AdminAISettings() {
  const toast = useToast();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [keysConfigured, setKeysConfigured] = useState({ claude: false, openai: false });
  const [available, setAvailable] = useState(false);
  const [keyInputs, setKeyInputs] = useState({ anthropic_api_key: '', openai_api_key: '' });
  const [showCustomModel, setShowCustomModel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/ai/settings', { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to load AI settings');
      const data = await res.json();
      setConfig({ ...DEFAULT_CONFIG, ...(data.config || {}) });
      setKeysConfigured(data.keysConfigured || { claude: false, openai: false });
      setAvailable(!!data.available);
    } catch (error) {
      console.error('Failed to load AI settings', error);
      toast.error(error.message || 'Failed to load AI settings');
    } finally {
      setLoading(false);
    }
  };

  const activeProvider = PROVIDERS.find((p) => p.id === config.ai_provider) || PROVIDERS[0];

  // A stored model that isn't one of the curated options is treated as "Custom".
  const knownModel = activeProvider.models.some((m) => m.value === config.ai_model);
  const isCustomModel = showCustomModel || (!!config.ai_model && !knownModel);
  const modelSelectValue = isCustomModel ? CUSTOM : (config.ai_model || activeProvider.defaultModel);

  const handleModelSelect = (e) => {
    const val = e.target.value;
    if (val === CUSTOM) {
      setShowCustomModel(true);
    } else {
      setShowCustomModel(false);
      setConfig((c) => ({ ...c, ai_model: val }));
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const body = {
        ai_enabled: config.ai_enabled === 'true',
        ai_provider: config.ai_provider,
        ai_model: config.ai_model,
      };
      // Only send key fields the admin actually typed into.
      if (keyInputs.anthropic_api_key.trim()) body.anthropic_api_key = keyInputs.anthropic_api_key.trim();
      if (keyInputs.openai_api_key.trim()) body.openai_api_key = keyInputs.openai_api_key.trim();

      const res = await fetch('/api/admin/ai/settings', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save settings');
      toast.success('Settings saved successfully');
      setKeyInputs({ anthropic_api_key: '', openai_api_key: '' });
      loadData();
    } catch (error) {
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveKey = async (providerId) => {
    try {
      const res = await fetch(`/api/admin/ai/settings/key/${providerId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error('Failed to remove API key');
      toast.success('API key removed');
      loadData();
    } catch (error) {
      toast.error(error.message || 'Failed to remove API key');
    }
  };

  if (loading) return <div className="p-8 text-center">Loading settings...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">AI Configuration</h1>
          <p className="text-gray-600 dark:text-gray-400">Connect Claude or OpenAI to power the AI assistant</p>
        </div>
        <div className={`px-4 py-2 rounded-full flex items-center gap-2 ${available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          <div className={`w-3 h-3 rounded-full ${available ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="font-medium">{available ? 'AI Ready' : 'AI Offline'}</span>
        </div>
      </div>

      {/* Main Settings Card */}
      <div className="card space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <Power className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Enable AI Features</h3>
              <p className="text-sm text-gray-500">Master switch for all AI functionality</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={config.ai_enabled === 'true'}
              onChange={(e) => setConfig({ ...config, ai_enabled: e.target.checked ? 'true' : 'false' })}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="label">Provider</label>
            <select
              className="input w-full"
              value={config.ai_provider}
              onChange={(e) => {
                setShowCustomModel(false);
                setConfig({ ...config, ai_provider: e.target.value, ai_model: '' });
              }}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Model</label>
            <select className="input w-full" value={modelSelectValue} onChange={handleModelSelect}>
              {activeProvider.models.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
              <option value={CUSTOM}>Custom…</option>
            </select>
            {isCustomModel && (
              <input
                type="text"
                className="input w-full mt-2"
                value={config.ai_model}
                placeholder={`Custom model id (default: ${activeProvider.defaultModel})`}
                onChange={(e) => setConfig({ ...config, ai_model: e.target.value })}
              />
            )}
            <p className="text-xs text-gray-500 mt-1">
              Default for this provider: <span className="font-mono">{activeProvider.defaultModel}</span>.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving} className="btn btn-primary disabled:opacity-50 flex items-center gap-2">
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>

      {/* API Keys */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <KeyRound className="w-5 h-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">API Keys</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Keys are encrypted at rest and never shown again after saving. Enter a value to add or replace a key; leave blank to keep the existing one.
        </p>

        <div className="space-y-5">
          {PROVIDERS.map((p) => (
            <div key={p.id}>
              <div className="flex items-center justify-between mb-1">
                <label className="label mb-0">{p.keyLabel}</label>
                {keysConfigured[p.id] ? (
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle size={10} /> Configured
                  </span>
                ) : (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <AlertCircle size={10} /> Not set
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  autoComplete="new-password"
                  className="input w-full"
                  placeholder={keysConfigured[p.id] ? '•••••••• (leave blank to keep)' : p.keyPlaceholder}
                  value={keyInputs[p.keyField]}
                  onChange={(e) => setKeyInputs({ ...keyInputs, [p.keyField]: e.target.value })}
                />
                {keysConfigured[p.id] && (
                  <button
                    onClick={() => handleRemoveKey(p.id)}
                    className="btn btn-secondary flex items-center gap-1 whitespace-nowrap"
                    title="Remove stored key"
                  >
                    <Trash2 className="w-4 h-4" /> Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info */}
      <div className="card bg-primary-50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/30">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-primary-600 mt-0.5" />
          <div className="text-sm text-gray-600 dark:text-gray-300">
            <p className="font-medium text-gray-900 dark:text-gray-100 mb-1">How it works</p>
            <p>
              The assistant sends your budget data to the selected provider's API to generate insights, categorize
              transactions, and answer questions. Enable AI, pick a provider, add its API key, and save. Get keys from{' '}
              <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">console.anthropic.com</a>
              {' '}or{' '}
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">platform.openai.com</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
