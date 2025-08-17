'use client';

import React from 'react';
import apiFetch from '../../lib/api-clients';
import { Button, PrimaryButton } from '../UI';
import { Modal } from '../Modal';
import { bytesToGiB, breakdownMemory, recommendGpuMemoryUtilization, type HardwareSnapshot, type ModelMeta, type Workload, type Choices } from '../../lib/model-math';
import { Tooltip } from '../Tooltip';

export type CalculatorResult = {
  applied: boolean;
  values: Partial<{
    tpSize: number;
    dtype: 'auto' | 'bfloat16' | 'float16';
    quantization: '' | 'awq' | 'gptq' | 'fp8' | 'int8';
    kvCacheDtype: '' | 'fp8' | 'fp8_e4m3' | 'fp8_e5m2';
    gpuMemoryUtilization: number;
    maxModelLen: number;
    maxNumBatchedTokens: number;
    blockSize: number;
    cpuOffloadGb: number;
    swapSpaceGb: number;
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
  // Source/presets & auto-fill
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
        // Base dir for offline inspect convenience
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

  // Persist state in session for convenience
  React.useEffect(() => {
    if (!open) return;
    try {
      const raw = sessionStorage.getItem('cortex_calc_state');
      if (raw) {
        const s = JSON.parse(raw);
        if (s.meta) setMeta(s.meta);
        if (s.work) setWork(s.work);
        if (s.choices) setChoices(s.choices);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  React.useEffect(() => {
    if (!open) return;
    try {
      sessionStorage.setItem('cortex_calc_state', JSON.stringify({ meta, work, choices }));
    } catch {}
  }, [open, meta, work, choices]);

  // Presets
  const presets: Array<{ id: string; label: string; meta: ModelMeta }> = [
    { id: 'custom', label: 'Custom', meta: meta },
    { id: '7b', label: 'Generic 7B (4096×32)', meta: { paramsB: 7, hiddenSize: 4096, numLayers: 32 } },
    { id: '8b', label: 'Llama‑3‑8B (4096×32)', meta: { paramsB: 8, hiddenSize: 4096, numLayers: 32 } },
    { id: '13b', label: 'Generic 13B (5120×40)', meta: { paramsB: 13, hiddenSize: 5120, numLayers: 40 } },
    { id: '20b', label: 'Generic 20B (6144×44)', meta: { paramsB: 20, hiddenSize: 6144, numLayers: 44 } },
    { id: '70b', label: 'Llama‑3‑70B (8192×80)', meta: { paramsB: 70, hiddenSize: 8192, numLayers: 80 } },
  ];
  const [presetId, setPresetId] = React.useState<string>('custom');
  const applyPreset = (id: string) => {
    setPresetId(id);
    const p = presets.find((x)=>x.id===id);
    if (p && p.id !== 'custom') setMeta(p.meta);
  };

  // Fetch meta from HF or local folder
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

  // Auto-fetch when repoId changes (debounced)
  React.useEffect(() => {
    if (!open) return;
    if (!repoId) return;
    const t = setTimeout(() => { onFetchMeta().catch(()=>{}); }, 600);
    return () => clearTimeout(t);
  }, [open, repoId]);

  // Auto-fetch when both baseDir and folder are present (debounced)
  React.useEffect(() => {
    if (!open) return;
    if (!baseDir || !folder) return;
    const t = setTimeout(() => { onFetchMeta().catch(()=>{}); }, 600);
    return () => clearTimeout(t);
  }, [open, baseDir, folder]);

  const onApplyClick = () => {
    const util = recommendGpuMemoryUtilization();
    onApply({ applied: true, values: {
      tpSize: choices.tpSize,
      dtype: choices.dtype,
      quantization: choices.quantization,
      kvCacheDtype: choices.kvCacheDtype,
      gpuMemoryUtilization: util,
      maxModelLen: work.seqLen,
      blockSize: 16,
      maxNumBatchedTokens: 2048,
      cpuOffloadGb: cpuOffloadGb > 0 ? Math.round(cpuOffloadGb) : 0,
      swapSpaceGb: swapSpaceGb > 0 ? Math.round(swapSpaceGb) : 0,
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
      items.push('Current settings may not fit in available VRAM. Consider:');
      items.push('• Enable kv_cache_dtype=fp8 to halve KV cache memory');
      items.push('• Use 4‑bit or int8 quantization to reduce weight memory');
      items.push('• Lower max context or max sequences');
      items.push('• Increase TP size if multiple GPUs are available');
      items.push('• Use cpu_offload_gb and/or swap_space as a last resort (higher latency)');
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
    // 1) KV fp8
    if (!check.ok && (!c.kvCacheDtype || !String(c.kvCacheDtype).startsWith('fp8'))) {
      c.kvCacheDtype = 'fp8';
      notes.push('Set kv_cache_dtype=fp8');
      check = tryFits();
    }
    // 2) Quantization: int8 then 4-bit
    if (!check.ok && !c.quantization) {
      c.quantization = 'int8';
      notes.push('Enable int8 quantization');
      check = tryFits();
    }
    if (!check.ok && c.quantization !== 'awq' && c.quantization !== 'gptq') {
      c.quantization = 'awq';
      notes.push('Switch to 4-bit quantization (awq)');
      check = tryFits();
    }
    // 3) Increase TP up to GPU count
    if (!check.ok && hw.gpuCount > c.tpSize) {
      for (let t = c.tpSize + 1; t <= hw.gpuCount; t++) {
        c.tpSize = t;
        notes.push(`Increase TP size to ${t}`);
        check = tryFits();
        if (check.ok) break;
      }
    }
    // 4) Reduce total active tokens via max_batched_tokens and avg_active_tokens, then sequences
    if (!check.ok) {
      // lower max_batched_tokens down to 2048 then 1024
      const targets = [2048, 1024, 768];
      for (const t of targets) {
        if (check.ok) break;
        const cur = w.maxBatchedTokens ?? 4096;
        if (cur > t) {
          w.maxBatchedTokens = t;
          notes.push(`Reduce max batched tokens to ${t}`);
          check = tryFits();
        }
      }
    }
    if (!check.ok && (w.avgActiveTokens ?? 2048) > 1024) {
      w.avgActiveTokens = Math.max(512, Math.floor((w.avgActiveTokens ?? 2048) / 2));
      notes.push(`Reduce avg active tokens to ${w.avgActiveTokens}`);
      check = tryFits();
    }
    if (!check.ok && w.maxNumSeqs > 64) {
      w.maxNumSeqs = Math.max(64, Math.floor(w.maxNumSeqs / 2));
      notes.push(`Reduce max sequences to ${w.maxNumSeqs}`);
      check = tryFits();
    }
    // 5) Reduce context down to 4096
    if (!check.ok && w.seqLen > 4096) {
      w.seqLen = Math.max(4096, Math.floor(w.seqLen / 2));
      notes.push(`Reduce context length to ${w.seqLen}`);
      check = tryFits();
    }
    // 6) As last resort, suggest offload/swap
    let offload = 0;
    let swap = 0;
    if (!check.ok) {
      // compute per-GPU deficit and propose offload
      const worst = Math.max(
        0,
        ...check.br.perGpu.map((p)=> (p.totalBytes - (p.vramFreeBytes || 0)))
      );
      offload = worst > 0 ? Math.ceil(bytesToGiB(worst)) : 0;
      if (offload > 0) notes.push(`Suggest cpu_offload_gb ≈ ${offload} GiB`);
      // also propose small swap space
      swap = offload > 0 ? Math.min(16, Math.max(4, Math.ceil(offload / 2))) : 0;
      if (swap > 0) notes.push(`Suggest swap_space ≈ ${swap} GiB`);
    }
    setChoices(c);
    setWork(w);
    setCpuOffloadGb(offload);
    setSwapSpaceGb(swap);
    setAdjustments(notes);
  };

  const downloadReport = () => {
    const lines: string[] = [];
    lines.push('# Cortex Model Resource Report');
    lines.push('');
    lines.push('Hardware:');
    if (hw) {
      hw.gpus.slice(0, choices.tpSize).forEach((g)=>{
        const total = (g.mem_total_mb||0)/1024;
        const used = (g.mem_used_mb||0)/1024;
        lines.push(`- GPU ${g.index}${g.name?` ${g.name}`:''}: total ${total.toFixed(1)} GiB, used ${used.toFixed(1)} GiB`);
      });
    }
    lines.push('');
    lines.push(`Model meta: params=${meta.paramsB}B, hidden_size=${meta.hiddenSize}, layers=${meta.numLayers}`);
    lines.push(`Workload: context=${work.seqLen}, max_num_seqs=${work.maxNumSeqs}`);
    lines.push(`Choices: dtype=${choices.dtype}, quant=${choices.quantization||'none'}, kv_cache_dtype=${choices.kvCacheDtype||'auto'}, tp_size=${choices.tpSize}`);
    lines.push('');
    if (summary) {
      lines.push('Per-GPU estimate:');
      summary.perGpu.forEach((p)=>{
        lines.push(`- GPU ${p.index}: total≈${bytesToGiB(p.totalBytes).toFixed(2)} GiB (weights ${bytesToGiB(p.weightsBytes).toFixed(2)}, kv ${bytesToGiB(p.kvBytes).toFixed(2)}, overhead ${bytesToGiB(p.overheadBytes).toFixed(2)})${p.vramFreeBytes!=null?`, free≈${bytesToGiB(p.vramFreeBytes||0).toFixed(2)} GiB`:''}${p.fits?'':' [may not fit]'}`);
      });
    }
    if (adjustments.length > 0) {
      lines.push('');
      lines.push('Applied adjustments:');
      adjustments.forEach((a)=> lines.push(`- ${a}`));
    }
    if (cpuOffloadGb>0 || swapSpaceGb>0) {
      lines.push('');
      lines.push(`Offload/swap suggestions: cpu_offload_gb≈${Math.round(cpuOffloadGb)} GiB, swap_space≈${Math.round(swapSpaceGb)} GiB`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `cortex-resource-report-${stamp}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal open={open} onClose={onClose} title="Model Resource Calculator">
      <div className="space-y-4">
        <div className="text-white/80 text-sm">Walk through hardware and workload to estimate recommended engine flags.</div>
        <div className="rounded border border-white/10 p-2">
          <div className="text-white/70 text-sm mb-2">Source & presets</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-sm md:col-span-1">Preset
              <select className="input mt-1" value={presetId} onChange={(e)=>applyPreset(e.target.value)}>
                {presets.map((p)=> (<option key={p.id} value={p.id}>{p.label}</option>))}
              </select>
              <p className="text-[11px] text-white/50 mt-1">Quickly set typical meta values for common model sizes. Choose Custom to edit manually.</p>
            </label>
            <label className="text-sm md:col-span-1">HF repo id (optional)
              <input className="input mt-1" placeholder="owner/repo" value={repoId} onChange={(e)=>setRepoId(e.target.value)} />
              <p className="text-[11px] text-white/50 mt-1">Hugging Face repository (e.g., <code>meta-llama/Meta-Llama-3-8B</code>). We read <code>config.json</code> to auto‑fill meta.</p>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:col-span-1">
              <label className="text-sm">Base dir (optional)
                <input className="input mt-1" value={baseDir} onChange={(e)=>setBaseDir(e.target.value)} />
                <p className="text-[11px] text-white/50 mt-1">Your models base directory (mounted as <code>/models</code> in vLLM). Used for local folder inspection.</p>
              </label>
              <label className="text-sm">Folder (optional)
                <input className="input mt-1" value={folder} onChange={(e)=>setFolder(e.target.value)} />
                <p className="text-[11px] text-white/50 mt-1">Subfolder name under the base dir that contains the model. We look for <code>config.json</code> here.</p>
              </label>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-end">
            <Button onClick={onFetchMeta} disabled={fetchingMeta}>{fetchingMeta ? 'Fetching…' : 'Fetch meta'}</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-sm">Params (B)
            <input className="input mt-1" type="number" min={1} step={1} value={meta.paramsB} onChange={(e)=>setMeta({ ...meta, paramsB: Number(e.target.value)||meta.paramsB })} />
            <p className="text-[11px] text-white/50 mt-1">Billions of parameters. Often listed on the model card; may be absent in <code>config.json</code>.</p>
          </label>
          <label className="text-sm">Hidden size
            <input className="input mt-1" type="number" min={512} step={64} value={meta.hiddenSize} onChange={(e)=>setMeta({ ...meta, hiddenSize: Number(e.target.value)||meta.hiddenSize })} />
            <p className="text-[11px] text-white/50 mt-1">From <code>config.json</code> → <code>hidden_size</code> (or <code>n_embd</code>).</p>
          </label>
          <label className="text-sm">Layers
            <input className="input mt-1" type="number" min={1} step={1} value={meta.numLayers} onChange={(e)=>setMeta({ ...meta, numLayers: Number(e.target.value)||meta.numLayers })} />
            <p className="text-[11px] text-white/50 mt-1">From <code>config.json</code> → <code>num_hidden_layers</code> (or <code>n_layer</code>).</p>
          </label>

          <label className="text-sm">Context (tokens)
            <input className="input mt-1" type="number" min={2048} step={1024} value={work.seqLen} onChange={(e)=>setWork({ ...work, seqLen: Number(e.target.value)||work.seqLen })} />
            <p className="text-[11px] text-white/50 mt-1">Target max context length. Larger context increases KV cache VRAM strongly.</p>
          </label>
          <label className="text-sm">Avg active tokens
            <input className="input mt-1" type="number" min={128} step={128} value={work.avgActiveTokens ?? 2048} onChange={(e)=>setWork({ ...work, avgActiveTokens: Number(e.target.value)|| (work.avgActiveTokens ?? 2048) })} />
            <p className="text-[11px] text-white/50 mt-1">Typical tokens per active sequence. Used to estimate total active tokens instead of assuming all sequences at max context.</p>
          </label>
          <label className="text-sm">Max sequences
            <input className="input mt-1" type="number" min={1} step={1} value={work.maxNumSeqs} onChange={(e)=>setWork({ ...work, maxNumSeqs: Number(e.target.value)||work.maxNumSeqs })} />
            <p className="text-[11px] text-white/50 mt-1">Concurrent active sequences. Higher values increase VRAM usage but boost throughput.</p>
          </label>
          <label className="text-sm">Max batched tokens
            <input className="input mt-1" type="number" min={512} step={256} value={work.maxBatchedTokens ?? 4096} onChange={(e)=>setWork({ ...work, maxBatchedTokens: Number(e.target.value)|| (work.maxBatchedTokens ?? 4096) })} />
            <p className="text-[11px] text-white/50 mt-1">Upper bound on total active tokens per batch. Approximates vLLM <code>--max-num-batched-tokens</code>.</p>
          </label>
          <label className="text-sm">TP size
            <input className="input mt-1" type="number" min={1} step={1} value={choices.tpSize} onChange={(e)=>setChoices({ ...choices, tpSize: Math.max(1, Number(e.target.value)||choices.tpSize) })} />
            <p className="text-[11px] text-white/50 mt-1">Tensor parallel size (&lt;= number of GPUs). Shards weights/KV across GPUs.</p>
          </label>

          <label className="text-sm">DType
            <select className="input mt-1" value={choices.dtype} onChange={(e)=>setChoices({ ...choices, dtype: e.target.value as any })}>
              <option value="auto">auto</option>
              <option value="bfloat16">bfloat16</option>
              <option value="float16">float16</option>
            </select>
            <p className="text-[11px] text-white/50 mt-1">Computation precision. bf16/fp16 are typical on NVIDIA. Auto lets vLLM choose.</p>
          </label>
          <label className="text-sm">Quantization
            <select className="input mt-1" value={choices.quantization} onChange={(e)=>setChoices({ ...choices, quantization: e.target.value as any })}>
              <option value="">none</option>
              <option value="awq">awq (4‑bit)</option>
              <option value="gptq">gptq (4‑bit)</option>
              <option value="fp8">fp8</option>
              <option value="int8">int8</option>
            </select>
            <p className="text-[11px] text-white/50 mt-1">Reduces weights memory. 4‑bit has largest savings, int8 moderate, fp8 requires support.</p>
          </label>
          <label className="text-sm">KV cache dtype
            <select className="input mt-1" value={choices.kvCacheDtype} onChange={(e)=>setChoices({ ...choices, kvCacheDtype: e.target.value as any })}>
              <option value="">auto</option>
              <option value="fp8">fp8</option>
              <option value="fp8_e4m3">fp8_e4m3</option>
              <option value="fp8_e5m2">fp8_e5m2</option>
            </select>
            <p className="text-[11px] text-white/50 mt-1">Lower precision KV cache (fp8) can halve KV memory with minor quality impact.</p>
          </label>
        </div>

        <div className="rounded border border-white/10 p-2">
          <div className="text-white/70 text-sm mb-2">Hardware snapshot</div>
          {loading && <div className="text-xs text-white/60">Detecting…</div>}
          {!loading && hw && hw.gpuCount > 0 && (
            <div className="text-xs space-y-1">
              {hw.gpus.slice(0, choices.tpSize).map((g)=> (
                <div key={g.index}>GPU {g.index} {g.name ? `• ${g.name}` : ''} – VRAM {((g.mem_total_mb||0)/1024).toFixed(1)} GiB (used {((g.mem_used_mb||0)/1024).toFixed(1)} GiB)</div>
              ))}
            </div>
          )}
          {!loading && hw && hw.gpuCount === 0 && (
            <div className="text-xs text-white/60">No GPUs detected. Estimates will assume unlimited VRAM; prefer CPU/offload.</div>
          )}
        </div>

        {summary && (
          <div className="rounded border border-white/10 p-2">
            <div className="text-white/70 text-sm mb-2">Per‑GPU memory estimate</div>
            <div className="text-xs space-y-1">
              {summary.perGpu.map((p) => (
                <div key={p.index} className={p.fits ? '' : 'text-amber-300'}>
                  GPU {p.index}: total ~ {bytesToGiB(p.totalBytes).toFixed(1)} GiB (weights {bytesToGiB(p.weightsBytes).toFixed(1)}, kv {bytesToGiB(p.kvBytes).toFixed(1)}, overhead {bytesToGiB(p.overheadBytes).toFixed(1)}) {p.vramFreeBytes!=null?`• free ${(bytesToGiB(p.vramFreeBytes||0)).toFixed(1)} GiB`:''} {p.fits ? '' : ' • may not fit'}
                </div>
              ))}
            </div>
            {suggestions.length > 0 && (
              <div className="mt-2 text-xs text-amber-200">
                {suggestions.map((s, i)=> (<div key={i}>{s}</div>))}
              </div>
            )}
            {adjustments.length > 0 && (
              <div className="mt-2 text-xs text-white/70">
                <div className="font-medium text-white/80 mb-1">Applied adjustments:</div>
                {adjustments.map((s, i)=> (<div key={i}>• {s}</div>))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-white/60">
            {cpuOffloadGb>0 && (<div>cpu_offload_gb: ~{Math.round(cpuOffloadGb)} GiB</div>)}
            {swapSpaceGb>0 && (<div>swap_space: ~{Math.round(swapSpaceGb)} GiB</div>)}
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={autoFit}>Auto‑fit to VRAM</Button>
            <Button onClick={downloadReport}>Download report</Button>
            <Button onClick={onClose}>Close</Button>
            <PrimaryButton onClick={onApplyClick}>Apply to Add Model</PrimaryButton>
          </div>
        </div>
      </div>
    </Modal>
  );
}


