'use client';

import { useQuery } from '@tanstack/react-query';
import apiFetch from '../../../src/lib/api-clients';
import { UsageListSchema, UsageSeriesSchema, UsageAggListSchema, LatencySummarySchema, TtftSummarySchema } from '../../../src/lib/validators';
import { PageHeader, Card } from '../../../src/components/UI';
import { LineChart, BarChart } from '../../../src/components/Charts';
import { useEffect, useMemo, useState } from 'react';
import { RangeSlider } from '../../../src/components/RangeSlider';
import { Tooltip } from '../../../src/components/Tooltip';

type UsageItem = {
  id: number;
  key_id: number | null;
  model_name: string;
  task: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  status_code: number;
  req_id: string;
  created_at: number;
};

export default function UsagePage() {
  const [filters, setFilters] = useState<{ hours: number; model?: string | ''; task?: string | ''; status?: string | ''; key_id?: number | ''; user_id?: number | ''; org_id?: number | '' }>({ hours: 24 });
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [live, setLive] = useState(false);

  useEffect(() => { setPage(0); }, [filters]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set('limit', String(limit));
    p.set('offset', String(page * limit));
    if (filters.hours) p.set('hours', String(filters.hours));
    if (filters.model) p.set('model', String(filters.model));
    if (filters.task) p.set('task', String(filters.task));
    if (filters.status) p.set('status', String(filters.status));
    if (filters.key_id) p.set('key_id', String(filters.key_id));
    if (filters.user_id) p.set('user_id', String(filters.user_id));
    if (filters.org_id) p.set('org_id', String(filters.org_id));
    return p;
  }, [filters, page, limit]);

  const list = useQuery({
    queryKey: ['usage', filters],
    queryFn: async () => {
      const raw = await apiFetch<any>(`/admin/usage?${params.toString()}`);
      return UsageListSchema.parse(raw) as UsageItem[];
    },
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    refetchInterval: live ? 5000 : false,
  });

  const series = useQuery({
    queryKey: ['usageSeries', filters],
    queryFn: async () => {
      const modelPart = filters.model ? `&model=${encodeURIComponent(String(filters.model))}` : '';
      const raw = await apiFetch<any>(`/admin/usage/series?hours=${filters.hours}&bucket=${filters.hours <= 24 ? 'hour' : 'day'}${modelPart}`);
      return UsageSeriesSchema.parse(raw);
    },
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    refetchInterval: live ? 10000 : false,
  });

  const topModels = useQuery({
    queryKey: ['usageAgg', filters],
    queryFn: async () => {
      const modelPart = filters.model ? `&model=${encodeURIComponent(String(filters.model))}` : '';
      const raw = await apiFetch<any>(`/admin/usage/aggregate?hours=${filters.hours}${modelPart}`);
      return UsageAggListSchema.parse(raw);
    },
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    refetchInterval: live ? 15000 : false,
  });
  const latency = useQuery({
    queryKey: ['usageLatency', filters],
    queryFn: async () => {
      const modelPart = filters.model ? `&model=${encodeURIComponent(String(filters.model))}` : '';
      const raw = await apiFetch<any>(`/admin/usage/latency?hours=${filters.hours}${modelPart}`);
      return LatencySummarySchema.parse(raw);
    },
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    refetchInterval: live ? 15000 : false,
  });

  const ttft = useQuery({
    queryKey: ['usageTtft', live],
    queryFn: async () => {
      const raw = await apiFetch<any>(`/admin/usage/ttft`);
      return TtftSummarySchema.parse(raw);
    },
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    refetchInterval: live ? 15000 : false,
  });

  const usersLookup = useQuery({
    queryKey: ['usersLookup'],
    queryFn: async () => await apiFetch<any>('/admin/users/lookup'),
    staleTime: 60_000,
  });
  const orgsLookup = useQuery({
    queryKey: ['orgsLookup'],
    queryFn: async () => await apiFetch<any>('/admin/orgs/lookup'),
    staleTime: 60_000,
  });
  const keysLookup = useQuery({
    queryKey: ['keysLookup'],
    queryFn: async () => await apiFetch<any>('/admin/keys?limit=1000&include_names=true'),
    staleTime: 60_000,
  });

  const keyIdToInfo = useMemo(() => {
    const map: Record<number, { prefix: string; username?: string | null; org_name?: string | null }> = {};
    for (const k of (keysLookup.data || []) as any[]) {
      if (typeof k?.id === 'number') {
        map[k.id] = { prefix: String(k.prefix || ''), username: k.username || null, org_name: k.org_name || null };
      }
    }
    return map;
  }, [keysLookup.data]);

  return (
    <section className="space-y-4">
      <PageHeader
        title="Usage"
        actions={(
          <div className="flex items-center gap-2">
            <button onClick={() => { list.refetch(); series.refetch(); topModels.refetch(); latency.refetch(); ttft.refetch(); }} className="btn">Refresh</button>
            <button onClick={() => setLive(v => !v)} className={"btn " + (live ? 'bg-white/10' : '')} aria-pressed={live}>Live</button>
            <button onClick={() => { const base = (process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8084'); window.open(`${base}/admin/usage/export?${params.toString()}`, '_blank'); }} className="btn">Export CSV</button>
          </div>
        )}
      />

      <Card className="p-3">
        <div className="text-sm font-medium mb-3">Filters</div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="text-xs min-w-[320px]">
            <div className="mb-1 flex items-center gap-1">Range <Tooltip text="Select the time window to analyze usage trends." /></div>
            <RangeSlider
              stops={[
                { label: 'Last Hour', value: 1 },
                { label: '6 Hours', value: 6 },
                { label: '24 Hours', value: 24 },
                { label: '7 Days', value: 168 },
              ]}
              value={filters.hours}
              onChange={(v) => setFilters({ ...filters, hours: v })}
            />
          </div>
          <label className="text-xs min-w-[160px]">Model <Tooltip text="Filter by model name." />
            <select className="input mt-1 w-full" value={filters.model ?? ''} onChange={(e) => setFilters({ ...filters, model: e.target.value })}>
              <option value="">Any</option>
              {(topModels.data || []).map(m => <option key={m.model_name} value={m.model_name}>{m.model_name}</option>)}
            </select>
          </label>
          <label className="text-xs min-w-[160px]">Task <Tooltip text="Select request type: chat, completions, or embeddings." />
            <select className="input mt-1 w-full" value={filters.task ?? ''} onChange={(e) => setFilters({ ...filters, task: e.target.value })}>
              <option value="">Any</option>
              <option value="chat">chat</option>
              <option value="completions">completions</option>
              <option value="embeddings">embeddings</option>
            </select>
          </label>
          <label className="text-xs min-w-[200px]">Key <Tooltip text="Filter by API key (prefix)." />
            <select className="input mt-1 w-full" value={String(filters.key_id ?? '')} onChange={(e) => setFilters({ ...filters, key_id: e.target.value ? Number(e.target.value) : '' })}>
              <option value="">Any</option>
              {(keysLookup.data || []).map((k: any) => (
                <option key={k.id} value={k.id}>{k.prefix}{k.username ? ` • ${k.username}` : ''}{k.org_name ? ` • ${k.org_name}` : ''}</option>
              ))}
            </select>
          </label>
          <label className="text-xs min-w-[160px]">User <Tooltip text="Filter by user who owns the request or key." />
            <select className="input mt-1 w-full" value={String(filters.user_id ?? '')} onChange={(e) => setFilters({ ...filters, user_id: e.target.value ? Number(e.target.value) : '' })}>
              <option value="">Any</option>
              {(usersLookup.data || []).map((u: any) => (
                <option key={u.id} value={u.id}>{u.username}</option>
              ))}
            </select>
          </label>
          <label className="text-xs min-w-[160px]">Org/Program <Tooltip text="Filter by organization or program." />
            <select className="input mt-1 w-full" value={String(filters.org_id ?? '')} onChange={(e) => setFilters({ ...filters, org_id: e.target.value ? Number(e.target.value) : '' })}>
              <option value="">Any</option>
              {(orgsLookup.data || []).map((o: any) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs min-w-[140px]">Status <Tooltip text="Filter by HTTP status class (2xx/4xx/5xx) or specific code." />
            <select className="input mt-1 w-full" value={filters.status ?? ''} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Any</option>
              <option value="2xx">2xx</option>
              <option value="4xx">4xx</option>
              <option value="5xx">5xx</option>
              <option value="200">200</option>
              <option value="400">400</option>
              <option value="500">500</option>
            </select>
          </label>
          <label className="text-xs min-w-[120px]">Page size <Tooltip text="Number of rows per page in the table." />
            <select className="input mt-1 w-full" value={String(limit)} onChange={(e) => { setPage(0); setLimit(Number(e.target.value)); }}>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </label>
        </div>
      </Card>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="text-xs text-white/70">Requests in range</div>
          <div className="text-lg font-semibold">{(series.data || []).reduce((a, b) => a + b.requests, 0).toLocaleString()}</div>
          <div className="text-xs text-white/60 mt-1">Total number of API requests received during the selected time window.</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-white/70">Total tokens in range</div>
          <div className="text-lg font-semibold">{(series.data || []).reduce((a, b) => a + b.total_tokens, 0).toLocaleString()}</div>
          <div className="text-xs text-white/60 mt-1">Sum of prompt and completion tokens reported (or estimated) over time.</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-white/70">Latency p50 / p95 (ms)</div>
          <div className="text-lg font-semibold">{(() => {
            if (!latency.data) return '—';
            return `${Math.round(latency.data.p50_ms)} / ${Math.round(latency.data.p95_ms)}`;
          })()}</div>
          <div className="text-xs text-white/60 mt-1">Median and 95th percentile request latency during the selected range.</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-white/70">TTFT p50 / p95 (s)</div>
          <div className="text-lg font-semibold">{ttft.data ? `${ttft.data.p50_s.toFixed(2)} / ${ttft.data.p95_s.toFixed(2)}` : '—'}</div>
          <div className="text-xs text-white/60 mt-1">Time to first token for streaming responses; lower is better for perceived speed.</div>
        </Card>
      </div>

      {/* Trend chart */}
      <Card className="p-3">
        <div className="text-sm font-medium mb-2">Requests over time</div>
        <LineChart data={(series.data || []).map(p => ({ ts: p.ts, value: p.requests }))} />
        <div className="text-xs text-white/60 mt-2">Shows request volume across the selected time window. Spikes may indicate batch jobs or traffic surges.</div>
      </Card>

      {/* Top models */}
      <Card className="p-3">
        <div className="text-sm font-medium mb-2">Top models by requests</div>
        <BarChart data={(topModels.data || []).map(m => ({ label: m.model_name, value: m.requests }))} />
        <div className="text-xs text-white/60 mt-2">Compares model demand. High-request models may need more capacity or stricter quotas.</div>
      </Card>

      {/* Latest table */}
      {list.data && (
        <div className="overflow-x-auto card p-2">
          <div className="flex items-center justify-between px-2 py-1">
            <div className="text-xs text-white/70">Latest requests under current filters. Page {page + 1}.</div>
            <div className="flex items-center gap-2">
              <button className="btn" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Prev</button>
              <button className="btn" onClick={() => setPage(p => p + 1)} disabled={!list.data || list.data.length < limit}>Next</button>
            </div>
          </div>
          <table className="table">
            <thead className="text-left">
              <tr>
                <th>Time</th>
                <th>Key</th>
                <th>User</th>
                <th>Org/Program</th>
                <th>Model</th>
                <th>Task</th>
                <th>Tokens (p/c/t)</th>
                <th>Latency (ms)</th>
                <th>Status</th>
                <th>Req ID</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map(u => (
                <tr key={u.id}>
                  <td>{new Date(u.created_at * 1000).toLocaleString()}</td>
                  <td className="font-mono text-xs">{u.key_id != null ? (keyIdToInfo[u.key_id]?.prefix || `id:${u.key_id}`) : '-'}</td>
                  <td>{u.key_id != null ? (keyIdToInfo[u.key_id]?.username || '—') : '—'}</td>
                  <td>{u.key_id != null ? (keyIdToInfo[u.key_id]?.org_name || '—') : '—'}</td>
                  <td>{u.model_name}</td>
                  <td>{u.task}</td>
                  <td>{u.prompt_tokens}/{u.completion_tokens}/{u.total_tokens}</td>
                  <td>{u.latency_ms}</td>
                  <td>{u.status_code}</td>
                  <td className="font-mono text-xs">{u.req_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}


