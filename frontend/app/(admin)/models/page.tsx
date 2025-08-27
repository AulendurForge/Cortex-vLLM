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
import { useUser } from '../../../src/providers/UserProvider';

type ModelRow = (typeof ModelListSchema extends infer T ? unknown : never) | any;

export default function ModelsPage() {
  const qc = useQueryClient();
  const { user } = useUser();
  const isAdmin = (user?.role === 'admin');
  const [open, setOpen] = React.useState(false);
  const [logsFor, setLogsFor] = React.useState<number | null>(null);
  const [archiveId, setArchiveId] = React.useState<number | null>(null);
  const [deleteId, setDeleteId] = React.useState<number | null>(null);
  const [purgeCache, setPurgeCache] = React.useState<boolean>(false);
  const [configId, setConfigId] = React.useState<number | null>(null);
  const [dryCmd, setDryCmd] = React.useState<string>("");
  const [calcOpen, setCalcOpen] = React.useState<boolean>(false);
  const [prefill, setPrefill] = React.useState<Partial<ModelFormValues> | null>(null);

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
      };
      return await apiFetch('/admin/models', { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['models'] }); setOpen(false); },
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
    mutationFn: async (id: number) => apiFetch(`/admin/models/${id}?purge_cache=${purgeCache ? 'true' : 'false'}`, { method: 'DELETE' }),
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
    mutationFn: async (id: number) => apiFetch<{ command: string }>(`/admin/models/${id}/dry-run`, { method: 'POST' }),
    onSuccess: (r) => { setDryCmd(Array.isArray((r as any).command) ? (r as any).command.join(' ') : (r as any).command || ''); },
  });

  return (
    <section className="space-y-4">
      <PageHeader title="Models & Pools" actions={
        isAdmin ? (
          <div className="flex items-center gap-2">
            <Button onClick={()=>setCalcOpen(true)}>Resource calculator</Button>
            <PrimaryButton onClick={()=>setOpen(true)}>Add Model</PrimaryButton>
          </div>
        ) : undefined
      } />

      <Card className="p-2">
        <Table>
          <thead className="text-left">
            <tr>
              <th>Name</th>
              <th>Served</th>
              <th>Task</th>
              {isAdmin && (<><th>TP</th><th>DType</th></>)}
              <th>State</th>
              {isAdmin && (<th></th>)}
            </tr>
          </thead>
          <tbody>
            {(list.data || []).filter((m:any)=>!m.archived).map((m: any) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td className="font-mono text-xs">{m.served_model_name}</td>
                <td>{m.task}</td>
                {isAdmin && (<td>{m.tp_size ?? '-'}</td>)}
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
                    {m.state !== 'running' ? (
                      <Button onClick={()=>start.mutate(m.id)} disabled={start.isPending}>Start</Button>
                    ) : (
                      <Button onClick={()=>stop.mutate(m.id)} disabled={stop.isPending}>Stop</Button>
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

      {isAdmin && (
      <Card className="p-2">
        <div className="text-white/60 text-sm mb-2">Archived</div>
        <Table>
          <thead className="text-left">
            <tr>
              <th>Name</th><th>Served</th><th>Task</th><th>TP</th><th>DType</th><th>State</th><th></th>
            </tr>
          </thead>
          <tbody>
            {(list.data || []).filter((m:any)=>m.archived).map((m:any)=>(
              <tr key={m.id}>
                <td>{m.name}</td>
                <td className="font-mono text-xs">{m.served_model_name}</td>
                <td>{m.task}</td>
                <td>{m.tp_size ?? '-'}</td>
                <td>{m.dtype ?? '-'}</td>
                <td><Badge>{m.state}</Badge></td>
                <td className="text-right space-x-2">
                  <Button onClick={()=>setLogsFor(m.id)}>Logs</Button>
                  <Button onClick={()=>setDeleteId(m.id)} className="bg-red-600/30 border border-red-500/40">Delete</Button>
                </td>
              </tr>
            ))}
            {(list.data || []).filter((m:any)=>m.archived).length === 0 && (
              <tr><td colSpan={7} className="text-white/70 text-sm">No archived models.</td></tr>
            )}
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
                onSubmit={(v)=>{
                  const values = draft || v;
                  const body:any = {
                    name: values.name,
                    served_model_name: values.servedModelName,
                    task: values.task,
                    dtype: values.dtype,
                    tp_size: values.tpSize,
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
      <Modal open={logsFor != null} onClose={()=>setLogsFor(null)} title="Model Logs">
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
        title="Delete model permanently?"
        description={
          <div className="space-y-3">
            <div className="text-red-300">This will remove the model from Cortex. If it was added from a local folder, its files will be deleted from the host machine. This action cannot be undone.</div>
            <label className="flex items-center gap-2 text-white/90 text-sm">
              <input type="checkbox" className="accent-red-500" checked={purgeCache} onChange={(e)=>setPurgeCache(e.target.checked)} />
              Also delete downloaded Hugging Face cache for this model (online installs)
            </label>
          </div>
        }
        confirmLabel={del.isPending ? 'Deleting…' : 'Delete'}
        onConfirm={()=> deleteId!=null && del.mutate(deleteId)}
        onClose={()=>{ setDeleteId(null); setPurgeCache(false); }}
      />)}
    </section>
  );
}


