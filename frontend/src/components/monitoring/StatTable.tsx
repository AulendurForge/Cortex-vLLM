'use client';

import React from 'react';
import { cn } from '../../lib/cn';

export type Column<T> = {
  key: keyof T | string;
  header: string;
  render?: (row: T) => React.ReactNode;
  width?: string;
  align?: 'left' | 'right' | 'center';
};

export function StatTable<T extends { id?: string | number }>({
  rows,
  columns,
  className = '',
  rowKey,
  empty = 'No data',
}: {
  rows: T[];
  columns: Column<T>[];
  className?: string;
  rowKey?: (row: T, idx: number) => string | number;
  empty?: string;
}) {
  return (
    <div className={cn('overflow-x-auto rounded border border-white/10', className)}>
      <table className="min-w-full text-sm">
        <thead className="bg-white/5">
          <tr>
            {columns.map((c) => (
              <th key={String(c.key)} className={cn('text-left px-2 py-1 text-white/80', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')} style={{ width: c.width }}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-2 py-2 text-white/60">{empty}</td></tr>
          )}
          {rows.map((r, idx) => (
            <tr key={rowKey ? rowKey(r, idx) : (r.id ?? idx)} className={cn(idx % 2 ? 'bg-white/0' : 'bg-white/0') }>
              {columns.map((c) => (
                <td key={String(c.key)} className={cn('px-2 py-1 whitespace-nowrap', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')}>
                  {c.render ? c.render(r) : (r as any)[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


