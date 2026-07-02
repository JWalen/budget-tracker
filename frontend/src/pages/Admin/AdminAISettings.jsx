import { useState, useEffect } from 'react';
import { Cpu, Database, Download, Power, Server, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../../api/client';
import { useToast } from '../../context/ToastContext';

const DEFAULT_CONFIG = { ai_enabled: 'false', ai_model: '', ai_auto_gpu: 'true' };

export default function AdminAISettings() {
  const toast = useToast();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [capabilities, setCapabilities] = useState(null);
  const [models, setModels] = useState([]);
  const [isOllamaRunning, setIsOllamaRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pullingModel, setPullingModel] = useState(false);
  const [pullProgress, setPullProgress] = useState(null);
  const [newModelName, setNewModelName] = useState('');
  const [message, setMessage] = useState(null);

  const recommendedModels = [
    { name: 'llama3.2:1b', description: 'Fastest, low memory (1GB)', type: 'efficient' },
    { name: 'llama3.2:3b', description: 'Balanced performance (2GB)', type: 'balanced' },
    { name: 'mistral', description: 'High quality reasoning (4GB)', type: 'quality' },
    { name: 'phi3', description: 'Microsoft efficient model (2.3GB)', type: 'efficient' },
    { name: 'gemma2:2b', description: 'Google lightweight model (1.6GB)', type: 'efficient' }
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      // We need to add this method to api client, but for now direct fetch
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const settingsRes = await fetch('/api/admin/ai/settings', { headers });
      if (!settingsRes.ok) throw new Error('Failed to load AI settings');
      const settingsData = await settingsRes.json();

      setConfig(settingsData.config || DEFAULT_CONFIG);
      setCapabilities(settingsData.capabilities);
      setIsOllamaRunning(settingsData.isOllamaRunning);

      if (settingsData.isOllamaRunning) {
        const modelsRes = await fetch('/api/admin/ai/models', { headers });
        if (!modelsRes.ok) throw new Error('Failed to load AI models');
        const modelsData = await modelsRes.json();
        setModels(modelsData);
      }
    } catch (error) {
      console.error('Failed to load AI settings', error);
      toast.error(error.message || 'Failed to load AI settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/ai/settings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ai_enabled: config.ai_enabled === 'true',
          ai_model: config.ai_model,
          ai_auto_gpu: config.ai_auto_gpu === 'true'
        })
      });
      if (!response.ok) throw new Error('Failed to save settings');
      toast.success('Settings saved successfully');
      loadData(); // Reload to confirm state
    } catch (error) {
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handlePullModel = async (e) => {
    e.preventDefault();
    if (!newModelName) return;
    
    setPullingModel(true);
    setPullProgress({ status: 'starting', percentage: 0 });
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/ai/pull-model', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model: newModelName })
      });
      
      if (!response.ok) throw new Error('Failed to start model pull');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.status) {
              setPullProgress(prev => ({
                status: data.status,
                completed: data.completed,
                total: data.total,
                percentage: data.total ? Math.round((data.completed / data.total) * 100) : (prev?.percentage || 0)
              }));
            }
          } catch (e) {
            // Ignore parse errors for partial chunks
          }
        }
      }
      
      setMessage({ type: 'success', text: `Model ${newModelName} pulled successfully` });
      setNewModelName('');
      loadData();
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Failed to pull model (check server logs)' });
    } finally {
      setPullingModel(false);
      setPullProgress(null);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading settings...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">AI Configuration</h1>
          <p className="text-gray-600 dark:text-gray-400">Manage local LLM settings and models</p>
        </div>
        <div className={`px-4 py-2 rounded-full flex items-center gap-2 ${isOllamaRunning ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          <div className={`w-3 h-3 rounded-full ${isOllamaRunning ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="font-medium">{isOllamaRunning ? 'Ollama Online' : 'Ollama Offline'}</span>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {message.text}
        </div>
      )}

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
              onChange={(e) => setConfig({...config, ai_enabled: e.target.checked ? 'true' : 'false'})}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="label">Default Model</label>
            <select 
              className="input w-full"
              value={config.ai_model}
              onChange={(e) => setConfig({...config, ai_model: e.target.value})}
              disabled={!isOllamaRunning}
            >
              {models.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
              {models.length === 0 && <option>No models found</option>}
            </select>
          </div>
          
          <div className="flex items-center justify-between pt-8">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                className="checkbox"
                checked={config.ai_auto_gpu === 'true'}
                onChange={(e) => setConfig({...config, ai_auto_gpu: e.target.checked ? 'true' : 'false'})}
              />
              <span className="text-gray-700 dark:text-gray-300">Auto-detect GPU</span>
            </label>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>

      {/* System Capabilities */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Cpu className="w-5 h-5 text-gray-500" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">GPU Status</h3>
          </div>
          {capabilities?.hasGPU ? (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle size={20} />
              <span className="font-medium">
                {capabilities.gpuName === 'Remote / Containerized (Unknown)' 
                  ? 'Remote GPU (Assumed)' 
                  : capabilities.gpuName}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-500">
              <AlertCircle size={20} />
              <span>Running on CPU</span>
            </div>
          )}
          {capabilities?.vram && (
             <p className="text-sm text-gray-500 mt-2">VRAM: {capabilities.vram} GB</p>
          )}
          {capabilities?.gpuName === 'Remote / Containerized (Unknown)' && (
             <p className="text-xs text-gray-500 mt-2 italic">Backend cannot verify remote GPU stats</p>
          )}
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Server className="w-5 h-5 text-gray-500" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Recommendation</h3>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Recommended Model: <span className="font-mono font-bold">{capabilities?.recommendedModel}</span>
          </p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Database className="w-5 h-5 text-gray-500" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Installed Models</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{models.length}</p>
        </div>
      </div>

      {/* Model Management */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Model Management</h3>
        
        {/* Recommended Models */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Recommended for Budget Tracker</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recommendedModels.map((rec) => {
              const isInstalled = models.includes(rec.name);
              const isSelected = config.ai_model === rec.name;
              
              return (
                <div key={rec.name} className={`p-3 border rounded-lg flex flex-col justify-between ${
                  isSelected 
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' 
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                }`}>
                  <div>
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{rec.name}</span>
                      {isInstalled && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle size={10} /> Installed
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{rec.description}</p>
                  </div>
                  
                  {isInstalled ? (
                    <button
                      onClick={() => setConfig({...config, ai_model: rec.name})}
                      disabled={isSelected}
                      className={`w-full text-xs py-1.5 rounded transition-colors ${
                        isSelected
                          ? 'bg-primary-600 text-white opacity-50 cursor-default'
                          : 'bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                    >
                      {isSelected ? 'Active Model' : 'Select'}
                    </button>
                  ) : (
                    <button
                      onClick={() => { setNewModelName(rec.name); handlePullModel({ preventDefault: () => {} }); }}
                      disabled={pullingModel || !isOllamaRunning}
                      className="w-full text-xs py-1.5 bg-gray-900 dark:bg-gray-600 text-white rounded hover:bg-gray-800 dark:hover:bg-gray-500 disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      <Download size={12} />
                      {pullingModel && newModelName === rec.name ? 'Pulling...' : 'Install'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Install Custom Model</h4>
          <form onSubmit={handlePullModel} className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Download className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input 
                  type="text" 
                  className="input w-full pl-10" 
                  placeholder="e.g. neural-chat, starling-lm"
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                />
              </div>
              {pullProgress && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{pullProgress.status}</span>
                    <span>{pullProgress.percentage}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                    <div 
                      className="bg-primary-600 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${pullProgress.percentage}%` }}
                    ></div>
                  </div>
                </div>
              )}
              <p className="text-xs text-gray-500 mt-2">
                See <a href="https://ollama.com/library" target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">Ollama Library</a> for available models.
              </p>
            </div>
            <button 
              type="submit" 
              disabled={pullingModel || !isOllamaRunning || !newModelName}
              className="btn btn-secondary h-[42px]"
            >
              {pullingModel && !recommendedModels.some(r => r.name === newModelName) ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Pulling...
                </>
              ) : (
                'Pull Model'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}