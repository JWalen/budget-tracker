import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useBudget } from '../context/BudgetContext';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Wallet,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  MinusCircle,
  RefreshCw,
} from 'lucide-react';

import { formatCurrency, formatShortDate, MONTHS } from '../utils/format';
import { useToast } from '../context/ToastContext';

export default function PayPeriods() {
  const [payPeriods, setPayPeriods] = useState([]);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const { activeBudgetOwner, isReadOnly } = useBudget();
  const toast = useToast();

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [editingPP, setEditingPP] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Inline assign state: which pay period has the dropdown open
  const [assigningPPId, setAssigningPPId] = useState(null);

  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();

  // Form state
  const [form, setForm] = useState({
    name: '',
    amount: '',
    date: '',
    is_recurring: false,
    frequency: 'biweekly',
  });

  useEffect(() => {
    loadData();
  }, [month, year, activeBudgetOwner?.id]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ppData, billData] = await Promise.all([
        api.getPayPeriods({ month, year }),
        api.getBills({ month, year }),
      ]);
      setPayPeriods(Array.isArray(ppData) ? ppData : []);
      setBills(Array.isArray(billData) ? billData : billData.bills || []);
    } catch (err) {
      setError(err.message || 'Failed to load pay periods');
      toast.error(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const goToPrevMonth = () => setCurrentDate(new Date(year, month - 2, 1));
  const goToNextMonth = () => setCurrentDate(new Date(year, month, 1));

  // Summary calculations
  const totalIncome = payPeriods.reduce((sum, pp) => sum + (parseFloat(pp.amount) || 0), 0);
  const totalAssigned = payPeriods.reduce(
    (sum, pp) =>
      sum +
      (pp.bills || []).reduce(
        (s, b) => s + (parseFloat(b.amount_override ?? b.bill_amount) || 0),
        0
      ),
    0
  );
  const totalRemaining = totalIncome - totalAssigned;

  // Bills assigned to any pay period this month
  const assignedBillIds = new Set(
    payPeriods.flatMap((pp) => (pp.bills || []).map((b) => b.bill_id))
  );

  // Active bills not yet assigned
  const unassignedBills = bills.filter(
    (b) => b.is_active !== false && !assignedBillIds.has(b.id)
  );

  // Open add modal
  const openAddModal = () => {
    setEditingPP(null);
    setForm({
      name: '',
      amount: '',
      date: '',
      is_recurring: false,
      frequency: 'biweekly',
    });
    setShowModal(true);
  };

  // Open edit modal
  const openEditModal = (pp) => {
    setEditingPP(pp);
    setForm({
      name: pp.name || '',
      amount: pp.amount || '',
      date: pp.date ? pp.date.split('T')[0] : '',
      is_recurring: pp.is_recurring || false,
      frequency: pp.frequency || 'biweekly',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingPP(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        name: form.name,
        amount: parseFloat(form.amount) || 0,
        date: form.date,
        is_recurring: form.is_recurring,
        frequency: form.is_recurring ? form.frequency : null,
      };

      if (editingPP) {
        await api.updatePayPeriod(editingPP.id, payload);
        toast.success('Pay period updated');
      } else {
        await api.createPayPeriod(payload);
        toast.success('Pay period created');
      }
      setError(null);
      closeModal();
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to save pay period');
      toast.error(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (pp) => {
    if (!confirm(`Delete pay period "${pp.name}"? Assigned bills will be unassigned.`)) return;
    try {
      await api.deletePayPeriod(pp.id);
      toast.success('Pay period deleted');
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to delete pay period');
      toast.error(err.message || 'Something went wrong');
    }
  };

  const handleAssignBill = async (payPeriodId, billId) => {
    if (assigning) return;
    setAssigning(true);
    try {
      await api.assignBillToPayPeriod(payPeriodId, {
        bill_id: billId,
        month,
        year,
      });
      setAssigningPPId(null);
      toast.success('Bill assigned');
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to assign bill');
      toast.error(err.message || 'Something went wrong');
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassignBill = async (payPeriodId, billId) => {
    if (assigning) return;
    setAssigning(true);
    try {
      await api.unassignBillFromPayPeriod(payPeriodId, billId, {
        month: String(month),
        year: String(year),
      });
      toast.success('Bill unassigned');
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to unassign bill');
      toast.error(err.message || 'Something went wrong');
    } finally {
      setAssigning(false);
    }
  };

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      await api.generatePayPeriods();
      setError(null);
      toast.success('Pay periods generated');
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to generate pay periods');
      toast.error(err.message || 'Something went wrong');
    } finally {
      setGenerating(false);
    }
  };

  // Quick-assign from unassigned section
  const handleQuickAssign = async (billId, payPeriodId) => {
    if (!payPeriodId) return;
    await handleAssignBill(parseInt(payPeriodId), billId);
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
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Pay Periods</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button aria-label="Previous month"
              onClick={goToPrevMonth}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="font-medium text-gray-900 dark:text-gray-100 min-w-[140px] text-center">
              {MONTHS[month - 1]} {year}
            </span>
            <button aria-label="Next month"
              onClick={goToNextMonth}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <ChevronRight size={20} />
            </button>
          </div>
          {!isReadOnly && (
            <>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="btn-secondary flex items-center gap-2 disabled:opacity-50"
                title="Generate future recurring pay periods"
              >
                <RefreshCw size={16} />
                <span className="hidden sm:inline">{generating ? 'Generating...' : 'Generate'}</span>
              </button>
              <button onClick={openAddModal} className="btn-primary flex items-center gap-2">
                <Plus size={20} />
                <span>Add Pay Period</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="text-red-600 dark:text-red-400 flex-shrink-0" size={20} />
          <p className="text-red-800 dark:text-red-300 text-sm">{error}</p>
          <button aria-label="Dismiss error"
            onClick={() => setError(null)}
            className="ml-auto text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Income</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {formatCurrency(totalIncome)}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total Assigned</p>
          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">
            {formatCurrency(totalAssigned)}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">Remaining</p>
          <p className={`text-2xl font-bold mt-1 ${totalRemaining >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {formatCurrency(totalRemaining)}
          </p>
        </div>
      </div>

      {/* Pay period cards */}
      {payPeriods.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-center py-12">
          <Wallet className="w-12 h-12 text-gray-300 dark:text-gray-500 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">No pay periods for this month.</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
            Click &quot;Add Pay Period&quot; to add your income.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {payPeriods.map((pp) => {
            const ppBills = pp.bills || [];
            const ppAssigned = ppBills.reduce(
              (sum, b) => sum + (parseFloat(b.amount_override ?? b.bill_amount) || 0),
              0
            );
            const ppRemaining = (parseFloat(pp.amount) || 0) - ppAssigned;

            return (
              <div
                key={pp.id}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden"
              >
                {/* Green header */}
                <div className="bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-green-900 dark:text-green-100 truncate">
                        {pp.name}
                      </h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-lg font-bold text-green-700 dark:text-green-300">
                          {formatCurrency(pp.amount)}
                        </span>
                        <span className="text-sm text-green-600 dark:text-green-400">
                          {formatShortDate(pp.date)}
                        </span>
                        {pp.is_recurring && (
                          <span className="text-xs px-2 py-0.5 bg-green-200 dark:bg-green-800 text-green-700 dark:text-green-300 rounded-full">
                            {pp.frequency}
                          </span>
                        )}
                      </div>
                    </div>
                    {!isReadOnly && (
                      <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                        <button aria-label="Edit pay period"
                          onClick={() => openEditModal(pp)}
                          className="p-2 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-800/50 rounded-lg"
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>
                        <button aria-label="Delete pay period"
                          onClick={() => handleDelete(pp)}
                          className="p-2 text-green-600 dark:text-green-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 rounded-lg"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bill list */}
                <div className="p-4">
                  {ppBills.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-2">
                      No bills assigned
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {ppBills.map((bill) => (
                        <li
                          key={bill.id}
                          className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        >
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate block">
                              {bill.bill_name}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              Due: {getOrdinalDay(bill.bill_due_date)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 ml-2">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              {formatCurrency(bill.amount_override ?? bill.bill_amount)}
                            </span>
                            {!isReadOnly && (
                              <button aria-label="Remove bill from pay period"
                                onClick={() => handleUnassignBill(pp.id, bill.bill_id)}
                                className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded"
                                title="Remove"
                              >
                                <MinusCircle size={16} />
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Footer: remaining + assign dropdown */}
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    <span className={`text-sm font-medium ${ppRemaining >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatCurrency(ppRemaining)} remaining
                    </span>
                    {!isReadOnly && unassignedBills.length > 0 && (
                      <div className="relative">
                        {assigningPPId === pp.id ? (
                          <div className="flex items-center gap-2">
                            <select
                              className="input text-sm py-1 pr-8"
                              defaultValue=""
                              disabled={assigning}
                              onChange={(e) => {
                                if (e.target.value) handleAssignBill(pp.id, parseInt(e.target.value));
                              }}
                              autoFocus
                              onBlur={() => setTimeout(() => setAssigningPPId(null), 150)}
                            >
                              <option value="">Select bill...</option>
                              {unassignedBills.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.name} ({formatCurrency(b.amount)})
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <button
                            onClick={() => setAssigningPPId(pp.id)}
                            className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
                          >
                            + Assign Bill
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Unassigned Bills */}
      {unassignedBills.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">
              Unassigned Bills ({unassignedBills.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {unassignedBills.map((bill) => (
              <div
                key={bill.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {bill.name}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                    Due: {getOrdinalDay(bill.due_date)}
                  </span>
                </div>
                <div className="flex items-center gap-3 ml-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {formatCurrency(bill.amount)}
                  </span>
                  {!isReadOnly && payPeriods.length > 0 && (
                    <select
                      className="input text-sm py-1 pr-8"
                      defaultValue=""
                      disabled={assigning}
                      onChange={(e) => handleQuickAssign(bill.id, e.target.value)}
                    >
                      <option value="">Assign to...</option>
                      {payPeriods.map((pp) => (
                        <option key={pp.id} value={pp.id}>
                          {pp.name} ({formatShortDate(pp.date)})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {!isReadOnly && showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {editingPP ? 'Edit Pay Period' : 'Add Pay Period'}
              </h2>
              <button aria-label="Close"
                onClick={closeModal}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* Name */}
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input"
                  placeholder="e.g. Paycheck, Freelance, Bonus"
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
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="input"
                  placeholder="0.00"
                  required
                />
              </div>

              {/* Date */}
              <div>
                <label className="label">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="input"
                  required
                />
              </div>

              {/* Recurring toggle */}
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_recurring}
                    onChange={(e) => setForm({ ...form, is_recurring: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-primary-600"></div>
                </label>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Recurring
                </span>
              </div>

              {/* Frequency (shown if recurring) */}
              {form.is_recurring && (
                <div>
                  <label className="label">Frequency</label>
                  <select
                    value={form.frequency}
                    onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                    className="input"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="semimonthly">Semi-monthly (1st & 15th)</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : editingPP ? 'Save Changes' : 'Add Pay Period'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function getOrdinalDay(day) {
  const d = parseInt(day, 10);
  if (isNaN(d)) return day;
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const mod100 = d % 100;
  const suffix = suffixes[(mod100 - 20) % 10] || suffixes[mod100] || suffixes[0];
  return `${d}${suffix}`;
}
