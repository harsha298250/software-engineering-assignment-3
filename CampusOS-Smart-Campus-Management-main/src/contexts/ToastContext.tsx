import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (toast: { title: string; description?: string; variant?: ToastVariant }) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({
      title,
      description,
      variant = 'info',
    }: {
      title: string;
      description?: string;
      variant?: ToastVariant;
    }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, title, description, variant }]);
      setTimeout(() => removeToast(id), 4500);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-lg transition-all duration-150 ${
              toast.variant === 'error'
                ? 'border-red-300 bg-white text-red-900 dark:border-red-800 dark:bg-[#101B2E] dark:text-red-200'
                : toast.variant === 'success'
                  ? 'border-emerald-300 bg-white text-emerald-950 dark:border-emerald-800 dark:bg-[#101B2E] dark:text-emerald-200'
                  : 'border-[#E5DFD3] bg-white text-[#0F2342] dark:border-[#1E2E4A] dark:bg-[#101B2E] dark:text-[#F5F2EB]'
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {toast.variant === 'error' ? (
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
              ) : toast.variant === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Info className="h-4 w-4 text-[#2B4C7E] dark:text-[#60A5FA]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {toast.description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
