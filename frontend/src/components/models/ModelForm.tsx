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
import { MergeInstructionsModal } from './modelForm/MergeInstructionsModal';

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
  hfToken?: string;
  cpuOffloadGb?: number;
  enablePrefixCaching?: boolean;
  prefixCachingHashAlgo?: string;
  enableChunkedPrefill?: boolean;
  maxNumSeqs?: number;
  cudaGraphSizes?: string;
  pipelineParallelSize?: number;
  device?: 'cuda' | 'cpu';
  tokenizer?: string;
  hfConfigPath?: string;
  engineType?: 'vllm' | 'llamacpp';
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
  modeLocked?: boolean;
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
    engineType: (defaults as any)?.engineType || defaults?.engineType || 'vllm',
    ngl: (defaults as any)?.ngl ?? 999,
    tensorSplit: (defaults as any)?.tensorSplit ?? '0.25,0.25,0.25,0.25',
    batchSize: (defaults as any)?.batchSize ?? 512,
    threads: (defaults as any)?.threads ?? 32,
    contextSize: (defaults as any)?.contextSize ?? 8192,
    ropeFreqBase: (defaults as any)?.ropeFreqBase ?? undefined,
    ropeFreqScale: (defaults as any)?.ropeFreqScale ?? undefined,
    flashAttention: (defaults as any)?.flashAttention ?? true,
    mlock: (defaults as any)?.mlock ?? true,
    noMmap: (defaults as any)?.noMmap ?? true,
    numaPolicy: (defaults as any)?.numaPolicy ?? 'isolate',
    splitMode: (defaults as any)?.splitMode ?? undefined,
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
    if (values.engineType === 'llamacpp') {
      if (values.mode === 'online') {
        alert('llama.cpp requires Offline mode. Please select a local GGUF file.');
        return;
      }
      if (!values.localPath) {
        alert('llama.cpp requires a local file path. Please select a GGUF file from your models directory.');
        return;
      }
    }
    
    if (values.engineType === 'vllm') {
      if (values.mode === 'online' && !values.repoId) {
        alert('Online mode requires a HuggingFace repository ID (e.g., meta-llama/Llama-3-8B-Instruct)');
        return;
      }
      if (values.mode === 'offline' && !values.localPath) {
        alert('Offline mode requires a local path. Please select a model folder.');
        return;
      }
    }
    
    if (!values.name || !values.servedModelName) {
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
      next.localPath = `${next.localPath}/${gg}`;
      
      if (!next.hfConfigPath && baseDir && next.localPath) {
        next.hfConfigPath = `/models/${(values.localPath || '')}`;
      }
      if (useLocalTokenizer) next.tokenizer = '';
    }
    
    onSubmit(next);
  };

  const handleFolderSelect = (folder: string) => {
    set('localPath', folder);
    if (!values.name) set('name', folder);
    const derived = (values.name || folder || '').toLowerCase().replace(/[^a-z0-9\-\_\s]/g, '').replace(/\s+/g, '-');
    if (!values.servedModelName) set('servedModelName', derived);
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
          engineType={values.engineType}
          onChange={(engine) => set('engineType', engine)}
          mode={values.mode}
          onModeChange={(mode) => set('mode', mode)}
          modeLocked={modeLocked}
        />

        {/* Disable rest of form until engine selected */}
        {!values.engineType && !modeLocked && (
          <div className="md:col-span-2 p-6 text-center text-white/60 bg-white/5 rounded border border-white/10">
            ⬆️ Please select an inference engine above to continue
          </div>
        )}

        {/* STEP 2: Mode Selection */}
        <ModeSelection
          mode={values.mode}
          onChange={(mode) => set('mode', mode)}
          engineType={values.engineType}
          modeLocked={modeLocked}
        />

        {/* Mode-specific fields */}
        {!modeLocked && values.mode === 'online' && (
          <OnlineModeFields
            repoId={values.repoId || ''}
            hfToken={values.hfToken || ''}
            onRepoIdChange={(v) => set('repoId', v)}
            onHfTokenChange={(v) => set('hfToken', v)}
            modeLocked={modeLocked}
          />
        )}

        {!modeLocked && values.mode === 'offline' && (
          <OfflineModeFields
            baseDir={baseDir}
            folders={folders}
            localPath={values.localPath || ''}
            tokenizer={values.tokenizer || ''}
            hfConfigPath={values.hfConfigPath || ''}
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
            onHfConfigPathChange={(v) => set('hfConfigPath', v)}
          />
        )}

        {/* Basic Model Info */}
        <BasicModelInfo
          name={values.name}
          servedModelName={values.servedModelName}
          task={values.task}
          engineType={values.engineType}
          onNameChange={(v) => set('name', v)}
          onServedModelNameChange={(v) => set('servedModelName', v)}
          onTaskChange={(v) => set('task', v)}
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