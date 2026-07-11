import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { BudgetProvider } from './context/BudgetContext';
import { ToastProvider } from './context/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';
import PageSpinner from './components/PageSpinner';
import Layout from './components/Layout';

// Auth pages stay eager so the login screen paints without a chunk round-trip.
import Login from './pages/Login';
import Register from './pages/Register';

// Everything behind auth is code-split — each page loads on first visit instead
// of shipping all ~30 pages (recharts, admin, import wizard…) in one 1 MB bundle.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Budgets = lazy(() => import('./pages/Budgets'));
const Recurring = lazy(() => import('./pages/Recurring'));
const Categories = lazy(() => import('./pages/Categories'));
const Settings = lazy(() => import('./pages/Settings'));
const Debts = lazy(() => import('./pages/Debts'));
const Bills = lazy(() => import('./pages/Bills'));
const Import = lazy(() => import('./pages/Import'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Help = lazy(() => import('./pages/Help'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Organizations = lazy(() => import('./pages/Organizations'));
const Receipts = lazy(() => import('./pages/Receipts'));
const BudgetTemplates = lazy(() => import('./pages/BudgetTemplates'));
const Currency = lazy(() => import('./pages/Currency'));
const Notifications = lazy(() => import('./pages/Notifications'));
const AIAssistant = lazy(() => import('./pages/AIAssistant'));
const PayPeriods = lazy(() => import('./pages/PayPeriods'));
const Accounts = lazy(() => import('./pages/Accounts'));
const MatchRules = lazy(() => import('./pages/MatchRules'));
const Backups = lazy(() => import('./pages/Backups'));
const Reports = lazy(() => import('./pages/Reports'));
const AdminDashboard = lazy(() => import('./pages/Admin/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/Admin/AdminUsers'));
const AdminLogs = lazy(() => import('./pages/Admin/AdminLogs'));
const AdminBackup = lazy(() => import('./pages/Admin/AdminBackup'));
const AdminAISettings = lazy(() => import('./pages/Admin/AdminAISettings'));
const AdminEmailSettings = lazy(() => import('./pages/Admin/AdminEmailSettings'));
const FamilyMembers = lazy(() => import('./pages/FamilyMembers'));

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user?.is_admin) {
    return <Navigate to="/" replace />;
  }

  return children;
};

const AppRoutes = () => {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="budgets" element={<Budgets />} />
        <Route path="budget-templates" element={<BudgetTemplates />} />
        <Route path="recurring" element={<Recurring />} />
        <Route path="categories" element={<Categories />} />
        <Route path="debts" element={<Debts />} />
        <Route path="bills" element={<Bills />} />
        <Route path="receipts" element={<Receipts />} />
        <Route path="pay-periods" element={<PayPeriods />} />
        <Route path="import" element={<Import />} />
        <Route path="match-rules" element={<MatchRules />} />
        <Route path="backups" element={<Backups />} />
        <Route path="reports" element={<Reports />} />
        <Route path="currency" element={<Currency />} />
        <Route path="organizations" element={<Organizations />} />
        <Route path="family" element={<FamilyMembers />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="ai-assistant" element={<AIAssistant />} />
        <Route path="settings" element={<Settings />} />
        <Route path="help" element={<Help />} />
        <Route path="admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
        <Route path="admin/logs" element={<AdminRoute><AdminLogs /></AdminRoute>} />
        <Route path="admin/backups" element={<AdminRoute><AdminBackup /></AdminRoute>} />
        <Route path="admin/ai" element={<AdminRoute><AdminAISettings /></AdminRoute>} />
        <Route path="admin/email" element={<AdminRoute><AdminEmailSettings /></AdminRoute>} />
      </Route>
    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <BudgetProvider>
              <ErrorBoundary>
                <Suspense fallback={<PageSpinner />}>
                  <AppRoutes />
                </Suspense>
              </ErrorBoundary>
            </BudgetProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
