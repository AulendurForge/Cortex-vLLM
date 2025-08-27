'use client';

import React, { createContext, useContext, useMemo, useRef, useState, ReactNode } from 'react';

type Toast = { id: string; title: string; kind?: 'success' | 'error' | 'info' };

type ToastContextValue = {
  addToast: (t: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
};

const ToastCtx = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

// Local safe UUID generator for environments lacking crypto.randomUUID
function safeUuid(): string {
  try {
    const g: any = (typeof globalThis !== 'undefined') ? (globalThis as any) : undefined;
    const anyCrypto: any = g && g.crypto ? g.crypto : undefined;
    if (anyCrypto && typeof anyCrypto.randomUUID === 'function') return anyCrypto.randomUUID();
    if (anyCrypto && typeof anyCrypto.getRandomValues === 'function') {
      const arr = new Uint8Array(16);
      anyCrypto.getRandomValues(arr);
      arr[6] = ((arr[6] ?? 0) & 0x0f) | 0x40;
      arr[8] = ((arr[8] ?? 0) & 0x3f) | 0x80;
      const h = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
      return `${h.substring(0,8)}-${h.substring(8,12)}-${h.substring(12,16)}-${h.substring(16,20)}-${h.substring(20)}`;
    }
  } catch {}
  const rnd = Math.random().toString(16).slice(2);
  const t = Date.now().toString(16);
  return `${t}-${rnd}-${t}`.slice(0, 36);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = (t: Omit<Toast, 'id'>) => {
    const id = safeUuid();
    setToasts((prev) => [...prev, { id, ...t }]);
    // auto-remove after 4s
    setTimeout(() => removeToast(id), 4000);
  };
  const removeToast = (id: string) => setToasts((prev) => prev.filter((x) => x.id !== id));
  const value = useMemo<ToastContextValue>(() => ({ addToast, removeToast }), []);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div key={t.id} className={`px-3 py-2 rounded shadow-lg text-sm ${t.kind === 'error' ? 'bg-red-600/90' : t.kind === 'success' ? 'bg-emerald-600/90' : 'bg-gray-700/90'}`}>
            {t.title}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}


