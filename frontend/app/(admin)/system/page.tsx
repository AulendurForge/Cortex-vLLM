'use client';

import { useEffect, useState } from 'react';
import React from 'react';
import { Card, H1, ThresholdBadge, PageHeader, Button, Badge, InfoBox } from '../../../src/components/UI';
import { LineChart } from '../../../src/components/Charts';
import { Modal } from '../../../src/components/Modal';
import { Tooltip } from '../../../src/components/Tooltip';
import { Accordion, AccordionItem } from '../../../src/components/monitoring/Accordion';
import { LegendToggle } from '../../../src/components/monitoring/LegendToggle';
import { StatTable } from '../../../src/components/monitoring/StatTable';
import { TimeRangeControls } from '../../../src/components/monitoring/TimeRangeControls';
import apiFetch from '../../../src/lib/api-clients';
import { z } from 'zod';
import { ThroughputSummarySchema, GpuMetricsListSchema, HostSummarySchema, HostTrendsSchema, CapabilitiesSchema, ModelMetricsListSchema } from '../../../src/lib/validators';
import { HostIpDisplay } from '../../../src/components/HostIpDisplay';
import { cn } from '../../../src/lib/cn';

type Throughput = z.infer<typeof ThroughputSummarySchema>;
type Gpu = z.infer<typeof GpuMetricsListSchema>[number];
type HostSummary = z.infer<typeof HostSummarySchema>;
type HostTrends = z.infer<typeof HostTrendsSchema>;
type Capabilities = z.infer<typeof CapabilitiesSchema>;
type ModelMetrics = z.infer<typeof ModelMetricsListSchema>[number];

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
  const [modelMetrics, setModelMetrics] = useState<ModelMetrics[] | null>(null); // Gap #16

  useEffect(() => {
    let stop = false;
    const load = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const [c, t, h, g, mm] = await Promise.all([
          apiFetch('/admin/system/capabilities'),
          apiFetch('/admin/system/throughput'),
          apiFetch('/admin/system/host/summary'),
          apiFetch('/admin/system/gpus'),
          apiFetch('/admin/models/metrics').catch(() => []), // Gap #16: model metrics
        ]);
        if (stop) return;
        setCaps(CapabilitiesSchema.parse(c));
        setThroughput(ThroughputSummarySchema.parse(t));
        setHost(HostSummarySchema.parse(h));
        const gz = GpuMetricsListSchema.parse(g);
        // Gap #16: Parse model metrics
        try {
          const mmz = ModelMetricsListSchema.parse(mm);
          setModelMetrics(mmz);
        } catch { setModelMetrics([]); }
        setGpus(gz);
        setGpuTrends((prev) => {
          const nowTs = Date.now();
          const cutoff = nowTs - 15 * 60 * 1000;
          const next = { ...prev };
          for (const item of gz) {
            const idx = item.index;
            const cur = next[idx] || { util: [], mem: [] };
            next[idx] = {
              util: [...cur.util, { ts: nowTs, value: item.utilization_pct || 0 }].filter(p => p.ts >= cutoff).slice(-200),
              mem: [...cur.mem, { ts: nowTs, value: item.mem_used_mb || 0 }].filter(p => p.ts >= cutoff).slice(-200),
            };
          }
          return next;
        });
        const step = rangeMin <= 60 ? 15 : 60;
        const tr = await apiFetch(`/admin/system/host/trends?minutes=${rangeMin}&step_s=${step}`);
        if (!stop) setTrends(HostTrendsSchema.parse(tr));
        setLastUpdated(Date.now());
      } catch (e) { if (!stop) setError('Synchronization failed'); }
    };
    load();
    const id = setInterval(load, live ? 5000 : 30000);
    return () => { stop = true; clearInterval(id); };
  }, [rangeMin, live]);

  return (
    <section className="space-y-4">
      <PageHeader 
        title="System Analytics" 
        actions={
          <div className="flex items-center gap-3 bg-white/5 p-1 rounded-xl border border-white/10 glass shadow-lg">
            <div className="flex items-center gap-2 px-2 border-r border-white/10">
              <span className="text-[9px] uppercase font-black text-white/30 tracking-widest">Status</span>
              <span className="text-[10px] font-mono text-emerald-400 font-bold flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" /> Live
              </span>
            </div>
            <TimeRangeControls minutes={rangeMin} onChange={setRangeMin} live={live} onToggleLive={setLive} />
            <Button variant="cyan" size="sm" className="h-7 px-3 text-[10px] font-bold uppercase" onClick={() => window.location.reload()}>Refresh</Button>
          </div>
        } 
      />
      
      <HostIpDisplay variant="banner" className="py-2" />
      
      {error && <InfoBox variant="purple" title="Metric Error" className="py-2 text-xs">{error}</InfoBox>}

      <Card className="p-4 relative group">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] flex items-center gap-2">📊 Performance KPIs</div>
          <div className="text-[9px] font-mono text-white/20">{lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '...'}</div>
        </div>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          <Kpi 
            label="Req/s" 
            value={throughput?.req_per_sec} 
            color="cyan" 
            tooltip="Requests per second. Total inference requests processed by the gateway per second."
          />
          <Kpi 
            label="Prompt" 
            value={throughput?.prompt_tokens_per_sec} 
            color="indigo" 
            tooltip="Prompt tokens per second. The rate at which the system processes incoming tokens."
          />
          <Kpi 
            label="Gen" 
            value={throughput?.generation_tokens_per_sec} 
            color="purple" 
            tooltip="Generation tokens per second. The rate at which the system generates new tokens."
          />
          <Kpi 
            label="p50 Lat" 
            value={throughput?.latency_p50_ms} 
            suffix="ms" 
            color="blue" 
            tooltip="50th percentile latency. Half of all requests are completed within this time."
          />
          <Kpi 
            label="p95 Lat" 
            value={throughput?.latency_p95_ms} 
            suffix="ms" 
            color="amber" 
            tooltip="95th percentile latency. 95% of all requests are completed within this time. Useful for identifying worst-case performance."
          />
          <Kpi 
            label="p50 TTFT" 
            value={throughput?.ttft_p50_ms} 
            suffix="ms" 
            color="emerald" 
            tooltip="50th percentile Time To First Token. The median time before the user receives the first chunk of generated text."
          />
        </div>
      </Card>

      <Accordion storageKey="sysmon">
        <AccordionItem
          id="gpus"
          title={<span className="font-bold tracking-tight text-white/90 text-sm uppercase">🖥️ Graphics Processors (GPUs)</span>}
          miniKpis={[
            { label: 'Count', value: (gpus || []).length },
            { label: 'Avg Util', value: Array.isArray(gpus) && gpus.length ? `${Math.round((gpus.reduce((a, g) => a + (g.utilization_pct || 0), 0) / gpus.length) || 0)}%` : '—' },
            { label: 'VRAM Total', value: Array.isArray(gpus) && gpus.length ? `${(gpus.reduce((a, g) => a + (g.mem_used_mb || 0), 0) / 1024).toFixed(1)} GiB` : '—' },
          ]}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {(gpus || []).map((g) => (
              <Card key={g.index} className="p-3 border-white/5 bg-white/[0.02] hover:bg-white/[0.04]">
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/5">
                  <div className="flex flex-col">
                    <div className="text-[8px] uppercase font-black text-white/20 tracking-[0.2em]">GPU {g.index}</div>
                    <div className="text-[11px] font-bold text-white/80 truncate max-w-[140px]">{g.name}</div>
                  </div>
                  {typeof g.temperature_c === 'number' && (
                    <div className="flex items-center gap-2">
                       <ThresholdBadge level={g.temperature_c >= 85 ? 'crit' : g.temperature_c >= 75 ? 'warn' : 'ok'} />
                       <span className="text-[10px] font-mono text-white/40">{g.temperature_c}°</span>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="p-2 bg-white/5 rounded-xl border border-white/5">
                    <div className="text-[8px] uppercase font-black text-white/30 flex items-center gap-1">
                      Utilization
                      <Tooltip text="Percentage of time GPU kernels were active. High values indicate heavy inference load." />
                    </div>
                    <div className="text-sm font-mono font-bold text-purple-400">{fmt(g.utilization_pct, '%')}</div>
                  </div>
                  <div className="p-2 bg-white/5 rounded-xl border border-white/5">
                    <div className="text-[8px] uppercase font-black text-white/30 flex items-center gap-1">
                      VRAM Usage
                      <Tooltip text="Video RAM allocated for model weights and KV cache. Approaching 100% may cause OOM errors." />
                    </div>
                    <div className="text-sm font-mono font-bold text-cyan-400 whitespace-nowrap">
                      {g.mem_used_mb != null && g.mem_total_mb != null 
                        ? `${(g.mem_used_mb / 1024).toFixed(1)} / ${(g.mem_total_mb / 1024).toFixed(1)} GiB`
                        : fmt(g.mem_used_mb, 'MB')}
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="relative p-1.5 bg-black/20 rounded-xl border border-white/5">
                    <div className="flex justify-between px-1 mb-1 text-[8px] font-black text-white/20 uppercase tracking-widest flex items-center gap-1">
                      <div className="flex items-center gap-1">
                        <span>Inference Load</span>
                        <Tooltip text="Real-time trend of computational activity on this GPU." />
                      </div>
                      <Button variant="default" size="sm" className="h-4 p-0 px-1 text-[7px]" onClick={() => setFullscreen({ title: `GPU ${g.index} Load`, content: <LineChart data={gpuTrends[g.index]?.util || []} stroke="#8b5cf6" valueSuffix="%" height={500} /> })}>FS</Button>
                    </div>
                    <LineChart data={gpuTrends[g.index]?.util || []} stroke="#8b5cf6" height={60} smoothAlpha={0.25} valueSuffix="%" />
                  </div>
                  <div className="relative p-1.5 bg-black/20 rounded-xl border border-white/5">
                    <div className="flex justify-between px-1 mb-1 text-[8px] font-black text-white/20 uppercase tracking-widest flex items-center gap-1">
                      <div className="flex items-center gap-1">
                        <span>Memory Allocation</span>
                        <Tooltip text="Trend of VRAM reserved for inference. Stability is expected after model load." />
                      </div>
                      <Button variant="default" size="sm" className="h-4 p-0 px-1 text-[7px]" onClick={() => setFullscreen({ title: `GPU ${g.index} VRAM`, content: <LineChart data={gpuTrends[g.index]?.mem || []} stroke="#f59e0b" valueSuffix=" MB" height={500} /> })}>FS</Button>
                    </div>
                    <LineChart data={gpuTrends[g.index]?.mem || []} stroke="#f59e0b" height={60} smoothAlpha={0.15} valueSuffix=" MB" />
                  </div>
                </div>
              </Card>
            ))}
            {gpus && gpus.length === 0 && (
              <div className="col-span-full py-12 text-center glass rounded-3xl border border-white/5">
                <div className="text-4xl mb-4 opacity-10">🔌</div>
                <div className="text-white/40 text-sm font-bold uppercase tracking-widest">No Active GPU Detectors</div>
              </div>
            )}
          </div>
        </AccordionItem>

        {/* Gap #16: Per-model vLLM Metrics */}
        <AccordionItem
          id="models"
          title={<span className="font-bold tracking-tight text-white/90 text-sm uppercase">🤖 Active Models</span>}
          miniKpis={[
            { label: 'Running', value: (modelMetrics || []).filter(m => m.status === 'running').length },
            { label: 'Loading', value: (modelMetrics || []).filter(m => m.status === 'loading').length },
          ]}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {(modelMetrics || []).map((m) => (
              <Card key={m.model_id} className="p-3 border-white/5 bg-white/[0.02] hover:bg-white/[0.04]">
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/5">
                  <div className="flex flex-col">
                    <div className="text-[8px] uppercase font-black text-white/20 tracking-[0.2em]">{m.served_name}</div>
                    <div className="text-[11px] font-bold text-white/80 truncate max-w-[180px]">{m.model_name}</div>
                  </div>
                  <Badge variant={m.status === 'running' ? 'success' : m.status === 'loading' ? 'warning' : 'default'}>
                    {m.status}
                  </Badge>
                </div>
                {m.status === 'running' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-white/5 rounded-xl border border-white/5">
                      <div className="text-[8px] uppercase font-black text-white/30 flex items-center gap-1">
                        Requests
                        <Tooltip text="Active inference requests being processed." />
                      </div>
                      <div className="text-sm font-mono font-bold text-purple-400">
                        {m.num_requests_running != null ? m.num_requests_running : '—'}
                        {m.num_requests_waiting != null && m.num_requests_waiting > 0 && (
                          <span className="text-[10px] text-amber-400 ml-1">(+{m.num_requests_waiting} queued)</span>
                        )}
                      </div>
                    </div>
                    <div className="p-2 bg-white/5 rounded-xl border border-white/5">
                      <div className="text-[8px] uppercase font-black text-white/30 flex items-center gap-1">
                        KV Cache
                        <Tooltip text="GPU KV cache utilization for this model." />
                      </div>
                      <div className="text-sm font-mono font-bold text-cyan-400">
                        {m.gpu_cache_usage_pct != null ? `${(m.gpu_cache_usage_pct * 100).toFixed(1)}%` : '—'}
                      </div>
                    </div>
                    <div className="p-2 bg-white/5 rounded-xl border border-white/5">
                      <div className="text-[8px] uppercase font-black text-white/30 flex items-center gap-1">
                        Tokens (Prompt)
                        <Tooltip text="Total prompt tokens processed since model start." />
                      </div>
                      <div className="text-sm font-mono font-bold text-indigo-400">
                        {m.prompt_tokens_total != null ? shortNum(m.prompt_tokens_total) : '—'}
                      </div>
                    </div>
                    <div className="p-2 bg-white/5 rounded-xl border border-white/5">
                      <div className="text-[8px] uppercase font-black text-white/30 flex items-center gap-1">
                        Tokens (Gen)
                        <Tooltip text="Total generated tokens since model start." />
                      </div>
                      <div className="text-sm font-mono font-bold text-emerald-400">
                        {m.generation_tokens_total != null ? shortNum(m.generation_tokens_total) : '—'}
                      </div>
                    </div>
                    {m.time_to_first_token_p50_ms != null && (
                      <div className="p-2 bg-white/5 rounded-xl border border-white/5 col-span-2">
                        <div className="text-[8px] uppercase font-black text-white/30 flex items-center gap-1">
                          Avg TTFT
                          <Tooltip text="Average time to first token in milliseconds." />
                        </div>
                        <div className="text-sm font-mono font-bold text-amber-400">
                          {m.time_to_first_token_p50_ms.toFixed(0)} ms
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {m.status === 'loading' && (
                  <div className="py-4 text-center text-white/40 text-sm">
                    <span className="animate-pulse">⏳ Loading model...</span>
                  </div>
                )}
                {m.error && (
                  <div className="mt-2 text-[10px] text-red-400 bg-red-500/10 px-2 py-1 rounded">
                    {m.error}
                  </div>
                )}
              </Card>
            ))}
            {modelMetrics && modelMetrics.length === 0 && (
              <div className="col-span-full py-12 text-center glass rounded-3xl border border-white/5">
                <div className="text-4xl mb-4 opacity-10">🤖</div>
                <div className="text-white/40 text-sm font-bold uppercase tracking-widest">No Active Models</div>
                <div className="text-white/20 text-xs mt-2">Start a model from the Models page to see metrics here</div>
              </div>
            )}
          </div>
        </AccordionItem>

        <AccordionItem id="cpu" title={<span className="text-sm font-bold uppercase text-white/90">💾 Host Processors (CPU)</span>} miniKpis={[{ label: 'Util', value: `${shortNum(host?.cpu_util_pct)}%` }]}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-[9px] uppercase font-black text-white/30 tracking-widest flex items-center gap-1">
                Aggregate Utilization
                <Tooltip text="Average CPU usage across all available cores." />
              </div>
              <div className="bg-black/20 p-2 rounded-2xl border border-white/5">
                <LineChart data={(trends?.cpu_util_pct || []).map(p => ({ ts: p.ts * 1000, value: p.value }))} valueSuffix="%" height={180} smoothAlpha={0.2} stroke="#6366f1" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-[9px] uppercase font-black text-white/30 tracking-widest flex items-center gap-1">
                Per-Core Topology
                <Tooltip text="Individual utilization for each detected CPU core." />
              </div>
              <div className="max-h-[200px] overflow-auto custom-scrollbar space-y-1.5 pr-2">
                {Object.entries(trends?.cpu_per_core_pct || {}).map(([core, series]) => (
                  <div key={core} className="flex items-center gap-3 bg-white/5 p-1.5 rounded-xl border border-white/5">
                    <span className="text-[9px] font-mono font-bold text-indigo-300 w-8">C{core}</span>
                    <div className="flex-1 h-6"><LineChart data={(series || []).map(p => ({ ts: p.ts * 1000, value: p.value }))} height={24} stroke="#818cf8" /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </AccordionItem>

        <AccordionItem id="memory" title={<span className="text-sm font-bold uppercase text-white/90">🧠 System RAM</span>} miniKpis={[{ label: 'Allocated', value: host?.mem_used_mb ? `${(host.mem_used_mb / 1024).toFixed(1)} GiB` : '—' }]}>
          <div className="bg-black/20 p-3 rounded-2xl border border-white/5 space-y-2">
            <div className="text-[9px] uppercase font-black text-white/30 tracking-widest flex items-center gap-1">
              Memory Utilization
              <Tooltip text="Total system memory currently in use by all processes on the host machine." />
            </div>
            <LineChart data={(trends?.mem_used_mb || []).map(p => ({ ts: p.ts * 1000, value: p.value }))} valueSuffix=" MB" height={160} smoothAlpha={0.15} stroke="#3b82f6" />
          </div>
        </AccordionItem>

        <AccordionItem id="network" title={<span className="text-sm font-bold uppercase text-white/90">🌐 Network Interfaces</span>} miniKpis={[{ label: 'RX/TX', value: `${shortNum(host?.net_rx_bps)} / ${shortNum(host?.net_tx_bps)}` }]}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-[9px] font-black uppercase text-white/20 tracking-widest flex items-center gap-1">
                Inbound (RX)
                <Tooltip text="Bytes received per second across all non-loopback network interfaces." />
              </div>
              <div className="bg-black/20 p-2 rounded-2xl border border-white/5"><LineChart data={(trends?.net_rx_bps || []).map(p => ({ ts: p.ts * 1000, value: p.value }))} stroke="#34d399" height={120} /></div>
            </div>
            <div className="space-y-2">
              <div className="text-[9px] font-black uppercase text-white/20 tracking-widest flex items-center gap-1">
                Outbound (TX)
                <Tooltip text="Bytes transmitted per second across all non-loopback network interfaces." />
              </div>
              <div className="bg-black/20 p-2 rounded-2xl border border-white/5"><LineChart data={(trends?.net_tx_bps || []).map(p => ({ ts: p.ts * 1000, value: p.value }))} stroke="#22d3ee" height={120} /></div>
            </div>
          </div>
        </AccordionItem>
      </Accordion>

      <Modal open={!!fullscreen} onClose={() => setFullscreen(null)} title={fullscreen?.title} variant="fullscreen">
        <div className="h-full p-4">{fullscreen?.content}</div>
      </Modal>
    </section>
  );
}

function Kpi({ label, value, suffix = '', color = 'default', tooltip }: { label: string; value: number | undefined; suffix?: string; color?: any; tooltip?: string }) {
  const text = value === undefined || value === null ? '—' : shortNum(value) + suffix;
  const gradients = { default: 'from-white/5 to-transparent', cyan: 'from-cyan-500/10 to-transparent', indigo: 'from-indigo-500/10 to-transparent', purple: 'from-purple-500/10 to-transparent', blue: 'from-blue-500/10 to-transparent', amber: 'from-amber-500/10 to-transparent', emerald: 'from-emerald-500/10 to-transparent' };
  const textColors = { default: 'text-white/90', cyan: 'text-cyan-300', indigo: 'text-indigo-300', purple: 'text-purple-300', blue: 'text-blue-300', amber: 'text-amber-300', emerald: 'text-emerald-300' };
  return (
    <div className={cn("glass rounded-xl p-3 bg-gradient-to-br border-white/5 shadow-lg transition-transform hover:scale-[1.02]", gradients[color as keyof typeof gradients])}>
      <div className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em] mb-1 flex items-center gap-1">
        {label}
        {tooltip && <Tooltip text={tooltip} />}
      </div>
      <div className={cn("text-lg font-mono font-bold tracking-tighter", textColors[color as keyof typeof textColors])}>{text}</div>
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
