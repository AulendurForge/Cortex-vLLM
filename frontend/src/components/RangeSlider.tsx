'use client';

import React from 'react';
import { cn } from '../lib/cn';

type Stop = { label: string; value: number };

export function RangeSlider({
  stops,
  value,
  onChange,
  className = '',
}: {
  stops: Stop[];
  value: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  const index = Math.max(0, stops.findIndex((s) => s.value === value));
  const stepCount = stops.length - 1;
  return (
    <div className={cn('w-64', className)}>
      <input
        type="range"
        min={0}
        max={stepCount}
        step={1}
        value={index}
        onChange={(e) => onChange(stops[Number(e.target.value)]?.value ?? value)}
        className="w-full accent-white"
        aria-label="Range selector"
      />
      <div className="flex justify-between text-[10px] text-white/70 mt-1">
        {stops.map((s) => (
          <span key={s.value} className="truncate" title={s.label}>{s.label}</span>
        ))}
      </div>
    </div>
  );
}


