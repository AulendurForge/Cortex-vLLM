'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { safeCopyToClipboard } from '../lib/clipboard';

type Point = { x: number; y: number };

export function LineChart({
  data,
  className = '',
  stroke = '#60a5fa',
  fill = 'none',
  yMaxPadding = 0.15,
  showAxes = true,
  showGrid = true,
  height = 220,
  valueSuffix = '',
  xLabel,
  yLabel,
  smooth = true,
  smoothAlpha = 0.25,
  paddingLeft = 8,
  paddingRight = 2,
  paddingTop = 8,
  paddingBottom = 14,
  thresholds,
  glow = true,
  yScale = 'linear',
  svgRefExternal,
  enableControls = false,
  filePrefix = 'chart',
  footerExtra,
  showScaleToggle = false,
  promQuery,
}: {
  data: Array<{ ts: number; value: number }>;
  className?: string;
  stroke?: string;
  fill?: string;
  yMaxPadding?: number;
  showAxes?: boolean;
  showGrid?: boolean;
  height?: number;
  valueSuffix?: string;
  xLabel?: string;
  yLabel?: string;
  smooth?: boolean;
  smoothAlpha?: number; // EMA smoothing factor (0..1]
  paddingLeft?: number; // percent of width (0..100)
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  thresholds?: { warn?: number; crit?: number };
  glow?: boolean;
  yScale?: 'linear' | 'log';
  svgRefExternal?: (el: SVGSVGElement | null) => void;
  enableControls?: boolean;
  filePrefix?: string;
  footerExtra?: React.ReactNode;
  showScaleToggle?: boolean;
  promQuery?: string;
}) {
  const width = 600;
  if (!data || data.length === 0) {
    return <div className={cn('h-40 flex items-center justify-center text-white/60', className)}>No data</div>;
  }
  const smoothed = smooth ? applyEMA(data, smoothAlpha) : data;
  const xs = smoothed.map((d) => d.ts);
  const ys = smoothed.map((d) => d.value);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = 0;
  const rawMaxY = Math.max(1, Math.max(...ys));
  const maxY = rawMaxY + rawMaxY * yMaxPadding;
  // Interactive X-range (pan/zoom)
  const [range, setRange] = useState<[number, number]>([minX, maxX]);
  React.useEffect(() => { setRange([minX, maxX]); }, [minX, maxX]);
  const x0 = paddingLeft;
  const x1 = 100 - paddingRight;
  const y0 = paddingTop;
  const y1 = 100 - paddingBottom;
  const toX = (v: number) => x0 + ((v - range[0]) / (range[1] - range[0] || 1)) * (x1 - x0);
  const [scaleMode, setScaleMode] = useState<'linear' | 'log'>(yScale);
  const toY = (v: number) => {
    if (scaleMode === 'log') {
      const f = (val: number) => Math.log1p(Math.max(0, val - minY));
      const top = f(maxY - minY);
      const vv = f(v - minY);
      const ratio = top > 0 ? vv / top : 0;
      return y1 - ratio * (y1 - y0);
    }
    return y1 - ((v - minY) / (maxY - minY || 1)) * (y1 - y0);
  };

  const pathD = useMemo(
    () => smoothed.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.ts).toFixed(2)} ${toY(p.value).toFixed(2)}`).join(' '),
    [smoothed, range, yScale, minX, maxX]
  );

  // hover state
  const [hoverX, setHoverX] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const nearest = useMemo(() => {
    if (hoverX == null) return null;
    // convert pixel x to ts ratio
    const pct = hoverX / width;
    const targetTs = range[0] + pct * (range[1] - range[0]);
    let best = smoothed[0]!;
    let bestDiff = Math.abs(best.ts - targetTs);
    for (const p of smoothed) {
      const d = Math.abs(p.ts - targetTs);
      if (d < bestDiff) { best = p; bestDiff = d; }
    }
    return best;
  }, [hoverX, smoothed, range]);

  const latest = smoothed[smoothed.length - 1]!;

  // axis/grid ticks (5 horizontal lines)
  const gridTicks = [0, 0.25, 0.5, 0.75, 1];
  // Gap shading (simple best-effort)
  const gaps = useMemo(() => {
    if (smoothed.length < 3) return [] as Array<[number, number]>;
    const dts = [] as number[];
    for (let i = 1; i < smoothed.length; i++) {
      const a = smoothed[i - 1];
      const b = smoothed[i];
      if (a && b) dts.push(b.ts - a.ts);
    }
    dts.sort((a, b) => a - b);
    const medVal: number = dts.length > 0 ? dts[Math.floor(dts.length / 2)]! : 0;
    const threshold = medVal * 3;
    const out: Array<[number, number]> = [];
    for (let i = 1; i < smoothed.length; i++) {
      const prev = smoothed[i - 1];
      const cur = smoothed[i];
      if (!prev || !cur) continue;
      const dt = cur.ts - prev.ts;
      if (dt > threshold) out.push([prev.ts, cur.ts]);
    }
    return out;
  }, [smoothed, range]);

  return (
    <div className={cn('', className)}>
      <div className="relative select-none" style={{ height }}>
      <svg
        ref={(el) => { svgRef.current = el; if (svgRefExternal) svgRefExternal(el); }}
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          setHoverX(Math.max(0, Math.min(width, e.clientX - rect.left)));
        }}
        onMouseLeave={() => setHoverX(null)}
        onWheel={(e) => {
          e.preventDefault();
          const factor = Math.exp(-e.deltaY * 0.001);
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseTs = range[0] + (mouseX / width) * (range[1] - range[0]);
          const newMin = mouseTs - (mouseTs - range[0]) * factor;
          const newMax = mouseTs + (range[1] - mouseTs) * factor;
          const minWidth = (maxX - minX) / 200;
          if (newMax - newMin < minWidth) return;
          setRange([Math.max(minX, newMin), Math.min(maxX, newMax)]);
        }}
        onDoubleClick={() => setRange([minX, maxX])}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const startX = e.clientX - rect.left;
          const startRange: [number, number] = [range[0], range[1]];
          const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - rect.left - startX;
            const dt = (dx / width) * (startRange[1] - startRange[0]);
            let n0 = startRange[0] - dt;
            let n1 = startRange[1] - dt;
            const span = n1 - n0;
            if (n0 < minX) { n0 = minX; n1 = minX + span; }
            if (n1 > maxX) { n1 = maxX; n0 = maxX - span; }
            setRange([n0, n1]);
          };
          const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}
      >
        <g transform={`scale(${width / 100} ${height / 100})`}>
          {glow && (
            <defs>
              <filter id="lc-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="1.2" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
          )}
          {showGrid && gridTicks.map((t, i) => (
            <line key={i} x1={x0} x2={x1} y1={y0 + t * (y1 - y0)} y2={y0 + t * (y1 - y0)} stroke="var(--chart-grid)" strokeWidth={0.5} />
          ))}
          {showAxes && (
            <>
              <line x1={x0} x2={x1} y1={y1} y2={y1} stroke="var(--chart-axis)" strokeWidth={0.8} />
              <line x1={x0} x2={x0} y1={y0} y2={y1} stroke="var(--chart-axis)" strokeWidth={0.8} />
            </>
          )}
          {thresholds?.warn != null && (
            <line x1={x0} x2={x1} y1={toY(thresholds.warn)} y2={toY(thresholds.warn)} stroke="#F59E0B" strokeOpacity={0.5} strokeDasharray="2 2" strokeWidth={0.8} />
          )}
          {thresholds?.crit != null && (
            <line x1={x0} x2={x1} y1={toY(thresholds.crit)} y2={toY(thresholds.crit)} stroke="#EF4444" strokeOpacity={0.6} strokeDasharray="2 2" strokeWidth={0.8} />
          )}
          {gaps.map(([a,b], idx) => (
            <rect key={idx} x={toX(a)} y={y0} width={Math.max(0.5, toX(b) - toX(a))} height={y1 - y0} fill="white" opacity={0.05} />
          ))}
          <path d={pathD} stroke={stroke} strokeWidth={2} fill={fill} vectorEffect="non-scaling-stroke" filter={glow ? 'url(#lc-glow)' : undefined} />
          {/* latest marker (circle in scaled space) */}
          <circle cx={toX(latest.ts)} cy={toY(latest.value)} r={1.2} fill={stroke} />
          {/* hover crosshair & tooltip */}
          {nearest && hoverX != null && (
            <>
              <line x1={toX(nearest.ts)} x2={toX(nearest.ts)} y1={y0} y2={y1} stroke="var(--chart-axis)" strokeDasharray="1 1" strokeWidth={0.6} />
              <circle cx={toX(nearest.ts)} cy={toY(nearest.value)} r={1.4} fill={stroke} />
            </>
          )}
        </g>
        {/* Unscaled text overlays to avoid non-uniform distortion */}
        {(() => {
          const toXpx = (norm: number) => (norm / 100) * width;
          const toYpx = (norm: number) => (norm / 100) * height;
          const lx = toX(latest.ts);
          const ly = toY(latest.value);
          
          // Positioning for the "leading edge" label
          // lx is 0..100 norm. We want it near the latest point.
          const anchor: 'start' | 'end' = lx > 85 ? 'end' : 'start';
          const textX = lx > 85 ? lx - 2 : lx + 2;
          const textY = Math.min(y1 - 2, Math.max(y0 + 10, ly));

          return (
            <>
              {/* Leading edge current value label with background pill */}
              <g>
                <rect 
                  x={toXpx(lx > 85 ? textX - 12 : textX - 1)} 
                  y={toYpx(textY - 5)} 
                  width={toXpx(14)} 
                  height={toYpx(8)} 
                  rx={2} 
                  fill="rgba(0,0,0,0.6)" 
                  className="backdrop-blur-sm"
                />
                <text 
                  x={toXpx(textX)} 
                  y={toYpx(textY + 1)} 
                  fontSize={10} 
                  fontWeight="bold"
                  textAnchor={anchor} 
                  fill={stroke}
                  className="font-mono"
                >
                  {formatNum(latest.value)}{valueSuffix}
                </text>
              </g>

              {xLabel && (
                <text x={toXpx((x0 + x1) / 2)} y={toYpx(y1 + 10)} fontSize={10} fontWeight="bold" textAnchor="middle" fill="var(--chart-axis)" className="uppercase tracking-widest opacity-50">{xLabel}</text>
              )}
              {yLabel && (
                <text x={toXpx(x0 + 1)} y={toYpx(y0 + 6)} fontSize={10} fontWeight="bold" textAnchor="start" fill="var(--chart-axis)" className="uppercase tracking-widest opacity-50">{yLabel}</text>
              )}
            </>
          );
        })()}
      </svg>
      {enableControls && (
        <div className="absolute right-2 top-2 flex items-center gap-2">
          <button className="btn text-xs" onClick={() => setRange([minX, maxX])}>Reset</button>
        </div>
      )}
      {nearest && hoverX != null && (
        <div
          className="absolute px-2 py-1 rounded border text-xs"
          style={{
            left: Math.min(width - 140, Math.max(4, (toX(nearest.ts) / 100) * width + 8)),
            top: Math.max(4, (toY(nearest.value) / 100) * height - 28),
            background: 'var(--chart-tooltip-bg)',
            borderColor: 'var(--chart-tooltip-border)'
          }}
        >
          <div className="font-mono">{formatNum(nearest.value)}{valueSuffix}</div>
          <div className="opacity-70">{new Date(nearest.ts).toLocaleTimeString()}</div>
        </div>
      )}
      </div>
      {enableControls && (
        <div className="mt-1 flex items-center justify-end gap-2">
          {footerExtra}
          {showScaleToggle && (
            <button className="btn text-xs" onClick={() => setScaleMode(scaleMode === 'log' ? 'linear' : 'log')}>{scaleMode === 'log' ? 'Linear' : 'Log'}</button>
          )}
          {promQuery && (
            <button className="btn text-xs" onClick={async () => { await safeCopyToClipboard(promQuery); }} title={promQuery}>Copy PromQL</button>
          )}
          <button className="btn text-xs" onClick={() => exportPNG(svgRef.current, `${filePrefix}.png`)}>PNG</button>
          <button className="btn text-xs" onClick={() => exportCSV(smoothed, [range[0], range[1]], `${filePrefix}.csv`)}>CSV</button>
        </div>
      )}
    </div>
  );
}

export function BarChart({
  data,
  className = '',
  barColor = '#60a5fa',
  maxBars = 10,
}: {
  data: Array<{ label: string; value: number }>;
  className?: string;
  barColor?: string;
  maxBars?: number;
}) {
  const items = (data || []).slice(0, maxBars);
  const max = Math.max(1, ...items.map((d) => d.value));
  return (
    <div className={cn('space-y-2', className)}>
      {items.map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          <div className="w-40 truncate text-sm text-white/80" title={d.label}>{d.label}</div>
          <div className="flex-1 h-2 bg-white/10 rounded">
            <div
              className="h-2 rounded"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: barColor }}
              aria-label={`${d.label}: ${d.value}`}
            />
          </div>
          <div className="w-16 text-right text-xs text-white/70 tabular-nums">{d.value.toLocaleString()}</div>
        </div>
      ))}
      {items.length === 0 && <div className="text-white/60 text-sm">No data</div>}
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  if (n >= 1) return n.toFixed(1);
  return n.toFixed(3);
}

function applyEMA(series: Array<{ ts: number; value: number }>, alpha: number) {
  const a = Math.min(1, Math.max(0.01, alpha || 0.2));
  let prev = series[0]?.value ?? 0;
  return series.map((p) => {
    const v = a * p.value + (1 - a) * prev;
    prev = v;
    return { ts: p.ts, value: v };
  });
}

function exportPNG(svgEl: SVGSVGElement | null, filename: string) {
  if (!svgEl) return;
  const svgData = new XMLSerializer().serializeToString(svgEl);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const rect = svgEl.viewBox.baseVal;
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0b1020';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = filename;
      a.click();
    }
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

function exportCSV(series: Array<{ ts: number; value: number }>, range: [number, number], filename: string) {
  const rows = ['ts,value'];
  for (const p of series) {
    if (p.ts >= range[0] && p.ts <= range[1]) rows.push(`${Math.floor(p.ts)},${p.value}`);
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}


