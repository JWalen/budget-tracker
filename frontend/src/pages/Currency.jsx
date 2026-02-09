import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp } from 'lucide-react';
import api from '../api/client';

export default function Currency() {
  const [currencies, setCurrencies] = useState([]);
  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCurrencies();
  }, []);

  const loadCurrencies = async () => {
    try {
      const data = await api.getCurrencies();
      setCurrencies(data);
    } catch (error) {
      console.error('Failed to load currencies:', error);
    } finally {
      setLoading(false);
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Multi-Currency</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Track finances in multiple currencies
        </p>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Default Currency
        </h3>
        <select
          value={defaultCurrency}
          onChange={(e) => setDefaultCurrency(e.target.value)}
          className="input w-full max-w-xs"
        >
          {currencies.map((curr) => (
            <option key={curr.code} value={curr.code}>
              {curr.code} - {curr.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Supported Currencies
        </h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {currencies.map((curr) => (
            <div
              key={curr.code}
              className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center gap-3"
            >
              <DollarSign className="w-5 h-5 text-primary-600" />
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {curr.code}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {curr.name}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {currencies.length === 0 && (
        <div className="card text-center py-12">
          <DollarSign className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Multi-Currency Not Available
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            No currencies configured yet
          </p>
        </div>
      )}
    </div>
  );
}
