'use client';

import React from 'react';
import { cn } from '../lib/cn';

export function Tooltip({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={cn('relative inline-block group align-middle', className)}>
      <svg
        className="w-3.5 h-3.5 text-white/70 group-hover:text-white transition-colors"
        viewBox="0 0 24 24"
        fill="none"
        aria-label="More info"
        role="img"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M12 8.5v.01M11 11.5h1v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <span
        role="tooltip"
        className="pointer-events-none absolute z-[100] left-1/2 -translate-x-1/2 -top-2 translate-y-[-100%] hidden group-hover:block bg-black/95 text-white text-[10px] leading-snug px-3 py-2 rounded-lg shadow-2xl border border-white/10 w-48 whitespace-normal text-left backdrop-blur-md"
      >
        {text}
      </span>
    </span>
  );
}


