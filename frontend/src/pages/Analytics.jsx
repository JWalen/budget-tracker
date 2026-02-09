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
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const month = selectedMonth.getMonth() + 1;
    const year = selectedMonth.getFullYear();
    const type = 'summary'; // Can be changed to 'category-breakdown' or 'budget-performance'
    
    window.open(
      `/api/analytics/export/csv?month=${month}&year=${year}&type=${type}`,
      '_blank'
    );
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
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
            onChange={(e) => setSelectedMonth(new Date(e.target.value))}
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
                  ${summary.current.income.toFixed(2)}
                </p>
                {summary.changes.income !== 0 && (
                  <p className={`text-sm flex items-center gap-1 ${
                    summary.changes.income > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {summary.changes.income > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    {Math.abs(summary.changes.income).toFixed(1)}% vs last month
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
                  ${summary.current.expenses.toFixed(2)}
                </p>
                {summary.changes.expenses !== 0 && (
                  <p className={`text-sm flex items-center gap-1 ${
                    summary.changes.expenses < 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {summary.changes.expenses < 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                    {Math.abs(summary.changes.expenses).toFixed(1)}% vs last month
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
                  ${Math.abs(summary.current.net).toFixed(2)}
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
                  {((summary.budgets.spent / summary.budgets.total) * 100).toFixed(0)}%
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  ${summary.budgets.remaining.toFixed(2)} remaining
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
            <XAxis dataKey="month" className="text-sm" />
            <YAxis className="text-sm" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
              }}
            />
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
                label={(entry) => `${entry.name}: $${entry.total.toFixed(0)}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="total"
              >
                {categoryBreakdown.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
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
              <XAxis dataKey="category" className="text-sm" />
              <YAxis className="text-sm" />
              <Tooltip />
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
            <XAxis dataKey="day" className="text-sm" />
            <YAxis className="text-sm" />
            <Tooltip />
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
                    <td className="text-right font-semibold">${parseFloat(cat.total).toFixed(2)}</td>
                    <td className="text-right">
                      {((parseFloat(cat.total) / summary.current.expenses) * 100).toFixed(1)}%
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
