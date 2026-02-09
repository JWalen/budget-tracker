const API_URL = '/api';

const getToken = () => localStorage.getItem('token');
const getBudgetOwnerId = () => localStorage.getItem('budgetOwnerId');

const headers = () => ({
  'Content-Type': 'application/json',
  ...(getToken() && { Authorization: `Bearer ${getToken()}` }),
  ...(getBudgetOwnerId() && { 'X-Budget-Owner': getBudgetOwnerId() }),
});

const handleResponse = async (response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }
  return response.json();
};

export const api = {
  // Auth
  login: (email, password, mfaCode = null) =>
    fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email, password, mfaCode }),
    }).then(handleResponse),

  register: (email, password, name) =>
    fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email, password, name }),
    }).then(handleResponse),

  getMe: () =>
    fetch(`${API_URL}/auth/me`, { headers: headers() }).then(handleResponse),

  // MFA
  setupMfa: () =>
    fetch(`${API_URL}/auth/mfa/setup`, {
      method: 'POST',
      headers: headers(),
    }).then(handleResponse),

  enableMfa: (code) =>
    fetch(`${API_URL}/auth/mfa/enable`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ code }),
    }).then(handleResponse),

  disableMfa: (code, password) =>
    fetch(`${API_URL}/auth/mfa/disable`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ code, password }),
    }).then(handleResponse),

  changePassword: (currentPassword, newPassword) =>
    fetch(`${API_URL}/auth/change-password`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ currentPassword, newPassword }),
    }).then(handleResponse),

  // Categories
  getCategories: () =>
    fetch(`${API_URL}/categories`, { headers: headers() }).then(handleResponse),

  createCategory: (data) =>
    fetch(`${API_URL}/categories`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  updateCategory: (id, data) =>
    fetch(`${API_URL}/categories/${id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  deleteCategory: (id) =>
    fetch(`${API_URL}/categories/${id}`, {
      method: 'DELETE',
      headers: headers(),
    }).then(handleResponse),

  // Transactions
  getTransactions: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/transactions${query ? `?${query}` : ''}`, {
      headers: headers(),
    }).then(handleResponse);
  },

  createTransaction: (data) =>
    fetch(`${API_URL}/transactions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  updateTransaction: (id, data) =>
    fetch(`${API_URL}/transactions/${id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  deleteTransaction: (id) =>
    fetch(`${API_URL}/transactions/${id}`, {
      method: 'DELETE',
      headers: headers(),
    }).then(handleResponse),

  // Budgets
  getBudgets: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/budgets${query ? `?${query}` : ''}`, {
      headers: headers(),
    }).then(handleResponse);
  },

  createBudget: (data) =>
    fetch(`${API_URL}/budgets`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  deleteBudget: (id) =>
    fetch(`${API_URL}/budgets/${id}`, {
      method: 'DELETE',
      headers: headers(),
    }).then(handleResponse),

  copyBudgets: (data) =>
    fetch(`${API_URL}/budgets/copy`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  updateBudget: (id, data) =>
    fetch(`${API_URL}/budgets/${id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  updateBudgetAllMonths: (data) =>
    fetch(`${API_URL}/budgets/update-all-months`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  // Recurring
  getRecurring: () =>
    fetch(`${API_URL}/recurring`, { headers: headers() }).then(handleResponse),

  createRecurring: (data) =>
    fetch(`${API_URL}/recurring`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  updateRecurring: (id, data) =>
    fetch(`${API_URL}/recurring/${id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  deleteRecurring: (id) =>
    fetch(`${API_URL}/recurring/${id}`, {
      method: 'DELETE',
      headers: headers(),
    }).then(handleResponse),

  processRecurring: () =>
    fetch(`${API_URL}/recurring/process`, {
      method: 'POST',
      headers: headers(),
    }).then(handleResponse),

  // Dashboard
  getSummary: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/dashboard/summary${query ? `?${query}` : ''}`, {
      headers: headers(),
    }).then(handleResponse);
  },

  getTrend: () =>
    fetch(`${API_URL}/dashboard/trend`, { headers: headers() }).then(handleResponse),

  // Admin
  getAdminStats: () =>
    fetch(`${API_URL}/admin/stats`, { headers: headers() }).then(handleResponse),

  getAdminUsers: (search = '') => {
    const params = search ? `?search=${encodeURIComponent(search)}` : '';
    return fetch(`${API_URL}/admin/users${params}`, { headers: headers() }).then(handleResponse);
  },

  deleteAdminUser: (id) =>
    fetch(`${API_URL}/admin/users/${id}`, {
      method: 'DELETE',
      headers: headers(),
    }).then(handleResponse),

  resetAdminUserPassword: (id, password) =>
    fetch(`${API_URL}/admin/users/${id}/reset-password`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ password }),
    }).then(handleResponse),

  getAdminActivity: () =>
    fetch(`${API_URL}/admin/activity`, { headers: headers() }).then(handleResponse),

  // Debts
  getDebts: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/debts${query ? `?${query}` : ''}`, {
      headers: headers(),
    }).then(handleResponse);
  },

  createDebt: (data) =>
    fetch(`${API_URL}/debts`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  updateDebt: (id, data) =>
    fetch(`${API_URL}/debts/${id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  deleteDebt: (id) =>
    fetch(`${API_URL}/debts/${id}`, {
      method: 'DELETE',
      headers: headers(),
    }).then(handleResponse),

  payDebt: (id, data) =>
    fetch(`${API_URL}/debts/${id}/payment`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  // Bills
  getBills: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/bills${query ? `?${query}` : ''}`, {
      headers: headers(),
    }).then(handleResponse);
  },

  getBillStatus: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/bills/status${query ? `?${query}` : ''}`, {
      headers: headers(),
    }).then(handleResponse);
  },

  createBill: (data) =>
    fetch(`${API_URL}/bills`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  updateBill: (id, data) =>
    fetch(`${API_URL}/bills/${id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  deleteBill: (id) =>
    fetch(`${API_URL}/bills/${id}`, {
      method: 'DELETE',
      headers: headers(),
    }).then(handleResponse),

  payBill: (id, data) =>
    fetch(`${API_URL}/bills/${id}/pay`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  // Pay Periods
  getPayPeriods: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/pay-periods${query ? `?${query}` : ''}`, {
      headers: headers(),
    }).then(handleResponse);
  },

  createPayPeriod: (data) =>
    fetch(`${API_URL}/pay-periods`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  updatePayPeriod: (id, data) =>
    fetch(`${API_URL}/pay-periods/${id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  deletePayPeriod: (id) =>
    fetch(`${API_URL}/pay-periods/${id}`, {
      method: 'DELETE',
      headers: headers(),
    }).then(handleResponse),

  assignBillToPayPeriod: (payPeriodId, data) =>
    fetch(`${API_URL}/pay-periods/${payPeriodId}/bills`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  unassignBillFromPayPeriod: (payPeriodId, billId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/pay-periods/${payPeriodId}/bills/${billId}${query ? `?${query}` : ''}`, {
      method: 'DELETE',
      headers: headers(),
    }).then(handleResponse);
  },

  generatePayPeriods: () =>
    fetch(`${API_URL}/pay-periods/generate`, {
      method: 'POST',
      headers: headers(),
    }).then(handleResponse),

  // Import
  uploadImport: (formData) =>
    fetch(`${API_URL}/import/upload`, {
      method: 'POST',
      headers: {
        ...(getToken() && { Authorization: `Bearer ${getToken()}` }),
        ...(getBudgetOwnerId() && { 'X-Budget-Owner': getBudgetOwnerId() }),
      },
      body: formData,
    }).then(handleResponse),

  confirmImport: (data) =>
    fetch(`${API_URL}/import/confirm`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  getImportRules: () =>
    fetch(`${API_URL}/import/rules`, { headers: headers() }).then(handleResponse),

  createImportRule: (data) =>
    fetch(`${API_URL}/import/rules`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  updateImportRule: (id, data) =>
    fetch(`${API_URL}/import/rules/${id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  deleteImportRule: (id) =>
    fetch(`${API_URL}/import/rules/${id}`, {
      method: 'DELETE',
      headers: headers(),
    }).then(handleResponse),

  applyRulesToExisting: () =>
    fetch(`${API_URL}/import/apply-rules`, {
      method: 'POST',
      headers: headers(),
    }).then(handleResponse),

  // Sharing
  getShares: () =>
    fetch(`${API_URL}/sharing`, { headers: headers() }).then(handleResponse),

  inviteShare: (email, role) =>
    fetch(`${API_URL}/sharing/invite`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email, role }),
    }).then(handleResponse),

  updateShare: (id, role) =>
    fetch(`${API_URL}/sharing/${id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ role }),
    }).then(handleResponse),

  deleteShare: (id) =>
    fetch(`${API_URL}/sharing/${id}`, {
      method: 'DELETE',
      headers: headers(),
    }).then(handleResponse),

  getPendingInvites: () =>
    fetch(`${API_URL}/sharing/pending`, { headers: headers() }).then(handleResponse),

  acceptInvite: (token) =>
    fetch(`${API_URL}/sharing/accept/${token}`, {
      method: 'POST',
      headers: headers(),
    }).then(handleResponse),

  // Backup
  exportBackup: () =>
    fetch(`${API_URL}/backup/export`, { headers: headers() }).then(async (response) => {
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(error.error || 'Export failed');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : 'budget-backup.sql';
      return { blob, filename };
    }),

  restoreBackup: async (formData) => {
    // Extract the JSON from the file
    const file = formData.get('backup');
    const text = await file.text();
    const backupData = JSON.parse(text);

    // Send as JSON, not FormData
    return fetch(`${API_URL}/backup/restore`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(backupData),
    }).then(handleResponse);
  },

  adminExportBackup: () =>
    fetch(`${API_URL}/backup/admin/export`, { headers: headers() }).then(async (response) => {
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(error.error || 'Export failed');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : 'budget-full-backup.sql';
      return { blob, filename };
    }),

  adminRestoreBackup: (formData) =>
    fetch(`${API_URL}/backup/admin/restore`, {
      method: 'POST',
      headers: {
        ...(getToken() && { Authorization: `Bearer ${getToken()}` }),
      },
      body: formData,
    }).then(handleResponse),

  // Scheduled Backups
  createBackup: (data) =>
    fetch(`${API_URL}/backup/create`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data || {}),
    }).then(handleResponse),

  getBackupHistory: () =>
    fetch(`${API_URL}/backup/history`, { headers: headers() }).then(handleResponse),

  getBackupSchedules: () =>
    fetch(`${API_URL}/backup/schedules`, { headers: headers() }).then(handleResponse),

  createBackupSchedule: (data) =>
    fetch(`${API_URL}/backup/schedules`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  updateBackupSchedule: (id, data) =>
    fetch(`${API_URL}/backup/schedules/${id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  deleteBackupSchedule: (id) =>
    fetch(`${API_URL}/backup/schedules/${id}`, {
      method: 'DELETE',
      headers: headers(),
    }).then(handleResponse),

  getBackupConfig: () =>
    fetch(`${API_URL}/backup/config`, { headers: headers() }).then(handleResponse),

  saveBackupConfig: (data) =>
    fetch(`${API_URL}/backup/config`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  downloadBackup: (id) => {
    window.open(`${API_URL}/backup/${id}/download`, '_blank');
  },

  downloadBackupNow: async (data) => {
    const response = await fetch(`${API_URL}/backup/download-now`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data || {}),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to create backup');
    }
    return result;
  },

  // Bank Accounts
  getAccounts: () =>
    fetch(`${API_URL}/accounts`, { headers: headers() }).then(handleResponse),

  getAccount: (id) =>
    fetch(`${API_URL}/accounts/${id}`, { headers: headers() }).then(handleResponse),

  createAccount: (data) =>
    fetch(`${API_URL}/accounts`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  updateAccount: (id, data) =>
    fetch(`${API_URL}/accounts/${id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  deleteAccount: (id) =>
    fetch(`${API_URL}/accounts/${id}`, {
      method: 'DELETE',
      headers: headers(),
    }).then(handleResponse),

  reconcileAccount: (id, data) =>
    fetch(`${API_URL}/accounts/${id}/reconcile`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  // Reports
  getReportExpenseSummary: (params) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/reports/expense-summary?${query}`, {
      headers: headers(),
    }).then(handleResponse);
  },

  getReportIncomeExpense: (params) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/reports/income-expense?${query}`, {
      headers: headers(),
    }).then(handleResponse);
  },

  getReportCategoryTrend: (params) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/reports/category-trend?${query}`, {
      headers: headers(),
    }).then(handleResponse);
  },

  getReportBudgetPerformance: (params) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/reports/budget-performance?${query}`, {
      headers: headers(),
    }).then(handleResponse);
  },

  getReportBillPayment: (params) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/reports/bill-payment?${query}`, {
      headers: headers(),
    }).then(handleResponse);
  },

  getReportCashFlow: (params) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/reports/cash-flow?${query}`, {
      headers: headers(),
    }).then(handleResponse);
  },

  // Admin Email Configuration
  getEmailConfig: () => {
    return fetch(`${API_URL}/admin/email/config`, {
      headers: headers(),
    }).then(handleResponse);
  },

  updateEmailConfig: (config) => {
    return fetch(`${API_URL}/admin/email/config`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(config),
    }).then(handleResponse);
  },

  testEmailConfig: (testEmail) => {
    return fetch(`${API_URL}/admin/email/test`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ testEmail }),
    }).then(handleResponse);
  },

  getEmailStats: () => {
    return fetch(`${API_URL}/admin/email/stats`, {
      headers: headers(),
    }).then(handleResponse);
  },

  // Family Members
  getFamilyMembers: () => {
    return fetch(`${API_URL}/family`, {
      headers: headers(),
    }).then(handleResponse);
  },

  createFamilyMember: (data) => {
    return fetch(`${API_URL}/family`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse);
  },

  updateFamilyMember: (id, data) => {
    return fetch(`${API_URL}/family/${id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse);
  },

  deleteFamilyMember: (id) => {
    return fetch(`${API_URL}/family/${id}`, {
      method: 'DELETE',
      headers: headers(),
    }).then(handleResponse);
  },

  getFamilyMemberSpending: (id, params) => {
    const queryString = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/family/${id}/spending${queryString ? `?${queryString}` : ''}`, {
      headers: headers(),
    }).then(handleResponse);
  },

  setFamilyMemberLimit: (id, data) => {
    return fetch(`${API_URL}/family/${id}/limits`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse);
  },

  // AI Assistant
  getAIStatus: () => {
    return fetch(`${API_URL}/ai/status`, {
      headers: headers(),
    }).then(handleResponse);
  },

  sendAIChat: (message, context) => {
    return fetch(`${API_URL}/ai/chat`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ message, context }),
    }).then(handleResponse);
  },

  getAIInsights: (month, year) => {
    const params = new URLSearchParams();
    if (month) params.append('month', month);
    if (year) params.append('year', year);
    return fetch(`${API_URL}/ai/insights/spending?${params}`, {
      headers: headers(),
    }).then(handleResponse);
  },

  getAIAnomalies: () => {
    return fetch(`${API_URL}/ai/anomalies`, {
      headers: headers(),
    }).then(handleResponse);
  },

  getAIBillOptimization: () => {
    return fetch(`${API_URL}/ai/optimize/bills`, {
      headers: headers(),
    }).then(handleResponse);
  },

  getAIBudgetRecommendations: () => {
    return fetch(`${API_URL}/ai/recommendations/budget`, {
      headers: headers(),
    }).then(handleResponse);
  },

  getAIDashboard: () => {
    return fetch(`${API_URL}/ai/dashboard`, {
      headers: headers(),
    }).then(handleResponse);
  },

  // Admin endpoints
  getAdminStats: () =>
    fetch(`${API_URL}/admin/stats`, { headers: headers() }).then(handleResponse),

  getAdminUsers: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/admin/users${query ? `?${query}` : ''}`, {
      headers: headers(),
    }).then(handleResponse);
  },

  updateAdminUser: (id, data) =>
    fetch(`${API_URL}/admin/users/${id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(data),
    }).then(handleResponse),

  deleteAdminUser: (id) =>
    fetch(`${API_URL}/admin/users/${id}`, {
      method: 'DELETE',
      headers: headers(),
    }).then(handleResponse),

  resetUserPassword: (id, password) =>
    fetch(`${API_URL}/admin/users/${id}/reset-password`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ password }),
    }).then(handleResponse),

  toggleUserMfa: (id) =>
    fetch(`${API_URL}/admin/users/${id}/toggle-mfa`, {
      method: 'POST',
      headers: headers(),
    }).then(handleResponse),

  impersonateUser: (id) =>
    fetch(`${API_URL}/admin/users/${id}/impersonate`, {
      method: 'POST',
      headers: headers(),
    }).then(handleResponse),

  getAdminActivity: () =>
    fetch(`${API_URL}/admin/activity`, { headers: headers() }).then(handleResponse),

  getAdminLogs: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetch(`${API_URL}/admin/logs${query ? `?${query}` : ''}`, {
      headers: headers(),
    }).then(handleResponse);
  },

  getAdminShares: () =>
    fetch(`${API_URL}/admin/shares`, { headers: headers() }).then(handleResponse),

  revokeAdminShare: (id) =>
    fetch(`${API_URL}/admin/shares/${id}`, {
      method: 'DELETE',
      headers: headers(),
    }).then(handleResponse),

  getAdminConfig: () =>
    fetch(`${API_URL}/admin/config`, { headers: headers() }).then(handleResponse),

  createAdminBackup: () =>
    fetch(`${API_URL}/admin/backup`, {
      method: 'POST',
      headers: headers(),
    }).then(handleResponse),

  getAdminBackups: () =>
    fetch(`${API_URL}/admin/backups`, { headers: headers() }).then(handleResponse),

  getAdminTransactionsOverview: () =>
    fetch(`${API_URL}/admin/transactions/overview`, { headers: headers() }).then(handleResponse),

  adminCleanup: (type, days) =>
    fetch(`${API_URL}/admin/cleanup`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ type, days }),
    }).then(handleResponse),
};
