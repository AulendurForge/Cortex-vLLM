'use client';

import React from 'react';
import { PrimaryButton, Button } from '../UI';
import apiFetch from '../../lib/api-clients';
import { EngineSelection } from './modelForm/EngineSelection';
import { ModeSelection } from './modelForm/ModeSelection';
import { OnlineModeFields } from './modelForm/OnlineModeFields';
import { OfflineModeFields } from './modelForm/OfflineModeFields';
import { BasicModelInfo } from './modelForm/BasicModelInfo';
import { VLLMConfiguration } from './modelForm/VLLMConfiguration';
import { LlamaCppConfiguration } from './modelForm/LlamaCppConfiguration';
import { RequestDefaultsSection } from './modelForm/RequestDefaultsSection';
import { CustomArgsEditor, type CustomArg } from './modelForm/CustomArgsEditor';
import { MergeInstructionsModal } from './modelForm/MergeInstructionsModal';

export type ModelFormValues = {
  mode: 'online' | 'offline';
  repo_id?: string;
  local_path?: string;
  name: string;
  served_model_name: string;
  task: 'generate' | 'embed';
  dtype?: string;
  tp_size?: number;
  selected_gpus?: number[];
  gpu_memory_utilization?: number;
  max_model_len?: number;
  max_num_batched_tokens?: number;
  kv_cache_dtype?: string;
  quantization?: string;
  block_size?: number;
  swap_space_gb?: number;
  enforce_eager?: boolean;
  trust_remote_code?: boolean;
  hf_offline?: boolean;
  hf_token?: string;
  cpu_offload_gb?: number;
  enable_prefix_caching?: boolean;
  prefix_caching_hash_algo?: string;
  enable_chunked_prefill?: boolean;
  max_num_seqs?: number;
  cuda_graph_sizes?: string;
  pipeline_parallel_size?: number;
  device?: 'cuda' | 'cpu';
  tokenizer?: string;
  hf_config_path?: string;
  engine_type?: 'vllm' | 'llamacpp';
  // Engine metadata for reproducibility (Plane D)
  engine_image?: string;
  engine_version?: string;
  engine_digest?: string;
  ngl?: number;
  tensor_split?: string;
  batch_size?: number;
  ubatch_size?: number;
  threads?: number;
  context_size?: number;
  parallel_slots?: number;
  rope_freq_base?: number;
  rope_freq_scale?: number;
  flash_attention?: boolean;
  mlock?: boolean;
  no_mmap?: boolean;
  numa_policy?: string;
  split_mode?: string;
  cache_type_k?: string;
  cache_type_v?: string;
  // vLLM advanced engine args (Gap #4)
  attention_backend?: string;
  disable_log_requests?: boolean;
  disable_log_stats?: boolean;
  vllm_v1_enabled?: boolean;
  // Version-aware entrypoint (Gap #5)
  entrypoint_override?: string;
  // Debug logging configuration (Gap #11)
  debug_logging?: boolean;
  trace_mode?: boolean;
  // Request timeout configuration (Gap #13)
  engine_request_timeout?: number;
  max_log_len?: number;
  // Repetition control parameters
  repetition_penalty?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  temperature?: number;
  top_k?: number;
  top_p?: number;
  // Custom request extensions (Plane C - advanced)
  custom_request_json?: string;
  // Custom startup args (Plane B - Phase 2)
  engine_startup_args_json?: string;  // Changed from customArgs
  engine_startup_env_json?: string;   // Changed from customEnv
};

export function ModelForm({ onSubmit, onCancel, defaults, fetchBaseDir, saveBaseDir, listLocalFolders, submitLabel, modeLocked = false, onValuesChange }: {
  onSubmit: (v: ModelFormValues) => void;
  onCancel: () => void;
  defaults?: Partial<ModelFormValues>;
  fetchBaseDir?: () => Promise<string>;
  saveBaseDir?: (dir: string) => Promise<void>;
  listLocalFolders?: (base: string) => Promise<string[]>;
  submitLabel?: string;
  modeLocked?: boolean;
  onValuesChange?: (v: ModelFormValues) => void;
}) {
  const [values, setValues] = React.useState<ModelFormValues>({
    mode: defaults?.mode || 'online',
    repo_id: defaults?.repo_id || '',
    local_path: defaults?.local_path || '',
    name: defaults?.name || '',
    served_model_name: defaults?.served_model_name || '',
    task: (defaults?.task as any) || 'generate',
    dtype: defaults?.dtype || 'auto',
    tp_size: defaults?.tp_size ?? 1,
    selected_gpus: defaults?.selected_gpus ?? [0],
    gpu_memory_utilization: defaults?.gpu_memory_utilization ?? 0.9,
    max_model_len: defaults?.max_model_len ?? 8192,
    max_num_batched_tokens: defaults?.max_num_batched_tokens ?? 2048,
    kv_cache_dtype: defaults?.kv_cache_dtype || '',
    quantization: defaults?.quantization || '',
    block_size: defaults?.block_size ?? undefined,
    swap_space_gb: defaults?.swap_space_gb ?? undefined,
    enforce_eager: defaults?.enforce_eager ?? true,
    trust_remote_code: defaults?.trust_remote_code ?? false,
    hf_offline: defaults?.hf_offline ?? false,
    hf_token: defaults?.hf_token || '',
    cpu_offload_gb: defaults?.cpu_offload_gb ?? 0,
    enable_prefix_caching: defaults?.enable_prefix_caching ?? undefined,
    prefix_caching_hash_algo: defaults?.prefix_caching_hash_algo ?? '',
    enable_chunked_prefill: defaults?.enable_chunked_prefill ?? undefined,
    max_num_seqs: defaults?.max_num_seqs ?? undefined,
    cuda_graph_sizes: defaults?.cuda_graph_sizes ?? '',
    pipeline_parallel_size: defaults?.pipeline_parallel_size ?? undefined,
    device: defaults?.device ?? 'cuda',
    tokenizer: defaults?.tokenizer || '',
    hf_config_path: defaults?.hf_config_path || '',
    engine_type: defaults?.engine_type || 'vllm',
    ngl: defaults?.ngl ?? 999,
    tensor_split: defaults?.tensor_split ?? '0.25,0.25,0.25,0.25',
    batch_size: defaults?.batch_size ?? 2048,
    ubatch_size: defaults?.ubatch_size ?? 2048,
    threads: defaults?.threads ?? 32,
    context_size: defaults?.context_size ?? 16384,
    parallel_slots: defaults?.parallel_slots ?? 16,
    rope_freq_base: defaults?.rope_freq_base ?? undefined,
    rope_freq_scale: defaults?.rope_freq_scale ?? undefined,
    flash_attention: defaults?.flash_attention ?? true,
    mlock: defaults?.mlock ?? true,
    no_mmap: defaults?.no_mmap ?? false,
    numa_policy: defaults?.numa_policy ?? 'isolate',
    split_mode: defaults?.split_mode ?? undefined,
    cache_type_k: defaults?.cache_type_k ?? 'q8_0',
    cache_type_v: defaults?.cache_type_v ?? 'q8_0',
    repetition_penalty: defaults?.repetition_penalty ?? 1.2,
    frequency_penalty: defaults?.frequency_penalty ?? 0.5,
    presence_penalty: defaults?.presence_penalty ?? 0.5,
    temperature: defaults?.temperature ?? 0.8,
    top_k: defaults?.top_k ?? 40,
    top_p: defaults?.top_p ?? 0.9,
    custom_request_json: defaults?.custom_request_json ?? '',
    engine_startup_args_json: defaults?.engine_startup_args_json || '[]',
    engine_startup_env_json: defaults?.engine_startup_env_json || '[]',
  });

  const set = (k: keyof ModelFormValues, v: any) => setValues(prev => { 
    const next = { ...prev, [k]: v } as ModelFormValues; 
    try { onValuesChange && onValuesChange(next); } catch {} 
    return next; 
  });

  const [baseDir, setBaseDir] = React.useState<string>('');
  const [folders, setFolders] = React.useState<string[]>([]);
  const [loadingFolders, setLoadingFolders] = React.useState<boolean>(false);
  const [savingBase, setSavingBase] = React.useState<boolean>(false);
  const [gpuCount, setGpuCount] = React.useState<number>(1);
  const [inspect, setInspect] = React.useState<any>(null);
  const [useGguf, setUseGguf] = React.useState<boolean>(false);
  const [selectedGguf, setSelectedGguf] = React.useState<string>('');
  const [selectedGgufGroup, setSelectedGgufGroup] = React.useState<string>('');
  const [useLocalTokenizer, setUseLocalTokenizer] = React.useState<boolean>(false);
  const [showGgufHelp, setShowGgufHelp] = React.useState<boolean>(false);
  const [showMergeHelp, setShowMergeHelp] = React.useState<boolean>(false);

  React.useEffect(() => {
    let stop = false;
    (async () => {
      if (fetchBaseDir) {
        try { const dir = await fetchBaseDir(); if (!stop) setBaseDir(dir || ''); } catch {}
      }
      // Discover GPU count
      try {
        const gpus: any[] = await apiFetch('/admin/system/gpus');
        if (!stop && Array.isArray(gpus) && gpus.length > 0) setGpuCount(gpus.length);
      } catch {}
    })();
    return () => { stop = true; };
  }, [fetchBaseDir]);

  React.useEffect(() => { 
    try { onValuesChange && onValuesChange(values); } catch {} 
  }, []);

  const refreshFolders = React.useCallback(async () => {
    if (!listLocalFolders || !baseDir) { setFolders([]); return; }
    setLoadingFolders(true);
    try { const items = await listLocalFolders(baseDir); setFolders(items || []); } 
    catch { setFolders([]); }
    finally { setLoadingFolders(false); }
  }, [listLocalFolders, baseDir]);

  const runInspect = React.useCallback(async (folder: string) => {
    setInspect(null);
    setUseGguf(false);
    setSelectedGguf('');
    setSelectedGgufGroup('');
    try {
      const q = new URLSearchParams({ base: baseDir, folder });
      const res: any = await apiFetch(`/admin/models/inspect-folder?${q.toString()}`);
      setInspect(res || null);
      
      const hasGgufFiles = (Array.isArray(res.gguf_files) && res.gguf_files.length > 0);
      const hasGgufGroups = (Array.isArray(res.gguf_groups) && res.gguf_groups.length > 0);
      
      if (res && !res.has_safetensors && (hasGgufFiles || hasGgufGroups)) {
        setUseGguf(true);
        if (hasGgufFiles && res.gguf_files.length === 1) setSelectedGguf(res.gguf_files[0]);
      }
      
      if (res && res.gguf_groups && res.gguf_groups.length > 0) {
        const recommended = res.gguf_groups.find((g: any) => g.is_recommended);
        if (recommended) {
          setSelectedGgufGroup(recommended.quant_type);
          if (!recommended.is_multipart && recommended.files.length === 1) {
            setSelectedGguf(recommended.files[0]);
          }
        }
      }
    } catch {}
  }, [baseDir]);

  React.useEffect(() => {
    if (values.mode === 'offline' && baseDir) {
      refreshFolders();
    }
  }, [values.mode, baseDir, refreshFolders]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Frontend validation
    if (values.engine_type === 'llamacpp') {
      if (values.mode === 'online') {
        alert('llama.cpp requires Offline mode. Please select a local GGUF file.');
        return;
      }
      if (!values.local_path) {
        alert('llama.cpp requires a local file path. Please select a GGUF file from your models directory.');
        return;
      }
    }
    
    if (values.engine_type === 'vllm') {
      if (values.mode === 'online' && !values.repo_id) {
        alert('Online mode requires a HuggingFace repository ID (e.g., meta-llama/Llama-3-8B-Instruct)');
        return;
      }
      if (values.mode === 'offline' && !values.local_path) {
        alert('Offline mode requires a local path. Please select a model folder.');
        return;
      }
    }
    
    if (!values.name || !values.served_model_name) {
      alert('Model name and served model name are required.');
      return;
    }
    
    // GGUF handling
    const usingGguf = !!inspect && (useGguf || (!inspect.has_safetensors && (inspect.gguf_files||[]).length>0));
    const next = { ...values } as ModelFormValues;
    
    if (usingGguf) {
      if (!useLocalTokenizer && !next.tokenizer) { 
        alert('Tokenizer (HF repo id) is required for GGUF unless you choose to use the local tokenizer.json'); 
        return; 
      }
      
      if (!useLocalTokenizer && next.tokenizer) {
        const tokenizerPattern = /^[\w\-\.]+\/[\w\-\.]+$/;
        if (!tokenizerPattern.test(next.tokenizer)) {
          alert('Invalid tokenizer format. Must be: owner/repo-name\n\nExample: meta-llama/Llama-3-8B-Instruct');
          return;
        }
      }
      
      const hasConfig = !!(inspect?.config_files || []).find((n: string) => 
        n.toLowerCase() === 'config.json' || n.toLowerCase() === 'params.json'
      );
      if (useLocalTokenizer && !hasConfig) {
        alert('Local tokenizer selected, but no config.json/params.json found in the folder. Either add a compatible config file or switch to providing an HF repo id.');
        return;
      }
      if (useLocalTokenizer && !(inspect?.tokenizer_files || []).length) {
        alert('Local tokenizer selected, but no tokenizer.json/tokenizer.model found in the folder. Add a tokenizer file or switch to providing an HF repo id.');
        return;
      }
      
      // Handle grouped or legacy GGUF selection
      let gg = '';
      if (selectedGgufGroup && inspect?.gguf_groups) {
        const group = inspect.gguf_groups.find((g: any) => g.quant_type === selectedGgufGroup);
        if (group) {
          if (group.status === 'incomplete') {
            alert(`Cannot use ${group.display_name}: Incomplete file set`);
            return;
          }
          if (group.status === 'merged_available') {
            alert('Please select the merged version instead of the multi-part files');
            return;
          }
          gg = group.files[0] || '';
        }
      }
      
      if (!gg) {
        gg = selectedGguf || (inspect?.gguf_files?.[0] || '');
      }
      
      if (!gg) { alert('Select a GGUF file'); return; }
      next.local_path = `${next.local_path}/${gg}`;
      
      if (!next.hf_config_path && baseDir && next.local_path) {
        next.hf_config_path = `/models/${(values.local_path || '')}`;
      }
      if (useLocalTokenizer) next.tokenizer = '';
    }
    
    onSubmit(next);
  };

  const handleFolderSelect = (folder: string) => {
    set('local_path', folder);
    if (!values.name) set('name', folder);
    const derived = (values.name || folder || '').toLowerCase().replace(/[^a-z0-9\-\_\s]/g, '').replace(/\s+/g, '-');
    if (!values.served_model_name) set('served_model_name', derived);
    if (folder) runInspect(folder);
  };

  const handleSaveBaseDir = async () => {
    if (!saveBaseDir) return;
    setSavingBase(true);
    try { 
      await saveBaseDir(baseDir); 
      await refreshFolders(); 
    } finally { 
      setSavingBase(false);
    }
  };

  const handleGgufGroupSelect = (quantType: string, firstFile: string) => {
    setSelectedGgufGroup(quantType);
    setSelectedGguf(firstFile);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* STEP 1: Engine Selection */}
        <EngineSelection
          engineType={values.engine_type}
          onChange={(engine) => set('engine_type', engine)}
          mode={values.mode}
          onModeChange={(mode) => set('mode', mode)}
          modeLocked={modeLocked}
        />

        {/* Engine Metadata (Advanced) */}
        {values.engine_type && (
          <details className="md:col-span-2">
            <summary className="cursor-pointer text-sm text-white/70 hover:text-white">
              ⚙️ Advanced: Engine Image/Version (for reproducibility)
            </summary>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2 p-3 bg-white/5 rounded border border-white/10">
              <label className="text-sm">
                Engine Image
                <input
                  className="input mt-1"
                  type="text"
                  placeholder={values.engine_type === 'vllm' ? 'e.g., vllm/vllm-openai:latest (Qwen3 requires newer Transformers)' : 'e.g., ghcr.io/ggerganov/llama.cpp:server'}
                  value={values.engine_image || ''}
                  onChange={(e) => set('engine_image', e.target.value)}
                />
                <p className="text-[11px] text-white/50 mt-1">
                  Leave blank to use system default. Pin specific version for reproducibility.
                </p>
              </label>
              <label className="text-sm">
                Engine Version
                <input
                  className="input mt-1"
                  type="text"
                  placeholder="e.g., v0.6.3"
                  value={values.engine_version || ''}
                  onChange={(e) => set('engine_version', e.target.value)}
                />
                <p className="text-[11px] text-white/50 mt-1">
                  Optional: For tracking/reference only.
                </p>
              </label>
            </div>
          </details>
        )}

        {/* Disable rest of form until engine selected */}
        {!values.engine_type && !modeLocked && (
          <div className="md:col-span-2 p-6 text-center text-white/60 bg-white/5 rounded border border-white/10">
            ⬆️ Please select an inference engine above to continue
          </div>
        )}

        {/* STEP 2: Mode Selection */}
        <ModeSelection
          mode={values.mode}
          onChange={(mode) => set('mode', mode)}
          engineType={values.engine_type}
          modeLocked={modeLocked}
        />

        {/* Mode-specific fields */}
        {!modeLocked && values.mode === 'online' && (
          <OnlineModeFields
            repoId={values.repo_id || ''}
            hfToken={values.hf_token || ''}
            onRepoIdChange={(v) => set('repo_id', v)}
            onHfTokenChange={(v) => set('hf_token', v)}
            modeLocked={modeLocked}
          />
        )}

        {!modeLocked && values.mode === 'offline' && (
          <OfflineModeFields
            baseDir={baseDir}
            folders={folders}
            localPath={values.local_path || ''}
            tokenizer={values.tokenizer || ''}
            hfConfigPath={values.hf_config_path || ''}
            loadingFolders={loadingFolders}
            savingBase={savingBase}
            inspect={inspect}
            useGguf={useGguf}
            selectedGguf={selectedGguf}
            selectedGgufGroup={selectedGgufGroup}
            useLocalTokenizer={useLocalTokenizer}
            showGgufHelp={showGgufHelp}
            modeLocked={modeLocked}
            onBaseDirChange={setBaseDir}
            onFolderSelect={handleFolderSelect}
            onRefreshFolders={refreshFolders}
            onSaveBaseDir={saveBaseDir ? handleSaveBaseDir : undefined}
            onUseGgufChange={setUseGguf}
            onSelectedGgufChange={setSelectedGguf}
            onSelectedGgufGroupChange={handleGgufGroupSelect}
            onUseLocalTokenizerChange={setUseLocalTokenizer}
            onShowGgufHelpToggle={() => setShowGgufHelp(v => !v)}
            onShowMergeHelp={() => setShowMergeHelp(true)}
            onTokenizerChange={(v) => set('tokenizer', v)}
            onHfConfigPathChange={(v) => set('hf_config_path', v)}
          />
        )}

        {/* Basic Model Info */}
        <BasicModelInfo
          name={values.name}
          servedModelName={values.served_model_name}
          task={values.task}
          engineType={values.engine_type}
          onNameChange={(v) => set('name', v)}
          onServedModelNameChange={(v) => set('served_model_name', v)}
          onTaskChange={(v) => set('task', v)}
          modeLocked={modeLocked}
        />

        {/* Engine-specific configuration */}
        <VLLMConfiguration
          values={values}
          gpuCount={gpuCount}
          onChange={set}
        />

        <LlamaCppConfiguration
          values={values}
          onChange={set}
        />

        {/* Request Defaults (Plane C) - Applied by gateway at request time */}
        <RequestDefaultsSection
          values={values}
          onChange={set}
        />

        {/* Custom Startup Config (Plane B) - Applied at container startup */}
        {values.engine_type && (
          <CustomArgsEditor
            args={JSON.parse(values.engine_startup_args_json || '[]')}
            envVars={JSON.parse(values.engine_startup_env_json || '[]')}
            onArgsChange={(args) => set('engine_startup_args_json', JSON.stringify(args))}
            onEnvVarsChange={(env) => set('engine_startup_env_json', JSON.stringify(env))}
            engineType={values.engine_type}
          />
        )}

        {/* Submit buttons */}
        <div className="md:col-span-2 flex items-center justify-end gap-2 mt-2">
          <Button type="button" onClick={onCancel}>Cancel</Button>
          {submitLabel ? (<PrimaryButton type="submit">{submitLabel}</PrimaryButton>) : null}
        </div>
      </form>
      
      <MergeInstructionsModal
        open={showMergeHelp}
        onClose={() => setShowMergeHelp(false)}
      />
    </>
  );
}
