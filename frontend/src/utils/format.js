// Parse a date value safely. Date-only strings ("YYYY-MM-DD") are parsed as
// LOCAL dates to avoid the UTC-midnight off-by-one that shifts the day in
// negative-UTC timezones. Returns a Date or null.
const parseDateValue = (date) => {
  if (!date) return null;
  if (date instanceof Date) return isNaN(date.getTime()) ? null : date;
  if (typeof date === 'string') {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (dateOnly) {
      const d = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(date);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

export const formatCurrency = (amount) => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '$0.00';

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(n));

  return n < 0 ? `-${formatted}` : formatted;
};

export const formatDate = (date) => {
  const dateObj = parseDateValue(date);
  if (!dateObj) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(dateObj);
};

export const formatDateOnly = (date) => {
  const dateObj = parseDateValue(date);
  if (!dateObj) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(dateObj);
};

export const formatPercent = (value, decimals = 1) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0%';
  return `${n.toFixed(decimals)}%`;
};

export const formatNumber = (value, decimals = 0) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(n);
};

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const formatShortDate = (date) => {
  const dateObj = parseDateValue(date);
  if (!dateObj) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric'
  }).format(dateObj);
};
