'use client';

import React from 'react';
import { RangeSlider } from '../RangeSlider';
import { cn } from '../../lib/cn';

export type RangeStop = { label: string; value: number; prom: string };

const DEFAULT_STOPS: RangeStop[] = [
  { label: '15m', value: 15, prom: '15m' },
  { label: '1h', value: 60, prom: '1h' },
  { label: '3h', value: 180, prom: '3h' },
  { label: '6h', value: 360, prom: '6h' },
  { label: '12h', value: 720, prom: '12h' },
  { label: '24h', value: 1440, prom: '24h' },
];

export function TimeRangeControls({
  minutes,
  onChange,
  live,
  onToggleLive,
  stops = DEFAULT_STOPS,
  className = '',
}: {
  minutes: number;
  onChange: (minutes: number) => void;
  live: boolean;
  onToggleLive: (next: boolean) => void;
  stops?: RangeStop[];
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <RangeSlider
        stops={stops.map((s) => ({ label: s.label, value: s.value }))}
        value={minutes}
        onChange={(v) => onChange(v)}
        className="w-72"
      />
      <button className={cn('btn text-xs', live ? 'bg-emerald-500/20 border border-emerald-400/30' : '')} onClick={() => onToggleLive(!live)}>{live ? 'Live: On' : 'Live: Off'}</button>
    </div>
  );
}

export function minutesToPromRange(minutes: number, stops: RangeStop[] = DEFAULT_STOPS): string {
  const hit = stops.find((s) => s.value === minutes);
  return hit ? hit.prom : `${minutes}m`;
}


