'use client';

import React from 'react';
import { PrimaryButton, Button } from '../UI';
import { Tooltip } from '../Tooltip';
import apiFetch from '../../lib/api-clients';

export type ModelFormValues = {
  mode: 'online' | 'offline';
  repoId?: string;
  localPath?: string;
  name: string;
  servedModelName: string;
  task: 'generate' | 'embed';
  dtype?: string;
  tpSize?: number;
  gpuMemoryUtilization?: number;
  maxModelLen?: number;
  maxNumBatchedTokens?: number;
  kvCacheDtype?: string;
  quantization?: string;
  blockSize?: number;
  swapSpaceGb?: number;
  enforceEager?: boolean;
  trustRemoteCode?: boolean;
  hfOffline?: boolean;
  hfToken?: string; // optional per-model HF token
  // Advanced
  cpuOffloadGb?: number;
  enablePrefixCaching?: boolean;
  prefixCachingHashAlgo?: string;
  enableChunkedPrefill?: boolean;
  maxNumSeqs?: number;
  cudaGraphSizes?: string; // comma-separated
  pipelineParallelSize?: number;
  device?: 'cuda' | 'cpu';
  // GGUF extras
  tokenizer?: string;
  hfConfigPath?: string;
  // Engine selection
  engineType?: 'vllm' | 'llamacpp';
  // llama.cpp specific fields
  ngl?: number;
  tensorSplit?: string;
  batchSize?: number;
  threads?: number;
  contextSize?: number;
  ropeFreqBase?: number;
  ropeFreqScale?: number;
  flashAttention?: boolean;
  mlock?: boolean;
  noMmap?: boolean;
  numaPolicy?: string;
  splitMode?: string;
};

export function ModelForm({ onSubmit, onCancel, defaults, fetchBaseDir, saveBaseDir, listLocalFolders, submitLabel, modeLocked = false, onValuesChange }: {
  onSubmit: (v: ModelFormValues) => void;
  onCancel: () => void;
  defaults?: Partial<ModelFormValues>;
  fetchBaseDir?: () => Promise<string>;
  saveBaseDir?: (dir: string) => Promise<void>;
  listLocalFolders?: (base: string) => Promise<string[]>;
  submitLabel?: string;
  modeLocked?: boolean; // Hide source selection in Configure modal
  onValuesChange?: (v: ModelFormValues) => void;
}) {
  const [values, setValues] = React.useState<ModelFormValues>({
    mode: defaults?.mode || 'online',
    repoId: defaults?.repoId || '',
    localPath: defaults?.localPath || '',
    name: defaults?.name || '',
    servedModelName: defaults?.servedModelName || '',
    task: (defaults?.task as any) || 'generate',
    dtype: defaults?.dtype || 'auto',
    tpSize: defaults?.tpSize ?? 1,
    gpuMemoryUtilization: defaults?.gpuMemoryUtilization ?? 0.9,
    maxModelLen: defaults?.maxModelLen ?? 8192,
    maxNumBatchedTokens: defaults?.maxNumBatchedTokens ?? 2048,
    kvCacheDtype: defaults?.kvCacheDtype || '',
    quantization: defaults?.quantization || '',
    blockSize: defaults?.blockSize ?? undefined,
    swapSpaceGb: defaults?.swapSpaceGb ?? undefined,
    enforceEager: defaults?.enforceEager ?? true,
    trustRemoteCode: defaults?.trustRemoteCode ?? false,
    hfOffline: defaults?.hfOffline ?? false,
    hfToken: (defaults as any)?.hfToken || '',
    cpuOffloadGb: (defaults as any)?.cpuOffloadGb ?? 0,
    enablePrefixCaching: (defaults as any)?.enablePrefixCaching ?? undefined,
    prefixCachingHashAlgo: (defaults as any)?.prefixCachingHashAlgo ?? '',
    enableChunkedPrefill: (defaults as any)?.enableChunkedPrefill ?? undefined,
    maxNumSeqs: (defaults as any)?.maxNumSeqs ?? undefined,
    cudaGraphSizes: (defaults as any)?.cudaGraphSizes ?? '',
    pipelineParallelSize: (defaults as any)?.pipelineParallelSize ?? undefined,
    device: (defaults as any)?.device ?? 'cuda',
    tokenizer: (defaults as any)?.tokenizer || '',
    hfConfigPath: (defaults as any)?.hfConfigPath || '',
    // Engine and llama.cpp fields
    engineType: (defaults as any)?.engineType ?? 'vllm',
    ngl: (defaults as any)?.ngl ?? 999,
    tensorSplit: (defaults as any)?.tensorSplit ?? '0.25,0.25,0.25,0.25',
    batchSize: (defaults as any)?.batchSize ?? 32,
    threads: (defaults as any)?.threads ?? 32,
    contextSize: (defaults as any)?.contextSize ?? 4096,
    ropeFreqBase: (defaults as any)?.ropeFreqBase ?? undefined,
    ropeFreqScale: (defaults as any)?.ropeFreqScale ?? undefined,
    flashAttention: (defaults as any)?.flashAttention ?? true,
    mlock: (defaults as any)?.mlock ?? true,
    noMmap: (defaults as any)?.noMmap ?? true,
    numaPolicy: (defaults as any)?.numaPolicy ?? 'isolate',
    splitMode: (defaults as any)?.splitMode ?? undefined,
  });

  const set = (k: keyof ModelFormValues, v: any) => setValues(prev => { const next = { ...prev, [k]: v } as ModelFormValues; try { onValuesChange && onValuesChange(next); } catch {} return next; });

  const [baseDir, setBaseDir] = React.useState<string>('');
  const [folders, setFolders] = React.useState<string[]>([]);
  const [loadingFolders, setLoadingFolders] = React.useState<boolean>(false);
  const [savingBase, setSavingBase] = React.useState<boolean>(false);
  const [gpuCount, setGpuCount] = React.useState<number>(1);
  const [inspect, setInspect] = React.useState<null | {
    has_safetensors: boolean;
    gguf_files: string[];
    tokenizer_files: string[];
    config_files: string[];
    warnings: string[];
  }>(null);
  const [useGguf, setUseGguf] = React.useState<boolean>(false);
  const [selectedGguf, setSelectedGguf] = React.useState<string>('');
  const [useLocalTokenizer, setUseLocalTokenizer] = React.useState<boolean>(false);
  const [showGgufHelp, setShowGgufHelp] = React.useState<boolean>(false);

  React.useEffect(() => {
    let stop = false;
    (async () => {
      if (fetchBaseDir) {
        try { const dir = await fetchBaseDir(); if (!stop) setBaseDir(dir || ''); } catch {}
      }
      // Discover GPU count to set guardrails for TP/PP
      try {
        const gpus: any[] = await apiFetch('/admin/system/gpus');
        if (!stop && Array.isArray(gpus) && gpus.length > 0) setGpuCount(gpus.length);
      } catch {}
    })();
    return () => { stop = true; };
  }, [fetchBaseDir]);

  // Notify parent of initial values
  React.useEffect(() => { try { onValuesChange && onValuesChange(values); } catch {} }, []);
  // When task = embed, treat maxModelLen as auto/derived; we don't enforce any specific value here.
  // We simply disable the slider to communicate that the model decides its context window.

  const refreshFolders = React.useCallback(async () => {
    if (!listLocalFolders || !baseDir) { setFolders([]); return; }
    setLoadingFolders(true);
    try { const items = await listLocalFolders(baseDir); setFolders(items || []); } catch { setFolders([]); }
    finally { setLoadingFolders(false); }
  }, [listLocalFolders, baseDir]);

  const runInspect = React.useCallback(async (folder: string) => {
    setInspect(null);
    setUseGguf(false);
    setSelectedGguf('');
    try {
      const q = new URLSearchParams({ base: baseDir, folder });
      const res: any = await apiFetch(`/admin/models/inspect-folder?${q.toString()}`);
      setInspect(res || null);
      // Auto-choice: if only GGUFs and no safetensors, choose gguf
      if (res && !res.has_safetensors && (Array.isArray(res.gguf_files) && res.gguf_files.length > 0)) {
        setUseGguf(true);
        if (res.gguf_files.length === 1) setSelectedGguf(res.gguf_files[0]);
      }
    } catch {}
  }, [baseDir]);

  // Auto-refresh available folders when switching to Offline mode or when baseDir becomes available
  React.useEffect(() => {
    if (values.mode === 'offline' && baseDir) {
      refreshFolders();
    }
  }, [values.mode, baseDir, refreshFolders]);

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      // If GGUF chosen, transform localPath to include selected .gguf and default hfConfigPath
      const usingGguf = !!inspect && (useGguf || (!inspect.has_safetensors && (inspect.gguf_files||[]).length>0));
      const next = { ...values } as ModelFormValues;
      if (usingGguf) {
        if (!useLocalTokenizer && !next.tokenizer) { alert('Tokenizer (HF repo id) is required for GGUF unless you choose to use the local tokenizer.json'); return; }
        const hasConfig = !!(inspect?.config_files || []).find((n)=> n.toLowerCase()==='config.json' || n.toLowerCase()==='params.json');
        if (useLocalTokenizer && !hasConfig) {
          alert('Local tokenizer selected, but no config.json/params.json found in the folder. Either add a compatible config file or switch to providing an HF repo id.');
          return;
        }
        if (useLocalTokenizer && !(inspect?.tokenizer_files || []).length) {
          alert('Local tokenizer selected, but no tokenizer.json/tokenizer.model found in the folder. Add a tokenizer file or switch to providing an HF repo id.');
          return;
        }
        const gg = selectedGguf || (inspect?.gguf_files?.[0] || '');
        if (!gg) { alert('Select a GGUF file'); return; }
        next.localPath = `${next.localPath}/${gg}`;
        // Default config path to folder so vLLM can read local tokenizer/config
        if (!next.hfConfigPath && baseDir && next.localPath) next.hfConfigPath = `/models/${(values.localPath||'')}`;
        // If local tokenizer requested, clear tokenizer field so backend will omit --tokenizer
        if (useLocalTokenizer) next.tokenizer = '';
      }
      onSubmit(next);
    }} className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {!modeLocked && (
        <div className="md:col-span-2">
          <div className="inline-flex items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-1"><input type="radio" name="mode" checked={values.mode==='online'} onChange={() => set('mode','online')} /> Online (Hugging Face)</label>
            <label className="inline-flex items-center gap-1"><input type="radio" name="mode" checked={values.mode==='offline'} onChange={() => set('mode','offline')} /> Offline (Local Folder)</label>
          </div>
        </div>
      )}

      {!modeLocked && (
        values.mode === 'online' ? (
          <>
            <label className="text-sm md:col-span-2">Hugging Face repo_id
              <input className="input mt-1" placeholder="meta-llama/Meta-Llama-3-8B-Instruct" value={values.repoId}
                onChange={(e)=>set('repoId', e.target.value)} required readOnly={modeLocked}/>
              <p className="text-[11px] text-white/50 mt-1">Repository identifier on Hugging Face (owner/repo). The server will download weights into the shared HF cache. <Tooltip text="Example: meta-llama/Meta-Llama-3-8B-Instruct. Requires network access or prewarmed cache." /></p>
            </label>
            <label className="text-sm md:col-span-2">Hugging Face access token (optional)
              <input className="input mt-1" type="password" placeholder="hf_... (stored with this model)" value={values.hfToken||''}
                onChange={(e)=>set('hfToken', e.target.value)} />
              <p className="text-[11px] text-white/50 mt-1">Used to download gated/private repos. Leave blank to use the server environment token. Stored server‑side and not shown after saving.</p>
            </label>
          </>
        ) : (
          <>
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2">
              <label className="text-sm">Models base directory
                <input className="input mt-1" placeholder="/var/cortex/models or C:\\cortex\\models" value={baseDir}
                  onChange={(e)=>setBaseDir(e.target.value)} readOnly={modeLocked} />
                <p className="text-[11px] text-white/50 mt-1">Root folder that contains your offline model directories. It is mounted read‑only into vLLM as /models. <Tooltip text="On Windows set to C:/cortex/models; on Linux, /var/cortex/models. Subfolders appear in the dropdown below." /></p>
              </label>
              <div className="flex items-end gap-2">
                <button type="button" className="btn" onClick={refreshFolders} disabled={!baseDir || loadingFolders}>{loadingFolders ? 'Loading…' : 'Refresh'}</button>
                {(!modeLocked && saveBaseDir) && (
                  <button type="button" className="btn" onClick={async ()=>{ setSavingBase(true); try { await saveBaseDir(baseDir); await refreshFolders(); } finally { setSavingBase(false);} }} disabled={!baseDir || savingBase}>{savingBase ? 'Saving…' : 'Save'}</button>
                )}
              </div>
              <div className="flex items-end">
                <button type="button" className="btn" onClick={()=>{
                  try {
                    const p = (baseDir || '').replace(/\\\\/g,'/');
                    const url = p.match(/^([A-Za-z]:)/) ? `file:///${p.replace(/:/,':').replace(/\\\\/g,'/')}` : `file://${p}`;
                    window.open(url);
                  } catch {}
                }}>Open folder</button>
              </div>
            </div>
            <label className="text-sm md:col-span-2">Select your model item
              <div className="flex items-center gap-2 mt-1">
                <select className="input w-full" value={values.localPath || ''} onChange={(e)=>{
                  const folder = e.target.value; set('localPath', folder);
                  if (!values.name) set('name', folder);
                  const derived = (values.name || folder || '').toLowerCase().replace(/[^a-z0-9\-\_\s]/g,'').replace(/\s+/g,'-');
                  if (!values.servedModelName) set('servedModelName', derived);
                  if (folder) runInspect(folder);
                }} disabled={modeLocked}>
                  <option value="">Select a folder…</option>
                  {folders.map((f)=> (<option key={f} value={f}>{f}</option>))}
                </select>
              </div>
              <p className="text-[11px] text-white/50 mt-1">Pick a subfolder (SafeTensors) or a .gguf file. <Tooltip text="Folders are mounted as /models/<name> and used as --model /models/<name>. If you choose a .gguf file, we will pass --model /models/<file.gguf> and you must provide a tokenizer HF repo id below." /></p>
            </label>
            {/* New: folder inspection and selection between SafeTensors and GGUF */}
            {!!inspect && (
              <div className="md:col-span-2 space-y-2 text-sm">
                {(inspect.has_safetensors && (inspect.gguf_files||[]).length>0) && (
                  <div className="inline-flex items-center gap-4">
                    <label className="inline-flex items-center gap-2"><input type="radio" checked={!useGguf} onChange={()=>setUseGguf(false)} />Use SafeTensors in this folder</label>
                    <label className="inline-flex items-center gap-2"><input type="radio" checked={useGguf} onChange={()=>setUseGguf(true)} />Use GGUF</label>
                  </div>
                )}
                {(!inspect.has_safetensors && (inspect.gguf_files||[]).length>0) && (
                  <div className="inline-flex items-center gap-2"><input type="radio" checked readOnly /> GGUF detected</div>
                )}
                {useGguf && (
                  <div className="rounded border border-white/10 bg-white/5 p-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[12px] text-white/80">Requirements for GGUF</div>
                      <button type="button" className="btn px-2 py-0 text-xs" onClick={()=>setShowGgufHelp((v)=>!v)}>{showGgufHelp ? 'Collapse' : 'Show more…'}</button>
                    </div>
                    {showGgufHelp && (
                      <ul className="text-[12px] text-white/70 list-disc pl-5 mt-2 space-y-1">
                        <li>Choose a single .gguf file in this folder.</li>
                        <li>Recommended: provide the base Hugging Face repo id for the original model (passed as <code>--tokenizer</code>).</li>
                        <li>Advanced: use local tokenizer. Folder must contain <code>config.json</code> (or <code>params.json</code> for Mistral-family) and <code>tokenizer.json</code> or <code>tokenizer.model</code>. We pass the folder via <code>--hf-config-path</code>.</li>
                        <li>Optional but helpful: <code>tokenizer_config.json</code>, <code>special_tokens_map.json</code>, <code>generation_config.json</code>.</li>
                        <li>vLLM supports single-file GGUF; pass a local path (not a remote repo) for the .gguf.</li>
                      </ul>
                    )}
                    {!!(inspect.gguf_files||[]).length && (
                      <div className="text-[11px] text-white/60 mt-2">Detected GGUF files: {(inspect.gguf_files||[]).join(', ')}</div>
                    )}
                    {!!(inspect.tokenizer_files||[]).length && (
                      <div className="text-[11px] text-white/60">Detected tokenizer files: {(inspect.tokenizer_files||[]).join(', ')}</div>
                    )}
                    {!!(inspect.warnings||[]).length && (
                      <div className="text-[11px] text-amber-300/90">Warnings: {(inspect.warnings||[]).join(', ')}</div>
                    )}
                  </div>
                )}
                {useGguf && (inspect.gguf_files||[]).length>1 && (
                  <label className="block">Select GGUF file
                    <select className="input mt-1" value={selectedGguf} onChange={(e)=>setSelectedGguf(e.target.value)}>
                      <option value="">Select .gguf…</option>
                      {inspect.gguf_files.map((g)=> (<option key={g} value={g}>{g}</option>))}
                    </select>
                  </label>
                )}
                {useGguf && (inspect.tokenizer_files||[]).length>1 && (
                  <div className="text-red-300">Multiple tokenizer files detected in this folder. Keep only one tokenizer.* file.</div>
                )}
              </div>
            )}
            {useGguf && (
              <>
                <div className="md:col-span-2 space-y-1">
                  <div className="text-[12px] text-white/80">Tokenizer source for GGUF</div>
                  <label className="inline-flex items-center gap-2 text-sm"><input type="radio" checked={!useLocalTokenizer} onChange={()=>setUseLocalTokenizer(false)} />Provide Hugging Face repo id (recommended)</label>
                  <label className="inline-flex items-center gap-2 text-sm"><input type="radio" checked={useLocalTokenizer} onChange={()=>setUseLocalTokenizer(true)} />Use tokenizer.json in this folder (advanced)</label>
                  {!useLocalTokenizer && (
                    <>
                      <input className="input mt-1" placeholder="e.g., TinyLlama/TinyLlama-1.1B-Chat-v1.0" value={values.tokenizer||''}
                        onChange={(e)=>set('tokenizer', e.target.value)} />
                      <p className="text-[11px] text-white/50">The HF repo id of the base Transformers model this GGUF came from (find it on Hugging Face). This is passed to vLLM as <code>--tokenizer</code>. Using the base model's tokenizer is recommended for stability.</p>
                    </>
                  )}
                  {useLocalTokenizer && (
                    <p className="text-[11px] text-amber-300/90">We will try to use the tokenizer files present in this folder via <code>--hf-config-path</code>. This may be slower/less stable for some GGUFs.</p>
                  )}
                </div>
                <label className="text-sm">HF config path (optional)
                  <input className="input mt-1" placeholder="e.g., /models/folder" value={values.hfConfigPath||''}
                    onChange={(e)=>set('hfConfigPath', e.target.value)} />
                  <p className="text-[11px] text-white/50 mt-1">If tokenizer conversion fails, provide a path with a compatible Hugging Face config. Passed as --hf-config-path.</p>
                </label>
              </>
            )}
          </>
        )
      )}

      <label className="text-sm">Display name
        <input className="input mt-1" value={values.name} onChange={(e)=>{ const v=e.target.value; set('name', v); const derived=(v||'').toLowerCase().replace(/[^a-z0-9\-\_\s]/g,'').replace(/\s+/g,'-'); set('servedModelName', derived); }} required />
        <p className="text-[11px] text-white/50 mt-1">Human‑readable model title shown in the UI.</p>
      </label>
      <label className="text-sm">Served model name
        <input className="input mt-1" value={values.servedModelName} onChange={(e)=>set('servedModelName', e.target.value)} required />
        <p className="text-[11px] text-white/50 mt-1">Identifier used by the OpenAI API. Lowercase, no spaces; we auto‑derive from the display name. <Tooltip text="Also called 'served_model_name'. Clients call with { model: '<served-name>' }. Avoid special characters; use dashes instead of spaces." /></p>
      </label>

      <label className="text-sm">Task
        <select className="input mt-1" value={values.task} onChange={(e)=>set('task', e.target.value as any)}>
          <option value="generate">generate</option>
          <option value="embed">embed</option>
        </select>
        <p className="text-[11px] text-white/50 mt-1">Routing hint: generation routes to /v1/completions/chat; embed routes to /v1/embeddings.</p>
      </label>
      
      <label className="text-sm">Engine Type
        <select className="input mt-1" value={values.engineType || 'vllm'} onChange={(e)=>set('engineType', e.target.value as any)}>
          <option value="vllm">vLLM (Transformers/Safetensors)</option>
          <option value="llamacpp">llama.cpp (GGUF)</option>
        </select>
        <p className="text-[11px] text-white/50 mt-1">Engine backend: vLLM for HuggingFace models, llama.cpp for GGUF files.</p>
      </label>
      <label className="text-sm">DType
        <select className="input mt-1" value={values.dtype} onChange={(e)=>set('dtype', e.target.value)}>
          <option value="auto">auto</option>
          <option value="float16">float16</option>
          <option value="bfloat16">bfloat16</option>
        </select>
        <p className="text-[11px] text-white/50 mt-1">Computation precision. <Tooltip text="Also called '--dtype'. 'auto' lets vLLM choose; 'float16' or 'bfloat16' use half precision. Lower precision can reduce VRAM with possible quality trade‑offs." /></p>
      </label>

      <label className="text-sm">TP Size
        <input className="input mt-1" type="number" min={1} value={values.tpSize ?? 1} onChange={(e)=>set('tpSize', Number(e.target.value)||1)} />
        <p className="text-[11px] text-white/50 mt-1">Tensor parallel size across GPUs. <Tooltip text="Also called '--tensor-parallel-size'. Must be <= number of visible GPUs. Example: 2 splits the model across 2 GPUs. Improves memory capacity and may lower per‑GPU memory pressure; throughput can improve up to a point but adds inter‑GPU communication overhead. Non‑power‑of‑two values (e.g., 3) work if you have that many GPUs." /></p>
      </label>
      <label className="text-sm">GPU Memory Util
        <input
          className="input mt-1"
          type="range"
          min={0.05}
          max={0.98}
          step={0.01}
          value={values.gpuMemoryUtilization ?? 0.9}
          onChange={(e)=>set('gpuMemoryUtilization', Number(e.target.value))}
        />
        <div className="text-[11px] text-white/60">{(values.gpuMemoryUtilization ?? 0.9).toFixed(2)}</div>
        <p className="text-[11px] text-white/50 mt-1">How much VRAM vLLM is allowed to use (0.05–0.98). Higher allows larger KV cache and batch sizes. <Tooltip text="Also called '--gpu-memory-utilization'. If you see 'not enough KV cache' errors, increase this or lower 'max_model_len'." /></p>
      </label>

      <label className="text-sm">Max context length
        <input
          className="input mt-1"
          type="range"
          min={2048}
          max={131072}
          step={1024}
          value={values.maxModelLen ?? 8192}
          onChange={(e)=>set('maxModelLen', Number(e.target.value))}
          disabled={values.task === 'embed'}
        />
        <div className="text-[11px] text-white/60">{values.task === 'embed' ? 'auto (model derived)' : (values.maxModelLen ?? 8192) + ' tokens'}</div>
        <p className="text-[11px] text-white/50 mt-1">{values.task === 'embed' ? (
          <>Embedding models usually define the maximum sequence length in their config (e.g., max_position_embeddings). The engine will use that automatically.</>
        ) : (
          <>Upper bound of tokens per request. Larger values need more KV cache VRAM. <Tooltip text="Also called '--max-model-len'. Start with 8192–32768 on small GPUs; 131072 requires significant VRAM." /></>
        )}</p>
      </label>
      <div className="text-sm flex items-center gap-2 mt-6">
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!values.trustRemoteCode} onChange={(e)=>set('trustRemoteCode', e.target.checked)} />Trust remote code <Tooltip text="When enabled, allows executing custom code in model repos that define custom model classes or tokenizers. Only enable for trusted sources." /></label>
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!values.hfOffline} onChange={(e)=>set('hfOffline', e.target.checked)} />HF offline <Tooltip text="Hint to run without reaching Hugging Face. For offline installs ensure weights/tokenizer/config exist locally or in the HF cache." /></label>
      </div>

      {values.engineType === 'llamacpp' && (
        <details className="md:col-span-2 mt-2 border-l-2 border-green-500 pl-4">
          <summary className="cursor-pointer text-sm text-green-400">llama.cpp Configuration</summary>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
            <label className="text-sm">GPU Layers (ngl)
              <input className="input mt-1" type="number" min={0} max={999} value={values.ngl ?? 999} 
                onChange={(e)=>set('ngl', Number(e.target.value)||999)} />
              <p className="text-[11px] text-white/50 mt-1">Number of layers to offload to GPU. 999 = all layers.</p>
            </label>
            <label className="text-sm">Tensor Split
              <input className="input mt-1" placeholder="0.25,0.25,0.25,0.25" value={values.tensorSplit||''} 
                onChange={(e)=>set('tensorSplit', e.target.value)} />
              <p className="text-[11px] text-white/50 mt-1">GPU memory distribution (comma-separated ratios).</p>
            </label>
            <label className="text-sm">Batch Size
              <input className="input mt-1" type="number" min={1} max={2048} value={values.batchSize ?? 32} 
                onChange={(e)=>set('batchSize', Number(e.target.value)||32)} />
              <p className="text-[11px] text-white/50 mt-1">Batch size for processing.</p>
            </label>
            <label className="text-sm">CPU Threads
              <input className="input mt-1" type="number" min={1} max={128} value={values.threads ?? 32} 
                onChange={(e)=>set('threads', Number(e.target.value)||32)} />
              <p className="text-[11px] text-white/50 mt-1">Number of CPU threads to use.</p>
            </label>
            <label className="text-sm">Context Size
              <input className="input mt-1" type="number" min={512} max={131072} step={512} value={values.contextSize ?? 4096} 
                onChange={(e)=>set('contextSize', Number(e.target.value)||4096)} />
              <p className="text-[11px] text-white/50 mt-1">Maximum context window in tokens.</p>
            </label>
            <div className="text-sm flex flex-col gap-2 mt-2">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={!!values.flashAttention} onChange={(e)=>set('flashAttention', e.target.checked)} />
                Flash Attention
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={!!values.mlock} onChange={(e)=>set('mlock', e.target.checked)} />
                Memory Lock (mlock)
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={!!values.noMmap} onChange={(e)=>set('noMmap', e.target.checked)} />
                Disable Memory Mapping
              </label>
            </div>
            <label className="text-sm">NUMA Policy
              <select className="input mt-1" value={values.numaPolicy||''} onChange={(e)=>set('numaPolicy', e.target.value)}>
                <option value="">default</option>
                <option value="isolate">isolate</option>
                <option value="distribute">distribute</option>
              </select>
              <p className="text-[11px] text-white/50 mt-1">NUMA memory policy.</p>
            </label>
          </div>
        </details>
      )}

      <details className="md:col-span-2 mt-2">
        <summary className="cursor-pointer text-sm text-white/80">Advanced engine tuning (vLLM)</summary>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2" style={{display: values.engineType === 'vllm' ? 'grid' : 'none'}}>
          <label className="text-sm">Max batched tokens
            <input
              className="input mt-1"
              type="range"
              min={512}
              max={16384}
              step={128}
              value={values.maxNumBatchedTokens ?? 2048}
              onChange={(e)=>set('maxNumBatchedTokens', Number(e.target.value))}
            />
            <div className="text-[11px] text-white/60">{values.maxNumBatchedTokens ?? 2048} tokens</div>
            <p className="text-[11px] text-white/50 mt-1">Limits total tokens processed per batch. <Tooltip text="Also called '--max-num-batched-tokens'. Higher improves throughput but increases VRAM usage and latency per batch. Typical range 1024–8192." /></p>
          </label>
          <label className="text-sm">KV cache dtype
            <select className="input mt-1" value={values.kvCacheDtype || ''} onChange={(e)=>set('kvCacheDtype', e.target.value)}>
              <option value="">auto</option>
              <option value="fp8">fp8</option>
              <option value="fp8_e4m3">fp8_e4m3</option>
              <option value="fp8_e5m2">fp8_e5m2</option>
            </select>
            <p className="text-[11px] text-white/50 mt-1">Precision for KV cache. <Tooltip text="Also called '--kv-cache-dtype'. 'fp8' variants reduce KV memory significantly with minor quality impact; 'auto' lets vLLM pick." /></p>
          </label>
          <label className="text-sm">Quantization
            <select className="input mt-1" value={values.quantization || ''} onChange={(e)=>set('quantization', e.target.value)}>
              <option value="">none</option>
              <option value="awq">awq</option>
              <option value="gptq">gptq</option>
              <option value="fp8">fp8</option>
              <option value="int8">int8</option>
            </select>
            <p className="text-[11px] text-white/50 mt-1">Weight quantization scheme. Requires compatible weights. <Tooltip text="Also called '--quantization'. AWQ/GPTQ need pre‑quantized repos; fp8/int8 require supported kernels. Reduces VRAM with possible quality/perf trade‑offs." /></p>
          </label>
          <label className="text-sm">KV cache block size
            <select className="input mt-1" value={(values.blockSize ?? 16)} onChange={(e)=>set('blockSize', Number(e.target.value))}>
              {[1,8,16,32].map((n)=> (<option key={n} value={n}>{n}</option>))}
            </select>
            <p className="text-[11px] text-white/50 mt-1">Granularity of KV cache paging. Typical: 16. <Tooltip text="Also called '--block-size'. On CUDA, valid values are 1, 8, 16, 32. Smaller blocks (1–8) reduce fragmentation and help fit long contexts in tight VRAM, at slightly higher overhead. Larger blocks (16–32) can improve throughput when memory is plentiful, but may waste memory. Recommended: 16 for balanced performance; try 8 if hitting KV fragmentation; 32 only when VRAM headroom is large." /></p>
          </label>
      <label className="text-sm">Swap space (GiB)
        <input
          className="input mt-1"
          type="range"
          min={0}
          max={64}
          step={1}
          value={values.swapSpaceGb ?? 4}
          onChange={(e)=>set('swapSpaceGb', Number(e.target.value))}
        />
        <div className="text-[11px] text-white/60">{values.swapSpaceGb ?? 4} GiB</div>
        <p className="text-[11px] text-white/50 mt-1">CPU RAM spillover for KV cache. <Tooltip text="Also called '--swap-space'. Helps fit longer contexts on small VRAM, at increased latency." /></p>
      </label>
          <div className="text-sm flex items-center gap-2 mt-6">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!values.enforceEager} onChange={(e)=>set('enforceEager', e.target.checked)} />Disable CUDA graphs (enforce eager)</label>
            <p className="text-[11px] text-white/50">Eager mode simplifies debugging; disabling CUDA graphs can reduce performance slightly. <Tooltip text="Also called '--enforce-eager'. Leave enabled (checked) for maximal compatibility; uncheck to allow CUDA graph capture if stable." /></p>
          </div>
        </div>
      </details>

      <details className="md:col-span-2 mt-2">
        <summary className="cursor-pointer text-sm text-white/80">Advanced cache/offload and scheduling</summary>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
          <label className="text-sm">CPU offload (GiB per GPU)
            <input
              className="input mt-1"
              type="range"
              min={0}
              max={32}
              step={1}
              value={values.cpuOffloadGb ?? 0}
              onChange={(e)=>set('cpuOffloadGb', Number(e.target.value))}
            />
            <div className="text-[11px] text-white/60">{values.cpuOffloadGb ?? 0} GiB</div>
            <p className="text-[11px] text-white/50 mt-1">Offload part of weights/KV to CPU RAM. <Tooltip text="Also called '--cpu-offload-gb'. Requires fast PCIe/NVLink. Increases capacity at the cost of latency." /></p>
          </label>
          <div className="text-sm flex items-center gap-2 mt-6">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!values.enablePrefixCaching} onChange={(e)=>set('enablePrefixCaching', e.target.checked)} />Enable prefix caching <Tooltip text="Also called '--enable-prefix-caching'. Speeds up repeated prefixes across requests." /></label>
          </div>
          <label className="text-sm">Prefix cache hash
            <select className="input mt-1" value={values.prefixCachingHashAlgo || ''} onChange={(e)=>set('prefixCachingHashAlgo', e.target.value)}>
              <option value="">builtin</option>
              <option value="sha256">sha256</option>
              <option value="sha256_cbor_64bit">sha256_cbor_64bit</option>
            </select>
            <p className="text-[11px] text-white/50 mt-1"><Tooltip text="Also called '--prefix-caching-hash-algo'. Choose sha256 variants for reproducible, cross-language caches." /></p>
          </label>
          <div className="text-sm flex items-center gap-2 mt-6">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={!!values.enableChunkedPrefill} onChange={(e)=>set('enableChunkedPrefill', e.target.checked)} />Enable chunked prefill <Tooltip text="Also called '--enable-chunked-prefill'. Improves prefill throughput for long prompts." /></label>
          </div>
          <label className="text-sm">Max sequences (concurrency)
            <input
              className="input mt-1"
              type="range"
              min={1}
              max={2048}
              step={1}
              value={values.maxNumSeqs ?? 256}
              onChange={(e)=>set('maxNumSeqs', Number(e.target.value))}
            />
            <div className="text-[11px] text-white/60">{values.maxNumSeqs ?? 256}</div>
            <p className="text-[11px] text-white/50 mt-1">Upper bound for concurrently active sequences. <Tooltip text="Also called '--max-num-seqs'. Higher values increase concurrency and can improve throughput for many small requests, but consume more VRAM and may raise latency. Start 128–512; increase only if VRAM headroom allows." /></p>
          </label>
          <label className="text-sm">CUDA graph sizes
            <input className="input mt-1" placeholder="e.g., 4096, 8192" value={values.cudaGraphSizes || ''}
              onChange={(e)=>{
                const cleaned = (e.target.value || '').replace(/[^0-9,\s]/g, '');
                set('cudaGraphSizes', cleaned);
              }} />
            <p className="text-[11px] text-white/50 mt-1">Fixed token sizes for graph capture. <Tooltip text="Also called '--cuda-graph-sizes'. Pre-captures kernels at common sequence sizes (e.g., 2048/4096/8192) to reduce overhead and improve throughput on steady workloads. Use when requests have common lengths. Note: CUDA graphs are disabled when 'enforce eager' is enabled." /></p>
          </label>
        </div>
      </details>

      <details className="md:col-span-2 mt-2">
        <summary className="cursor-pointer text-sm text-white/80">Distributed / device</summary>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
          <label className="text-sm">Pipeline parallel size
            <select className="input mt-1" value={(values.pipelineParallelSize ?? 1)} onChange={(e)=>set('pipelineParallelSize', Number(e.target.value))} disabled={(values.device||'cuda')==='cpu'}>
              {Array.from({ length: Math.max(1, (gpuCount && gpuCount>0) ? Math.min(8, gpuCount) : 8) }, (_, i)=> i+1).map((n)=> (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <p className="text-[11px] text-white/50 mt-1">Split layers across devices/nodes. Recommended: 1 for most models. <Tooltip text="Also called '--pipeline-parallel-size'. Shards model layers across stages. Effects: (1) Memory per device decreases as PP increases; (2) Inter‑stage comms add latency; (3) Throughput benefits mainly for very large models. Use >1 when the model cannot fit with TP/quant/KV tweaks alone or in multi‑node. Values >4 are rare and typically for very large (e.g., 70B+) or multi‑node setups with fast interconnects. If GPU count is unknown, options up to 8 are shown; starting will fail if hardware is insufficient." /></p>
          </label>
          <div className="text-sm">
            <div className="mt-1 inline-flex items-center gap-3">
              <label className="inline-flex items-center gap-2"><input type="radio" name="device" checked={(values.device||'cuda')==='cuda'} onChange={()=>set('device','cuda')} />GPU</label>
              <label className="inline-flex items-center gap-2"><input type="radio" name="device" checked={(values.device||'cuda')==='cpu'} onChange={()=>set('device','cpu')} />CPU</label>
            </div>
            <p className="text-[11px] text-white/50 mt-1">Choose compute device. <Tooltip text="When CPU is selected, the container starts without GPU access; throughput will be significantly lower." /></p>
          </div>
        </div>
      </details>

      <div className="md:col-span-2 flex items-center justify-end gap-2 mt-2">
        <Button type="button" onClick={onCancel}>Cancel</Button>
        {submitLabel ? (<PrimaryButton type="submit">{submitLabel}</PrimaryButton>) : null}
      </div>
    </form>
  );
}


