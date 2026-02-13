import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, FileText, Database, Bot, Mail, Shield } from 'lucide-react';
import { api } from '../../api/client';
import DashboardStats from './DashboardStats';
import AdminUsers from './AdminUsers';
import AdminLogs from './AdminLogs';
import AdminBackup from './AdminBackup';
import AdminAISettings from './AdminAISettings';
import AdminEmailSettings from './AdminEmailSettings';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const location = useLocation();
  const navigate = useNavigate();

  // Sync tab with URL query param or hash if desired, or just internal state
  // For now, simple internal state, but let's check if we want to support deep linking
  useEffect(() => {
    // If we wanted to map routes to tabs, we could do it here
    // But since the router handles /admin/* routes separately, we might want to consolidate
    // strictly under /admin with a tab selector, OR keep the sub-routes.
    // The user asked to "encompass all the settings needed for admin with tabs"
    // So a single page with tabs is what they want.
  }, []);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, component: DashboardStats },
    { id: 'users', label: 'Users', icon: Users, component: AdminUsers },
    { id: 'logs', label: 'System Logs', icon: FileText, component: AdminLogs },
    { id: 'backups', label: 'Backups', icon: Database, component: AdminBackup },
    { id: 'ai', label: 'AI Configuration', icon: Bot, component: AdminAISettings },
    { id: 'email', label: 'Email Settings', icon: Mail, component: AdminEmailSettings },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Shield className="w-8 h-8 text-primary-600" />
          Admin Console
        </h1>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                  ${isActive
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }
                `}
              >
                <Icon className={`
                  -ml-0.5 mr-2 h-5 w-5
                  ${isActive ? 'text-primary-500 dark:text-primary-400' : 'text-gray-400 group-hover:text-gray-500 dark:text-gray-500'}
                `} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {tabs.map((tab) => (
          <div key={tab.id} className={activeTab === tab.id ? 'block' : 'hidden'}>
            <tab.component />
          </div>
        ))}
      </div>
    </div>
  );
}
