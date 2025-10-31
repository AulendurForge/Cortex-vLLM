'use client';

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiFetch from '../../../src/lib/api-clients';
import { ModelListSchema } from '../../../src/lib/validators';
import { Card, Table, Button, PrimaryButton, PageHeader, Badge } from '../../../src/components/UI';
import { Modal } from '../../../src/components/Modal';
import { ModelForm, ModelFormValues } from '../../../src/components/models/ModelForm';
import { LogsViewer } from '../../../src/components/models/LogsViewer';
import { ConfirmDialog } from '../../../src/components/Confirm';
import { ResourceCalculatorModal } from '../../../src/components/models/ResourceCalculatorModal';
import { TestResultsModal } from '../../../src/components/models/TestResultsModal';
import { SaveRecipeDialog } from '../../../src/components/models/SaveRecipeDialog';
import { MyRecipesModal } from '../../../src/components/models/MyRecipesModal';
import { useUser } from '../../../src/providers/UserProvider';
import { Tooltip } from '../../../src/components/Tooltip';
import { useToast } from '../../../src/providers/ToastProvider';

type ModelRow = (typeof ModelListSchema extends infer T ? unknown : never) | any;

export default function ModelsPage() {
  const qc = useQueryClient();
  const { user } = useUser();
  const { addToast } = useToast();
  const isAdmin = (user?.role === 'admin');
  const [open, setOpen] = React.useState(false);
  const [logsFor, setLogsFor] = React.useState<number | null>(null);
  const [archiveId, setArchiveId] = React.useState<number | null>(null);
  const [deleteId, setDeleteId] = React.useState<number | null>(null);
  const [configId, setConfigId] = React.useState<number | null>(null);
  const [dryCmd, setDryCmd] = React.useState<string>("");
  const [calcOpen, setCalcOpen] = React.useState<boolean>(false);
  const [prefill, setPrefill] = React.useState<Partial<ModelFormValues> | null>(null);
  const [testingId, setTestingId] = React.useState<number | null>(null);
  const [testResult, setTestResult] = React.useState<any>(null);
  const [saveRecipeOpen, setSaveRecipeOpen] = React.useState(false);
  const [saveRecipeModelId, setSaveRecipeModelId] = React.useState<number | null>(null);
  const [myRecipesOpen, setMyRecipesOpen] = React.useState(false);

  const list = useQuery({
    queryKey: ['models', isAdmin],
    queryFn: async () => {
      try {
        if (isAdmin) {
          const raw = await apiFetch<any>('/admin/models');
          return ModelListSchema.parse(raw);
        }
        const raw = await apiFetch<any>('/v1/models/status');
        const arr = Array.isArray(raw?.data) ? raw.data : [];
        // Map to minimal shape the table expects for read-only view
        return arr.map((r: any, idx: number) => ({
          id: idx + 1,
          name: r.name || r.served_model_name || '-',
          served_model_name: r.served_model_name || r.name || '-',
          task: r.task || 'generate',
          tp_size: undefined,
          dtype: undefined,
          state: r.state || 'down',
          archived: false,
        }));
      } catch {
        return [] as any[];
      }
    },
    staleTime: 5000,
  });

  const create = useMutation({
    mutationFn: async (payload: ModelFormValues) => {
      const body: any = {
        mode: payload.mode,
        repo_id: payload.repoId,
        local_path: payload.localPath,
        name: payload.name,
        served_model_name: payload.servedModelName,
        task: payload.task,
        dtype: payload.dtype,
        tp_size: payload.tpSize,
        selected_gpus: payload.selectedGpus,
        gpu_memory_utilization: payload.gpuMemoryUtilization,
        max_model_len: payload.maxModelLen,
        max_num_batched_tokens: payload.maxNumBatchedTokens,
        kv_cache_dtype: payload.kvCacheDtype,
        quantization: payload.quantization,
        block_size: payload.blockSize,
        swap_space_gb: payload.swapSpaceGb,
        enforce_eager: payload.enforceEager,
        trust_remote_code: payload.trustRemoteCode,
        hf_offline: payload.hfOffline,
        hf_token: payload.hfToken,
            tokenizer: payload.tokenizer,
            hf_config_path: payload.hfConfigPath,
            cpu_offload_gb: payload.cpuOffloadGb,
            enable_prefix_caching: payload.enablePrefixCaching,
            prefix_caching_hash_algo: payload.prefixCachingHashAlgo,
            enable_chunked_prefill: payload.enableChunkedPrefill,
            max_num_seqs: payload.maxNumSeqs,
            cuda_graph_sizes: payload.cudaGraphSizes,
            pipeline_parallel_size: payload.pipelineParallelSize,
            device: payload.device,
            // Engine and llama.cpp fields
            engine_type: payload.engineType,
            ngl: payload.ngl,
            tensor_split: payload.tensorSplit,
            batch_size: payload.batchSize,
            ubatch_size: payload.ubatchSize,
            threads: payload.threads,
            context_size: payload.contextSize,
            parallel_slots: payload.parallelSlots,
            rope_freq_base: payload.ropeFreqBase,
            rope_freq_scale: payload.ropeFreqScale,
            flash_attention: payload.flashAttention,
            mlock: payload.mlock,
            no_mmap: payload.noMmap,
            numa_policy: payload.numaPolicy,
            split_mode: payload.splitMode,
            cache_type_k: payload.cacheTypeK,
            cache_type_v: payload.cacheTypeV,
            // Repetition control parameters
            repetition_penalty: payload.repetitionPenalty,
            frequency_penalty: payload.frequencyPenalty,
            presence_penalty: payload.presencePenalty,
            temperature: payload.temperature,
            top_k: payload.topK,
            top_p: payload.topP,
      };
      return await apiFetch('/admin/models', { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: (data) => { 
      qc.invalidateQueries({ queryKey: ['models'] }); 
      addToast({ 
        title: `Model created successfully!`, 
        kind: 'success' 
      });
      setOpen(false); 
    },
    onError: (error: any) => {
      addToast({
        title: `Failed to create model: ${error?.message || 'Unknown error'}`,
        kind: 'error'
      });
    }
  });

  const start = useMutation({
    mutationFn: async (id: number) => apiFetch(`/admin/models/${id}/start`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['models'] }),
  });
  const stop = useMutation({
    mutationFn: async (id: number) => apiFetch(`/admin/models/${id}/stop`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['models'] }),
  });
  const archive = useMutation({
    mutationFn: async (id: number) => apiFetch(`/admin/models/${id}/archive`, { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['models'] }); setArchiveId(null); },
  });
  const del = useMutation({
    mutationFn: async (id: number) => apiFetch(`/admin/models/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['models'] }); setDeleteId(null); },
  });
  const update = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: any }) => apiFetch(`/admin/models/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['models'] }); },
  });
  const apply = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: any }) => {
      await apiFetch(`/admin/models/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      return await apiFetch(`/admin/models/${id}/apply`, { method: 'POST' });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['models'] }); setConfigId(null); setDryCmd(""); },
  });
  const dryRun = useMutation({
    mutationFn: async (id: number) => apiFetch<{ command: string | string[]; engine?: string }>(`/admin/models/${id}/dry-run`, { method: 'POST' }),
    onSuccess: (r) => { 
      const cmd = Array.isArray((r as any).command) ? (r as any).command.join(' ') : (r as any).command || '';
      const engine = (r as any).engine || 'vllm';
      setDryCmd(`# ${engine} command:\n${cmd}`); 
    },
  });

  const testModel = useMutation({
    mutationFn: async (id: number) => {
      setTestingId(id);
      return await apiFetch(`/admin/models/${id}/test`, { method: 'POST' });
    },
    onSuccess: (data) => {
      setTestResult(data);
      if ((data as any).success) {
        addToast({ title: 'Model test passed! ✓', kind: 'success' });
      } else {
        addToast({ title: 'Model test failed', kind: 'error' });
      }
      setTestingId(null);
    },
    onError: (error: any) => {
      addToast({ title: `Test error: ${error?.message || 'Unknown error'}`, kind: 'error' });
      setTestingId(null);
    }
  });

  return (
    <section className="space-y-4">
      <PageHeader title="Models & Pools" actions={
        isAdmin ? (
          <div className="flex items-center gap-2">
            <Button onClick={()=>setCalcOpen(true)}>Resource calculator</Button>
            <Button onClick={()=>setMyRecipesOpen(true)}>My Recipes</Button>
            <PrimaryButton onClick={()=>setOpen(true)}>Add Model</PrimaryButton>
          </div>
        ) : undefined
      } />
      
      <Card className="p-4 bg-blue-500/10 border-blue-500/30">
        <div className="flex items-start gap-3">
          <div className="text-3xl">🔌</div>
          <div className="flex-1">
            <div className="font-medium text-blue-200 mb-1">Connect to Your Models</div>
            <div className="text-sm text-white/80 mb-2">
              Use the <strong>served model name</strong> from the table below in your API requests. 
              Copy the name and use it in your OpenAI-compatible client with endpoint <code className="bg-black/30 px-1.5 py-0.5 rounded">http://192.168.1.181:8084</code>
            </div>
            <a 
              href="/guide?tab=api-keys" 
              className="inline-flex items-center gap-1 text-sm text-blue-300 hover:text-blue-200 underline"
            >
              📖 View Complete API Connection Guide →
            </a>
          </div>
        </div>
      </Card>

      <Card className="p-2">
        <Table>
          <thead className="text-left">
            <tr>
              <th>Model Name</th>
              <th>Served on Network As:</th>
              <th>Task</th>
              <th>Engine</th>
              {isAdmin && (<><th># of Tensors/GPUs</th><th>DType</th></>)}
              <th>State</th>
              {isAdmin && (<th></th>)}
            </tr>
          </thead>
          <tbody>
            {(list.data || []).filter((m:any)=>!m.archived).map((m: any) => (
              <tr key={m.id} className="group">
                <td>{m.name}</td>
                <td className="font-mono text-xs">
                  <div className="flex items-center gap-1">
                    <span>{m.served_model_name}</span>
                    <button 
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(m.served_model_name);
                          addToast({ title: 'Model name copied!', kind: 'success' });
                        } catch {
                          addToast({ title: 'Copy failed', kind: 'error' });
                        }
                      }}
                      className="text-emerald-400 hover:text-emerald-300 transition-colors opacity-0 group-hover:opacity-100"
                      title="Copy model name for API calls"
                      aria-label="Copy model name"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </td>
                <td>{m.task}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <Badge className={
                      m.engine_type === 'llamacpp' ? 'bg-green-500/20 text-green-200 border border-green-400/30' :
                      'bg-blue-500/20 text-blue-200 border border-blue-400/30'
                    }>
                      {m.engine_type === 'llamacpp' ? 'llama.cpp' : 'vLLM'}
                    </Badge>
                    <Tooltip text={
                      m.engine_type === 'llamacpp' ? 
                        'llama.cpp - For GGUF quantized models and GPT-OSS 120B (Harmony architecture)' :
                        'vLLM - High-performance engine for HuggingFace Transformers models with PagedAttention'
                    } />
                  </div>
                </td>
                {isAdmin && (<td>{m.engine_type === 'llamacpp' && m.tensor_split ? 
                  (m.tensor_split.split(',').length) : 
                  (m.tp_size ?? '-')}</td>)}
                {isAdmin && (<td>{m.dtype ?? '-'}</td>)}
                <td>
                  <Badge className={
                    m.state === 'running' ? 'bg-green-500/20 text-green-200 border border-green-400/30' :
                    m.state === 'starting' ? 'bg-amber-500/20 text-amber-200 border border-amber-400/30' :
                    m.state === 'failed' ? 'bg-red-500/20 text-red-200 border border-red-400/30' : ''
                  }>{m.state}</Badge>
                </td>
                {isAdmin && (
                  <td className="text-right space-x-2">
                    <Button onClick={()=>setLogsFor(m.id)}>Logs</Button>
                    <Button 
                      onClick={()=>{
                        setSaveRecipeModelId(m.id);
                        setSaveRecipeOpen(true);
                      }}
                      className="bg-purple-500/20 border-purple-500/40 hover:bg-purple-500/30"
                      title="Save this model's configuration as a recipe"
                    >
                      📝 Save Recipe
                    </Button>
                    {m.state === 'running' && (
                      <Button 
                        onClick={()=>testModel.mutate(m.id)}
                        disabled={testingId === m.id}
                        className="bg-emerald-500/20 border-emerald-500/40 hover:bg-emerald-500/30"
                        title="Send test request to verify model is working"
                      >
                        {testingId === m.id ? '🧪 Testing...' : '🧪 Test'}
                      </Button>
                    )}
                    {m.state !== 'running' ? (
                      <Button 
                        onClick={()=>start.mutate(m.id)} 
                        disabled={start.isPending || m.state === 'starting'}
                        className={m.state === 'starting' ? 'opacity-75' : ''}
                      >
                        {start.isPending || m.state === 'starting' ? 'Starting...' : 'Start'}
                      </Button>
                    ) : (
                      <Button 
                        onClick={()=>stop.mutate(m.id)} 
                        disabled={stop.isPending}
                      >
                        {stop.isPending ? 'Stopping...' : 'Stop'}
                      </Button>
                    )}
                    <Button onClick={()=>{ setConfigId(m.id); setDryCmd(""); }}>Configure</Button>
                    <Button onClick={()=>setArchiveId(m.id)}>Archive</Button>
                  </td>
                )}
              </tr>
            ))}
            {(list.data || []).filter((m:any)=>!m.archived).length === 0 && (
              <tr><td colSpan={7} className="text-white/70 text-sm">No models yet.</td></tr>
            )}
          </tbody>
        </Table>
      </Card>

      {isAdmin && (list.data || []).filter((m:any)=>m.archived).length > 0 && (
      <Card className="p-2">
        <div className="text-white/60 text-sm mb-2">Archived ({(list.data || []).filter((m:any)=>m.archived).length})</div>
        <Table>
          <thead className="text-left">
            <tr>
              <th>Model Name</th><th>Served on the Network As:</th><th>Task</th><th># of Tensors/GPUs</th><th>DType</th><th>State</th><th></th>
            </tr>
          </thead>
          <tbody>
            {(list.data || []).filter((m:any)=>m.archived).map((m:any)=>(
              <tr key={m.id}>
                <td>{m.name}</td>
                <td className="font-mono text-xs">{m.served_model_name}</td>
                <td>{m.task}</td>
                <td>{m.engine_type === 'llamacpp' && m.tensor_split ? 
                  (m.tensor_split.split(',').length) : 
                  (m.tp_size ?? '-')}</td>
                <td>{m.dtype ?? '-'}</td>
                <td><Badge>{m.state}</Badge></td>
                <td className="text-right space-x-2">
                  <Button onClick={()=>setLogsFor(m.id)}>Logs</Button>
                  <Button 
                    onClick={()=>{
                      setSaveRecipeModelId(m.id);
                      setSaveRecipeOpen(true);
                    }}
                    className="bg-purple-500/20 border-purple-500/40 hover:bg-purple-500/30"
                    title="Save this model's configuration as a recipe"
                  >
                    📝 Save Recipe
                  </Button>
                  <Button onClick={()=>setDeleteId(m.id)} className="bg-red-600/30 border border-red-500/40">Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      )}

      {isAdmin && (
      <Modal open={open} onClose={()=>setOpen(false)} title="Add Model">
        <ModelForm
          onCancel={()=>setOpen(false)}
          onSubmit={(v)=>{
            // If user chose GGUF via UI inspect, they will have set localPath to folder.
            // We convert to file path when GGUF was selected (detected by presence of '.gguf' in localPath or tokenizer filled and selectedGguf handled in form before submit).
            create.mutate(v);
          }}
          submitLabel={create.isPending ? 'Creating…' : 'Create'}
          defaults={prefill ?? undefined}
          fetchBaseDir={async ()=> { try { const r:any = await apiFetch('/admin/models/base-dir'); return r?.base_dir || ''; } catch { return ''; } }}
          saveBaseDir={async (dir)=> { try { await apiFetch('/admin/models/base-dir', { method: 'PUT', body: JSON.stringify({ base_dir: dir }) }); } catch {} }}
          listLocalFolders={async (base)=> { try { const r:any = await apiFetch(`/admin/models/local-folders?base=${encodeURIComponent(base)}`); return Array.isArray(r) ? r : []; } catch { return []; } }}
        />
      </Modal>
      )}

      {isAdmin && (
      <ResourceCalculatorModal
        open={calcOpen}
        onClose={()=>setCalcOpen(false)}
        onApply={(r)=>{
          setCalcOpen(false);
          if (r && r.values) {
            const v = r.values;
            setPrefill((prev)=>({
              ...(prev || {}),
              tpSize: v.tpSize ?? (prev?.tpSize ?? 1),
              dtype: (v.dtype as any) ?? (prev?.dtype ?? 'auto'),
              quantization: (v.quantization as any) ?? (prev?.quantization ?? ''),
              kvCacheDtype: (v.kvCacheDtype as any) ?? (prev?.kvCacheDtype ?? ''),
              gpuMemoryUtilization: v.gpuMemoryUtilization ?? (prev?.gpuMemoryUtilization ?? 0.9),
              maxModelLen: v.maxModelLen ?? (prev?.maxModelLen ?? undefined),
              blockSize: v.blockSize ?? (prev?.blockSize ?? undefined),
              maxNumBatchedTokens: v.maxNumBatchedTokens ?? (prev?.maxNumBatchedTokens ?? undefined),
              cpuOffloadGb: v.cpuOffloadGb ?? (prev as any)?.cpuOffloadGb,
              swapSpaceGb: v.swapSpaceGb ?? (prev?.swapSpaceGb ?? undefined),
            } as any));
            setOpen(true);
          }
        }}
      />
      )}

      {isAdmin && (
      <Modal open={configId != null} onClose={()=>{ setConfigId(null); setDryCmd(""); }} title="Configure Model">
        {configId != null && (()=>{
          const m = (list.data || []).find((x:any)=>x.id===configId) || {};
          const defaults: ModelFormValues = {
            mode: (m.repo_id ? 'online' : 'offline') as any,
            repoId: (m as any).repo_id || '',
            localPath: (m as any).local_path || '',
            name: m.name || '',
            servedModelName: m.served_model_name || '',
            task: (m.task || 'generate'),
            dtype: m.dtype || 'auto',
            tpSize: m.tp_size ?? 1,
            selectedGpus: Array.isArray(m.selected_gpus) ? m.selected_gpus : [0],
            gpuMemoryUtilization: m.gpu_memory_utilization ?? 0.9,
            maxModelLen: m.max_model_len ?? 8192,
            maxNumBatchedTokens: m.max_num_batched_tokens ?? (m.max_model_len ?? 8192),
            kvCacheDtype: m.kv_cache_dtype || '',
            quantization: m.quantization || '',
            blockSize: m.block_size ?? undefined,
            swapSpaceGb: m.swap_space_gb ?? undefined,
            enforceEager: m.enforce_eager ?? true,
            trustRemoteCode: false,
            hfOffline: false,
            tokenizer: (m as any).tokenizer || '',
            hfConfigPath: (m as any).hf_config_path || '',
            engineType: (m as any).engine_type || 'vllm',
            ngl: (m as any).ngl ?? 999,
            tensorSplit: (m as any).tensor_split || '',
            batchSize: (m as any).batch_size ?? 2048,
            ubatchSize: (m as any).ubatch_size ?? 2048,
            threads: (m as any).threads ?? 32,
            contextSize: (m as any).context_size ?? 16384,
            parallelSlots: (m as any).parallel_slots ?? 16,
            ropeFreqBase: (m as any).rope_freq_base ?? undefined,
            ropeFreqScale: (m as any).rope_freq_scale ?? undefined,
            flashAttention: (m as any).flash_attention ?? true,
            mlock: (m as any).mlock ?? true,
            noMmap: (m as any).no_mmap ?? false,
            numaPolicy: (m as any).numa_policy || 'isolate',
            splitMode: (m as any).split_mode ?? undefined,
            cacheTypeK: (m as any).cache_type_k ?? 'q8_0',
            cacheTypeV: (m as any).cache_type_v ?? 'q8_0',
            // Repetition control parameters
            repetitionPenalty: (m as any).repetition_penalty ?? 1.2,
            frequencyPenalty: (m as any).frequency_penalty ?? 0.5,
            presencePenalty: (m as any).presence_penalty ?? 0.5,
            temperature: (m as any).temperature ?? 0.8,
            topK: (m as any).top_k ?? 40,
            topP: (m as any).top_p ?? 0.9,
          } as any;
          let draft: ModelFormValues | null = null;
          return (
            <div className="space-y-3">
              <div className="text-[12px] text-white/60">Source: {m.repo_id ? (<span>online • {m.repo_id}</span>) : (<span>offline • /models/{(m as any).local_path || ''}</span>)}</div>
              <div className="text-xs text-white/70">
                Changes to engine flags require a restart. "Save" stores changes only; "Apply" will stop and restart the container to pick up new flags.
              </div>
              <ModelForm
                defaults={defaults}
                modeLocked
                onValuesChange={(v)=>{ draft = v; }}
                onCancel={()=>{ setConfigId(null); setDryCmd(""); }}
                fetchBaseDir={async ()=> { try { const r:any = await apiFetch('/admin/models/base-dir'); return r?.base_dir || ''; } catch { return ''; } }}
                saveBaseDir={async (dir)=> { try { await apiFetch('/admin/models/base-dir', { method: 'PUT', body: JSON.stringify({ base_dir: dir }) }); } catch {} }}
                listLocalFolders={async (base)=> { try { const r:any = await apiFetch(`/admin/models/local-folders?base=${encodeURIComponent(base)}`); return Array.isArray(r) ? r : []; } catch { return []; } }}
                onSubmit={(v)=>{
                  const values = draft || v;
                  const body:any = {
                    name: values.name,
                    served_model_name: values.servedModelName,
                    task: values.task,
                    dtype: values.dtype,
                    tp_size: values.tpSize,
                    selected_gpus: values.selectedGpus,
                    gpu_memory_utilization: values.gpuMemoryUtilization,
                    max_model_len: values.maxModelLen,
                    max_num_batched_tokens: values.maxNumBatchedTokens,
                    kv_cache_dtype: values.kvCacheDtype,
                    quantization: values.quantization,
                    block_size: values.blockSize,
                    swap_space_gb: values.swapSpaceGb,
                    enforce_eager: values.enforceEager,
                    tokenizer: values.tokenizer,
                    hf_config_path: values.hfConfigPath,
                    hf_token: values.hfToken,
                    cpu_offload_gb: values.cpuOffloadGb,
                    enable_prefix_caching: values.enablePrefixCaching,
                    prefix_caching_hash_algo: values.prefixCachingHashAlgo,
                    enable_chunked_prefill: values.enableChunkedPrefill,
                    max_num_seqs: values.maxNumSeqs,
                    cuda_graph_sizes: values.cudaGraphSizes,
                    pipeline_parallel_size: values.pipelineParallelSize,
                    device: values.device,
                    // llama.cpp-specific fields
                    ngl: values.ngl,
                    tensor_split: values.tensorSplit,
                    batch_size: values.batchSize,
                    ubatch_size: values.ubatchSize,
                    threads: values.threads,
                    context_size: values.contextSize,
                    parallel_slots: values.parallelSlots,
                    rope_freq_base: values.ropeFreqBase,
                    rope_freq_scale: values.ropeFreqScale,
                    flash_attention: values.flashAttention,
                    mlock: values.mlock,
                    no_mmap: values.noMmap,
                    numa_policy: values.numaPolicy,
            split_mode: values.splitMode,
            cache_type_k: values.cacheTypeK,
            cache_type_v: values.cacheTypeV,
            // Repetition control parameters
            repetition_penalty: values.repetitionPenalty,
            frequency_penalty: values.frequencyPenalty,
            presence_penalty: values.presencePenalty,
            temperature: values.temperature,
            top_k: values.topK,
            top_p: values.topP,
                  };
                  apply.mutate({ id: configId, body });
                }}
                submitLabel={undefined}
              />
              <div className="flex items-center justify-between">
                <div className="text-xs text-white/60">
                  Immutable fields (mode, repo/local folder) are fixed after creation. Use Delete and re‑add to change them.
                </div>
                <div className="flex gap-2">
                  <Button onClick={()=>dryRun.mutate(configId)} disabled={dryRun.isPending}>Dry run</Button>
                  <PrimaryButton onClick={()=>{
                    // Fire with last draft values; ModelForm onSubmit also covers Enter key
                    if (draft) apply.mutate({ id: configId!, body: {
                      name: draft.name,
                      served_model_name: draft.servedModelName,
                      task: draft.task,
                      dtype: draft.dtype,
                      tp_size: draft.tpSize,
                      selected_gpus: draft.selectedGpus,
                      gpu_memory_utilization: draft.gpuMemoryUtilization,
                      max_model_len: draft.maxModelLen,
                      max_num_batched_tokens: draft.maxNumBatchedTokens,
                      kv_cache_dtype: draft.kvCacheDtype,
                      quantization: draft.quantization,
                      block_size: draft.blockSize,
                      swap_space_gb: draft.swapSpaceGb,
                      enforce_eager: draft.enforceEager,
                      tokenizer: draft.tokenizer,
                      hf_config_path: draft.hfConfigPath,
                      hf_token: draft.hfToken,
                      cpu_offload_gb: draft.cpuOffloadGb,
                      enable_prefix_caching: draft.enablePrefixCaching,
                      prefix_caching_hash_algo: draft.prefixCachingHashAlgo,
                      enable_chunked_prefill: draft.enableChunkedPrefill,
                      max_num_seqs: draft.maxNumSeqs,
                      cuda_graph_sizes: draft.cudaGraphSizes,
                      pipeline_parallel_size: draft.pipelineParallelSize,
                      device: draft.device,
                      // llama.cpp-specific fields
                      ngl: draft.ngl,
                      tensor_split: draft.tensorSplit,
                      batch_size: draft.batchSize,
                      ubatch_size: draft.ubatchSize,
                      threads: draft.threads,
                      context_size: draft.contextSize,
                      parallel_slots: draft.parallelSlots,
                      rope_freq_base: draft.ropeFreqBase,
                      rope_freq_scale: draft.ropeFreqScale,
                      flash_attention: draft.flashAttention,
                      mlock: draft.mlock,
                      no_mmap: draft.noMmap,
                      numa_policy: draft.numaPolicy,
                      split_mode: draft.splitMode,
                      cache_type_k: draft.cacheTypeK,
                      cache_type_v: draft.cacheTypeV,
                      // Repetition control parameters
                      repetition_penalty: draft.repetitionPenalty,
                      frequency_penalty: draft.frequencyPenalty,
                      presence_penalty: draft.presencePenalty,
                      temperature: draft.temperature,
                      top_k: draft.topK,
                      top_p: draft.topP,
                    }});
                    else if (m) apply.mutate({ id: configId!, body: {} });
                  }} disabled={apply.isPending}>Apply (restart)</PrimaryButton>
                </div>
              </div>
              {dryCmd && (<pre className="text-xs text-white/70 bg-black/30 rounded p-2 overflow-x-auto" title="Effective vLLM command">{dryCmd}</pre>)}
            </div>
          );
        })()}
      </Modal>
      )}

      {isAdmin && (
      <Modal 
        open={logsFor != null} 
        onClose={()=>setLogsFor(null)} 
        title={logsFor != null ? `Model Logs - ${list.data?.find((m: any) => m.id === logsFor)?.name || 'Model'} (${list.data?.find((m: any) => m.id === logsFor)?.engine_type || 'vllm'})` : 'Model Logs'}
      >
        {logsFor != null && (
          <LogsViewer fetcher={async ()=> {
            try { return await apiFetch(`/admin/models/${logsFor}/logs`); } catch { return 'Logs not available yet.'; }
          }} />
        )}
      </Modal>
      )}

      {isAdmin && (<ConfirmDialog
        open={archiveId != null}
        title="Archive model?"
        description={<div>Archiving hides the model from the main list and disables actions. You can delete it later from the Archived section.</div>}
        confirmLabel={archive.isPending ? 'Archiving…' : 'Archive'}
        onConfirm={()=> archiveId!=null && archive.mutate(archiveId)}
        onClose={()=>setArchiveId(null)}
      />)}

      {isAdmin && (<ConfirmDialog
        open={deleteId != null}
        title="Delete model from Cortex?"
        description={
          <div className="space-y-3">
            <div className="text-white/80">
              This will remove the model from Cortex's management and stop its container.
            </div>
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <div className="font-medium text-emerald-300 mb-1">✓ Your model files are safe</div>
              <div className="text-sm text-white/80">
                Model files in <code className="bg-black/30 px-1 py-0.5 rounded">/var/cortex/models</code> will NOT be deleted.
                You can safely re-add this model later without re-downloading or re-transferring files.
              </div>
            </div>
            <div className="text-xs text-white/60">
              To permanently remove model files from disk, you must manually delete them from the filesystem.
            </div>
          </div>
        }
        confirmLabel={del.isPending ? 'Deleting…' : 'Delete Configuration'}
        onConfirm={()=> deleteId!=null && del.mutate(deleteId)}
        onClose={()=>{ setDeleteId(null); }}
      />)}

      <TestResultsModal
        open={!!testResult}
        onClose={() => setTestResult(null)}
        result={testResult}
        modelName={testResult ? list.data?.find((m: any) => m.id === testingId)?.name : undefined}
      />

      {isAdmin && saveRecipeModelId && (
        <SaveRecipeDialog
          open={saveRecipeOpen}
          onClose={() => {
            setSaveRecipeOpen(false);
            setSaveRecipeModelId(null);
          }}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['recipes'] });
          }}
          modelId={saveRecipeModelId}
          modelName={list.data?.find((m: any) => m.id === saveRecipeModelId)?.name || 'Unknown Model'}
          engineType={list.data?.find((m: any) => m.id === saveRecipeModelId)?.engine_type || 'vllm'}
        />
      )}

      {isAdmin && (
        <MyRecipesModal
          open={myRecipesOpen}
          onClose={() => setMyRecipesOpen(false)}
          onSelectRecipe={async (recipe) => {
            try {
              // Fetch full recipe details
              const recipeDetails = await apiFetch<any>(`/admin/recipes/${recipe.id}`);
              
              // Convert recipe to ModelFormValues
              const formValues: Partial<ModelFormValues> = {
                mode: recipeDetails.mode as 'online' | 'offline',
                repoId: recipeDetails.repo_id || '',
                localPath: recipeDetails.local_path || '',
                name: `${recipeDetails.model_name} (from recipe)`,
                servedModelName: recipeDetails.served_model_name,
                task: recipeDetails.task as 'generate' | 'embed',
                dtype: recipeDetails.dtype || 'auto',
                tpSize: recipeDetails.tp_size ?? 1,
                selectedGpus: Array.isArray(recipeDetails.selected_gpus) ? recipeDetails.selected_gpus : [0],
                gpuMemoryUtilization: recipeDetails.gpu_memory_utilization ?? 0.9,
                maxModelLen: recipeDetails.max_model_len ?? 8192,
                maxNumBatchedTokens: recipeDetails.max_num_batched_tokens ?? (recipeDetails.max_model_len ?? 8192),
                kvCacheDtype: recipeDetails.kv_cache_dtype || '',
                quantization: recipeDetails.quantization || '',
                blockSize: recipeDetails.block_size ?? undefined,
                swapSpaceGb: recipeDetails.swap_space_gb ?? undefined,
                enforceEager: recipeDetails.enforce_eager ?? true,
                trustRemoteCode: false,
                hfOffline: false,
                tokenizer: recipeDetails.tokenizer || '',
                hfConfigPath: recipeDetails.hf_config_path || '',
                engineType: recipeDetails.engine_type as 'vllm' | 'llamacpp',
                ngl: recipeDetails.ngl ?? 999,
                tensorSplit: recipeDetails.tensor_split || '',
                batchSize: recipeDetails.batch_size ?? 2048,
                ubatchSize: recipeDetails.ubatch_size ?? 2048,
                threads: recipeDetails.threads ?? 32,
                contextSize: recipeDetails.context_size ?? 16384,
                parallelSlots: recipeDetails.parallel_slots ?? 16,
                ropeFreqBase: recipeDetails.rope_freq_base ?? undefined,
                ropeFreqScale: recipeDetails.rope_freq_scale ?? undefined,
                flashAttention: recipeDetails.flash_attention ?? true,
                mlock: recipeDetails.mlock ?? true,
                noMmap: recipeDetails.no_mmap ?? false,
                numaPolicy: recipeDetails.numa_policy || 'isolate',
                splitMode: recipeDetails.split_mode ?? undefined,
                cacheTypeK: recipeDetails.cache_type_k ?? 'q8_0',
                cacheTypeV: recipeDetails.cache_type_v ?? 'q8_0',
                // Repetition control parameters
                repetitionPenalty: recipeDetails.repetition_penalty ?? 1.2,
                frequencyPenalty: recipeDetails.frequency_penalty ?? 0.5,
                presencePenalty: recipeDetails.presence_penalty ?? 0.5,
                temperature: recipeDetails.temperature ?? 0.8,
                topK: recipeDetails.top_k ?? 40,
                topP: recipeDetails.top_p ?? 0.9,
              };
              
              // Set the prefilled values and open the model form
              setPrefill(formValues);
              setOpen(true);
              
              addToast({ 
                title: `Recipe "${recipe.name}" loaded`, 
                kind: 'success' 
              });
            } catch (error: any) {
              addToast({ 
                title: `Failed to load recipe: ${error?.message || 'Unknown error'}`, 
                kind: 'error' 
              });
            }
          }}
        />
      )}
    </section>
  );
}


