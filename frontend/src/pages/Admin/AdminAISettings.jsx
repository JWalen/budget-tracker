import { useState, useEffect } from 'react';
import { Cpu, Database, Download, Power, Server, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import api from '../../api/client';

export default function AdminAISettings() {
  const [config, setConfig] = useState({
    ai_enabled: 'false',
    ai_model: '',
    ai_auto_gpu: 'true'
  });
  const [capabilities, setCapabilities] = useState(null);
  const [models, setModels] = useState([]);
  const [isOllamaRunning, setIsOllamaRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pullingModel, setPullingModel] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [message, setMessage] = useState(null);

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
      const settingsData = await settingsRes.json();
      
      setConfig(settingsData.config);
      setCapabilities(settingsData.capabilities);
      setIsOllamaRunning(settingsData.isOllamaRunning);
      
      if (settingsData.isOllamaRunning) {
        const modelsRes = await fetch('/api/admin/ai/models', { headers });
        const modelsData = await modelsRes.json();
        setModels(modelsData);
      }
    } catch (error) {
      console.error('Failed to load AI settings', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/admin/ai/settings', {
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
      setMessage({ type: 'success', text: 'Settings saved successfully' });
      setTimeout(() => setMessage(null), 3000);
      loadData(); // Reload to confirm state
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    }
  };

  const handlePullModel = async (e) => {
    e.preventDefault();
    if (!newModelName) return;
    
    setPullingModel(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/ai/pull-model', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model: newModelName })
      });
      
      if (res.ok) {
        setMessage({ type: 'success', text: `Model ${newModelName} pulled successfully` });
        setNewModelName('');
        loadData();
      } else {
        throw new Error('Failed');
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to pull model (check server logs)' });
    } finally {
      setPullingModel(false);
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
            <button onClick={handleSave} className="btn btn-primary">
              Save Configuration
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
              <span className="font-medium">{capabilities.gpuName}</span>
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
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Pull New Model</h3>
        <form onSubmit={handlePullModel} className="flex gap-4">
          <div className="flex-1">
            <div className="relative">
              <Download className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input 
                type="text" 
                className="input w-full pl-10" 
                placeholder="e.g. llama3, mistral, neural-chat"
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              See <a href="https://ollama.com/library" target="_blank" rel="noreferrer" className="text-primary-600 hover:underline">Ollama Library</a> for available models.
            </p>
          </div>
          <button 
            type="submit" 
            disabled={pullingModel || !isOllamaRunning || !newModelName}
            className="btn btn-secondary h-[42px]"
          >
            {pullingModel ? (
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
  );
}