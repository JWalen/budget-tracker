import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useBudget } from '../context/BudgetContext';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Receipt,
  ChevronLeft,
  ChevronRight,
  Check,
  AlertCircle,
} from 'lucide-react';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function Bills() {
  const [bills, setBills] = useState([]);
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const { activeBudgetOwner, isReadOnly } = useBudget();

  // Modals
  const [showBillModal, setShowBillModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  const [payingBill, setPayingBill] = useState(null);

  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();

  // Bill form state
  const [billForm, setBillForm] = useState({
    name: '',
    amount: '',
    due_date: '',
    category_id: '',
    auto_match_pattern: '',
  });

  // Pay form state
  const [payMode, setPayMode] = useState('link'); // 'link' or 'create'
  const [selectedTransactionId, setSelectedTransactionId] = useState('');
  const [newExpenseForm, setNewExpenseForm] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    category_id: '',
  });

  useEffect(() => {
    loadData();
  }, [month, year, activeBudgetOwner?.id]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [billData, catData, txData] = await Promise.all([
        api.getBills({ month, year }),
        api.getCategories(),
        api.getTransactions({ month, year }),
      ]);
      setBills(Array.isArray(billData) ? billData : billData.bills || []);
      setCategories(catData);
      const txList = Array.isArray(txData) ? txData : txData.transactions || [];
      setTransactions(txList);
    } catch (err) {
      console.error('Failed to load bills:', err);
      setError(err.message || 'Failed to load bills');
    } finally {
      setLoading(false);
    }
  };

  const goToPrevMonth = () => setCurrentDate(new Date(year, month - 2, 1));
  const goToNextMonth = () => setCurrentDate(new Date(year, month, 1));

  // Determine bill status for the current month
  const getBillStatus = (bill) => {
    // Check if bill has a payment for this month
    if (bill.payment_id || bill.transaction_id || bill.paid || bill.paid_transaction_id) {
      return 'paid';
    }
    const today = new Date();
    if (today.getFullYear() === year && today.getMonth() + 1 === month) {
      const dueDay = parseInt(bill.due_date, 10);
      if (today.getDate() > dueDay) {
        return 'overdue';
      }
    } else if (year < today.getFullYear() || (year === today.getFullYear() && month < today.getMonth() + 1)) {
      return 'overdue';
    }
    return 'unpaid';
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400">
            <Check size={12} />
            Paid
          </span>
        );
      case 'overdue':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400">
            <AlertCircle size={12} />
            Overdue
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
            Unpaid
          </span>
        );
    }
  };

  // Summary calculations
  const billStatuses = bills.map((b) => ({ ...b, status: getBillStatus(b) }));
  const paidCount = billStatuses.filter((b) => b.status === 'paid').length;
  const totalDue = bills.reduce((sum, b) => sum + parseFloat(b.amount || 0), 0);
  const totalPaid = billStatuses
    .filter((b) => b.status === 'paid')
    .reduce((sum, b) => sum + parseFloat(b.paid_amount || b.amount || 0), 0);

  // Open add modal
  const openAddModal = () => {
    setEditingBill(null);
    setBillForm({
      name: '',
      amount: '',
      due_date: '',
      category_id: '',
      auto_match_pattern: '',
    });
    setShowBillModal(true);
  };

  // Open edit modal
  const openEditModal = (bill) => {
    setEditingBill(bill);
    setBillForm({
      name: bill.name || '',
      amount: bill.amount || '',
      due_date: bill.due_date || '',
      category_id: bill.category_id || '',
      auto_match_pattern: bill.auto_match_pattern || '',
    });
    setShowBillModal(true);
  };

  const closeBillModal = () => {
    setShowBillModal(false);
    setEditingBill(null);
  };

  const handleBillSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: billForm.name,
        amount: parseFloat(billForm.amount),
        due_date: parseInt(billForm.due_date, 10),
        category_id: billForm.category_id ? parseInt(billForm.category_id, 10) : null,
        auto_match_pattern: billForm.auto_match_pattern || null,
      };

      if (editingBill) {
        await api.updateBill(editingBill.id, payload);
      } else {
        await api.createBill(payload);
      }
      closeBillModal();
      loadData();
    } catch (err) {
      console.error('Failed to save bill:', err);
      setError(err.message || 'Failed to save bill');
    }
  };

  const handleDelete = async (bill) => {
    if (!confirm(`Delete bill "${bill.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteBill(bill.id);
      loadData();
    } catch (err) {
      console.error('Failed to delete bill:', err);
      setError(err.message || 'Failed to delete bill');
    }
  };

  // Pay modal
  const openPayModal = (bill) => {
    setPayingBill(bill);
    // Default to 'create' mode if there are no transactions to link
    setPayMode(expenseTransactions.length > 0 ? 'link' : 'create');
    setSelectedTransactionId('');
    setNewExpenseForm({
      amount: bill.amount || '',
      date: new Date().toISOString().split('T')[0],
      description: bill.name || '',
      category_id: bill.category_id || '',
    });
    setShowPayModal(true);
  };

  const closePayModal = () => {
    setShowPayModal(false);
    setPayingBill(null);
  };

  const handlePaySubmit = async (e) => {
    e.preventDefault();
    console.log('handlePaySubmit called', { payingBill, payMode, month, year });
    if (!payingBill) {
      console.log('No paying bill, returning');
      return;
    }

    try {
      const payload = {
        month: month,
        year: year
      };
      console.log('Initial payload:', payload);
      if (payMode === 'link') {
        payload.transaction_id = parseInt(selectedTransactionId, 10);
      } else {
        payload.create_transaction = true;
        payload.amount = parseFloat(newExpenseForm.amount);
        payload.date = newExpenseForm.date;
        payload.description = newExpenseForm.description;
        payload.category_id = newExpenseForm.category_id
          ? parseInt(newExpenseForm.category_id, 10)
          : undefined;
      }

      console.log('Final payload before API call:', payload);
      console.log('Calling api.payBill with id:', payingBill.id);

      const result = await api.payBill(payingBill.id, payload);
      console.log('API call successful, result:', result);

      closePayModal();
      loadData();
    } catch (err) {
      console.error('Failed to mark bill as paid:', err);
      alert('Error marking bill as paid: ' + (err.message || 'Unknown error'));
      setError(err.message || 'Failed to mark bill as paid');
    }
  };

  // Category lookup helper
  const getCategoryName = (categoryId) => {
    const cat = categories.find((c) => c.id === categoryId);
    return cat ? cat.name : null;
  };

  const getCategoryColor = (categoryId) => {
    const cat = categories.find((c) => c.id === categoryId);
    return cat ? cat.color : null;
  };

  // Available (unlinked) expense transactions for linking
  const expenseTransactions = transactions.filter((t) => t.type === 'expense');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Bills</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrevMonth}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="font-medium text-gray-900 dark:text-gray-100 min-w-[140px] text-center">
              {months[month - 1]} {year}
            </span>
            <button
              onClick={goToNextMonth}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <ChevronRight size={20} />
            </button>
          </div>
          {!isReadOnly && (
            <button onClick={openAddModal} className="btn-primary flex items-center gap-2">
              <Plus size={20} />
              <span>Add Bill</span>
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="text-red-600 dark:text-red-400 flex-shrink-0" size={20} />
          <p className="text-red-800 dark:text-red-300 text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Bills Paid</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {paidCount} <span className="text-base font-normal text-gray-500 dark:text-gray-400">of {bills.length}</span>
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Due</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {formatCurrency(totalDue)}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Paid</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
            {formatCurrency(totalPaid)}
          </p>
        </div>
      </div>

      {/* Bill cards */}
      {bills.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-center py-12">
          <Receipt className="w-12 h-12 text-gray-300 dark:text-gray-500 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">No bills set up yet.</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
            Click &quot;Add Bill&quot; to start tracking your recurring bills.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {billStatuses.map((bill) => {
            const categoryName = getCategoryName(bill.category_id);
            const categoryColor = getCategoryColor(bill.category_id);

            return (
              <div
                key={bill.id}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col"
              >
                {/* Top row: name + actions */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {bill.name}
                    </h3>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {formatCurrency(bill.amount)}
                    </p>
                  </div>
                  {!isReadOnly && (
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      <button
                        onClick={() => openEditModal(bill)}
                        className="p-2 text-gray-400 dark:text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
                        title="Edit bill"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(bill)}
                        className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                        title="Delete bill"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Due date */}
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-3">
                  <span>Due: {getOrdinalDay(bill.due_date)} of each month</span>
                </div>

                {/* Category badge */}
                {categoryName && (
                  <div className="mb-3">
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: categoryColor ? `${categoryColor}20` : undefined,
                        color: categoryColor || undefined,
                      }}
                    >
                      {categoryColor && (
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: categoryColor }}
                        />
                      )}
                      {categoryName}
                    </span>
                  </div>
                )}

                {/* Status */}
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100 dark:border-gray-700">
                  {getStatusBadge(bill.status)}

                  {bill.status === 'paid' && bill.paid_transaction_amount != null && (
                    <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                      <p>{formatCurrency(bill.paid_transaction_amount)}</p>
                      {bill.paid_transaction_date && (
                        <p>
                          {new Date(bill.paid_transaction_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      )}
                    </div>
                  )}

                  {!isReadOnly && bill.status !== 'paid' && (
                    <button
                      onClick={() => openPayModal(bill)}
                      className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                    >
                      Mark as Paid
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Bill Modal */}
      {!isReadOnly && showBillModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {editingBill ? 'Edit Bill' : 'Add Bill'}
              </h2>
              <button
                onClick={closeBillModal}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleBillSubmit} className="p-4 space-y-4">
              {/* Name */}
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  value={billForm.name}
                  onChange={(e) => setBillForm({ ...billForm, name: e.target.value })}
                  className="input"
                  placeholder="e.g. Netflix, Electric Bill"
                  required
                />
              </div>

              {/* Amount */}
              <div>
                <label className="label">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={billForm.amount}
                  onChange={(e) => setBillForm({ ...billForm, amount: e.target.value })}
                  className="input"
                  placeholder="0.00"
                  required
                />
              </div>

              {/* Due date (day of month) */}
              <div>
                <label className="label">Due Date (Day of Month)</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={billForm.due_date}
                  onChange={(e) => setBillForm({ ...billForm, due_date: e.target.value })}
                  className="input"
                  placeholder="1-31"
                  required
                />
              </div>

              {/* Category */}
              <div>
                <label className="label">Category</label>
                <select
                  value={billForm.category_id}
                  onChange={(e) => setBillForm({ ...billForm, category_id: e.target.value })}
                  className="input"
                >
                  <option value="">No category</option>
                  {categories
                    .filter((c) => c.type === 'expense')
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Auto-match pattern */}
              <div>
                <label className="label">Auto-Match Pattern</label>
                <input
                  type="text"
                  value={billForm.auto_match_pattern}
                  onChange={(e) =>
                    setBillForm({ ...billForm, auto_match_pattern: e.target.value })
                  }
                  className="input"
                  placeholder="e.g. NETFLIX, ELECTRIC CO"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Enter keywords from your bank statement, e.g. NETFLIX
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeBillModal} className="flex-1 btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary">
                  {editingBill ? 'Save Changes' : 'Add Bill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mark as Paid Modal */}
      {!isReadOnly && showPayModal && payingBill && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Mark &quot;{payingBill.name}&quot; as Paid
              </h2>
              <button
                onClick={closePayModal}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handlePaySubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Mode selector */}
              <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setPayMode('link')}
                  className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                    payMode === 'link'
                      ? 'bg-primary-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Link Transaction
                </button>
                <button
                  type="button"
                  onClick={() => setPayMode('create')}
                  className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                    payMode === 'create'
                      ? 'bg-primary-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Create Expense
                </button>
              </div>

              {payMode === 'link' ? (
                <div>
                  <label className="label">Select Transaction</label>
                  {expenseTransactions.length === 0 ? (
                    <div className="py-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                        No expense transactions found for {months[month - 1]} {year}.
                      </p>
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center mt-2">
                        Please switch to "Create Expense" mode to mark this bill as paid.
                      </p>
                    </div>
                  ) : (
                    <select
                      value={selectedTransactionId}
                      onChange={(e) => setSelectedTransactionId(e.target.value)}
                      className="input"
                      required
                    >
                      <option value="">Choose a transaction...</option>
                      {expenseTransactions.map((tx) => (
                        <option key={tx.id} value={tx.id}>
                          {tx.description} - {formatCurrency(tx.amount)} (
                          {new Date(tx.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                          )
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <>
                  {/* Create new expense */}
                  <div>
                    <label className="label">Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newExpenseForm.amount}
                      onChange={(e) =>
                        setNewExpenseForm({ ...newExpenseForm, amount: e.target.value })
                      }
                      className="input"
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Date</label>
                    <input
                      type="date"
                      value={newExpenseForm.date}
                      onChange={(e) =>
                        setNewExpenseForm({ ...newExpenseForm, date: e.target.value })
                      }
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Description</label>
                    <input
                      type="text"
                      value={newExpenseForm.description}
                      onChange={(e) =>
                        setNewExpenseForm({ ...newExpenseForm, description: e.target.value })
                      }
                      className="input"
                      placeholder="Payment description"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Category</label>
                    <select
                      value={newExpenseForm.category_id}
                      onChange={(e) =>
                        setNewExpenseForm({ ...newExpenseForm, category_id: e.target.value })
                      }
                      className="input"
                    >
                      <option value="">No category</option>
                      {categories
                        .filter((c) => c.type === 'expense')
                        .map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </>
              )}
              </div>

              {/* Actions - Fixed at bottom */}
              <div className="flex gap-3 p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
                <button type="button" onClick={closePayModal} className="flex-1 btn-secondary">
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 btn-primary"
                  disabled={payMode === 'link' && !selectedTransactionId}
                >
                  <Check size={16} className="inline mr-1" />
                  Mark as Paid
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper: ordinal day string (e.g. 1st, 2nd, 3rd, 15th)
function getOrdinalDay(day) {
  const d = parseInt(day, 10);
  if (isNaN(d)) return day;
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const mod100 = d % 100;
  const suffix = suffixes[(mod100 - 20) % 10] || suffixes[mod100] || suffixes[0];
  return `${d}${suffix}`;
}
