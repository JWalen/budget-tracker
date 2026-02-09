import { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Calendar,
  TrendingUp,
  DollarSign,
  PieChart,
  BarChart3,
  Filter,
  Printer
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useBudget } from '../context/BudgetContext';

export default function Reports() {
  const { user } = useAuth();
  const { isReadOnly } = useBudget();
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [reportType, setReportType] = useState('expense-summary');
  const [reportData, setReportData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const data = await api.getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const reportTypes = [
    {
      id: 'expense-summary',
      name: 'Expense Summary',
      icon: PieChart,
      description: 'Breakdown of expenses by category'
    },
    {
      id: 'income-expense',
      name: 'Income vs Expenses',
      icon: BarChart3,
      description: 'Compare income and expenses over time'
    },
    {
      id: 'category-trend',
      name: 'Category Trends',
      icon: TrendingUp,
      description: 'Track spending trends by category'
    },
    {
      id: 'budget-performance',
      name: 'Budget Performance',
      icon: FileText,
      description: 'Compare actual spending vs budgets'
    },
    {
      id: 'bill-payment',
      name: 'Bill Payment History',
      icon: Calendar,
      description: 'Track bill payment status and history'
    },
    {
      id: 'cash-flow',
      name: 'Cash Flow Report',
      icon: DollarSign,
      description: 'Analyze cash flow patterns'
    }
  ];

  const generateReport = async () => {
    setLoading(true);
    try {
      // Call the appropriate API based on report type
      let data;
      switch (reportType) {
        case 'expense-summary':
          data = await api.getReportExpenseSummary(dateRange);
          break;
        case 'income-expense':
          data = await api.getReportIncomeExpense(dateRange);
          break;
        case 'category-trend':
          data = await api.getReportCategoryTrend({
            ...dateRange,
            category_id: selectedCategory !== 'all' ? selectedCategory : undefined
          });
          break;
        case 'budget-performance':
          data = await api.getReportBudgetPerformance(dateRange);
          break;
        case 'bill-payment':
          data = await api.getReportBillPayment(dateRange);
          break;
        case 'cash-flow':
          data = await api.getReportCashFlow(dateRange);
          break;
        default:
          data = {};
      }
      setReportData(data);
    } catch (error) {
      console.error('Failed to generate report:', error);
      alert('Failed to generate report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = () => {
    if (!reportData) return;

    const dataStr = JSON.stringify(reportData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

    const exportFileDefaultName = `${reportType}-${dateRange.startDate}-to-${dateRange.endDate}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const printReport = () => {
    window.print();
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const renderReportContent = () => {
    if (!reportData) return null;

    switch (reportType) {
      case 'expense-summary':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Expense Summary</h3>
            <div className="grid gap-4">
              {reportData.categories?.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="font-medium">{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-gray-600 dark:text-gray-400">
                      {cat.transactionCount} transactions
                    </span>
                    <span className="font-semibold">{formatCurrency(Math.abs(cat.total))}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
              <div className="flex items-center justify-between text-lg font-bold">
                <span>Total Expenses</span>
                <span className="text-red-600 dark:text-red-400">
                  {formatCurrency(Math.abs(reportData.totalExpenses || 0))}
                </span>
              </div>
            </div>
          </div>
        );

      case 'income-expense':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Income vs Expenses</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="text-sm text-green-600 dark:text-green-400">Total Income</div>
                <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                  {formatCurrency(reportData.totalIncome || 0)}
                </div>
              </div>
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <div className="text-sm text-red-600 dark:text-red-400">Total Expenses</div>
                <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                  {formatCurrency(Math.abs(reportData.totalExpenses || 0))}
                </div>
              </div>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="text-sm text-blue-600 dark:text-blue-400">Net Income</div>
              <div className={`text-2xl font-bold ${reportData.netIncome >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                {formatCurrency(reportData.netIncome || 0)}
              </div>
            </div>
            {reportData.monthlyBreakdown && (
              <div className="space-y-2 mt-4">
                <h4 className="font-medium">Monthly Breakdown</h4>
                {reportData.monthlyBreakdown.map((month) => (
                  <div key={month.month} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
                    <span>{month.monthName}</span>
                    <div className="flex gap-4">
                      <span className="text-green-600 dark:text-green-400">+{formatCurrency(month.income)}</span>
                      <span className="text-red-600 dark:text-red-400">-{formatCurrency(Math.abs(month.expenses))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'budget-performance':
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Budget Performance</h3>
            {reportData.budgets?.map((budget) => {
              const percentage = budget.limit > 0 ? (Math.abs(budget.spent) / budget.limit) * 100 : 0;
              const isOver = percentage > 100;

              return (
                <div key={budget.id} className="p-4 border rounded-lg dark:border-gray-600">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{budget.categoryName}</span>
                    <span className={`text-sm ${isOver ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                      {percentage.toFixed(1)}% used
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span>Spent: {formatCurrency(Math.abs(budget.spent))}</span>
                    <span>Budget: {formatCurrency(budget.limit)}</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${isOver ? 'bg-red-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        );

      default:
        return (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Report data will appear here after generation
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Financial Reports</h1>

      {/* Report Type Selection */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Select Report Type</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {reportTypes.map((type) => {
            const Icon = type.icon;
            return (
              <button
                key={type.id}
                onClick={() => setReportType(type.id)}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  reportType === type.id
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Icon size={20} className={reportType === type.id ? 'text-primary-600' : 'text-gray-400'} />
                  <div className="flex-1">
                    <div className="font-medium">{type.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {type.description}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Date Range and Filters */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Report Parameters</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Start Date</label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label">End Date</label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              className="input"
            />
          </div>
          {reportType === 'category-trend' && (
            <div>
              <label className="label">Category Filter</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="input"
              >
                <option value="all">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({cat.type})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-4">
          <button
            onClick={generateReport}
            disabled={loading}
            className="btn-primary flex items-center gap-2"
          >
            <Filter size={16} />
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
        </div>
      </div>

      {/* Report Results */}
      {reportData && (
        <div className="card print:shadow-none">
          <div className="flex items-center justify-between mb-4 print:hidden">
            <h2 className="text-lg font-semibold">Report Results</h2>
            <div className="flex gap-2">
              <button
                onClick={downloadReport}
                className="btn-secondary flex items-center gap-2"
              >
                <Download size={16} />
                Download
              </button>
              <button
                onClick={printReport}
                className="btn-secondary flex items-center gap-2"
              >
                <Printer size={16} />
                Print
              </button>
            </div>
          </div>
          <div className="print:p-4">
            {renderReportContent()}
          </div>
        </div>
      )}
    </div>
  );
}