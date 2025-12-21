'use client';

import React from 'react';
import apiFetch from '../../lib/api-clients';
import { Card, Button, Input, Select, SectionTitle, InfoBox, FormField, Badge } from '../UI';
import { Modal } from '../Modal';
import { bytesToGiB, breakdownMemory, recommendGpuMemoryUtilization, type HardwareSnapshot, type ModelMeta, type Workload, type Choices } from '../../lib/model-math';
import { Tooltip } from '../Tooltip';
import { cn } from '../../lib/cn';

export type CalculatorResult = {
  applied: boolean;
  values: Partial<{
    tp_size: number;
    dtype: 'auto' | 'bfloat16' | 'float16';
    quantization: '' | 'awq' | 'gptq' | 'fp8' | 'int8';
    kv_cache_dtype: '' | 'fp8' | 'fp8_e4m3' | 'fp8_e5m2';
    gpu_memory_utilization: number;
    max_model_len: number;
    max_num_batched_tokens: number;
    block_size: number;
    cpu_offload_gb: number;
    swap_space_gb: number;
  }>;
};

export function ResourceCalculatorModal({ open, onClose, onApply }: { open: boolean; onClose: () => void; onApply: (r: CalculatorResult) => void; }) {
  const [loading, setLoading] = React.useState<boolean>(false);
  const [hw, setHw] = React.useState<HardwareSnapshot | null>(null);
  const [meta, setMeta] = React.useState<ModelMeta>({ paramsB: 7, hiddenSize: 4096, numLayers: 32 });
  const [work, setWork] = React.useState<Workload>({ seqLen: 8192, maxNumSeqs: 256, avgActiveTokens: 2048, maxBatchedTokens: 4096 });
  const [choices, setChoices] = React.useState<Choices>({ dtype: 'bfloat16', quantization: '', kvCacheDtype: '', tpSize: 1 });
  const [cpuOffloadGb, setCpuOffloadGb] = React.useState<number>(0);
  const [swapSpaceGb, setSwapSpaceGb] = React.useState<number>(0);
  const [adjustments, setAdjustments] = React.useState<string[]>([]);
  const [repoId, setRepoId] = React.useState<string>("");
  const [baseDir, setBaseDir] = React.useState<string>("");
  const [folder, setFolder] = React.useState<string>("");
  const [fetchingMeta, setFetchingMeta] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (!open) return;
    let stop = false;
    (async () => {
      setLoading(true);
      try {
        const gpus: any[] = await apiFetch('/admin/system/gpus');
        const snapshot: HardwareSnapshot = {
          gpuCount: Array.isArray(gpus) ? gpus.length : 0,
          gpus: (Array.isArray(gpus) ? gpus : []).map((g: any) => ({ index: g.index, name: g.name, mem_total_mb: g.mem_total_mb, mem_used_mb: g.mem_used_mb })),
        };
        if (!stop) setHw(snapshot);
        if (!stop && snapshot.gpuCount > 0) setChoices((c) => ({ ...c, tpSize: Math.min(2, snapshot.gpuCount) }));
        try {
          const r: any = await apiFetch('/admin/models/base-dir');
          if (!stop && r?.base_dir) setBaseDir(r.base_dir);
        } catch {}
      } catch {
        if (!stop) setHw({ gpuCount: 0, gpus: [] });
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => { stop = true; };
  }, [open]);

  const presets: Array<{ id: string; label: string; meta: ModelMeta }> = [
    { id: 'custom', label: 'Custom', meta: meta },
    { id: '7b', label: 'Generic 7B', meta: { paramsB: 7, hiddenSize: 4096, numLayers: 32 } },
    { id: '8b', label: 'Llama‑3‑8B', meta: { paramsB: 8, hiddenSize: 4096, numLayers: 32 } },
    { id: '13b', label: 'Generic 13B', meta: { paramsB: 13, hiddenSize: 5120, numLayers: 40 } },
    { id: '20b', label: 'Generic 20B', meta: { paramsB: 20, hiddenSize: 6144, numLayers: 44 } },
    { id: '70b', label: 'Llama‑3‑70B', meta: { paramsB: 70, hiddenSize: 8192, numLayers: 80 } },
  ];
  const [presetId, setPresetId] = React.useState<string>('custom');
  const applyPreset = (id: string) => {
    setPresetId(id);
    const p = presets.find((x)=>x.id===id);
    if (p && p.id !== 'custom') setMeta(p.meta);
  };

  const onFetchMeta = async () => {
    setFetchingMeta(true);
    try {
      if (repoId) {
        const r: any = await apiFetch(`/admin/models/hf-config?repo_id=${encodeURIComponent(repoId)}`);
        const next = { ...meta };
        if (typeof r.params_b === 'number' && r.params_b > 0) next.paramsB = r.params_b;
        if (typeof r.hidden_size === 'number' && r.hidden_size > 0) next.hiddenSize = r.hidden_size;
        if (typeof r.num_hidden_layers === 'number' && r.num_hidden_layers > 0) next.numLayers = r.num_hidden_layers;
        setMeta(next);
        setPresetId('custom');
      } else if (baseDir && folder) {
        const q = new URLSearchParams({ base: baseDir, folder });
        const r: any = await apiFetch(`/admin/models/inspect-folder?${q.toString()}`);
        const next = { ...meta };
        if (typeof r.params_b === 'number' && r.params_b > 0) next.paramsB = r.params_b;
        if (typeof r.hidden_size === 'number' && r.hidden_size > 0) next.hiddenSize = r.hidden_size;
        if (typeof r.num_hidden_layers === 'number' && r.num_hidden_layers > 0) next.numLayers = r.num_hidden_layers;
        setMeta(next);
        setPresetId('custom');
      }
    } catch {}
    finally { setFetchingMeta(false); }
  };

  const onApplyClick = () => {
    const util = recommendGpuMemoryUtilization();
    onApply({ applied: true, values: {
      tp_size: choices.tpSize,
      dtype: choices.dtype,
      quantization: choices.quantization,
      kv_cache_dtype: choices.kvCacheDtype,
      gpu_memory_utilization: util,
      max_model_len: work.seqLen,
      block_size: 16,
      max_num_batched_tokens: 2048,
      cpu_offload_gb: cpuOffloadGb > 0 ? Math.round(cpuOffloadGb) : 0,
      swap_space_gb: swapSpaceGb > 0 ? Math.round(swapSpaceGb) : 0,
    }});
  };

  const summary = React.useMemo(() => {
    if (!hw) return null;
    const br = breakdownMemory(meta, work, choices, hw);
    return br;
  }, [hw, meta, work, choices]);

  const suggestions = React.useMemo(() => {
    const items: string[] = [];
    if (!summary) return items;
    const anyOver = summary.perGpu.some((p)=>!p.fits);
    if (anyOver) {
      items.push('Consider:');
      items.push('• Enable kv_cache_dtype=fp8');
      items.push('• Use 4‑bit or int8 quantization');
      items.push('• Lower max context or sequences');
      items.push('• Increase TP size');
    }
    return items;
  }, [summary]);

  const autoFit = () => {
    if (!hw) return;
    let c = { ...choices };
    let w = { ...work };
    const notes: string[] = [];
    const tryFits = () => {
      const br = breakdownMemory(meta, w, c, hw);
      const ok = br.perGpu.every((p)=>p.fits);
      return { ok, br };
    };
    let check = tryFits();
    if (!check.ok && (!c.kvCacheDtype || !String(c.kvCacheDtype).startsWith('fp8'))) {
      c.kvCacheDtype = 'fp8';
      notes.push('Set kv_cache_dtype=fp8');
      check = tryFits();
    }
    if (!check.ok && !c.quantization) {
      c.quantization = 'int8';
      notes.push('Enable int8 quantization');
      check = tryFits();
    }
    if (!check.ok && c.quantization !== 'awq' && c.quantization !== 'gptq') {
      c.quantization = 'awq';
      notes.push('Switch to 4-bit (awq)');
      check = tryFits();
    }
    if (!check.ok && hw.gpuCount > c.tpSize) {
      for (let t = c.tpSize + 1; t <= hw.gpuCount; t++) {
        c.tpSize = t;
        notes.push(`Increase TP to ${t}`);
        check = tryFits();
        if (check.ok) break;
      }
    }
    if (!check.ok) {
      const targets = [2048, 1024, 768];
      for (const t of targets) {
        if (check.ok) break;
        const cur = w.maxBatchedTokens ?? 4096;
        if (cur > t) {
          w.maxBatchedTokens = t;
          notes.push(`Reduce batched tokens to ${t}`);
          check = tryFits();
        }
      }
    }
    if (!check.ok && (w.avgActiveTokens ?? 2048) > 1024) {
      w.avgActiveTokens = Math.max(512, Math.floor((w.avgActiveTokens ?? 2048) / 2));
      notes.push(`Reduce avg tokens to ${w.avgActiveTokens}`);
      check = tryFits();
    }
    if (!check.ok && w.maxNumSeqs > 64) {
      w.maxNumSeqs = Math.max(64, Math.floor(w.maxNumSeqs / 2));
      notes.push(`Reduce sequences to ${w.maxNumSeqs}`);
      check = tryFits();
    }
    if (!check.ok && w.seqLen > 4096) {
      w.seqLen = Math.max(4096, Math.floor(w.seqLen / 2));
      notes.push(`Reduce context to ${w.seqLen}`);
      check = tryFits();
    }
    let offload = 0;
    let swap = 0;
    if (!check.ok) {
      const worst = Math.max(0, ...check.br.perGpu.map((p)=> (p.totalBytes - (p.vramFreeBytes || 0))));
      offload = worst > 0 ? Math.ceil(bytesToGiB(worst)) : 0;
      if (offload > 0) notes.push(`Suggest offload ≈ ${offload} GiB`);
      swap = offload > 0 ? Math.min(16, Math.max(4, Math.ceil(offload / 2))) : 0;
      if (swap > 0) notes.push(`Suggest swap ≈ ${swap} GiB`);
    }
    setChoices(c);
    setWork(w);
    setCpuOffloadGb(offload);
    setSwapSpaceGb(swap);
    setAdjustments(notes);
  };

  return (
    <Modal open={open} onClose={onClose} title="Model Resource Calculator" variant="workflow">
      <div className="p-4 space-y-4 h-full flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto pr-2 space-y-4 custom-scrollbar">
          <section>
            <SectionTitle variant="purple">📦 Source & Presets</SectionTitle>
            <Card className="p-3 bg-white/[0.02] border-white/5 shadow-inner">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField label="Preset">
                  <Select value={presetId} onChange={(e)=>applyPreset(e.target.value)}>
                    {presets.map((p)=> (<option key={p.id} value={p.id}>{p.label}</option>))}
                  </Select>
                </FormField>
                <FormField label="Hugging Face ID">
                  <Input placeholder="owner/repo" value={repoId} onChange={(e)=>setRepoId(e.target.value)} />
                </FormField>
                <div className="grid grid-cols-2 gap-2">
                  <FormField label="Base Dir">
                    <Input value={baseDir} onChange={(e)=>setBaseDir(e.target.value)} placeholder="/var/cortex/models" />
                  </FormField>
                  <FormField label="Folder">
                    <Input value={folder} onChange={(e)=>setFolder(e.target.value)} placeholder="model-name" />
                  </FormField>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-white/5 flex justify-end">
                <Button variant="cyan" size="sm" onClick={onFetchMeta} disabled={fetchingMeta}>
                  {fetchingMeta ? 'Fetching...' : '🔍 Fetch Metadata'}
                </Button>
              </div>
            </Card>
          </section>

          <section>
            <SectionTitle variant="cyan">📐 Specification</SectionTitle>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
              <FormField label="Params (B)"><Input type="number" min={1} value={meta.paramsB} onChange={(e)=>setMeta({ ...meta, paramsB: Number(e.target.value)||meta.paramsB })} /></FormField>
              <FormField label="Hidden Size"><Input type="number" min={512} step={64} value={meta.hiddenSize} onChange={(e)=>setMeta({ ...meta, hiddenSize: Number(e.target.value)||meta.hiddenSize })} /></FormField>
              <FormField label="Layers"><Input type="number" min={1} value={meta.numLayers} onChange={(e)=>setMeta({ ...meta, numLayers: Number(e.target.value)||meta.numLayers })} /></FormField>
              <FormField label="Context"><Input type="number" min={2048} step={1024} value={work.seqLen} onChange={(e)=>setWork({ ...work, seqLen: Number(e.target.value)||work.seqLen })} /></FormField>
              <FormField label="Avg Active"><Input type="number" min={128} step={128} value={work.avgActiveTokens ?? 2048} onChange={(e)=>setWork({ ...work, avgActiveTokens: Number(e.target.value)|| (work.avgActiveTokens ?? 2048) })} /></FormField>
              <FormField label="Max Seqs"><Input type="number" min={1} value={work.maxNumSeqs} onChange={(e)=>setWork({ ...work, maxNumSeqs: Number(e.target.value)||work.maxNumSeqs })} /></FormField>
              <FormField label="TP Size"><Input type="number" min={1} value={choices.tpSize} onChange={(e)=>setChoices({ ...choices, tpSize: Math.max(1, Number(e.target.value)||choices.tpSize) })} /></FormField>
              <FormField label="DType">
                <Select value={choices.dtype} onChange={(e)=>setChoices({ ...choices, dtype: e.target.value as any })}>
                  <option value="auto">auto</option>
                  <option value="bfloat16">bfloat16</option>
                  <option value="float16">float16</option>
                </Select>
              </FormField>
              <FormField label="Quant">
                <Select value={choices.quantization} onChange={(e)=>setChoices({ ...choices, quantization: e.target.value as any })}>
                  <option value="">None</option>
                  <option value="awq">AWQ (4-bit)</option>
                  <option value="gptq">GPTQ (4-bit)</option>
                  <option value="fp8">FP8</option>
                  <option value="int8">INT8</option>
                </Select>
              </FormField>
              <FormField label="KV Cache">
                <Select value={choices.kvCacheDtype} onChange={(e)=>setChoices({ ...choices, kvCacheDtype: e.target.value as any })}>
                  <option value="">Auto</option>
                  <option value="fp8">FP8</option>
                </Select>
              </FormField>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section>
              <SectionTitle variant="blue">🖥️ Hardware</SectionTitle>
              <Card className="p-3 bg-white/[0.02] border-white/5 min-h-[80px] flex flex-col justify-center">
                {loading ? <div className="text-center py-2 animate-pulse text-[10px] font-bold text-white/30 uppercase">Detecting...</div> :
                 hw && hw.gpuCount > 0 ? (
                  <div className="space-y-1.5">
                    {hw.gpus.slice(0, choices.tpSize).map((g)=> (
                      <div key={g.index} className="flex items-center justify-between p-1.5 bg-black/20 rounded-xl border border-white/5">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-[9px] font-bold text-emerald-400">G{g.index}</div>
                          <span className="text-[11px] font-semibold text-white/80">{g.name}</span>
                        </div>
                        <div className="text-[9px] font-mono text-emerald-300">VRAM: {((g.mem_total_mb||0)/1024).toFixed(1)} GiB</div>
                      </div>
                    ))}
                  </div>
                ) : <InfoBox variant="purple" className="text-xs">No GPUs detected.</InfoBox>}
              </Card>
            </section>

            <section>
              <SectionTitle variant="purple">📊 Projection</SectionTitle>
              {summary ? (
                <Card className="p-3 bg-white/[0.02] border-white/5 space-y-2">
                  {summary.perGpu.map((p) => (
                    <div key={p.index} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] uppercase font-black text-white/40">GPU {p.index}</span>
                        <Badge size="sm" className={p.fits ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}>
                          {p.fits ? 'FITS' : 'OVERFLOW'}
                        </Badge>
                      </div>
                      <div className="h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                        <div className={cn("h-full transition-all duration-1000", p.fits ? "bg-gradient-to-r from-indigo-500 to-purple-500" : "bg-red-500")}
                             style={{ width: `${Math.min(100, (p.totalBytes / (p.vramFreeBytes ? p.vramFreeBytes + p.totalBytes : 40 * 1024 * 1024 * 1024)) * 100)}%` }} />
                      </div>
                      <div className="flex justify-between text-[9px] font-mono text-white/40">
                        <span>Weights: {bytesToGiB(p.weightsBytes).toFixed(1)}G</span>
                        <span>KV: {bytesToGiB(p.kvBytes).toFixed(1)}G</span>
                      </div>
                    </div>
                  ))}
                </Card>
              ) : <div className="text-white/20 text-xs italic text-center py-4">Configure to see projection...</div>}
            </section>
          </div>

          {(cpuOffloadGb > 0 || swapSpaceGb > 0 || adjustments.length > 0) && (
            <Card className="p-3 bg-cyan-500/5 border-cyan-500/20 grid grid-cols-2 gap-4">
              {adjustments.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Adjustments</div>
                  {adjustments.map((s, i)=> <div key={i} className="text-[10px] text-white/60 flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-cyan-400"/>{s}</div>)}
                </div>
              )}
              <div className="space-y-1.5">
                <div className="text-[9px] font-black text-purple-400 uppercase tracking-widest">Offload</div>
                <div className="flex gap-2 font-mono text-xs">
                  {cpuOffloadGb > 0 && <div className="p-1 bg-black/20 rounded border border-white/5 text-purple-300">CPU: {Math.round(cpuOffloadGb)}G</div>}
                  {swapSpaceGb > 0 && <div className="p-1 bg-black/20 rounded border border-white/5 text-indigo-300">Disk: {Math.round(swapSpaceGb)}G</div>}
                </div>
              </div>
            </Card>
          )}
        </div>

        <footer className="mt-auto pt-3 border-t border-white/10 flex items-center justify-between -mx-4 -mb-4 px-4 pb-4 bg-black/20">
          <div className="flex gap-2">
            <Button variant="default" size="sm" onClick={autoFit}>✨ Auto-Fit</Button>
            <Button variant="default" size="sm" onClick={() => {}}>📥 Report</Button>
          </div>
          <div className="flex gap-2">
            <Button variant="default" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={onApplyClick} className="px-6">Apply</Button>
          </div>
        </footer>
      </div>
    </Modal>
  );
}
