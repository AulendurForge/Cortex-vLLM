'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '../../lib/cn';
import { Button, PrimaryButton } from '../UI';
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
import { ModelFormValues } from './ModelForm';
import apiFetch from '../../lib/api-clients';
import { useMutation, useQueryClient } from '@tanstack/react-query';

type StepType = 'engine' | 'model' | 'core' | 'startup' | 'request' | 'summary';

interface StepConfig {
  type: StepType;
  title: string;
  color: string;
  gemColor: string;
}

const ADD_STEPS: StepConfig[] = [
  { type: 'engine', title: 'Engine & Mode', color: 'blue', gemColor: '#3b82f6' },
  { type: 'model', title: 'Model Selection', color: 'emerald', gemColor: '#10b981' },
  { type: 'core', title: 'Core Settings', color: 'amber', gemColor: '#f59e0b' },
  { type: 'startup', title: 'Startup Config', color: 'red', gemColor: '#ef4444' },
  { type: 'request', title: 'Request Defaults', color: 'purple', gemColor: '#a855f7' },
  { type: 'summary', title: 'Summary & Launch', color: 'cyan', gemColor: '#06b6d4' },
];

const CONFIG_STEPS: StepConfig[] = [
  { type: 'core', title: 'Core Settings', color: 'amber', gemColor: '#f59e0b' },
  { type: 'startup', title: 'Startup Config', color: 'red', gemColor: '#ef4444' },
  { type: 'request', title: 'Request Defaults', color: 'purple', gemColor: '#a855f7' },
  { type: 'summary', title: 'Summary & Launch', color: 'cyan', gemColor: '#06b6d4' },
];

/**
 * Helper to hex-to-rgba for gemstone backgrounds
 */
function getGemBg(hex: string, active: boolean, disabled: boolean) {
  if (disabled) return 'transparent';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${active ? 0.12 : 0.04})`;
}

export function ModelWorkflowForm({ 
  onSubmit, 
  onCancel, 
  defaults, 
  fetchBaseDir, 
  saveBaseDir, 
  listLocalFolders, 
  submitLabel, 
  modeLocked = false,
  modelId
}: {
  onSubmit: (v: ModelFormValues) => void;
  onCancel: () => void;
  defaults?: Partial<ModelFormValues>;
  fetchBaseDir?: () => Promise<string>;
  saveBaseDir?: (dir: string) => Promise<void>;
  listLocalFolders?: (base: string) => Promise<string[]>;
  submitLabel?: string;
  modeLocked?: boolean;
  modelId?: number;
}) {
  const queryClient = useQueryClient();
  const currentSteps = modeLocked ? CONFIG_STEPS : ADD_STEPS;
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  
  const [values, setValues] = useState<ModelFormValues>({
    mode: defaults?.mode || 'online',
    repoId: defaults?.repoId || '',
    localPath: defaults?.localPath || '',
    name: defaults?.name || '',
    servedModelName: defaults?.servedModelName || '',
    task: (defaults?.task as any) || 'generate',
    dtype: defaults?.dtype || 'auto',
    tpSize: defaults?.tpSize ?? 1,
    selectedGpus: defaults?.selectedGpus ?? [0],
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
    tensorSplit: (defaults as any)?.tensorSplit ?? '',
    batchSize: (defaults as any)?.batchSize ?? 2048,
    ubatchSize: (defaults as any)?.ubatchSize ?? 2048,
    threads: (defaults as any)?.threads ?? 32,
    contextSize: (defaults as any)?.contextSize ?? 16384,
    parallelSlots: (defaults as any)?.parallelSlots ?? 16,
    ropeFreqBase: (defaults as any)?.ropeFreqBase ?? undefined,
    ropeFreqScale: (defaults as any)?.ropeFreqScale ?? undefined,
    flashAttention: (defaults as any)?.flashAttention ?? true,
    mlock: (defaults as any)?.mlock ?? true,
    noMmap: (defaults as any)?.noMmap ?? false,
    numaPolicy: (defaults as any)?.numaPolicy ?? 'isolate',
    splitMode: (defaults as any)?.splitMode ?? undefined,
    cacheTypeK: (defaults as any)?.cacheTypeK ?? 'q8_0',
    cacheTypeV: (defaults as any)?.cacheTypeV ?? 'q8_0',
    repetitionPenalty: (defaults as any)?.repetitionPenalty ?? 1.2,
    frequencyPenalty: (defaults as any)?.frequencyPenalty ?? 0.5,
    presencePenalty: (defaults as any)?.presencePenalty ?? 0.5,
    temperature: (defaults as any)?.temperature ?? 0.8,
    topK: (defaults as any)?.topK ?? 40,
    topP: (defaults as any)?.topP ?? 0.9,
    customRequestJson: (defaults as any)?.customRequestJson ?? '',
    customArgs: (defaults as any)?.customArgs ?? [],
    customEnv: (defaults as any)?.customEnv ?? [],
  });

  const [baseDir, setBaseDir] = useState<string>('');
  const [folders, setFolders] = useState<string[]>([]);
  const [loadingFolders, setLoadingFolders] = useState<boolean>(false);
  const [savingBase, setSavingBase] = useState<boolean>(false);
  const [gpuCount, setGpuCount] = useState<number>(1);
  const [inspect, setInspect] = useState<any>(null);
  const [useGguf, setUseGguf] = useState<boolean>(false);
  const [selectedGguf, setSelectedGguf] = useState<string>('');
  const [selectedGgufGroup, setSelectedGgufGroup] = useState<string>('');
  const [useLocalTokenizer, setUseLocalTokenizer] = useState<boolean>(false);
  const [showGgufHelp, setShowGgufHelp] = useState<boolean>(false);
  const [showMergeHelp, setShowMergeHelp] = useState<boolean>(false);
  const [dryRunResult, setDryRunResult] = useState<any>(null);

  const dryRun = useMutation({
    mutationFn: async () => {
      if (!modelId) return null;
      return await apiFetch<any>(`/admin/models/${modelId}/dry-run`, { method: 'POST' });
    },
    onSuccess: (r) => { setDryRunResult(r); },
  });

  useEffect(() => {
    let stop = false;
    (async () => {
      if (fetchBaseDir) {
        try { const dir = await fetchBaseDir(); if (!stop) setBaseDir(dir || ''); } catch {}
      }
      try {
        const gpus: any[] = await apiFetch('/admin/system/gpus');
        if (!stop && Array.isArray(gpus) && gpus.length > 0) setGpuCount(gpus.length);
      } catch {}
    })();
    return () => { stop = true; };
  }, [fetchBaseDir]);

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
      if (res && !res.has_safetensors && ((res.gguf_files||[]).length > 0 || (res.gguf_groups||[]).length > 0)) {
        setUseGguf(true);
      }
      if (res && res.gguf_groups && res.gguf_groups.length > 0) {
        const recommended = res.gguf_groups.find((g: any) => g.is_recommended);
        if (recommended) {
          setSelectedGgufGroup(recommended.quant_type);
          setSelectedGguf(recommended.files[0] || '');
        }
      }
    } catch {}
  }, [baseDir]);

  useEffect(() => {
    if (values.mode === 'offline' && baseDir) refreshFolders();
  }, [values.mode, baseDir, refreshFolders]);

  const set = (k: keyof ModelFormValues, v: any) => setValues(prev => ({ ...prev, [k]: v }));

  const handleStepClick = (idx: number) => {
    if (idx <= activeStepIdx || canNavigateTo(idx)) {
      setActiveStepIdx(idx);
    }
  };

  const canNavigateTo = (idx: number) => {
    const step = currentSteps[idx];
    if (!step) return false;
    
    // For Add workflow
    if (!modeLocked) {
      if (step.type === 'model') return !!values.engineType;
      if (step.type === 'core') return !!values.engineType && (values.mode === 'online' ? !!values.repoId : !!values.localPath);
      if (step.type === 'startup') return !!values.name && !!values.servedModelName;
    }
    
    return true;
  };

  const handleFinalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = { ...values };
    if (useGguf && inspect) {
      let gg = selectedGguf;
      if (selectedGgufGroup) {
        const group = inspect.gguf_groups.find((g: any) => g.quant_type === selectedGgufGroup);
        if (group) gg = group.files[0] || '';
      }
      if (gg) next.localPath = `${next.localPath}/${gg}`;
      if (!next.hfConfigPath && baseDir) next.hfConfigPath = `/models/${values.localPath}`;
      if (useLocalTokenizer) next.tokenizer = '';
    }
    onSubmit(next);
  };

  return (
    <div className="flex h-full min-h-[600px]">
      <div className="flex flex-1 overflow-hidden h-full">
        {currentSteps.map((step, idx) => {
          const isActive = activeStepIdx === idx;
          const isPast = activeStepIdx > idx;
          const isDisabled = !canNavigateTo(idx);

          return (
            <div
              key={step.type}
              className={cn(
                "relative transition-all duration-500 ease-in-out border-r border-white/5 flex flex-col",
                isActive ? "flex-[10] opacity-100" : "flex-1 cursor-pointer hover:opacity-100",
                isDisabled ? "cursor-not-allowed opacity-40" : "opacity-80"
              )}
              style={{
                backgroundColor: getGemBg(step.gemColor, isActive, isDisabled),
                borderLeft: isActive ? `4px solid ${step.gemColor}` : 'none'
              }}
              onClick={() => !isDisabled && handleStepClick(idx)}
            >
              {/* Vertical Header for collapsed states */}
              {!isActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-2 h-full w-full pointer-events-none overflow-hidden">
                  <div className="rotate-180 flex flex-col items-center gap-6" style={{ writingMode: 'vertical-rl' }}>
                    <span className="text-sm font-black uppercase tracking-[0.2em] whitespace-nowrap" style={{ color: isDisabled ? 'rgba(255,255,255,0.3)' : step.gemColor }}>
                      Step 0{idx + 1}
                    </span>
                    <span className={cn(
                      "text-xl font-extrabold whitespace-nowrap drop-shadow-sm",
                      isDisabled ? "text-white/40" : "text-white"
                    )}>
                      {step.title}
                    </span>
                  </div>
                  {isPast && <div className="mt-6 text-emerald-400 font-bold text-xl">✓</div>}
                </div>
              )}

              {/* Active Content */}
              {isActive && (
                <div className="p-6 overflow-y-auto h-full space-y-6 flex flex-col">
                  <header className="shrink-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full border", `bg-${step.color}-500/20 border-${step.color}-500/40 text-${step.color}-200`)}>
                        STEP 0{idx + 1}
                      </span>
                      {isPast && <span className="text-emerald-400 text-xs">✓ COMPLETED</span>}
                    </div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">{step.title}</h2>
                  </header>

                  <div className="flex-1 space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    {step.type === 'engine' && (
                      <div className="space-y-8">
                        <EngineSelection 
                          engineType={values.engineType} 
                          onChange={(e) => set('engineType', e)} 
                          mode={values.mode} 
                          onModeChange={(m) => set('mode', m)} 
                          modeLocked={modeLocked} 
                        />
                        <ModeSelection 
                          mode={values.mode} 
                          onChange={(m) => set('mode', m)} 
                          engineType={values.engineType} 
                          modeLocked={modeLocked} 
                        />
                      </div>
                    )}

                    {step.type === 'model' && (
                      <div className="space-y-4">
                        {values.mode === 'online' ? (
                          <OnlineModeFields 
                            repoId={values.repoId || ''} 
                            hfToken={values.hfToken || ''} 
                            onRepoIdChange={(v) => set('repoId', v)} 
                            onHfTokenChange={(v) => set('hfToken', v)} 
                            modeLocked={modeLocked} 
                          />
                        ) : (
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
                            onFolderSelect={(f) => { set('localPath', f); runInspect(f); if(!values.name) set('name', f); }}
                            onRefreshFolders={refreshFolders}
                            onSaveBaseDir={saveBaseDir ? async () => { setSavingBase(true); await saveBaseDir(baseDir); await refreshFolders(); setSavingBase(false); } : undefined}
                            onUseGgufChange={setUseGguf}
                            onSelectedGgufChange={setSelectedGguf}
                            onSelectedGgufGroupChange={(q, f) => { setSelectedGgufGroup(q); setSelectedGguf(f); }}
                            onUseLocalTokenizerChange={setUseLocalTokenizer}
                            onShowGgufHelpToggle={() => setShowGgufHelp(!showGgufHelp)}
                            onShowMergeHelp={() => setShowMergeHelp(true)}
                            onTokenizerChange={(v) => set('tokenizer', v)}
                            onHfConfigPathChange={(v) => set('hfConfigPath', v)}
                          />
                        )}
                      </div>
                    )}

                    {step.type === 'core' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                        <BasicModelInfo
                          name={values.name}
                          servedModelName={values.servedModelName}
                          task={values.task}
                          engineType={values.engineType}
                          onNameChange={(v) => set('name', v)}
                          onServedModelNameChange={(v) => set('servedModelName', v)}
                          onTaskChange={(v) => set('task', v)}
                          modeLocked={modeLocked}
                        />
                        <div className="md:col-span-2 space-y-4 mt-4 border-t border-white/5 pt-4">
                          {values.engineType === 'vllm' ? (
                            <VLLMConfiguration values={values} gpuCount={gpuCount} onChange={set} />
                          ) : (
                            <LlamaCppConfiguration values={values} onChange={set} />
                          )}
                        </div>
                      </div>
                    )}

                    {step.type === 'startup' && (
                      <div className="space-y-4 h-full">
                        <CustomArgsEditor
                          args={values.customArgs || []}
                          envVars={values.customEnv || []}
                          onArgsChange={(a) => set('customArgs', a)}
                          onEnvVarsChange={(e) => set('customEnv', e)}
                          engineType={values.engineType || 'vllm'}
                        />
                      </div>
                    )}

                    {step.type === 'request' && (
                      <div className="space-y-4 h-full">
                        <RequestDefaultsSection values={values} onChange={set} />
                      </div>
                    )}

                    {step.type === 'summary' && (
                      <div className="space-y-6 flex flex-col h-full">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                            <h3 className="text-xs font-bold text-white/40 uppercase mb-3">Identity</h3>
                            <div className="space-y-1">
                              <div className="text-sm font-semibold">{values.name}</div>
                              <div className="text-xs font-mono text-emerald-400">{values.servedModelName}</div>
                              <div className="text-xs text-white/60 uppercase">{values.task} · {values.engineType}</div>
                            </div>
                          </div>
                          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                            <h3 className="text-xs font-bold text-white/40 uppercase mb-3">Compute</h3>
                            <div className="space-y-1 text-sm">
                              <div>{values.tpSize || 1} GPU(s) {values.dtype && `· ${values.dtype}`}</div>
                              {values.engineType === 'vllm' ? (
                                <div className="text-xs text-white/60">{values.maxModelLen} tokens · {values.gpuMemoryUtilization} util</div>
                              ) : (
                                <div className="text-xs text-white/60">{values.contextSize} context · {values.parallelSlots} slots</div>
                              )}
                            </div>
                          </div>
                        </div>

                        {dryRunResult && (
                          <div className="flex-1 overflow-auto p-4 bg-black/40 rounded-lg border border-white/10 space-y-3">
                            <h3 className="text-xs font-bold text-white/40 uppercase">Dry Run Validation</h3>
                            {dryRunResult.warnings?.map((w: any, i: number) => (
                              <div key={i} className={cn("text-xs p-2 rounded border", w.severity === 'error' ? "bg-red-500/10 border-red-500/30 text-red-200" : "bg-amber-500/10 border-amber-500/30 text-amber-200")}>
                                <strong>{w.title}:</strong> {w.message}
                              </div>
                            ))}
                            {dryRunResult.vram_estimate && (
                              <div className="text-xs text-cyan-300 font-mono">
                                Required VRAM: {dryRunResult.vram_estimate.required_vram_gb} GB
                              </div>
                            )}
                            <pre className="text-[10px] text-white/40 overflow-x-auto pt-2 border-t border-white/5">
                              {dryRunResult.command_str}
                            </pre>
                          </div>
                        )}

                        <div className="mt-auto flex items-center justify-between gap-4 border-t border-white/10 pt-6">
                          <Button 
                            type="button"
                            onClick={(e) => { e.stopPropagation(); dryRun.mutate(); }} 
                            disabled={dryRun.isPending || !modelId}
                            className="bg-cyan-500/10 border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/20"
                          >
                            {dryRun.isPending ? 'Validating...' : '🔍 Dry Run'}
                          </Button>
                          <div className="flex gap-3">
                            <Button type="button" onClick={(e) => { e.stopPropagation(); onCancel(); }}>Cancel</Button>
                            <PrimaryButton 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleFinalSubmit(e);
                              }}
                            >
                              {submitLabel || 'Launch Model'}
                            </PrimaryButton>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {idx < currentSteps.length - 1 && (
                    <div className="mt-auto pt-6 border-t border-white/5 flex justify-end">
                      <PrimaryButton 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (canNavigateTo(idx + 1)) {
                            setActiveStepIdx(idx + 1);
                          } else {
                            // Provide feedback if they can't move forward
                            alert('Please complete the required fields in this step before proceeding.');
                          }
                        }}
                      >
                        Next: {currentSteps[idx + 1]?.title} →
                      </PrimaryButton>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <MergeInstructionsModal open={showMergeHelp} onClose={() => setShowMergeHelp(false)} />
    </div>
  );
}

