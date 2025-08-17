'use client';

import { ReactNode } from 'react';
import { cn } from '../lib/cn';

export function Button({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn('btn', className)} {...props}>{children}</button>;
}

export function PrimaryButton({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn('btn btn-primary', className)} {...props}>{children}</button>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={cn('card rounded-xl', className)}>{children}</div>;
}

export function Table({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <table className={cn('table', className)}>{children}</table>;
}

export function Badge({ children, className = '', ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn('text-xs px-2 py-1 rounded bg-white/10 text-white', className)} {...props}>
      {children}
    </span>
  );
}

export function H1({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h1 className={cn('text-xl font-semibold', className)}>{children}</h1>;
}


export function PageHeader({ title, actions, className = '' }: { title: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <H1 className="m-0">{title}</H1>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}

export function ThresholdBadge({ level }: { level: 'ok' | 'warn' | 'crit' }) {
  const cls = level === 'crit' ? 'bg-red-500/20 text-red-200 border-red-400/30' : level === 'warn' ? 'bg-amber-500/20 text-amber-200 border-amber-400/30' : 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30';
  return <span className={cn('text-[10px] px-1.5 py-0.5 rounded border', cls)}>{level.toUpperCase()}</span>;
}



