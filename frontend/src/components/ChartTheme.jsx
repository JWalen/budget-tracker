import { useTheme } from '../context/ThemeContext';
import { formatCurrency } from '../utils/format';

// Shared Recharts theming so charts read correctly in both light and dark mode.
// Recharts' default tooltip is a hardcoded white box and axis ticks are #666 —
// both look broken on dark cards. These helpers pull colors from the active theme.

export function useChartTheme() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  return {
    dark,
    axisTick: dark ? '#9ca3af' : '#6b7280',       // gray-400 / gray-500
    grid: dark ? '#374151' : '#e5e7eb',           // gray-700 / gray-200
    tooltipBg: dark ? '#1f2937' : '#ffffff',      // gray-800 / white
    tooltipBorder: dark ? '#374151' : '#e5e7eb',
    tooltipText: dark ? '#f3f4f6' : '#111827',    // gray-100 / gray-900
  };
}

// Custom tooltip content that themes itself. Pass `currency` to format values as money.
export function ChartTooltip({ active, payload, label, currency = false }) {
  const t = useChartTheme();
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div
      style={{
        background: t.tooltipBg,
        border: `1px solid ${t.tooltipBorder}`,
        borderRadius: 8,
        padding: '8px 12px',
        color: t.tooltipText,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        fontSize: 13,
      }}
    >
      {label != null && <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      {payload.map((entry, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {entry.color && (
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: entry.color,
                display: 'inline-block',
              }}
            />
          )}
          <span style={{ opacity: 0.85 }}>{entry.name}:</span>
          <span style={{ fontWeight: 600 }}>
            {currency ? formatCurrency(entry.value) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}
