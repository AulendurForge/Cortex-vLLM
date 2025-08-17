'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '../../lib/cn';

export type MiniKpi = { label: string; value: React.ReactNode };

export function Accordion({ children, storageKey = 'accordion-state', className = '' }: { children: React.ReactNode; storageKey?: string; className?: string }) {
  return <div className={cn('space-y-3', className)}>{children}</div>;
}

export function AccordionItem({
  id,
  title,
  miniKpis,
  defaultOpen = true,
  children,
  actions,
  storageKey = 'accordion-state',
}: {
  id: string;
  title: React.ReactNode;
  miniKpis?: MiniKpi[];
  defaultOpen?: boolean;
  children: React.ReactNode;
  actions?: React.ReactNode;
  storageKey?: string;
}) {
  const [open, setOpen] = usePersistentOpen(storageKey, id, defaultOpen);

  return (
    <div className="card rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between gap-3 px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={`acc-${id}`}
      >
        <div className="flex items-center gap-2">
          <Chevron open={open} />
          <div className="text-sm font-semibold">{title}</div>
        </div>
        <div className="flex items-center gap-3">
          {miniKpis && miniKpis.length > 0 && (
            <div className="hidden md:flex items-center gap-3 text-xs text-white/80">
              {miniKpis.map((k) => (
                <div key={String(k.label)} className="flex items-center gap-1">
                  <span className="text-white/60">{k.label}:</span>
                  <span className="tabular-nums">{k.value}</span>
                </div>
              ))}
            </div>
          )}
          {actions && <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>{actions}</div>}
        </div>
      </button>
      <div id={`acc-${id}`} className={cn('px-3 py-3', open ? 'block' : 'hidden')}>
        {children}
      </div>
    </div>
  );
}

function usePersistentOpen(storageKey: string, id: string, defaultOpen: boolean): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const key = `${storageKey}:${id}`;
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return defaultOpen;
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultOpen;
      return raw === '1';
    } catch { return defaultOpen; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, open ? '1' : '0'); } catch {}
  }, [key, open]);
  return [open, setOpen];
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={cn('w-4 h-4 text-white/70 transition-transform', open ? 'rotate-90' : 'rotate-0')} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}


