import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useBudget } from '../context/BudgetContext';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function Dashboard() {
  const { activeBudgetOwner } = useBudget();
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();

  useEffect(() => {
    loadData();
  }, [month, year, activeBudgetOwner?.id]);

  const loadData = async () => {
    try {
      const [summaryData, trendData] = await Promise.all([
        api.getSummary({ month, year }),
        api.getTrend(),
      ]);
      setSummary(summaryData);
      setTrend(trendData);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month, 1));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const overBudget = summary?.budgets?.filter(b => parseFloat(b.spent) > parseFloat(b.amount_limit)) || [];

  return (
    <div className="space-y-6">
      {/* Month selector */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <div className="flex items-center gap-2">
          <button onClick={goToPrevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <ChevronLeft size={20} />
          </button>
          <span className="font-medium text-gray-900 dark:text-gray-100 min-w-[140px] text-center">
            {months[month - 1]} {year}
          </span>
          <button onClick={goToNextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Over budget alerts */}
      {overBudget.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-medium mb-2">
            <AlertTriangle size={20} />
            <span>Over Budget</span>
          </div>
          <div className="space-y-1">
            {overBudget.map((b) => (
              <p key={b.id} className="text-amber-700 dark:text-amber-300 text-sm">
                {b.category_name}: {formatCurrency(b.spent)} / {formatCurrency(b.amount_limit)}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Income</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(summary?.income || 0)}
              </p>
            </div>
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Expenses</p>
              <p className="text-2xl font-bold text-red-600">
                {formatCurrency(summary?.expenses || 0)}
              </p>
            </div>
            <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-xl">
              <TrendingDown className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Balance</p>
              <p className={`text-2xl font-bold ${summary?.balance >= 0 ? 'text-primary-600' : 'text-red-600'}`}>
                {formatCurrency(summary?.balance || 0)}
              </p>
            </div>
            <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-xl">
              <Wallet className="w-6 h-6 text-primary-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spending by category */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Spending by Category</h3>
          {summary?.byCategory?.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={summary.byCategory}
                    dataKey="total"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {summary.byCategory.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
              No expenses this month
            </div>
          )}
        </div>

        {/* Budget progress */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Budget Progress</h3>
          {summary?.budgets?.length > 0 ? (
            <div className="space-y-4">
              {summary.budgets.map((budget) => {
                const percent = Math.min((parseFloat(budget.spent) / parseFloat(budget.amount_limit)) * 100, 100);
                const isOver = parseFloat(budget.spent) > parseFloat(budget.amount_limit);
                return (
                  <div key={budget.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{budget.category_name}</span>
                      <span className={isOver ? 'text-red-600' : 'text-gray-600 dark:text-gray-400'}>
                        {formatCurrency(budget.spent)} / {formatCurrency(budget.amount_limit)}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isOver ? 'bg-red-500' : percent > 80 ? 'bg-amber-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-500 dark:text-gray-400">
              No budgets set for this month
            </div>
          )}
        </div>
      </div>

      {/* Trend chart */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">6-Month Trend</h3>
        {trend.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `$${value}`} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="income"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={{ fill: '#22c55e' }}
                />
                <Line
                  type="monotone"
                  dataKey="expenses"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ fill: '#ef4444' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
            No data available
          </div>
        )}
      </div>
    </div>
  );
}
