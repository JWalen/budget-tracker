import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useBudget } from '../context/BudgetContext';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Landmark,
  DollarSign,
  CreditCard,
  UserCheck,
  UserX,
} from 'lucide-react';

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const debtTypes = [
  { value: 'owe', label: 'I Owe' },
  { value: 'owed', label: 'Owed To Me' },
  { value: 'loan', label: 'Loan' },
  { value: 'credit_card', label: 'Credit Card' },
];

const defaultForm = {
  type: 'owe',
  name: '',
  balance: '',
  contact: '',
  original_amount: '',
  interest_rate: '',
  minimum_payment: '',
  due_date: '',
  notes: '',
};

export default function Debts() {
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('people');
  const [showModal, setShowModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [payingDebt, setPayingDebt] = useState(null);
  const [form, setForm] = useState({ ...defaultForm });
  const [paymentForm, setPaymentForm] = useState({ amount: '', create_expense: false });
  const { activeBudgetOwner, isReadOnly } = useBudget();

  useEffect(() => {
    loadDebts();
  }, [activeBudgetOwner?.id]);

  const loadDebts = async () => {
    try {
      const data = await api.getDebts();
      setDebts(data);
    } catch (error) {
      console.error('Failed to load debts:', error);
    } finally {
      setLoading(false);
    }
  };

  // Derived data
  const peopleDebts = debts.filter((d) => d.type === 'owe' || d.type === 'owed');
  const loanDebts = debts.filter((d) => d.type === 'loan' || d.type === 'credit_card');

  const totalIOwe = debts
    .filter((d) => d.type === 'owe')
    .reduce((sum, d) => sum + (parseFloat(d.balance) || 0), 0);

  const totalOwedToMe = debts
    .filter((d) => d.type === 'owed')
    .reduce((sum, d) => sum + (parseFloat(d.balance) || 0), 0);

  const totalLoanBalance = debts
    .filter((d) => d.type === 'loan' || d.type === 'credit_card')
    .reduce((sum, d) => sum + (parseFloat(d.balance) || 0), 0);

  // Modal handlers
  const openModal = (debt = null) => {
    if (debt) {
      setEditing(debt);
      setForm({
        type: debt.type,
        name: debt.name || '',
        balance: debt.balance || '',
        contact: debt.contact || '',
        original_amount: debt.original_amount || '',
        interest_rate: debt.interest_rate || '',
        minimum_payment: debt.minimum_payment || '',
        due_date: debt.due_date ? debt.due_date.split('T')[0] : '',
        notes: debt.notes || '',
      });
    } else {
      setEditing(null);
      setForm({
        ...defaultForm,
        type: activeTab === 'people' ? 'owe' : 'loan',
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
  };

  const openPaymentModal = (debt) => {
    setPayingDebt(debt);
    setPaymentForm({ amount: '', create_expense: false });
    setShowPaymentModal(true);
  };

  const closePaymentModal = () => {
    setShowPaymentModal(false);
    setPayingDebt(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        type: form.type,
        name: form.name,
        balance: parseFloat(form.balance),
        notes: form.notes || null,
      };

      if (form.type === 'owe' || form.type === 'owed') {
        data.contact = form.contact || null;
      }

      if (form.type === 'loan' || form.type === 'credit_card') {
        data.original_amount = form.original_amount ? parseFloat(form.original_amount) : null;
        data.interest_rate = form.interest_rate ? parseFloat(form.interest_rate) : null;
        data.minimum_payment = form.minimum_payment ? parseFloat(form.minimum_payment) : null;
        data.due_date = form.due_date || null;
      }

      if (editing) {
        await api.updateDebt(editing.id, data);
      } else {
        await api.createDebt(data);
      }
      closeModal();
      loadDebts();
    } catch (error) {
      console.error('Failed to save debt:', error);
    }
  };

  const handlePayment = async (e) => {
    e.preventDefault();
    if (!payingDebt) return;
    try {
      await api.payDebt(payingDebt.id, {
        amount: parseFloat(paymentForm.amount),
        create_expense: paymentForm.create_expense,
      });
      closePaymentModal();
      loadDebts();
    } catch (error) {
      console.error('Failed to process payment:', error);
    }
  };

  const handleMarkPaid = async (debt) => {
    try {
      await api.payDebt(debt.id, {
        amount: parseFloat(debt.balance),
        create_expense: false,
      });
      loadDebts();
    } catch (error) {
      console.error('Failed to mark as paid:', error);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this debt?')) return;
    try {
      await api.deleteDebt(id);
      loadDebts();
    } catch (error) {
      console.error('Failed to delete debt:', error);
    }
  };

  const isPeopleType = form.type === 'owe' || form.type === 'owed';
  const isLoanType = form.type === 'loan' || form.type === 'credit_card';

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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Debts</h1>
        {!isReadOnly && (
          <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
            <Plus size={20} />
            <span>Add Debt</span>
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
              <UserX className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total I Owe</p>
              <p className="text-xl font-bold text-red-600 dark:text-red-400">
                {formatCurrency(totalIOwe)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
              <UserCheck className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Owed To Me</p>
              <p className="text-xl font-bold text-green-600 dark:text-green-400">
                {formatCurrency(totalOwedToMe)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Landmark className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Loan/Card Balance</p>
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                {formatCurrency(totalLoanBalance)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('people')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'people'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          People
        </button>
        <button
          onClick={() => setActiveTab('loans')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'loans'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Loans & Cards
        </button>
      </div>

      {/* People Tab */}
      {activeTab === 'people' && (
        <>
          {peopleDebts.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-center py-12">
              <DollarSign className="w-12 h-12 text-gray-300 dark:text-gray-500 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">No people debts yet.</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                Track money you owe others or money owed to you.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
              {peopleDebts.map((debt) => (
                <div key={debt.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-2 rounded-lg ${
                        debt.type === 'owe'
                          ? 'bg-red-100 dark:bg-red-900/30'
                          : 'bg-green-100 dark:bg-green-900/30'
                      }`}
                    >
                      {debt.type === 'owe' ? (
                        <UserX className="w-5 h-5 text-red-600 dark:text-red-400" />
                      ) : (
                        <UserCheck className="w-5 h-5 text-green-600 dark:text-green-400" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{debt.name}</p>
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            debt.type === 'owe'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                              : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          }`}
                        >
                          {debt.type === 'owe' ? 'I owe' : 'Owes me'}
                        </span>
                        {debt.contact && (
                          <>
                            <span>·</span>
                            <span>{debt.contact}</span>
                          </>
                        )}
                        {debt.notes && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[200px]">{debt.notes}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-lg font-semibold ${
                        debt.type === 'owe'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-green-600 dark:text-green-400'
                      }`}
                    >
                      {formatCurrency(debt.balance)}
                    </span>
                    {!isReadOnly && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openPaymentModal(debt)}
                          className="p-2 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
                          title="Make payment"
                        >
                          <DollarSign size={16} />
                        </button>
                        <button
                          onClick={() => handleMarkPaid(debt)}
                          className="p-2 text-gray-400 dark:text-gray-500 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg"
                          title="Mark as paid"
                        >
                          <UserCheck size={16} />
                        </button>
                        <button
                          onClick={() => openModal(debt)}
                          className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(debt.id)}
                          className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Loans & Cards Tab */}
      {activeTab === 'loans' && (
        <>
          {loanDebts.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-center py-12">
              <CreditCard className="w-12 h-12 text-gray-300 dark:text-gray-500 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">No loans or credit cards tracked.</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                Add loans or credit card balances to track your payoff progress.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {loanDebts.map((debt) => {
                const originalAmount = parseFloat(debt.original_amount) || parseFloat(debt.balance);
                const balance = parseFloat(debt.balance) || 0;
                const paidPercent = originalAmount > 0
                  ? Math.min(100, Math.round(((originalAmount - balance) / originalAmount) * 100))
                  : 0;

                return (
                  <div
                    key={debt.id}
                    className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg ${
                            debt.type === 'credit_card'
                              ? 'bg-purple-100 dark:bg-purple-900/30'
                              : 'bg-blue-100 dark:bg-blue-900/30'
                          }`}
                        >
                          {debt.type === 'credit_card' ? (
                            <CreditCard className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                          ) : (
                            <Landmark className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100">{debt.name}</p>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              debt.type === 'credit_card'
                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                            }`}
                          >
                            {debt.type === 'credit_card' ? 'Credit Card' : 'Loan'}
                          </span>
                        </div>
                      </div>
                      {!isReadOnly && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openPaymentModal(debt)}
                            className="p-2 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
                            title="Make payment"
                          >
                            <DollarSign size={16} />
                          </button>
                          <button
                            onClick={() => openModal(debt)}
                            className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                            title="Edit"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(debt.id)}
                            className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Balance */}
                    <div className="mb-4">
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {formatCurrency(balance)}
                      </p>
                      {debt.original_amount && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          of {formatCurrency(originalAmount)} original
                        </p>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-500 dark:text-gray-400">Paid off</span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          {paidPercent}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                        <div
                          className={`h-2.5 rounded-full transition-all ${
                            debt.type === 'credit_card'
                              ? 'bg-purple-500'
                              : 'bg-blue-500'
                          }`}
                          style={{ width: `${paidPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {debt.interest_rate != null && debt.interest_rate !== '' && (
                        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-2.5">
                          <p className="text-gray-500 dark:text-gray-400">Interest Rate</p>
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {debt.interest_rate}%
                          </p>
                        </div>
                      )}
                      {debt.minimum_payment != null && debt.minimum_payment !== '' && (
                        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-2.5">
                          <p className="text-gray-500 dark:text-gray-400">Min Payment</p>
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {formatCurrency(debt.minimum_payment)}
                          </p>
                        </div>
                      )}
                      {debt.due_date && (
                        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-2.5">
                          <p className="text-gray-500 dark:text-gray-400">Due Date</p>
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {formatDate(debt.due_date)}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    {debt.notes && (
                      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 italic">
                        {debt.notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Add/Edit Modal */}
      {!isReadOnly && showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {editing ? 'Edit Debt' : 'New Debt'}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* Type selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {debtTypes.map((dt) => (
                    <button
                      key={dt.value}
                      type="button"
                      onClick={() => setForm({ ...form, type: dt.value })}
                      className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors border ${
                        form.type === dt.value
                          ? dt.value === 'owe'
                            ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700'
                            : dt.value === 'owed'
                            ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700'
                            : dt.value === 'loan'
                            ? 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700'
                            : 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700'
                      }`}
                    >
                      {dt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input"
                  placeholder={
                    isPeopleType ? 'e.g., John Smith' : 'e.g., Chase Sapphire'
                  }
                  required
                />
              </div>

              {/* Balance */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Balance
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.balance}
                  onChange={(e) => setForm({ ...form, balance: e.target.value })}
                  className="input"
                  placeholder="0.00"
                  required
                />
              </div>

              {/* Contact - only for people types */}
              {isPeopleType && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Contact
                  </label>
                  <input
                    type="text"
                    value={form.contact}
                    onChange={(e) => setForm({ ...form, contact: e.target.value })}
                    className="input"
                    placeholder="Phone, email, or other contact info"
                  />
                </div>
              )}

              {/* Loan/Credit Card specific fields */}
              {isLoanType && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Original Amount
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.original_amount}
                      onChange={(e) => setForm({ ...form, original_amount: e.target.value })}
                      className="input"
                      placeholder="0.00"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Interest Rate (%)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={form.interest_rate}
                        onChange={(e) => setForm({ ...form, interest_rate: e.target.value })}
                        className="input"
                        placeholder="0.00"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Min Payment
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.minimum_payment}
                        onChange={(e) => setForm({ ...form, minimum_payment: e.target.value })}
                        className="input"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={form.due_date}
                      onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                      className="input"
                    />
                  </div>
                </>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="input"
                  rows={3}
                  placeholder="Optional notes..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary">
                  {editing ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {!isReadOnly && showPaymentModal && payingDebt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Make Payment
              </h2>
              <button
                onClick={closePaymentModal}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 dark:text-gray-400"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handlePayment} className="p-4 space-y-4">
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">Paying towards</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">{payingDebt.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Current balance: {formatCurrency(payingDebt.balance)}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Payment Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={payingDebt.balance}
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  className="input"
                  placeholder="0.00"
                  required
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={paymentForm.create_expense}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, create_expense: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Create expense transaction
                </span>
              </label>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closePaymentModal} className="flex-1 btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary">
                  Pay {paymentForm.amount ? formatCurrency(parseFloat(paymentForm.amount)) : '$0.00'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
