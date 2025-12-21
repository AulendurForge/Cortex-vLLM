'use client';

import { useQuery } from '@tanstack/react-query';
import apiFetch from '../../../src/lib/api-clients';
import { PageHeader, Button, Card, Badge, InfoBox, SectionTitle } from '../../../src/components/UI';
import { Accordion, AccordionItem } from '../../../src/components/monitoring/Accordion';
import { LineChart } from '../../../src/components/Charts';
import { HostIpDisplay } from '../../../src/components/HostIpDisplay';
import { useToast } from '../../../src/providers/ToastProvider';
import { cn } from '../../../src/lib/cn';
import { safeCopyToClipboard } from '../../../src/lib/clipboard';

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
  const { addToast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['upstreams'],
    queryFn: () => apiFetch<HealthSnapshot>('/admin/upstreams'),
    staleTime: 10_000,
  });

  const onRefresh = async () => {
    try {
      await apiFetch('/admin/upstreams/refresh-health', { method: 'POST', body: JSON.stringify({}) });
      refetch();
      addToast({ title: 'Health checks triggered', kind: 'success' });
    } catch {
      addToast({ title: 'Refresh failed', kind: 'error' });
    }
  };

  return (
    <section className="space-y-4">
      <PageHeader 
        title="Network Health" 
        actions={
          <Button variant="cyan" size="sm" onClick={onRefresh} className="px-6">
            <span className="mr-1.5">🔄</span> Refresh
          </Button>
        } 
      />
      
      <HostIpDisplay variant="banner" className="py-2.5" />
      
      <InfoBox variant="blue" title="Connectivity" className="py-2.5">
        <div className="text-xs text-white/80 mb-1">
          Endpoint: <code className="bg-white/10 px-1 py-0.5 rounded border border-white/10 font-mono text-[10px]">http://192.168.1.181:8084</code>
        </div>
        <a href="/guide?tab=api-keys" className="text-xs font-semibold text-blue-300 hover:text-blue-200 transition-colors">📖 API Guide →</a>
      </InfoBox>
      
      {isLoading && <div className="text-center py-12 text-white/20 uppercase font-black tracking-widest text-[10px]">Synchronizing...</div>}
      
      {data && (
        <Accordion storageKey="health-groups">
          {[
            { id: 'generate', title: '🧠 Inference', color: 'indigo', match: (m: any) => (m?.category || '') === 'generate' },
            { id: 'embed', title: '🗄️ Embeddings', color: 'cyan', match: (m: any) => (m?.category || '') === 'embed' },
            { id: 'other', title: '🔌 Others', color: 'purple', match: (m: any) => (m?.category || 'unknown') === 'unknown' },
          ].map(group => {
            const upstreams = Object.entries(data.health).filter(([url]) => {
              const m = (data.meta && (data.meta as any)[url]) || {} as any;
              return group.match(m);
            });

            return (
              <AccordionItem 
                key={group.id} 
                id={group.id} 
                title={<span className="font-bold tracking-tight text-white/90 text-sm uppercase">{group.title}</span>}
                miniKpis={[
                  { label: 'Live', value: upstreams.filter(([_, h]) => (h as any).ok).length },
                  { label: 'Total', value: upstreams.length }
                ]}
              >
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {upstreams.map(([url, h]) => {
                    const hh = h as { ok: boolean; ts: number };
                    const m = (data.meta && (data.meta as any)[url]) || {} as any;
                    const latency = m.last_latency_ms != null ? `${m.last_latency_ms}ms` : '—';
                    const history = Array.isArray(m.history) ? m.history : [];
                    const series = history.map((p: any) => ({ ts: p.ts * 1000, value: typeof p.latency_ms === 'number' ? p.latency_ms : 0 }));
                    
                    return (
                      <Card key={url} className="p-3 border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300">
                        <div className="flex items-start justify-between gap-3 mb-2 pb-2 border-b border-white/5">
                          <div className="space-y-1.5 flex-1 min-w-0">
                            {Array.isArray(m.served_names) && m.served_names.length > 0 ? (
                              <div className="flex items-center gap-1.5">
                                <code className="font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-[11px]">{m.served_names[0]}</code>
                                <button onClick={async () => { 
                                  const ok = await safeCopyToClipboard(m.served_names[0]); 
                                  if (ok) addToast({ title: 'Copied!', kind: 'success' }); 
                                }} className="p-1 bg-emerald-500/5 text-emerald-500/40 rounded hover:text-emerald-400"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg></button>
                              </div>
                            ) : <div className="text-xs font-bold text-white/90 truncate">{url}</div>}

                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[9px] font-mono">
                              <div className="flex flex-col"><span className="text-white/20 uppercase font-black">Latency</span><span className="text-cyan-400 font-bold">{latency}</span></div>
                              <div className="flex flex-col"><span className="text-white/20 uppercase font-black">HTTP</span><span className={m.last_status_code === 200 ? "text-emerald-400" : "text-red-400"}>{m.last_status_code || '—'}</span></div>
                              <div className="flex flex-col"><span className="text-white/20 uppercase font-black">TPS (P/G)</span><span className="text-indigo-400 font-bold">{(m.tokens_per_sec?.prompt ?? 0).toFixed(1)} / {(m.tokens_per_sec?.generation ?? 0).toFixed(1)}</span></div>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <Badge className={cn("px-2 py-0.5 text-[8px] font-black tracking-widest", hh.ok ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20')}>
                              {hh.ok ? 'ONLINE' : 'OFFLINE'}
                            </Badge>
                            <code className="text-[8px] text-white/20 uppercase font-bold tracking-tighter truncate max-w-[100px]">{url}</code>
                          </div>
                        </div>

                        {series.length > 1 && (
                          <div className="bg-black/20 p-1.5 rounded-xl border border-white/5">
                            <LineChart data={series} height={60} smoothAlpha={0.3} stroke="#06b6d4" />
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </section>
  );
}
