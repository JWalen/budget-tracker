import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useBudget } from '../context/BudgetContext';
import { ChevronLeft, ChevronRight, Plus, X, TrendingUp, TrendingDown } from 'lucide-react';

import { formatCurrency, MONTHS } from '../utils/format';
import { useToast } from '../context/ToastContext';

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Resolve a value to a day-of-month (1-31) using LOCAL parsing.
// Accepts a day-of-month integer (1-31) directly, a date-only string
// ("YYYY-MM-DD..."), or any other parseable date string.
const toDayOfMonth = (value) => {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  // Pure integer day-of-month (no date separators)
  if (/^\d{1,2}$/.test(raw)) {
    const n = Number(raw);
    if (n >= 1 && n <= 31) return n;
  }
  // Date-only / ISO string: take the day component directly to avoid
  // the UTC-midnight off-by-one shift.
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) return Number(dateOnly[3]);
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d.getDate();
};

export default function Calendar() {
  const [transactions, setTransactions] = useState([]);
  const [bills, setBills] = useState([]);
  const [debts, setDebts] = useState([]);
  const [payPeriods, setPayPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const { activeBudgetOwner } = useBudget();
  const toast = useToast();

  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();

  useEffect(() => {
    loadData();
  }, [month, year, activeBudgetOwner?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [txData, billData, debtData, payPeriodData] = await Promise.all([
        api.getTransactions({ month, year }),
        api.getBillStatus({ month, year }).catch(() => []),
        api.getDebts({ is_paid: 'false' }).catch(() => []),
        api.getPayPeriods({ month, year }).catch(() => []),
      ]);
      setTransactions(Array.isArray(txData) ? txData : []);
      setBills(Array.isArray(billData) ? billData : []);
      setDebts(Array.isArray(debtData) ? debtData : []);
      setPayPeriods(Array.isArray(payPeriodData) ? payPeriodData : []);
    } catch (err) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const goToPrevMonth = () => setCurrentDate(new Date(year, month - 2, 1));
  const goToNextMonth = () => setCurrentDate(new Date(year, month, 1));

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getMonth() + 1 === month && today.getFullYear() === year;

  // Group transactions by local day-of-month
  const txByDay = {};
  transactions.forEach((tx) => {
    const day = toDayOfMonth(tx.date);
    if (day == null) return;
    if (!txByDay[day]) txByDay[day] = [];
    txByDay[day].push(tx);
  });

  // Group bills by due date (day-of-month)
  const billsByDay = {};
  bills.forEach((bill) => {
    const day = toDayOfMonth(bill.due_date);
    if (day == null) return;
    if (!billsByDay[day]) billsByDay[day] = [];
    billsByDay[day].push(bill);
  });

  // Group debts by due date. due_date may be a day-of-month integer OR a date string.
  const debtsByDay = {};
  debts.forEach((debt) => {
    const day = toDayOfMonth(debt.due_date);
    if (day == null) return;
    if (!debtsByDay[day]) debtsByDay[day] = [];
    debtsByDay[day].push(debt);
  });

  // Group pay periods by local day-of-month
  const payPeriodsByDay = {};
  payPeriods.forEach((pp) => {
    const day = toDayOfMonth(pp.date);
    if (day == null) return;
    if (!payPeriodsByDay[day]) payPeriodsByDay[day] = [];
    payPeriodsByDay[day].push(pp);
  });

  const getDaySummary = (day) => {
    const dayTxs = txByDay[day] || [];
    const income = dayTxs.filter((t) => t.type === 'income').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const expenses = dayTxs.filter((t) => t.type === 'expense').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
    const dayBills = billsByDay[day] || [];
    const dayDebts = debtsByDay[day] || [];
    const dayPayPeriods = payPeriodsByDay[day] || [];
    const expectedIncome = dayPayPeriods.reduce((s, pp) => s + (parseFloat(pp.amount) || 0), 0);
    return { income, expenses, bills: dayBills, debts: dayDebts, transactions: dayTxs, payPeriods: dayPayPeriods, expectedIncome };
  };

  const selectedDayData = selectedDay ? getDaySummary(selectedDay) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const weeks = [];
  let currentWeek = [];
  for (let i = 0; i < firstDay; i++) {
    currentWeek.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Calendar</h1>
        <div className="flex items-center gap-2">
          <button aria-label="Previous month" onClick={goToPrevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <ChevronLeft size={20} />
          </button>
          <span className="font-medium text-gray-900 dark:text-gray-100 min-w-[140px] text-center">
            {MONTHS[month - 1]} {year}
          </span>
          <button aria-label="Next month" onClick={goToNextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="card p-0 overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
          {dayNames.map((name) => (
            <div key={name} className="p-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
              {name}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
            {week.map((day, di) => {
              if (!day) {
                return <div key={di} className="min-h-[80px] lg:min-h-[100px] bg-gray-50 dark:bg-gray-900/50" />;
              }

              const summary = getDaySummary(day);
              const isToday = isCurrentMonth && today.getDate() === day;
              const isSelected = selectedDay === day;
              const hasContent = summary.income > 0 || summary.expenses > 0 || summary.bills.length > 0 || summary.debts.length > 0 || summary.payPeriods.length > 0;

              return (
                <button
                  key={di}
                  onClick={() => setSelectedDay(isSelected ? null : day)}
                  className={`min-h-[80px] lg:min-h-[100px] p-1.5 text-left transition-colors border-r border-gray-100 dark:border-gray-700 last:border-r-0 ${
                    isSelected
                      ? 'bg-primary-50 dark:bg-primary-900/20'
                      : hasContent
                      ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <div className={`text-sm font-medium mb-1 ${
                    isToday
                      ? 'w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center text-xs'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    {day}
                  </div>

                  <div className="space-y-0.5">
                    {summary.expectedIncome > 0 && (
                      <div className="text-[10px] lg:text-xs text-blue-600 dark:text-blue-400 font-medium truncate">
                        ⊕{formatCurrency(summary.expectedIncome)}
                      </div>
                    )}
                    {summary.income > 0 && (
                      <div className="text-[10px] lg:text-xs text-green-600 dark:text-green-400 font-medium truncate">
                        +{formatCurrency(summary.income)}
                      </div>
                    )}
                    {summary.expenses > 0 && (
                      <div className="text-[10px] lg:text-xs text-red-600 dark:text-red-400 font-medium truncate">
                        -{formatCurrency(summary.expenses)}
                      </div>
                    )}
                    {/* Bill indicators */}
                    {summary.bills.length > 0 && (
                      <div className="flex gap-0.5 flex-wrap">
                        {summary.bills.map((bill) => (
                          <div
                            key={bill.id}
                            className={`w-2 h-2 rounded-full ${
                              bill.is_paid ? 'bg-green-500' : 'bg-red-500'
                            }`}
                            title={`${bill.name}: ${bill.is_paid ? 'Paid' : 'Unpaid'}`}
                          />
                        ))}
                      </div>
                    )}
                    {/* Debt due indicators */}
                    {summary.debts.length > 0 && (
                      <div className="flex gap-0.5 flex-wrap">
                        {summary.debts.map((debt) => (
                          <div
                            key={debt.id}
                            className="w-2 h-2 rounded-full bg-amber-500"
                            title={`Debt due: ${debt.name}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-blue-600 dark:text-blue-400">⊕</span>
          <span>Expected income</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-green-600 dark:text-green-400">+</span>
          <span>Actual income</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-red-600 dark:text-red-400">−</span>
          <span>Expenses</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span>Bill paid</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span>Bill unpaid</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span>Debt due</span>
        </div>
      </div>

      {/* Day detail panel */}
      {selectedDay && selectedDayData && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {MONTHS[month - 1]} {selectedDay}, {year}
            </h3>
            <button aria-label="Close"
              onClick={() => setSelectedDay(null)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <X size={18} />
            </button>
          </div>

          {/* Pay periods (expected income) */}
          {selectedDayData.payPeriods.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Expected Income</h4>
              <div className="space-y-2">
                {selectedDayData.payPeriods.map((pp) => (
                  <div
                    key={pp.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20"
                  >
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      {pp.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        {formatCurrency(pp.amount)}
                      </span>
                      {pp.is_recurring && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                          {pp.frequency}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bills due this day */}
          {selectedDayData.bills.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Bills Due</h4>
              <div className="space-y-2">
                {selectedDayData.bills.map((bill) => (
                  <div
                    key={bill.id}
                    className={`flex items-center justify-between p-2 rounded-lg ${
                      bill.is_paid
                        ? 'bg-green-50 dark:bg-green-900/20'
                        : 'bg-red-50 dark:bg-red-900/20'
                    }`}
                  >
                    <span className={`text-sm font-medium ${
                      bill.is_paid ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
                    }`}>
                      {bill.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{formatCurrency(bill.amount)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        bill.is_paid
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                      }`}>
                        {bill.is_paid ? 'Paid' : 'Unpaid'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Debt payments due */}
          {selectedDayData.debts.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Debt Payments Due</h4>
              <div className="space-y-2">
                {selectedDayData.debts.map((debt) => (
                  <div key={debt.id} className="flex items-center justify-between p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-300">{debt.name}</span>
                    <span className="text-sm font-medium">{debt.minimum_payment ? formatCurrency(debt.minimum_payment) : formatCurrency(debt.balance)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transactions */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Transactions ({selectedDayData.transactions.length})
            </h4>
            {selectedDayData.transactions.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No transactions on this day.</p>
            ) : (
              <div className="space-y-2">
                {selectedDayData.transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <div className="flex items-center gap-2">
                      {tx.type === 'income' ? (
                        <TrendingUp className="w-4 h-4 text-green-600" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-red-600" />
                      )}
                      <span className="text-sm text-gray-900 dark:text-gray-100">
                        {tx.description || tx.category_name || 'Uncategorized'}
                      </span>
                    </div>
                    <span className={`text-sm font-medium ${
                      tx.type === 'income' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
