'use client';

import { useEffect, useState } from 'react';
import React from 'react';
import { Card, H1, ThresholdBadge } from '../../../src/components/UI';
import { LineChart } from '../../../src/components/Charts';
import { Modal } from '../../../src/components/Modal';
import { Tooltip } from '../../../src/components/Tooltip';
import { Accordion, AccordionItem } from '../../../src/components/monitoring/Accordion';
import { LegendToggle } from '../../../src/components/monitoring/LegendToggle';
import { StatTable } from '../../../src/components/monitoring/StatTable';
import { TimeRangeControls } from '../../../src/components/monitoring/TimeRangeControls';
import apiFetch from '../../../src/lib/api-clients';
import { z } from 'zod';
import { ThroughputSummarySchema, GpuMetricsListSchema, HostSummarySchema, HostTrendsSchema, CapabilitiesSchema } from '../../../src/lib/validators';

type Throughput = z.infer<typeof ThroughputSummarySchema>;
type Gpu = z.infer<typeof GpuMetricsListSchema>[number];
type HostSummary = z.infer<typeof HostSummarySchema>;
type HostTrends = z.infer<typeof HostTrendsSchema>;
type Capabilities = z.infer<typeof CapabilitiesSchema>;

export default function SystemMonitoringPage() {
  const [throughput, setThroughput] = useState<Throughput | null>(null);
  const [gpus, setGpus] = useState<Gpu[] | null>(null);
  const [host, setHost] = useState<HostSummary | null>(null);
  const [trends, setTrends] = useState<HostTrends | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [gpuTrends, setGpuTrends] = useState<Record<number, { util: { ts: number; value: number }[]; mem: { ts: number; value: number }[] }>>({});
  const [fullscreen, setFullscreen] = useState<{ title: string; content: React.ReactNode } | null>(null);
  const [rangeMin, setRangeMin] = useState<number>(15);
  const [live, setLive] = useState<boolean>(true);
  const [activeCores, setActiveCores] = useState<Record<string, boolean>>({});
  const [activeDisks, setActiveDisks] = useState<Record<string, boolean>>({});
  const [activeIfaces, setActiveIfaces] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let stop = false;
    const load = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      try {
        const c = await apiFetch('/admin/system/capabilities');
        const cz = CapabilitiesSchema.parse(c);
        if (!stop) setCaps(cz);
      } catch {}
      try {
        const t = await apiFetch('/admin/system/throughput');
        const tz = ThroughputSummarySchema.parse(t);
        if (!stop) setThroughput(tz);
      } catch (e: any) {
        if (!stop) setError('Failed to load throughput');
      }
      try {
        const h = await apiFetch('/admin/system/host/summary');
        const hz = HostSummarySchema.parse(h);
        if (!stop) setHost(hz);
      } catch {}
      try {
        const step = rangeMin <= 60 ? 15 : 60;
        const tr = await apiFetch(`/admin/system/host/trends?minutes=${rangeMin}&step_s=${step}`);
        const trz = HostTrendsSchema.parse(tr);
        if (!stop) setTrends(trz);
      } catch {}
      try {
        const g = await apiFetch('/admin/system/gpus');
        const gz = GpuMetricsListSchema.parse(g);
        if (!stop) {
          setGpus(gz);
          // accumulate simple client-side 15m trend (5s poll → ~180 pts)
          setGpuTrends((prev) => {
            const nowTs = Date.now();
            const cutoff = nowTs - 15 * 60 * 1000;
            const next = { ...prev } as typeof prev;
            for (const item of gz) {
              const idx = item.index;
              const utilVal = typeof item.utilization_pct === 'number' ? item.utilization_pct : 0;
              const memVal = typeof item.mem_used_mb === 'number' ? item.mem_used_mb : 0;
              const cur = next[idx] || { util: [], mem: [] };
              const utilSeries = [...cur.util, { ts: nowTs, value: utilVal }].filter(p => p.ts >= cutoff).slice(-200);
              const memSeries = [...cur.mem, { ts: nowTs, value: memVal }].filter(p => p.ts >= cutoff).slice(-200);
              next[idx] = { util: utilSeries, mem: memSeries };
            }
            return next;
          });
        }
      } catch {
        if (!stop) setGpus([]);
      }
      if (!stop) setLastUpdated(Date.now());
    };
    load();
    const id = setInterval(load, live ? 5000 : 30000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [rangeMin, live]);

  return (
    <section className="space-y-4">
      <H1>System Monitor</H1>
      {error && <div className="text-xs text-red-400">{error}</div>}

      {/* Global summary + refresh */}
      <Card className="p-3">
        <div className="text-sm flex items-center gap-2">Backend throughput <Tooltip text="Aggregates from gateway and vLLM: requests per second and tokens per second (prompt/generation) plus request latency and time‑to‑first‑token percentiles." /></div>
        <div className="text-xs text-white/70 mt-1">Realtime summary from Prometheus: requests/sec, tokens/sec, latency and TTFT percentiles.</div>
        <div className="flex items-center justify-between mt-2">
          <div className="text-xs text-white/60">
            {lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : '—'}
            {lastUpdated && Date.now() - lastUpdated > 15000 && (
              <span className="ml-2 text-amber-300">(stale)</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <TimeRangeControls minutes={rangeMin} onChange={setRangeMin} live={live} onToggleLive={setLive} />
            <button
            className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/15"
            onClick={() => {
              (async () => {
                try { const c = await apiFetch('/admin/system/capabilities'); setCaps(CapabilitiesSchema.parse(c)); } catch {}
                try { const t = await apiFetch('/admin/system/throughput'); setThroughput(ThroughputSummarySchema.parse(t)); } catch {}
                try { const h = await apiFetch('/admin/system/host/summary'); setHost(HostSummarySchema.parse(h)); } catch {}
                try { const step = rangeMin <= 60 ? 15 : 60; const tr = await apiFetch(`/admin/system/host/trends?minutes=${rangeMin}&step_s=${step}`); setTrends(HostTrendsSchema.parse(tr)); } catch {}
                try { const g = await apiFetch('/admin/system/gpus'); setGpus(GpuMetricsListSchema.parse(g)); } catch {}
                setLastUpdated(Date.now());
              })();
            }}
          >Refresh</button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
          <Kpi label={<span className="inline-flex items-center gap-1">Req/s <Tooltip text="Requests per second served by the gateway (instantaneous rate over ~1m)." /></span>} value={throughput?.req_per_sec} suffix="" />
          <Kpi label={<span className="inline-flex items-center gap-1">Prompt tok/s <Tooltip text="Prompt tokens per second processed by vLLM (rate over ~1m)." /></span>} value={throughput?.prompt_tokens_per_sec} />
          <Kpi label={<span className="inline-flex items-center gap-1">Gen tok/s <Tooltip text="Generation tokens per second produced by vLLM (rate over ~1m)." /></span>} value={throughput?.generation_tokens_per_sec} />
          <Kpi label={<span className="inline-flex items-center gap-1">p50 latency <Tooltip text="Median end‑to‑end request latency measured at the gateway." /></span>} value={throughput?.latency_p50_ms} suffix="ms" />
          <Kpi label={<span className="inline-flex items-center gap-1">p95 latency <Tooltip text="95th percentile end‑to‑end request latency measured at the gateway." /></span>} value={throughput?.latency_p95_ms} suffix="ms" />
          <Kpi label={<span className="inline-flex items-center gap-1">p50 TTFT <Tooltip text="Median time to first token observed in streaming responses." /></span>} value={throughput?.ttft_p50_ms} suffix="ms" />
        </div>
      </Card>

      <Accordion storageKey="sysmon">
        {/* GPUs (moved to top) */}
        <AccordionItem
          id="gpus"
          title={<span>GPUs</span>}
          miniKpis={[
            { label: 'Count', value: (gpus || []).length },
            { label: 'Util avg', value: Array.isArray(gpus) && gpus.length ? `${Math.round((gpus.reduce((a, g) => a + (g.utilization_pct || 0), 0) / gpus.length) || 0)}%` : '—' },
          ]}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(gpus || []).map((g) => (
              <div key={g.index} className="card p-3">
                <div className="text-sm font-medium flex items-center justify-between">GPU {g.index} {g.name ? `· ${g.name}` : ''}
                  {typeof g.temperature_c === 'number' && (
                    <ThresholdBadge level={g.temperature_c >= 85 ? 'crit' : g.temperature_c >= 75 ? 'warn' : 'ok'} />
                  )}
                </div>
                <div className="text-xs text-white/70 mt-1">Util {fmt(g.utilization_pct, '%')} · Mem {fmt(g.mem_used_mb, 'MB')} / {fmt(g.mem_total_mb, 'MB')} · Temp {fmt(g.temperature_c, '°C')}</div>
                <div className="mt-3 grid grid-cols-1 gap-3">
                  <div className="relative">
                    <LineChart enableControls filePrefix={`gpu${g.index}_util_15m`} footerExtra={<button className="btn text-xs" onClick={() => setFullscreen({ title: `GPU ${g.index} Util (15m)`, content: <LineChart enableControls filePrefix={`gpu${g.index}_util_15m`} data={(gpuTrends[g.index]?.util || []).map(p => ({ ts: p.ts, value: p.value }))} stroke="#8b5cf6" valueSuffix="%" xLabel="time" yLabel="util" smoothAlpha={0.25} thresholds={{ warn: 70, crit: 90 }} height={560} promQuery={`DCGM_FI_DEV_GPU_UTIL{gpu="${g.index}"}`} /> })}>Fullscreen</button>} data={(gpuTrends[g.index]?.util || []).map(p => ({ ts: p.ts, value: p.value }))} stroke="#8b5cf6" valueSuffix="%" xLabel="time" yLabel="util" smoothAlpha={0.25} thresholds={{ warn: 70, crit: 90 }} height={240} promQuery={`DCGM_FI_DEV_GPU_UTIL{gpu="${g.index}"}`} />
                  </div>
                  <div className="relative">
                    <LineChart enableControls filePrefix={`gpu${g.index}_mem_15m`} footerExtra={<button className="btn text-xs" onClick={() => setFullscreen({ title: `GPU ${g.index} Mem Used MB (15m)`, content: <LineChart enableControls filePrefix={`gpu${g.index}_mem_15m`} data={(gpuTrends[g.index]?.mem || []).map(p => ({ ts: p.ts, value: p.value }))} stroke="#f59e0b" valueSuffix=" MB" xLabel="time" yLabel="mem" smoothAlpha={0.15} height={560} /> })}>Fullscreen</button>} data={(gpuTrends[g.index]?.mem || []).map(p => ({ ts: p.ts, value: p.value }))} stroke="#f59e0b" valueSuffix=" MB" xLabel="time" yLabel="mem" smoothAlpha={0.15} height={240} />
                  </div>
                </div>
              </div>
            ))}
            {gpus && gpus.length === 0 && (<div className="text-xs text-white/60">No GPU metrics available.</div>)}
          </div>
        </AccordionItem>

        {/* CPU */}
        <AccordionItem
          id="cpu"
          title={<span>CPU</span>}
          miniKpis={[
            { label: 'Util', value: `${shortNum(host?.cpu_util_pct)}%` },
            { label: 'Load1m', value: shortNum(host?.load_avg_1m ?? null) },
          ]}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-white/70 mb-1 inline-flex items-center gap-1">CPU Util % (15m) <Tooltip text="CPU utilization percentage over the last 15 minutes." /></div>
              <div className="relative">
                <LineChart enableControls filePrefix="cpu_util_15m" footerExtra={<button className="btn text-xs" onClick={() => setFullscreen({ title: 'CPU Util % (15m)', content: <LineChart enableControls filePrefix="cpu_util_15m" data={(trends?.cpu_util_pct || []).map(p => ({ ts: p.ts * 1000, value: p.value }))} valueSuffix="%" xLabel="time" yLabel="util" smoothAlpha={0.2} height={560} thresholds={{ warn: 70, crit: 90 }} promQuery={'100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100)'} /> })}>Fullscreen</button>} data={(trends?.cpu_util_pct || []).map(p => ({ ts: p.ts * 1000, value: p.value }))} valueSuffix="%" xLabel="time" yLabel="util" smoothAlpha={0.2} height={240} thresholds={{ warn: 70, crit: 90 }} promQuery={'100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100)'} />
              </div>
            </div>
            {/* Per-core overlay collapsed by default */}
            <div>
              <Accordion storageKey="sysmon-cpu">
                <AccordionItem id="cpu-cores" title={<span>CPU per‑core</span>} defaultOpen={false}>
                  <div className="text-xs text-white/70 mb-1 inline-flex items-center gap-1">Per‑core util <Tooltip text="Per‑core utilization percentage. Toggle cores in legend to focus." /></div>
                  {Object.keys(trends?.cpu_per_core_pct || {}).length > 0 ? (
                    <>
                      <LegendToggle
                        items={Object.keys(trends?.cpu_per_core_pct || {})
                          .sort((a,b) => Number(a) - Number(b))
                          .map((id) => ({ id, label: `CPU ${id}` }))}
                        active={activeCores}
                        onChange={setActiveCores}
                      />
                      <div className="mt-2 space-y-2 max-h-[520px] overflow-auto pr-2">
                        {Object.entries(trends?.cpu_per_core_pct || {})
                          .sort(([a],[b]) => Number(a) - Number(b))
                          .map(([core, series]) => {
                            const shown = activeCores[core] !== false;
                            if (!shown) return null;
                            return (
                              <LineChart key={core} enableControls filePrefix={`cpu_core_${core}`} data={(series || []).map(p => ({ ts: p.ts * 1000, value: p.value }))} valueSuffix="%" xLabel="time" yLabel={`cpu ${core}`} smoothAlpha={0.2} height={120} />
                            );
                          })}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-white/50">No per‑core data available yet.</div>
                  )}
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </AccordionItem>

        {/* Memory */}
        <AccordionItem
          id="memory"
          title={<span>Memory</span>}
          miniKpis={[
            { label: 'Used', value: `${shortNum(host?.mem_used_mb)} MB` },
          ]}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-white/70 mb-1 inline-flex items-center gap-1">Mem Used MB (15m) <Tooltip text="Physical memory used over the last 15 minutes." /></div>
              <div className="relative">
                <LineChart enableControls filePrefix="mem_used_mb_15m" footerExtra={<button className="btn text-xs" onClick={() => setFullscreen({ title: 'Mem Used MB (15m)', content: <LineChart enableControls filePrefix="mem_used_mb_15m" data={(trends?.mem_used_mb || []).map(p => ({ ts: p.ts * 1000, value: p.value }))} valueSuffix=" MB" xLabel="time" yLabel="mem" smoothAlpha={0.15} height={560} promQuery={'sum(node_memory_MemTotal_bytes)/(1024*1024) - sum(node_memory_MemAvailable_bytes)/(1024*1024)'} /> })}>Fullscreen</button>} data={(trends?.mem_used_mb || []).map(p => ({ ts: p.ts * 1000, value: p.value }))} valueSuffix=" MB" xLabel="time" yLabel="mem" smoothAlpha={0.15} height={240} promQuery={'sum(node_memory_MemTotal_bytes)/(1024*1024) - sum(node_memory_MemAvailable_bytes)/(1024*1024)'} />
              </div>
            </div>
          </div>
        </AccordionItem>

        {/* Disks */}
        <AccordionItem
          id="disks"
          title={<span>Disks</span>}
          miniKpis={[
            { label: 'Used %', value: `${shortNum(host?.disk_used_pct)}%` },
          ]}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-white/70 mb-1 inline-flex items-center gap-1">Disk Used % (15m) <Tooltip text="Root filesystem usage percentage over the last 15 minutes." /></div>
              <div className="relative">
                <LineChart enableControls filePrefix="disk_used_pct_15m" footerExtra={<button className="btn text-xs" onClick={() => setFullscreen({ title: 'Disk Used % (15m)', content: <LineChart enableControls filePrefix="disk_used_pct_15m" data={(trends?.disk_used_pct || []).map(p => ({ ts: p.ts * 1000, value: p.value }))} valueSuffix="%" xLabel="time" yLabel="disk" smoothAlpha={0.2} height={560} thresholds={{ warn: 80, crit: 95 }} promQuery={'100 * (1 - (sum(node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay|squashfs|aufs|fuse.lxcfs"}) / sum(node_filesystem_size_bytes{mountpoint="/",fstype!~"tmpfs|overlay|squashfs|aufs|fuse.lxcfs"})) )'} /> })}>Fullscreen</button>} data={(trends?.disk_used_pct || []).map(p => ({ ts: p.ts * 1000, value: p.value }))} valueSuffix="%" xLabel="time" yLabel="disk" smoothAlpha={0.2} height={240} thresholds={{ warn: 80, crit: 95 }} promQuery={'100 * (1 - (sum(node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay|squashfs|aufs|fuse.lxcfs"}) / sum(node_filesystem_size_bytes{mountpoint="/",fstype!~"tmpfs|overlay|squashfs|aufs|fuse.lxcfs"})) )'} />
              </div>
            </div>
            {/* Per-disk R/W throughput with LegendToggle and StatTable */}
            <div>
              <div className="text-xs text-white/70 mb-1 inline-flex items-center gap-1">Per‑disk throughput <Tooltip text="Bytes per second read/write by physical device." /></div>
              <LegendToggle
                items={Object.keys(trends?.disk_rw_bps || {}).sort().map((dev) => ({ id: dev, label: dev }))}
                active={activeDisks}
                onChange={setActiveDisks}
              />
              <div className="mt-2 space-y-2">
                {Object.entries(trends?.disk_rw_bps || {}).sort(([a],[b]) => a.localeCompare(b)).map(([dev, rw]) => {
                  if (activeDisks[dev] === false) return null;
                  return (
                    <div key={dev} className="space-y-1">
                      <div className="text-xs text-white/60">{dev}</div>
                      <LineChart enableControls showScaleToggle filePrefix={`disk_${dev}_read`} data={(rw.read || []).map(p => ({ ts: p.ts * 1000, value: p.value }))} stroke="#34d399" valueSuffix=" B/s" xLabel="time" yLabel="read" smoothAlpha={0.15} height={120} />
                      <LineChart enableControls showScaleToggle filePrefix={`disk_${dev}_write`} data={(rw.write || []).map(p => ({ ts: p.ts * 1000, value: p.value }))} stroke="#f59e0b" valueSuffix=" B/s" xLabel="time" yLabel="write" smoothAlpha={0.15} height={120} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </AccordionItem>

        {/* Network */}
        <AccordionItem
          id="network"
          title={<span>Network</span>}
          miniKpis={[
            { label: 'RX', value: `${shortNum(host?.net_rx_bps)} B/s` },
            { label: 'TX', value: `${shortNum(host?.net_tx_bps)} B/s` },
          ]}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-white/70 mb-1 inline-flex items-center gap-1">Net RX B/s (15m) <Tooltip text="Estimated inbound throughput over the last 15 minutes." /></div>
              <div className="relative">
                <LineChart enableControls showScaleToggle filePrefix="net_rx_bps_15m" footerExtra={<button className="btn text-xs" onClick={() => setFullscreen({ title: 'Net RX B/s (15m)', content: <LineChart enableControls showScaleToggle filePrefix="net_rx_bps_15m" data={(trends?.net_rx_bps || []).map(p => ({ ts: p.ts * 1000, value: p.value }))} stroke="#34d399" valueSuffix=" B/s" xLabel="time" yLabel="rx" smoothAlpha={0.15} height={560} promQuery={'sum(rate(node_network_receive_bytes_total{device!~"lo|docker.*|veth.*"}[1m]))'} /> })}>Fullscreen</button>} data={(trends?.net_rx_bps || []).map(p => ({ ts: p.ts * 1000, value: p.value }))} stroke="#34d399" valueSuffix=" B/s" xLabel="time" yLabel="rx" smoothAlpha={0.15} height={240} promQuery={'sum(rate(node_network_receive_bytes_total{device!~"lo|docker.*|veth.*"}[1m]))'} />
              </div>
            </div>
            <div>
              <div className="text-xs text-white/70 mb-1 inline-flex items-center gap-1">Net TX B/s (15m) <Tooltip text="Estimated outbound throughput over the last 15 minutes." /></div>
              <div className="relative">
                <LineChart enableControls showScaleToggle filePrefix="net_tx_bps_15m" footerExtra={<button className="btn text-xs" onClick={() => setFullscreen({ title: 'Net TX B/s (15m)', content: <LineChart enableControls showScaleToggle filePrefix="net_tx_bps_15m" data={(trends?.net_tx_bps || []).map(p => ({ ts: p.ts * 1000, value: p.value }))} stroke="#22d3ee" valueSuffix=" B/s" xLabel="time" yLabel="tx" smoothAlpha={0.15} height={560} promQuery={'sum(rate(node_network_transmit_bytes_total{device!~"lo|docker.*|veth.*"}[1m]))'} /> })}>Fullscreen</button>} data={(trends?.net_tx_bps || []).map(p => ({ ts: p.ts * 1000, value: p.value }))} stroke="#22d3ee" valueSuffix=" B/s" xLabel="time" yLabel="tx" smoothAlpha={0.15} height={240} promQuery={'sum(rate(node_network_transmit_bytes_total{device!~"lo|docker.*|veth.*"}[1m]))'} />
              </div>
            </div>
            {/* Per-interface overlay */}
            <div className="md:col-span-2">
              <div className="text-xs text-white/70 mb-1 inline-flex items-center gap-1">Per‑interface throughput <Tooltip text="Bytes per second per network interface (exclude loopback and docker)." /></div>
              <LegendToggle
                items={Object.keys(trends?.net_per_iface_bps || {}).sort().map((iface) => ({ id: iface, label: iface }))}
                active={activeIfaces}
                onChange={setActiveIfaces}
              />
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(trends?.net_per_iface_bps || {}).sort(([a],[b]) => a.localeCompare(b)).map(([iface, bps]) => {
                  if (activeIfaces[iface] === false) return null;
                  return (
                    <div key={iface} className="card p-2">
                      <div className="text-xs text-white/60 mb-1">{iface}</div>
                      <LineChart enableControls showScaleToggle filePrefix={`iface_${iface}_rx`} data={(bps.rx || []).map(p => ({ ts: p.ts * 1000, value: p.value }))} stroke="#34d399" valueSuffix=" B/s" xLabel="time" yLabel="rx" smoothAlpha={0.15} height={120} />
                      <LineChart enableControls showScaleToggle filePrefix={`iface_${iface}_tx`} data={(bps.tx || []).map(p => ({ ts: p.ts * 1000, value: p.value }))} stroke="#22d3ee" valueSuffix=" B/s" xLabel="time" yLabel="tx" smoothAlpha={0.15} height={120} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </AccordionItem>

        

        {/* Gateway/vLLM */}
        <AccordionItem
          id="gateway"
          title={<span>Gateway / vLLM</span>}
          miniKpis={[
            { label: 'Req/s', value: shortNum(throughput?.req_per_sec ?? null) },
            { label: 'Tok/s', value: shortNum((throughput?.prompt_tokens_per_sec ?? 0) + (throughput?.generation_tokens_per_sec ?? 0)) },
          ]}
        >
          <div className="text-xs text-white/60">Detailed gateway/vLLM charts will appear here as we add per‑model and error rate panels.</div>
        </AccordionItem>
      </Accordion>

      <Modal open={!!fullscreen} onClose={() => setFullscreen(null)} title={fullscreen?.title} variant="fullscreen">
        {fullscreen?.content}
      </Modal>
    </section>
  );
}

function Kpi({ label, value, suffix = '' }: { label: React.ReactNode; value: number | undefined; suffix?: string }) {
  const text = value === undefined || value === null ? '—' : shortNum(value) + (suffix ? ` ${suffix}` : '');
  return (
    <div className="glass rounded p-3">
      <div className="text-xs text-white/70">{label}</div>
      <div className="text-lg font-semibold">{text}</div>
    </div>
  );
}

function KpiWithBadge({ label, value, suffix = '', warn, crit }: { label: React.ReactNode; value: number | undefined; suffix?: string; warn?: number; crit?: number }) {
  const text = value === undefined || value === null ? '—' : shortNum(value) + (suffix ? ` ${suffix}` : '');
  let level: 'ok' | 'warn' | 'crit' = 'ok';
  if (typeof value === 'number') {
    if (crit != null && value >= crit) level = 'crit';
    else if (warn != null && value >= warn) level = 'warn';
  }
  return (
    <div className="glass rounded p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-white/70">{label}</div>
        <ThresholdBadge level={level} />
      </div>
      <div className="text-lg font-semibold">{text}</div>
    </div>
  );
}

function shortNum(n?: number | null) {
  if (n === undefined || n === null) return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  if (n >= 1) return n.toFixed(1);
  return n.toFixed(3);
}

function fmt(n?: number | null, unit?: string) {
  if (n === undefined || n === null) return '—';
  if (unit === 'MB') return `${n.toFixed(0)} MB`;
  if (unit === '%') return `${n.toFixed(0)}%`;
  if (unit === '°C') return `${n.toFixed(0)}°C`;
  return `${n}`;
}

function MiniLine({ data, color = '#60a5fa', overlay = false }: { data?: { ts: number; value: number }[] | null | undefined; color?: string; overlay?: boolean }) {
  const safe: { ts: number; value: number }[] = Array.isArray(data) ? data : [];
  const series = safe.map(d => ({ ts: d.ts * 1000, value: d.value }));
  return (
    <div className={overlay ? '-mt-8' : ''}>
      <svg className="w-full h-24" viewBox="0 0 600 96" preserveAspectRatio="none">
        {series.length > 1 ? (
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2"
            points={polyPoints(series, 600, 96)}
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <text x="8" y="16" className="text-[10px] fill-white/60">No data</text>
        )}
      </svg>
    </div>
  );
}

function polyPoints(data: { ts: number; value: number }[], width: number, height: number) {
  if (!data.length) return '';
  const minX = data[0]!.ts;
  const maxX = data[data.length - 1]!.ts;
  const ys = data.map(d => d.value);
  const minY = 0;
  const maxY = Math.max(1, Math.max(...ys));
  const toX = (v: number) => ((v - minX) / (maxX - minX || 1)) * width;
  const toY = (v: number) => height - ((v - minY) / (maxY - minY || 1)) * height;
  return data.map(d => `${toX(d.ts)},${toY(d.value)}`).join(' ');
}

