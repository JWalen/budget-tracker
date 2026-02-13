import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { BudgetProvider } from './context/BudgetContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Budgets from './pages/Budgets';
import Recurring from './pages/Recurring';
import Categories from './pages/Categories';
import Settings from './pages/Settings';
import Debts from './pages/Debts';
import Bills from './pages/Bills';
import Import from './pages/Import';
import Calendar from './pages/Calendar';
import Help from './pages/Help';

// New Feature Pages
import Analytics from './pages/Analytics';
import Organizations from './pages/Organizations';
import Receipts from './pages/Receipts';
import BudgetTemplates from './pages/BudgetTemplates';
import Currency from './pages/Currency';
import Notifications from './pages/Notifications';
import AIAssistant from './pages/AIAssistant';
import PayPeriods from './pages/PayPeriods';
import Accounts from './pages/Accounts';
import MatchRules from './pages/MatchRules';
import Backups from './pages/Backups';
import Reports from './pages/Reports';
import AdminDashboard from './pages/Admin/AdminDashboard';
import AdminUsers from './pages/Admin/AdminUsers';
import AdminLogs from './pages/Admin/AdminLogs';
import AdminBackup from './pages/Admin/AdminBackup';
import AdminAISettings from './pages/Admin/AdminAISettings';
import AdminEmailSettings from './pages/Admin/AdminEmailSettings';
import FamilyMembers from './pages/FamilyMembers';

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
      </Route>
    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <BudgetProvider>
            <AppRoutes />
          </BudgetProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
