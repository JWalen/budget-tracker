import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { format, subMonths } from 'date-fns';
import api from '../api/client';
import { formatCurrency, formatPercent } from '../utils/format';
import { ChartTooltip, useChartTheme } from '../components/ChartTheme';
import { useToast } from '../context/ToastContext';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  PieChartIcon,
  BarChart3,
  Download,
} from 'lucide-react';

export default function Analytics() {
  const toast = useToast();
  const chart = useChartTheme();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [spendingTrends, setSpendingTrends] = useState([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState([]);
  const [budgetVariance, setBudgetVariance] = useState([]);
  const [cashFlow, setCashFlow] = useState([]);
  const [incomeVsExpenses, setIncomeVsExpenses] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  useEffect(() => {
    loadAnalytics();
  }, [selectedMonth]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const month = selectedMonth.getMonth() + 1;
      const year = selectedMonth.getFullYear();

      const [
        summaryRes,
        trendsRes,
        categoryRes,
        varianceRes,
        cashFlowRes,
        incomeVsExpensesRes,
      ] = await Promise.all([
        api.getAnalyticsSummary(month, year),
        api.getSpendingTrends(12),
        api.getCategoryBreakdown(month, year),
        api.getBudgetVariance(month, year),
        api.getCashFlow(month, year),
        api.getIncomeVsExpenses(12),
      ]);

      setSummary(summaryRes);
      setSpendingTrends(trendsRes);
      setCategoryBreakdown(categoryRes);
      setBudgetVariance(varianceRes);
      setCashFlow(cashFlowRes);
      setIncomeVsExpenses(incomeVsExpensesRes);
    } catch (error) {
      console.error('Error loading analytics:', error);
      toast.error(error.message || 'Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = async () => {
    const month = selectedMonth.getMonth() + 1;
    const year = selectedMonth.getFullYear();
    const type = 'summary';

    try {
      const blob = await api.exportAnalyticsCsv({ month, year, type });
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `analytics-${type}-${year}-${String(month).padStart(2, '0')}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast.error(error.message || 'Failed to export CSV.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const COLORS = ['#0ea5e9', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Analytics
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Comprehensive financial insights and trends
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <input
            type="month"
            value={format(selectedMonth, 'yyyy-MM')}
            onChange={(e) => {
              // Parse as a LOCAL date. `new Date('2026-07')` is UTC midnight, which
              // is the previous month in negative-UTC timezones (wrong-month data).
              const [y, m] = e.target.value.split('-');
              if (y && m) setSelectedMonth(new Date(Number(y), Number(m) - 1, 1));
            }}
            className="input"
          />
          <button onClick={exportToCSV} className="btn btn-outline flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Income</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(summary.current.income)}
                </p>
                {Number(summary.changes.income || 0) !== 0 && (
                  <p className={`text-sm flex items-center gap-1 ${
                    summary.changes.income > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {summary.changes.income > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    {formatPercent(Math.abs(Number(summary.changes.income || 0)))} vs last month
                  </p>
                )}
              </div>
              <DollarSign className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Expenses</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(summary.current.expenses)}
                </p>
                {Number(summary.changes.expenses || 0) !== 0 && (
                  <p className={`text-sm flex items-center gap-1 ${
                    summary.changes.expenses < 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {summary.changes.expenses < 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                    {formatPercent(Math.abs(Number(summary.changes.expenses || 0)))} vs last month
                  </p>
                )}
              </div>
              <DollarSign className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Net Savings</p>
                <p className={`text-2xl font-bold ${
                  summary.current.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {formatCurrency(Math.abs(Number(summary.current.net || 0)))}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {summary.current.income_count} income, {summary.current.expense_count} expenses
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-primary-600 dark:text-primary-400" />
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Budget Status</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {Number(summary.budgets.total || 0) === 0
                    ? '0%'
                    : formatPercent((Number(summary.budgets.spent || 0) / Number(summary.budgets.total)) * 100, 0)}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {formatCurrency(summary.budgets.remaining)} remaining
                </p>
              </div>
              <BarChart3 className="w-8 h-8 text-primary-600 dark:text-primary-400" />
            </div>
          </div>
        </div>
      )}

      {/* Income vs Expenses Trend */}
      <div className="card">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Income vs Expenses (12 Months)
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={incomeVsExpenses}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-700" />
            <XAxis dataKey="month" tick={{ fill: chart.axisTick, fontSize: 12 }} stroke={chart.grid} />
            <YAxis tick={{ fill: chart.axisTick, fontSize: 12 }} stroke={chart.grid} />
            <Tooltip content={<ChartTooltip currency />} />
            <Legend />
            <Area type="monotone" dataKey="income" stackId="1" stroke="#10b981" fill="#10b981" name="Income" />
            <Area type="monotone" dataKey="expenses" stackId="2" stroke="#ef4444" fill="#ef4444" name="Expenses" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <div className="card">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <PieChartIcon className="w-5 h-5" />
            Spending by Category
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={categoryBreakdown}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(entry) => `${entry.name}: $${Number(entry.total || 0).toFixed(0)}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="total"
              >
                {categoryBreakdown.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip currency />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Budget Variance */}
        <div className="card">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Budget vs Actual
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={budgetVariance}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-700" />
              <XAxis dataKey="category" tick={{ fill: chart.axisTick, fontSize: 12 }} stroke={chart.grid} />
              <YAxis tick={{ fill: chart.axisTick, fontSize: 12 }} stroke={chart.grid} />
              <Tooltip content={<ChartTooltip currency />} />
              <Legend />
              <Bar dataKey="budget" fill="#8b5cf6" name="Budget" />
              <Bar dataKey="spent" fill="#0ea5e9" name="Spent" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cash Flow */}
      <div className="card">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Daily Cash Flow
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={cashFlow}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-700" />
            <XAxis dataKey="day" tick={{ fill: chart.axisTick, fontSize: 12 }} stroke={chart.grid} />
            <YAxis tick={{ fill: chart.axisTick, fontSize: 12 }} stroke={chart.grid} />
            <Tooltip content={<ChartTooltip currency />} />
            <Legend />
            <Line type="monotone" dataKey="income" stroke="#10b981" name="Income" />
            <Line type="monotone" dataKey="expenses" stroke="#ef4444" name="Expenses" />
            <Line type="monotone" dataKey="net" stroke="#0ea5e9" name="Net" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Top Categories Table */}
      {summary && summary.topCategories.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-bold mb-4">Top 5 Spending Categories</h2>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="text-right">Total Spent</th>
                  <th className="text-right">% of Expenses</th>
                </tr>
              </thead>
              <tbody>
                {summary.topCategories.map((cat, index) => (
                  <tr key={index}>
                    <td className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      {cat.name}
                    </td>
                    <td className="text-right font-semibold">{formatCurrency(cat.total)}</td>
                    <td className="text-right">
                      {Number(summary.current.expenses || 0) === 0
                        ? '0%'
                        : formatPercent((Number(cat.total || 0) / Number(summary.current.expenses)) * 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
