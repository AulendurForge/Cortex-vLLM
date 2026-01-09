'use client';

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiFetch from '../../../src/lib/api-clients';
import { ModelListSchema } from '../../../src/lib/validators';
import { Card, Table, Button, PageHeader, Badge, InfoBox, SectionTitle } from '../../../src/components/UI';
import { Modal } from '../../../src/components/Modal';
import { ModelWorkflowForm } from '../../../src/components/models/ModelWorkflowForm';
import { ModelFormValues } from '../../../src/components/models/ModelForm';
import { LogsViewer } from '../../../src/components/models/LogsViewer';
import { DiagnosticBanner } from '../../../src/components/models/DiagnosticBanner';
import { ConfirmDialog } from '../../../src/components/Confirm';
import { ResourceCalculatorModal } from '../../../src/components/models/ResourceCalculatorModal';
import { TestResultsModal } from '../../../src/components/models/TestResultsModal';
import { SaveRecipeDialog } from '../../../src/components/models/SaveRecipeDialog';
import { MyRecipesModal } from '../../../src/components/models/MyRecipesModal';
import { useUser } from '../../../src/providers/UserProvider';
import { Tooltip } from '../../../src/components/Tooltip';
import { useToast } from '../../../src/providers/ToastProvider';
import { cn } from '../../../src/lib/cn';
import { safeCopyToClipboard } from '../../../src/lib/clipboard';

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
        return arr.map((r: any, idx: number) => ({
          id: idx + 1,
          name: r.name || r.served_model_name || '-',
          served_model_name: r.served_model_name || r.name || '-',
          task: r.task || 'generate',
          state: r.state || 'down',
          archived: false,
        }));
      } catch { return [] as any[]; }
    },
    staleTime: 5000,
  });

  const create = useMutation({
    mutationFn: async (payload: ModelFormValues) => {
      return await apiFetch('/admin/models', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['models'] }); 
      addToast({ title: 'Model created!', kind: 'success' });
      setOpen(false); 
    },
    onError: (e: any) => addToast({ title: `Error: ${e?.message}`, kind: 'error' })
  });

  const start = useMutation({
    mutationFn: async (id: number) => apiFetch(`/admin/models/${id}/start`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['models'] });
      addToast({ title: 'Model started successfully', kind: 'success' });
    },
    onError: (e: any) => {
      // Parse error message to provide actionable feedback
      const errorMsg = e?.message || String(e) || 'Unknown error';
      let title = 'Failed to start model';
      let description = errorMsg;
      
      // Detect CUDA/driver errors (check for common CUDA error patterns)
      const lowerMsg = errorMsg.toLowerCase();
      if (lowerMsg.includes('nvidia-container-cli') || 
          lowerMsg.includes('unsatisfied condition') && lowerMsg.includes('cuda') ||
          lowerMsg.includes('cuda') && (lowerMsg.includes('driver') || lowerMsg.includes('version'))) {
        title = 'NVIDIA Driver Incompatible';
        // Extract CUDA version if present
        const cudaMatch = errorMsg.match(/cuda[>=]*\s*([\d.]+)/i);
        const cudaVersion = cudaMatch ? cudaMatch[1] : 'required version';
        description = `Container requires CUDA ${cudaVersion}+, but your NVIDIA driver is too old. Update your drivers and reboot.`;
        addToast({ 
          title, 
          kind: 'error',
          description: description + ' See docs/operations/UPDATE_NVIDIA_DRIVERS.md for instructions.'
        });
      } else if (errorMsg.includes('model_path_invalid') || errorMsg.includes('path not found') || errorMsg.includes('Model path not found')) {
        title = 'Model Path Invalid';
        // Clean up the error message
        description = errorMsg.replace(/^model_path_invalid:\s*/i, '').split('\n')[0];
        addToast({ title, kind: 'error', description });
      } else if (errorMsg.includes('start_failed')) {
        title = 'Model Startup Failed';
        // Extract the actual error, removing the "start_failed:" prefix
        description = errorMsg.replace(/^start_failed:\s*/i, '').split('\n')[0];
        // Truncate very long error messages
        if (description.length > 200) {
          description = description.substring(0, 200) + '...';
        }
        addToast({ 
          title, 
          kind: 'error',
          description: description + ' Check logs for detailed error information.'
        });
      } else {
        // Generic error - truncate if too long
        if (description.length > 150) {
          description = description.substring(0, 150) + '...';
        }
        addToast({ title, kind: 'error', description });
      }
    },
  });
  const stop = useMutation({
    mutationFn: async (id: number) => apiFetch(`/admin/models/${id}/stop`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['models'] });
      addToast({ title: 'Model stopped', kind: 'success' });
    },
    onError: (e: any) => {
      const errorMsg = e?.message || String(e) || 'Unknown error';
      addToast({ title: 'Failed to stop model', kind: 'error', description: errorMsg });
    },
  });
  const archive = useMutation({
    mutationFn: async (id: number) => apiFetch(`/admin/models/${id}/archive`, { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['models'] }); setArchiveId(null); },
  });
  const del = useMutation({
    mutationFn: async (id: number) => apiFetch(`/admin/models/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['models'] }); setDeleteId(null); },
  });
  const apply = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: any }) => {
      await apiFetch(`/admin/models/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      return await apiFetch(`/admin/models/${id}/apply`, { method: 'POST' });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['models'] }); setConfigId(null); },
  });

  const testModel = useMutation({
    mutationFn: async (id: number) => {
      setTestingId(id);
      return await apiFetch(`/admin/models/${id}/test`, { method: 'POST' });
    },
    onSuccess: (data) => {
      setTestResult(data);
      addToast({ title: (data as any).success ? 'Test passed!' : 'Test failed', kind: (data as any).success ? 'success' : 'error' });
      setTestingId(null);
    },
    onError: () => { addToast({ title: 'Test failed', kind: 'error' }); setTestingId(null); }
  });

  return (
    <section className="space-y-4">
      <PageHeader title="Models & Pools" actions={
        isAdmin && (
          <div className="flex items-center gap-2">
            <Button variant="default" size="sm" onClick={()=>setCalcOpen(true)}><span className="mr-1">🧮</span> Calculator</Button>
            <Button variant="purple" size="sm" onClick={()=>setMyRecipesOpen(true)}><span className="mr-1">📜</span> Recipes</Button>
            <Button variant="cyan" size="sm" onClick={()=>setOpen(true)}><span className="mr-1">➕</span> Add Model</Button>
          </div>
        )
      } />
      
      <InfoBox variant="blue" title="Connectivity" className="py-2.5">
        <div className="text-xs text-white/80 mb-1">
          Endpoint: <code className="bg-white/10 px-1 py-0.5 rounded border border-white/10 font-mono text-[10px]">http://192.168.1.181:8084</code>
        </div>
        <a href="/guide?tab=api-keys" className="text-xs font-semibold text-blue-300 hover:text-blue-200 transition-colors">📖 API Guide →</a>
      </InfoBox>

      <Card className="p-0 overflow-hidden shadow-xl">
        <Table>
          <thead>
            <tr>
              <th>Model Name</th><th>Served As</th><th>Task</th><th>Engine</th>{isAdmin && (<><th>GPUs</th><th>DType</th></>)}<th>State</th>{isAdmin && (<th>Actions</th>)}
            </tr>
          </thead>
          <tbody>
            {(list.data || []).filter((m:any)=>!m.archived).map((m: any) => (
              <tr key={m.id} className="group">
                <td className="font-semibold text-white text-xs">{m.name}</td>
                <td className="font-mono text-[10px]">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 bg-white/5 rounded border border-white/5 group-hover:border-white/10">{m.served_model_name}</span>
                    <button onClick={async () => { 
                      const ok = await safeCopyToClipboard(m.served_model_name); 
                      if (ok) addToast({ title: 'Copied!', kind: 'success' }); 
                    }} className="p-1 bg-emerald-500/10 text-emerald-400 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    </button>
                  </div>
                </td>
                <td><Badge className="bg-indigo-500/10 text-indigo-300 border-indigo-500/20 text-[9px]">{m.task}</Badge></td>
                <td>
                  <div className="flex items-center gap-1.5">
                    <Badge className={cn("text-[9px]", m.engine_type === 'llamacpp' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-blue-500/10 text-blue-300')}>
                      {m.engine_type === 'llamacpp' ? 'llama.cpp' : 'vLLM'}
                    </Badge>
                    <Tooltip text={m.engine_type === 'llamacpp' ? 'GGUF engine' : 'Transformers engine'} />
                  </div>
                </td>
                {isAdmin && (<td className="text-[11px]">{m.engine_type === 'llamacpp' && m.tensor_split ? (m.tensor_split.split(',').length) : (m.tp_size ?? '-')}</td>)}
                {isAdmin && (<td className="text-[11px]">{m.dtype ?? '-'}</td>)}
                <td><Badge className={cn("text-[9px]", m.state === 'running' ? 'bg-green-500/20 text-green-200' : m.state === 'starting' ? 'bg-amber-500/20 text-amber-200' : m.state === 'failed' ? 'bg-red-500/20 text-red-200' : 'bg-white/10 text-white/40')}>{m.state}</Badge></td>
                {isAdmin && (
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button size="sm" onClick={()=>setLogsFor(m.id)}>Logs</Button>
                      <Button size="sm" variant="purple" onClick={()=>{ setSaveRecipeModelId(m.id); setSaveRecipeOpen(true); }}>Recipe</Button>
                      {m.state === 'running' && (<Button size="sm" variant="cyan" onClick={()=>testModel.mutate(m.id)} disabled={testingId === m.id}>Test</Button>)}
                      {m.state !== 'running' ? (
                        <Button 
                          size="sm" 
                          variant="primary" 
                          onClick={()=>start.mutate(m.id)} 
                          disabled={(start.isPending && start.variables === m.id) || m.state === 'starting'}
                        >
                          {(start.isPending && start.variables === m.id) || m.state === 'starting' ? '...' : 'Start'}
                        </Button>
                      ) : (
                        <Button 
                          size="sm" 
                          variant="danger" 
                          onClick={()=>stop.mutate(m.id)} 
                          disabled={stop.isPending && stop.variables === m.id}
                        >
                          {stop.isPending && stop.variables === m.id ? '...' : 'Stop'}
                        </Button>
                      )}
                      <Button size="sm" onClick={()=>setConfigId(m.id)}>Config</Button>
                      <Button size="sm" onClick={()=>setArchiveId(m.id)}>Archive</Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {(list.data || []).filter((m:any)=>!m.archived).length === 0 && (
              <tr><td colSpan={isAdmin ? 8 : 5} className="text-white/20 text-xs py-12 text-center italic font-medium uppercase tracking-[0.2em]">Zero Active Deployments</td></tr>
            )}
          </tbody>
        </Table>
      </Card>

      {isAdmin && (list.data || []).filter((m:any)=>m.archived).length > 0 && (
      <Card className="p-0 overflow-hidden border-white/5 bg-white/[0.01]">
        <div className="px-4 py-2 border-b border-white/5 bg-white/[0.02]">
          <SectionTitle variant="blue" className="mb-0 text-[10px]">Vaulted Configurations</SectionTitle>
        </div>
        <Table>
          <thead>
            <tr><th>Name</th><th>Served As</th><th>Task</th><th>GPUs</th><th>DType</th><th>State</th><th></th></tr>
          </thead>
          <tbody>
            {(list.data || []).filter((m:any)=>m.archived).map((m:any)=>(
              <tr key={m.id}>
                <td className="text-xs text-white/60">{m.name}</td>
                <td className="font-mono text-[9px] text-white/40">{m.served_model_name}</td>
                <td><Badge className="bg-indigo-500/5 text-indigo-300/50 border-indigo-500/10 text-[8px]">{m.task}</Badge></td>
                <td className="text-[10px] text-white/40">{m.engine_type === 'llamacpp' && m.tensor_split ? (m.tensor_split.split(',').length) : (m.tp_size ?? '-')}</td>
                <td className="text-[10px] text-white/40">{m.dtype ?? '-'}</td>
                <td><Badge className="text-[8px] opacity-50">{m.state}</Badge></td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button size="sm" onClick={()=>setLogsFor(m.id)}>Logs</Button>
                    <Button size="sm" variant="danger" onClick={()=>setDeleteId(m.id)}>Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      )}

      {isAdmin && (
      <Modal open={open} onClose={()=>setOpen(false)} title="Add Model" variant="workflow">
        <ModelWorkflowForm
          onCancel={()=>setOpen(false)}
          onSubmit={(v)=>create.mutate(v)}
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
            setPrefill((prev)=>({ ...(prev || {}), ...r.values } as any));
            setOpen(true);
          }
        }}
      />
      )}

      {isAdmin && (
      <Modal open={configId != null} onClose={()=>setConfigId(null)} title="Configure Model" variant="workflow">
        {configId != null && (()=>{
          const m = (list.data || []).find((x:any)=>x.id===configId) || {};
          return (
            <ModelWorkflowForm
              modelId={configId}
              defaults={{ ...m, mode: (m.repo_id ? 'online' : 'offline') } as any}
              modeLocked
              onCancel={()=>setConfigId(null)}
              fetchBaseDir={async ()=> { try { const r:any = await apiFetch('/admin/models/base-dir'); return r?.base_dir || ''; } catch { return ''; } }}
              saveBaseDir={async (dir)=> { try { await apiFetch('/admin/models/base-dir', { method: 'PUT', body: JSON.stringify({ base_dir: dir }) }); } catch {} }}
              listLocalFolders={async (base)=> { try { const r:any = await apiFetch(`/admin/models/local-folders?base=${encodeURIComponent(base)}`); return Array.isArray(r) ? r : []; } catch { return []; } }}
              onSubmit={(values)=>apply.mutate({ id: configId, body: values })}
              submitLabel={apply.isPending ? 'Applying...' : 'Apply & Restart'}
            />
          );
        })()}
      </Modal>
      )}

      {isAdmin && (
      <Modal open={logsFor != null} onClose={()=>setLogsFor(null)} title="Model Logs">
        {logsFor != null && (
          <div className="space-y-3">
            <DiagnosticBanner modelId={logsFor} modelState={list.data?.find((m: any) => m.id === logsFor)?.state || 'unknown'} />
            <LogsViewer fetcher={async ()=> { try { return await apiFetch(`/admin/models/${logsFor}/logs`); } catch { return 'Logs not available yet.'; } }} />
          </div>
        )}
      </Modal>
      )}

      {isAdmin && (<ConfirmDialog open={archiveId != null} title="Archive Model?" description="Vaulting will hide this model from primary views." onConfirm={()=> archiveId!=null && archive.mutate(archiveId)} onClose={()=>setArchiveId(null)} />)}
      {isAdmin && (<ConfirmDialog open={deleteId != null} title="Purge Configuration?" description="Model files on disk will be preserved." onConfirm={()=> deleteId!=null && del.mutate(deleteId)} onClose={()=>setDeleteId(null)} />)}
      
      <TestResultsModal open={!!testResult} onClose={()=>setTestResult(null)} result={testResult} modelName={testResult ? list.data?.find((m: any) => m.id === testingId)?.name : undefined} />

      {isAdmin && saveRecipeModelId && (
        <SaveRecipeDialog open={saveRecipeOpen} onClose={()=>{ setSaveRecipeOpen(false); setSaveRecipeModelId(null); }} onSuccess={()=>qc.invalidateQueries({ queryKey: ['recipes'] })} modelId={saveRecipeModelId} modelName={list.data?.find((m: any) => m.id === saveRecipeModelId)?.name || ''} engineType={list.data?.find((m: any) => m.id === saveRecipeModelId)?.engine_type || ''} />
      )}

      {isAdmin && (<MyRecipesModal open={myRecipesOpen} onClose={()=>setMyRecipesOpen(false)} onSelectRecipe={async (recipe) => { try { const r = await apiFetch<any>(`/admin/recipes/${recipe.id}`); setPrefill(r); setOpen(true); addToast({ title: 'Blueprint loaded', kind: 'success' }); } catch { addToast({ title: 'Load failed', kind: 'error' }); } }} />)}
    </section>
  );
}
