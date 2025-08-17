'use client';

import React from 'react';
import { useToast } from '../../providers/ToastProvider';

type Props = {
  fetcher: () => Promise<string>;
  onClose?: () => void;
  pollMs?: number;
  modelName?: string;
};

export function LogsViewer({ fetcher, onClose, pollMs = 2000, modelName }: Props) {
  const { addToast } = useToast();
  const [text, setText] = React.useState<string>('');
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [live, setLive] = React.useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = React.useState<number>(0);
  const [atBottom, setAtBottom] = React.useState<boolean>(true);
  const [truncated, setTruncated] = React.useState<boolean>(false);
  const preRef = React.useRef<HTMLPreElement | null>(null);

  // Search state
  const [query, setQuery] = React.useState<string>('');
  const [caseSensitive, setCaseSensitive] = React.useState<boolean>(false);
  const [useRegex, setUseRegex] = React.useState<boolean>(false);
  const [activeMatch, setActiveMatch] = React.useState<number>(0);

  // Presentation toggles
  const [wrap, setWrap] = React.useState<boolean>(true);

  // Severity filter (best-effort client side)
  const severities = ['ERROR', 'WARN', 'INFO', 'DEBUG'] as const;
  const [activeSev, setActiveSev] = React.useState<Set<string>>(new Set());

  const MAX_BYTES = 2 * 1024 * 1024; // ~2MB cap

  // Polling
  React.useEffect(() => {
    let stop = false;
    let timer: any = null;
    const loadOnce = async () => {
      try {
        const t = (await fetcher()) || '';
        if (stop) return;
        // Truncation guard: keep last ~2MB
        let next = t;
        let didTruncate = false;
        if (new Blob([t]).size > MAX_BYTES) {
          // heuristic cut to last 2MB at a newline boundary
          const cut = Math.max(0, t.length - MAX_BYTES);
          const idx = t.indexOf('\n', cut);
          next = idx > 0 ? t.slice(idx + 1) : t.slice(-MAX_BYTES);
          didTruncate = true;
        }
        setTruncated(didTruncate);
        setText(next);
        setError(null);
        setLastUpdated(Date.now());
        if (atBottom) {
          requestAnimationFrame(() => {
            try { preRef.current?.scrollTo({ top: preRef.current.scrollHeight }); } catch {}
          });
        }
      } catch (e: any) {
        if (!stop) setError(e?.message || 'Failed to load logs');
      } finally {
        if (!stop) setLoading(false);
      }
    };
    setLoading(true);
    loadOnce();
    if (live) timer = setInterval(loadOnce, Math.max(750, pollMs));
    return () => { stop = true; if (timer) clearInterval(timer); };
  }, [fetcher, live, pollMs, atBottom]);

  // Track scroll position for follow behavior
  React.useEffect(() => {
    const el = preRef.current;
    if (!el) return;
    const onScroll = () => {
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
      setAtBottom(nearBottom);
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Build filtered text (severity)
  const filteredText = React.useMemo(() => {
    if (!activeSev.size) return text;
    try {
      const lines = text.split(/\r?\n/);
      return lines.filter(l => {
        const sev = (l.match(/\b(ERROR|WARN|INFO|DEBUG)\b/) || [])[1];
        return sev ? activeSev.has(sev) : false;
      }).join('\n');
    } catch { return text; }
  }, [text, activeSev]);

  // Matches for search
  const matches = React.useMemo(() => {
    if (!query) return [] as Array<{ start: number; end: number }>;
    try {
      const flags = caseSensitive ? 'g' : 'gi';
      const pattern = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(pattern, flags);
      const out: Array<{ start: number; end: number }> = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(filteredText))) {
        out.push({ start: m.index, end: m.index + (m[0]?.length || 0) });
        if (m.index === re.lastIndex) re.lastIndex++; // avoid zero-length loops
      }
      return out;
    } catch { return []; }
  }, [filteredText, query, caseSensitive, useRegex]);

  // Severity spans for coloring
  const sevSpans = React.useMemo(() => {
    const out: Array<{ start: number; end: number; sev: 'ERROR'|'WARN'|'INFO'|'DEBUG' }> = [];
    try {
      const re = /\b(ERROR|WARN|INFO|DEBUG)\b/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(filteredText))) {
        const sev = (m[1] as any) as 'ERROR'|'WARN'|'INFO'|'DEBUG';
        out.push({ start: m.index, end: m.index + m[0].length, sev });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    } catch {}
    return out;
  }, [filteredText]);

  // Active match clamp
  React.useEffect(() => {
    setActiveMatch(m => (matches.length ? Math.min(m, matches.length - 1) : 0));
  }, [matches.length]);

  // Scroll to active match
  React.useEffect(() => {
    const el = preRef.current;
    if (!el || !matches.length) return;
    const target = matches[activeMatch];
    if (!target) return;
    const ratio = target.start / Math.max(1, filteredText.length);
    el.scrollTo({ top: ratio * el.scrollHeight - el.clientHeight * 0.3, behavior: 'smooth' });
  }, [activeMatch, matches, filteredText.length]);

  // Render highlighted content efficiently (merge search matches + severity spans)
  const content = React.useMemo(() => {
    type Span = { start: number; end: number; type: 'match' | 'active' | 'sev'; sev?: 'ERROR'|'WARN'|'INFO'|'DEBUG'; key: string };
    const spans: Span[] = [];
    matches.forEach((m, i) => {
      spans.push({ start: m.start, end: m.end, type: i === activeMatch ? 'active' : 'match', key: `m-${i}` });
    });
    sevSpans.forEach((s, i) => spans.push({ start: s.start, end: s.end, type: 'sev', sev: s.sev, key: `s-${i}` }));
    if (!spans.length) return filteredText;
    spans.sort((a, b) => a.start - b.start || (a.end - b.end));
    // merge overlaps by priority: active > match > sev
    const merged: Span[] = [];
    for (const s of spans) {
      if (!merged.length) { merged.push(s); continue; }
      const last = merged[merged.length - 1];
      if (s.start >= last.end) { merged.push(s); continue; }
      // overlap: split; keep higher priority segment first
      const pri = (t: Span['type']) => t === 'active' ? 3 : t === 'match' ? 2 : 1;
      if (pri(s.type) > pri(last.type)) {
        // cut last to s.start, then push s, then remainder of last
        if (s.start > last.start) merged[merged.length - 1] = { ...last, end: s.start };
        merged.push(s);
        if (s.end < last.end) merged.push({ ...last, start: s.end });
      } else {
        // keep last priority; insert s remainder after last
        if (s.end > last.end) merged.push({ ...s, start: last.end });
      }
    }
    // build output
    const out: React.ReactNode[] = [];
    let cursor = 0;
    const sevCls = (sev?: string) => sev === 'ERROR' ? 'text-red-300' : sev === 'WARN' ? 'text-amber-300' : sev === 'INFO' ? 'text-sky-300' : sev === 'DEBUG' ? 'text-slate-300' : '';
    for (const s of merged) {
      if (cursor < s.start) out.push(filteredText.slice(cursor, s.start));
      if (s.type === 'match') {
        out.push(<span key={s.key} className={`bg-amber-500/40 rounded px-0.5 ${sevCls()}`}>{filteredText.slice(s.start, s.end)}</span>);
      } else if (s.type === 'active') {
        out.push(<span key={s.key} className="bg-yellow-400 text-black rounded px-0.5">{filteredText.slice(s.start, s.end)}</span>);
      } else {
        out.push(<span key={s.key} className={sevCls(s.sev)}>{filteredText.slice(s.start, s.end)}</span>);
      }
      cursor = s.end;
    }
    if (cursor < filteredText.length) out.push(filteredText.slice(cursor));
    return out;
  }, [filteredText, matches, activeMatch, sevSpans]);

  // Minimap markers
  const markers = React.useMemo(() => {
    return matches.map((m, i) => ({ key: i, topPct: (m.start / Math.max(1, filteredText.length)) * 100 }));
  }, [matches, filteredText.length]);

  const copyLogs = async () => {
    try {
      await navigator.clipboard.writeText(filteredText || '');
      addToast({ title: 'Logs copied', kind: 'success' });
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = filteredText || '';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        addToast({ title: 'Logs copied', kind: 'success' });
      } catch {
        addToast({ title: 'Copy failed', kind: 'error' });
      }
    }
  };

  const downloadLogs = () => {
    const blob = new Blob([filteredText || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `logs-${modelName || 'model'}-${stamp}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmtAgo = (ts: number) => {
    if (!ts) return '';
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
  };

  return (
    <div className="space-y-2">
      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 md:gap-3">
        {/* Search group */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-white/60">Search</span>
          <input
            className="input w-56"
            placeholder="Search (text or /regex/)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={caseSensitive} onChange={e=>setCaseSensitive(e.target.checked)} />Case</label>
          <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={useRegex} onChange={e=>setUseRegex(e.target.checked)} />Regex</label>
          <div className="flex items-center gap-1 text-xs">
            <button className="btn" onClick={()=> setActiveMatch(m => matches.length ? (m - 1 + matches.length) % matches.length : 0)} disabled={!matches.length}>Prev</button>
            <button className="btn" onClick={()=> setActiveMatch(m => matches.length ? (m + 1) % matches.length : 0)} disabled={!matches.length}>Next</button>
            <span className="text-white/70">{matches.length ? `${activeMatch+1}/${matches.length}` : '0/0'}</span>
          </div>
        </div>
        {/* Actions group */}
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <span className="text-xs text-white/60 hidden md:inline">Filter</span>
          <div className="hidden md:flex items-center gap-1 text-xs">
            {severities.map(s => (
              <button key={s} className={`btn ${activeSev.has(s) ? 'bg-white/10' : ''}`} onClick={() => {
                const next = new Set(activeSev); next.has(s) ? next.delete(s) : next.add(s); setActiveSev(next);
              }}>{s}</button>
            ))}
          </div>
          <span className="text-xs text-white/60 hidden md:inline">View</span>
          <label className="text-xs flex items-center gap-1 whitespace-nowrap"><input type="checkbox" checked={wrap} onChange={e=>setWrap(e.target.checked)} />Wrap</label>
          <button className="btn whitespace-nowrap" onClick={()=>setLive(v=>!v)} aria-pressed={live} title={live ? 'Pause live updates' : 'Resume live updates'}>
            {live ? 'Pause stream' : 'Resume stream'}
          </button>
          <button className="btn whitespace-nowrap" onClick={copyLogs}>Copy</button>
          <button className="btn whitespace-nowrap" onClick={downloadLogs}>Download</button>
          {onClose && (<button className="btn whitespace-nowrap" onClick={onClose}>Close</button>)}
        </div>
      </div>

      {/* Status row */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {loading && <span className="animate-pulse text-white/70">Loading…</span>}
          {!loading && (
            <span className="text-white/60">{live ? 'Live updating' : 'Paused'} · Updated {fmtAgo(lastUpdated)}</span>
          )}
          {truncated && <span className="text-amber-200">Older lines truncated</span>}
          {error && (
            <span className="text-red-300">{error} <button className="btn ml-2" onClick={()=>setLastUpdated(0)}>Retry</button></span>
          )}
        </div>
        {!atBottom && (
          <button className="btn" onClick={()=>{ try { preRef.current?.scrollTo({ top: preRef.current.scrollHeight, behavior: 'smooth' }); } catch{} }}>Jump to latest</button>
        )}
      </div>

      {/* Log area with minimap */}
      <div className="relative">
        <pre
          ref={preRef}
          className={`glass rounded p-3 max-h-[60vh] overflow-auto text-xs ${wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}
        >{content || '—'}</pre>
        {/* Minimap markers */}
        <div className="absolute top-2 right-1 h-[calc(100%-1rem)] w-1.5">
          {markers.map(m => (
            <div key={m.key} title={`Match #${m.key+1}`}
              className="absolute left-0 right-0 h-0.5 bg-amber-400/80 cursor-pointer"
              style={{ top: `${m.topPct}%` }}
              onClick={() => setActiveMatch(m.key)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

