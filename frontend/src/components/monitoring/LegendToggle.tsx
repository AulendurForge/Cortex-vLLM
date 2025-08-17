'use client';

import React from 'react';
import { cn } from '../../lib/cn';

export type LegendItem = { id: string; label: string; color?: string };

export function LegendToggle({
  items,
  active,
  onChange,
  className = '',
}: {
  items: LegendItem[];
  active: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {items.map((it) => {
        const checked = active[it.id] !== false; // default true
        return (
          <button
            key={it.id}
            className={cn('px-2 py-1 text-xs rounded border transition-colors', checked ? 'bg-white/10 border-white/20' : 'bg-transparent border-white/10 opacity-60 hover:opacity-80')}
            onClick={() => onChange({ ...active, [it.id]: !checked })}
            aria-pressed={checked}
            title={it.label}
          >
            <span className="inline-flex items-center gap-1">
              {it.color && <span className="inline-block w-2 h-2 rounded" style={{ background: it.color }} />}
              <span>{it.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}


