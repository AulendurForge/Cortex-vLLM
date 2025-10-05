'use client';

import { useQuery } from '@tanstack/react-query';
import apiFetch from '../../../src/lib/api-clients';
import { H1, Button, Card, Badge } from '../../../src/components/UI';
import { Accordion, AccordionItem } from '../../../src/components/monitoring/Accordion';
import { LineChart } from '../../../src/components/Charts';
import { HostIpDisplay } from '../../../src/components/HostIpDisplay';

type HealthSnapshot = {
  circuit_breakers: Record<string, any>;
  health: Record<string, { ok: boolean; ts: number }>;
  meta?: Record<string, {
    last_status_code?: number | null;
    last_latency_ms?: number | null;
    last_ok_ts?: number | null;
    last_fail_ts?: number | null;
    consecutive_fails?: number | null;
    history?: Array<{ ts: number; ok: boolean; latency_ms: number; status_code: number | null }>;
    breaker?: { state: 'OPEN' | 'CLOSED'; cooldown_remaining_sec: number; consecutive_fails?: number };
    tokens_per_sec?: { prompt?: number; generation?: number };
    models?: string[];
    served_names?: string[];
    category?: 'generate' | 'embed' | 'unknown' | string;
  }>;
  lb_index: Record<string, number>;
  now: number;
  health_ttl_sec?: number;
};

export default function HealthPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['upstreams'],
    queryFn: () => apiFetch<HealthSnapshot>('/admin/upstreams'),
    staleTime: 10_000,
  });

  const onRefresh = async () => {
    await apiFetch('/admin/upstreams/refresh-health', { method: 'POST', body: JSON.stringify({}) });
    refetch();
  };

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <H1>Upstream Health</H1>
        <Button onClick={onRefresh}>Refresh</Button>
      </header>
      
      <HostIpDisplay variant="banner" />
      
      <Card className="p-4 bg-blue-500/10 border-blue-500/30">
        <div className="flex items-start gap-3">
          <div className="text-3xl">📡</div>
          <div className="flex-1">
            <div className="font-medium text-blue-200 mb-1">Connect to Your Models</div>
            <div className="text-sm text-white/80 mb-2">
              Use the <strong>served model names</strong> shown below in your API requests. 
              Each model is accessible via the OpenAI-compatible API at <code className="bg-black/30 px-1.5 py-0.5 rounded">http://192.168.1.181:8084</code>
            </div>
            <a 
              href="/guide?tab=api-keys" 
              className="inline-flex items-center gap-1 text-sm text-blue-300 hover:text-blue-200 underline"
            >
              📖 View API Connection Guide →
            </a>
          </div>
        </div>
      </Card>
      
      {isLoading && <div className="text-sm text-white/70 mt-2">Loading...</div>}
      {isError && <div className="text-sm text-red-300 mt-2">Error loading upstream health.</div>}
      {data && (
        <Accordion storageKey="health-groups">
          {[
            { id: 'generate', title: 'Inference / Generate', match: (m: any) => (m?.category || '') === 'generate' },
            { id: 'embed', title: 'Embeddings', match: (m: any) => (m?.category || '') === 'embed' },
            { id: 'transcribe', title: 'Transcription', match: (_: any) => false },
            { id: 'other', title: 'Other / Unknown', match: (m: any) => (m?.category || 'unknown') === 'unknown' },
          ].map(group => (
            <AccordionItem key={group.id} id={group.id} title={<span>{group.title}</span>}>
              <div className="space-y-3">
                {Object.entries(data.health).filter(([url]) => {
                  const m = (data.meta && (data.meta as any)[url]) || {} as any;
                  return group.match(m);
                }).map(([url, h]) => {
            const hh = h as { ok: boolean; ts: number };
            const cb = (data.circuit_breakers[url] || { fail: 0, open_until: 0 }) as { fail: number; open_until: number };
            const open = data.now < (cb.open_until || 0);
            const m = (data.meta && (data.meta as any)[url]) || {} as any;
            const latency = m.last_latency_ms != null ? `${m.last_latency_ms} ms` : '—';
            const http = m.last_status_code != null ? String(m.last_status_code) : '—';
            const lastOk = m.last_ok_ts ? new Date(m.last_ok_ts * 1000).toLocaleString() : '—';
            const fails = m.consecutive_fails != null ? String(m.consecutive_fails) : String(cb.fail || 0);
            const breaker = m.breaker || { state: open ? 'OPEN' : 'CLOSED', cooldown_remaining_sec: Math.max(0, (cb.open_until || 0) - data.now) };
            const category = m.category ? String(m.category) : 'unknown';
            const history = Array.isArray(m.history) ? m.history : [];
            const series = history.map((p: any) => ({ ts: p.ts * 1000, value: typeof p.latency_ms === 'number' ? p.latency_ms : 0 }));
                  return (
              <Card key={url} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-medium text-lg">
                      {Array.isArray(m.served_names) && m.served_names.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-emerald-300 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/30">
                            {m.served_names[0]}
                          </code>
                          <button 
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(m.served_names[0]);
                                // Would need toast context here, simplified for now
                                alert('Model name copied to clipboard!');
                              } catch {}
                            }}
                            className="text-emerald-400 hover:text-emerald-300 transition-colors"
                            title="Copy served model name for API calls"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      ) : Array.isArray(m.models) && m.models.length > 0 ? (
                        <span className="text-white/70">Model: {m.models[0]}</span>
                      ) : (
                        <span className="text-white/70">{url}</span>
                      )}
                      {category !== 'unknown' && (<span className="text-xs text-white/50 ml-2">· {category}</span>)}
                    </div>
                    {Array.isArray(m.served_names) && m.served_names.length > 1 && (
                      <div className="text-xs text-white/60">
                        Also serving: {m.served_names.slice(1).join(', ')}
                      </div>
                    )}
                    <div className="text-[11px] text-white/40">Endpoint: {url}</div>
                  <div className="text-xs text-white/60">Last check: {new Date(hh.ts * 1000).toLocaleString()} {data.health_ttl_sec ? `(TTL ${data.health_ttl_sec}s)` : ''}</div>
                  <div className="text-xs text-white/60">Latency: {latency} · HTTP: {http}</div>
                    <div className="text-xs text-white/60">Last OK: {lastOk} · Fails: {fails}
                      {m.tokens_per_sec && (typeof m.tokens_per_sec.prompt === 'number' || typeof m.tokens_per_sec.generation === 'number') && (
                        <span> · Tok/s: {(m.tokens_per_sec.prompt ?? 0).toFixed(1)}/{(m.tokens_per_sec.generation ?? 0).toFixed(1)}</span>
                      )}
                    </div>
                    {Array.isArray(m.models) && m.models.length > 0 && (
                      <div className="text-xs text-white/60 truncate" title={m.models.join(', ')}>Models: {m.models.slice(0,3).join(', ')}{m.models.length>3?'…':''}</div>
                    )}
                    <div className="text-xs text-white/60">Breaker: {breaker.state}{breaker.cooldown_remaining_sec ? ` (${breaker.cooldown_remaining_sec.toFixed(1)}s)` : ''}</div>
                  </div>
                  <Badge
                    className={hh.ok ? 'bg-green-500/20 text-green-200 border border-green-400/30' : 'bg-red-500/20 text-red-200 border border-red-400/30'}
                    title={breaker.state === 'OPEN' ? 'Breaker open; cooling down' : 'Healthy or closed breaker'}
                  >
                    <span className={hh.ok ? 'text-green-200' : 'text-red-200'}>{hh.ok ? 'UP' : 'DOWN'}</span>
                  </Badge>
                </div>
                {series.length > 1 && (
                  <div className="mt-3">
                    <div className="text-xs text-white/60 mb-1">Latency (recent)</div>
                    <LineChart data={series} height={120} yLabel="ms" xLabel="time" valueSuffix=" ms" smoothAlpha={0.2} />
                  </div>
                )}
              </Card>
                  );
                })}
                {Object.entries(data.health).filter(([url]) => {
                  const m = (data.meta && (data.meta as any)[url]) || {} as any;
                  return group.match(m);
                }).length === 0 && (
                  <div className="text-xs text-white/50">No upstreams in this category.</div>
                )}
              </div>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </section>
  );
}