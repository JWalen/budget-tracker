import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useBudget } from '../context/BudgetContext';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Target,
  RefreshCw,
  Tags,
  Settings,
  LogOut,
  Menu,
  X,
  Shield,
  Users,
  Activity,
  Sun,
  Moon,
  CalendarDays,
  Calendar,
  Landmark,
  Receipt,
  Upload,
  ChevronDown,
  Eye,
  HelpCircle,
  Wallet,
  Zap,
  HardDrive,
  BarChart2,
  TrendingUp,
  CreditCard,
  Building2,
  FileText,
  DollarSign,
  Bell,
  Sparkles,
  Share2,
  Mail,
  Brain,
} from 'lucide-react';
import { useState } from 'react';
import { APP_VERSION } from '../version';
import ChatWidget from './ChatWidget';

const navGroups = [
  { items: [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
  ]},
  { label: 'FINANCES', items: [
    { to: '/accounts', icon: Wallet, label: 'Accounts' },
    { to: '/budgets', icon: Target, label: 'Budgets' },
    { to: '/bills', icon: FileText, label: 'Bills' },
    { to: '/recurring', icon: RefreshCw, label: 'Recurring' },
    { to: '/debts', icon: Landmark, label: 'Debts' },
  ]},
  { label: 'PLANNING', items: [
    { to: '/ai-assistant', icon: Brain, label: 'AI Assistant' },
    { to: '/reports', icon: BarChart2, label: 'Reports' },
    { to: '/pay-periods', icon: Calendar, label: 'Pay Periods' },
    { to: '/budget-templates', icon: Sparkles, label: 'Templates' },
    { to: '/analytics', icon: TrendingUp, label: 'Analytics' },
  ]},
  { label: 'MANAGE', items: [
    { to: '/categories', icon: Tags, label: 'Categories' },
    { to: '/match-rules', icon: Zap, label: 'Auto-Categorize' },
    { to: '/receipts', icon: Receipt, label: 'Receipts' },
    { to: '/import', icon: Upload, label: 'Import' },
    { to: '/currency', icon: DollarSign, label: 'Currency' },
    { to: '/family', icon: Users, label: 'Family Members' },
  ]},
  { label: 'ACCOUNT', items: [
    { to: '/organizations', icon: Building2, label: 'Households' },
    { to: '/backups', icon: HardDrive, label: 'Backups' },
    { to: '/notifications', icon: Bell, label: 'Notifications' },
    { to: '/settings', icon: Settings, label: 'Settings' },
    { to: '/help', icon: HelpCircle, label: 'Help' },
  ]},
];

const adminNavItems = [
  { to: '/admin', icon: Shield, label: 'Admin Console' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { activeBudgetOwner, sharedBudgets, isReadOnly, switchBudget } = useBudget();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showBudgetSwitcher, setShowBudgetSwitcher] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSwitchBudget = (owner) => {
    switchBudget(owner);
    setShowBudgetSwitcher(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Mobile header */}
      <div className="lg:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="Budget Tracker" className="w-8 h-8 rounded-lg" />
          <div>
            <h1 className="text-xl font-bold text-primary-600">Budget Tracker</h1>
            <span className="text-xs text-gray-400">v{APP_VERSION}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <NavLink
            to="/calendar"
            className={({ isActive }) =>
              `p-2 rounded-lg transition-colors ${
                isActive
                  ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`
            }
            title="Calendar"
          >
            <CalendarDays size={20} />
          </NavLink>
          <NavLink
            to="/notifications"
            className={({ isActive }) =>
              `p-2 rounded-lg transition-colors ${
                isActive
                  ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`
            }
            title="Notifications"
          >
            <Bell size={20} />
          </NavLink>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
            title="Toggle theme"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
          {/* Mobile Budget Switcher */}
          {sharedBudgets.length > 0 && (
            <div className="pb-2 mb-2 border-b border-gray-200 dark:border-gray-700">
              <select
                value={activeBudgetOwner?.id || ''}
                onChange={(e) => {
                  if (e.target.value === '') {
                    handleSwitchBudget(null);
                  } else {
                    const share = sharedBudgets.find(s => s.owner_id === parseInt(e.target.value));
                    if (share) handleSwitchBudget({ id: share.owner_id, name: share.owner_name, email: share.owner_email });
                  }
                }}
                className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100"
              >
                <option value="">My Budget</option>
                {sharedBudgets.map((share) => (
                  <option key={share.id} value={share.owner_id}>
                    {share.owner_name}'s Budget {share.role === 'view' ? '(view)' : '(edit)'}
                  </option>
                ))}
              </select>
            </div>
          )}
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <>
                  <div className="border-t border-gray-200 dark:border-gray-700 my-2"></div>
                  <p className="px-4 py-1 text-xs font-semibold text-gray-400 uppercase">{group.label}</p>
                </>
              )}
              {group.items.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                        : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`
                  }
                  end={to === '/'}
                >
                  <Icon size={20} />
                  <span className="flex-1">{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
          {user?.is_admin && (
            <>
              <div className="border-t border-gray-200 dark:border-gray-700 my-2"></div>
              <p className="px-4 py-1 text-xs font-semibold text-gray-400 uppercase">Admin</p>
              {adminNavItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                        : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`
                  }
                  end={to === '/admin'}
                >
                  <Icon size={20} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700 rounded-lg"
          >
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      )}

      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 h-16 px-6 border-b border-gray-200 dark:border-gray-700">
            <img src="/logo.svg" alt="Budget Tracker" className="w-9 h-9 rounded-lg" />
            <div>
              <h1 className="text-xl font-bold text-primary-600">Budget Tracker</h1>
              <span className="text-xs text-gray-400">v{APP_VERSION}</span>
            </div>
          </div>

          {/* Budget Switcher */}
          {sharedBudgets.length > 0 && (
            <div className="px-4 pt-4 pb-2 relative">
              <button
                onClick={() => setShowBudgetSwitcher(!showBudgetSwitcher)}
                className="w-full flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                  {activeBudgetOwner ? `${activeBudgetOwner.name}'s Budget` : 'My Budget'}
                </span>
                <ChevronDown size={16} className={`text-gray-500 transition-transform ${showBudgetSwitcher ? 'rotate-180' : ''}`} />
              </button>
              {showBudgetSwitcher && (
                <div className="absolute left-4 right-4 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1">
                  <button
                    onClick={() => handleSwitchBudget(null)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${
                      !activeBudgetOwner ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium' : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    My Budget
                  </button>
                  {sharedBudgets.map((share) => (
                    <button
                      key={share.id}
                      onClick={() => handleSwitchBudget({ id: share.owner_id, name: share.owner_name, email: share.owner_email })}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between ${
                        activeBudgetOwner?.id === share.owner_id ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium' : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <span className="truncate">{share.owner_name}'s Budget</span>
                      {share.role === 'view' && <Eye size={14} className="text-gray-400 shrink-0 ml-2" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <nav className="flex-1 min-h-0 px-4 py-6 space-y-1 overflow-y-auto">
            {navGroups.map((group, gi) => (
              <div key={gi}>
                {group.label && (
                  <>
                    <div className="border-t border-gray-200 dark:border-gray-700 my-3"></div>
                    <p className="px-4 py-1 text-xs font-semibold text-gray-400 uppercase">{group.label}</p>
                  </>
                )}
                {group.items.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-primary-50 text-primary-600 font-medium dark:bg-primary-900/30 dark:text-primary-400'
                          : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
                      }`
                    }
                    end={to === '/'}
                  >
                    <Icon size={20} />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
            {user?.is_admin && (
              <>
                <div className="border-t border-gray-200 dark:border-gray-700 my-3"></div>
                <p className="px-4 py-1 text-xs font-semibold text-gray-400 uppercase">Admin</p>
                {adminNavItems.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-primary-50 text-primary-600 font-medium dark:bg-primary-900/30 dark:text-primary-400'
                          : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'
                      }`
                    }
                    end={to === '/admin'}
                  >
                    <Icon size={20} />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </>
            )}
          </nav>

        </aside>

        {/* Main content */}
        <main className="flex-1 lg:pl-64">
          {/* Top icon bar */}
          <div className="hidden lg:flex items-center justify-between px-6 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg transition-colors text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200"
              title="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="flex items-center gap-2">
            <NavLink
              to="/calendar"
              className={({ isActive }) =>
                `p-2 rounded-lg transition-colors ${
                  isActive
                    ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200'
                }`
              }
              title="Calendar"
            >
              <CalendarDays size={20} />
            </NavLink>
            <NavLink
              to="/notifications"
              className={({ isActive }) =>
                `p-2 rounded-lg transition-colors ${
                  isActive
                    ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/30'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200'
                }`
              }
              title="Notifications"
              aria-label="Notifications"
            >
              <Bell size={20} />
            </NavLink>
            <div className="relative ml-1">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center text-sm font-medium hover:bg-primary-700 transition-colors"
                title={user?.name}
              >
                {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </button>
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1">
                  <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user?.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
                  </div>
                  <button
                    onClick={() => { setShowUserMenu(false); handleLogout(); }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <LogOut size={16} />
                    Logout
                  </button>
                </div>
              )}
            </div>
            </div>
          </div>
          {/* Read-only banner */}
          {activeBudgetOwner && isReadOnly && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700 px-4 py-2 flex items-center gap-2">
              <Eye size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-sm text-amber-700 dark:text-amber-300">
                Viewing <strong>{activeBudgetOwner.name}'s</strong> budget (read-only)
              </span>
            </div>
          )}
          {activeBudgetOwner && !isReadOnly && (
            <div className="bg-primary-50 dark:bg-primary-900/20 border-b border-primary-200 dark:border-primary-700 px-4 py-2 flex items-center gap-2">
              <Share2 size={16} className="text-primary-600 dark:text-primary-400 shrink-0" />
              <span className="text-sm text-primary-700 dark:text-primary-300">
                Editing <strong>{activeBudgetOwner.name}'s</strong> budget
              </span>
            </div>
          )}
          <div className="p-4 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
      <ChatWidget />
    </div>
  );
}
