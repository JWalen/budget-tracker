import { lazy } from 'react';

// Lazy load pages for code splitting
export const Dashboard = lazy(() => import('../pages/Dashboard'));
export const Transactions = lazy(() => import('../pages/Transactions'));
export const Budgets = lazy(() => import('../pages/Budgets'));
export const Categories = lazy(() => import('../pages/Categories'));
export const IncomeCategories = lazy(() => import('../pages/IncomeCategories'));
export const PayPeriods = lazy(() => import('../pages/PayPeriods'));
export const Sharing = lazy(() => import('../pages/Sharing'));
export const Analytics = lazy(() => import('../pages/Analytics'));
export const Profile = lazy(() => import('../pages/Profile'));
export const Settings = lazy(() => import('../pages/Settings'));
export const Changelog = lazy(() => import('../pages/Changelog'));
export const Login = lazy(() => import('../pages/Login'));
export const Register = lazy(() => import('../pages/Register'));

// Add any new pages here for lazy loading
