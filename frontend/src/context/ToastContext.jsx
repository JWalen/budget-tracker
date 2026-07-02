import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

let nextId = 1;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message, type = 'info', timeout = 5000) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message: String(message ?? ''), type }]);
    if (timeout) setTimeout(() => remove(id), timeout);
    return id;
  }, [remove]);

  const toast = {
    success: (m, t) => push(m, 'success', t),
    error: (m, t) => push(m, 'error', t ?? 8000),
    info: (m, t) => push(m, 'info', t),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => {
          const Icon = t.type === 'success' ? CheckCircle : t.type === 'error' ? AlertCircle : Info;
          const color =
            t.type === 'success'
              ? 'border-green-500 text-green-800 dark:text-green-200'
              : t.type === 'error'
              ? 'border-red-500 text-red-800 dark:text-red-200'
              : 'border-primary-500 text-gray-800 dark:text-gray-100';
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-2 rounded-lg border-l-4 bg-white dark:bg-gray-800 shadow-lg px-4 py-3 ${color}`}
            >
              <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm flex-1 break-words">{t.message}</p>
              <button
                onClick={() => remove(t.id)}
                aria-label="Dismiss"
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fail soft: never crash a page because the provider is missing.
    return { success: () => {}, error: () => {}, info: () => {} };
  }
  return ctx;
};
