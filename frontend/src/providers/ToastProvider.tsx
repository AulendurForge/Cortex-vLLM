'use client';

import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

type Toast = { id: string; title: string; kind?: 'success' | 'error' | 'info' };

type ToastContextValue = {
  addToast: (t: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, ...t }]);
    setTimeout(() => removeToast(id), 4000);
  }, [removeToast]);

  const value = useMemo(() => ({ addToast, removeToast }), [addToast, removeToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {toasts.map((t) => (
          <div key={t.id} className={
            'min-w-[260px] px-3 py-2 rounded shadow text-sm border ' +
            (t.kind === 'error' ? 'bg-red-50 text-red-800 border-red-200' : t.kind === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-gray-50 text-gray-800 border-gray-200')
          }>
            {t.title}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}


