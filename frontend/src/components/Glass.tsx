'use client';

import { ReactNode } from 'react';

export function Glass({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`glass rounded-2xl ${className}`}>{children}</div>
  );
}


