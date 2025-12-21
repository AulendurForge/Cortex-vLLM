'use client';

import React from 'react';
import apiFetch from '../../../src/lib/api-clients';
import { PageHeader, Card, Button, Input, Badge, InfoBox } from '../../../src/components/UI';
import { useToast } from '../../../src/providers/ToastProvider';

type ModelItem = {
  id: number;
  name: string;
  served_model_name: string;
  engine_type: string;
  engine_image?: string | null;
  local_path?: string | null;
  repo_id?: string | null;
};

type Status =
  | { status: 'idle' }
  | {
      id: string;
      status: 'pending' | 'running' | 'completed' | 'failed';
      started_at: number;
      finished_at?: number | null;
      step?: string;
      progress?: number;
      logs?: string[];
      output_dir?: string;
      artifacts?: any;
      error?: string | null;
    };

export default function DeploymentPage() {
  const { addToast } = useToast();
  const [opts, setOpts] = React.useState<any>(null);
  const [status, setStatus] = React.useState<Status>({ status: 'idle' });
  const [loading, setLoading] = React.useState(false);
  const [models, setModels] = React.useState<ModelItem[]>([]);
  const [selectedModelId, setSelectedModelId] = React.useState<number | ''>('');
  const [modelExporting, setModelExporting] = React.useState(false);

  const [outputDir, setOutputDir] = React.useState('/var/cortex/exports');
  const [includeImages, setIncludeImages] = React.useState(true);
  const [includeDb, setIncludeDb] = React.useState(true);
  const [includeConfigs, setIncludeConfigs] = React.useState(true);
  const [includeModelsManifest, setIncludeModelsManifest] = React.useState(true);
  const [tarModels, setTarModels] = React.useState(false);
  const [tarHfCache, setTarHfCache] = React.useState(false);
  const [allowPullImages, setAllowPullImages] = React.useState(true);
  const [modelTarFiles, setModelTarFiles] = React.useState(false);
  const [modelTarHfCache, setModelTarHfCache] = React.useState(false);
  const [modelAllowPull, setModelAllowPull] = React.useState(true);

  const [importDir, setImportDir] = React.useState('/var/cortex/exports');
  const [manifestItems, setManifestItems] = React.useState<any[]>([]);
  const [manifestLoading, setManifestLoading] = React.useState(false);
  const [selectedManifestFile, setSelectedManifestFile] = React.useState<string>('');
  const [importConflictStrategy, setImportConflictStrategy] = React.useState<'error' | 'rename'>('rename');
  const [importServedOverride, setImportServedOverride] = React.useState<string>('');
  const [importNameOverride, setImportNameOverride] = React.useState<string>('');
  const [importLocalPathOverride, setImportLocalPathOverride] = React.useState<string>('');
  const [useExportedEngineImage, setUseExportedEngineImage] = React.useState<boolean>(true);
  const [importing, setImporting] = React.useState(false);

  React.useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const o = await apiFetch<any>('/admin/deployment/options');
        if (!stop) {
          setOpts(o);
          if (o?.defaults?.output_dir) setOutputDir(o.defaults.output_dir);
          if (o?.defaults?.output_dir) setImportDir(o.defaults.output_dir);
        }
      } catch {}
    })();
    return () => {
      stop = true;
    };
  }, []);

  React.useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const ms = await apiFetch<ModelItem[]>('/admin/models');
        if (!stop) setModels(Array.isArray(ms) ? ms : []);
      } catch {}
    })();
    return () => { stop = true; };
  }, []);

  // Poll status (lightweight)
  React.useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const s = await apiFetch<any>('/admin/deployment/status');
        if (!stop) setStatus(s as any);
      } catch {}
    };
    tick();
    const t = window.setInterval(tick, 2000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, []);

  const running = (status as any)?.status === 'running' || (status as any)?.status === 'pending';

  const start = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<any>('/admin/deployment/export', {
        method: 'POST',
        body: JSON.stringify({
          output_dir: outputDir,
          include_images: includeImages,
          include_db: includeDb,
          include_configs: includeConfigs,
          include_models_manifest: includeModelsManifest,
          tar_models: tarModels,
          tar_hf_cache: tarHfCache,
          allow_pull_images: allowPullImages,
        }),
      });
      setStatus(res);
      addToast({ title: 'Deployment export started', kind: 'success' });
    } catch (e: any) {
      addToast({ title: `Export failed: ${e?.message || 'error'}`, kind: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const exportSelectedModel = async () => {
    if (!selectedModelId) {
      addToast({ title: 'Select a model first', kind: 'error' });
      return;
    }
    setModelExporting(true);
    try {
      const res = await apiFetch<any>(`/admin/deployment/export-model/${selectedModelId}`, {
        method: 'POST',
        body: JSON.stringify({
          output_dir: outputDir,
          include_engine_image: true,
          tar_model_files: modelTarFiles,
          tar_hf_cache: modelTarHfCache,
          allow_pull_images: modelAllowPull,
        }),
      });
      setStatus(res);
      addToast({ title: 'Model export started', kind: 'success' });
    } catch (e: any) {
      addToast({ title: `Model export failed: ${e?.message || 'error'}`, kind: 'error' });
    } finally {
      setModelExporting(false);
    }
  };

  const refreshManifests = async () => {
    setManifestLoading(true);
    try {
      const r = await apiFetch<any>(`/admin/deployment/model-manifests?output_dir=${encodeURIComponent(importDir)}`);
      const items = Array.isArray(r?.items) ? r.items : [];
      setManifestItems(items);
      if (items.length === 1) setSelectedManifestFile(items[0]?.file || '');
    } catch (e: any) {
      addToast({ title: `Failed to list manifests: ${e?.message || 'error'}`, kind: 'error' });
    } finally {
      setManifestLoading(false);
    }
  };

  const doImport = async () => {
    if (!selectedManifestFile) {
      addToast({ title: 'Select a manifest first', kind: 'error' });
      return;
    }
    setImporting(true);
    try {
      const res = await apiFetch<any>('/admin/deployment/import-model', {
        method: 'POST',
        body: JSON.stringify({
          output_dir: importDir,
          manifest_file: selectedManifestFile,
          conflict_strategy: importConflictStrategy,
          served_model_name_override: importServedOverride || null,
          name_override: importNameOverride || null,
          local_path_override: importLocalPathOverride || null,
          use_exported_engine_image: useExportedEngineImage,
        }),
      });
      addToast({ title: `Imported model #${res?.id}`, kind: 'success' });
      // Refresh models list for dropdowns
      try {
        const ms = await apiFetch<ModelItem[]>('/admin/models');
        setModels(Array.isArray(ms) ? ms : []);
      } catch {}
    } catch (e: any) {
      addToast({ title: `Import failed: ${e?.message || 'error'}`, kind: 'error' });
    } finally {
      setImporting(false);
    }
  };

  const pct = Math.round(((status as any)?.progress || 0) * 100);
  const step = (status as any)?.step || '';
  const selectedManifest = React.useMemo(() => {
    return manifestItems.find((x) => x?.file === selectedManifestFile) || null;
  }, [manifestItems, selectedManifestFile]);

  return (
    <section className="space-y-4">
      <PageHeader
        title="Deployment"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="cyan" size="sm" onClick={start} disabled={loading || running}>
              {running ? 'Running…' : loading ? 'Starting…' : 'Create Offline Package'}
            </Button>
          </div>
        }
      />

      <InfoBox variant="purple" title="What this does">
        <div className="text-sm text-white/80 space-y-2">
          <div>
            Generate an <strong>offline migration package</strong> from this running Cortex instance:
          </div>
          <ul className="list-disc pl-5 space-y-1">
            <li>Docker images (gateway/frontend + engines + infra)</li>
            <li>Database snapshot (pg_dump)</li>
            <li>Manifests for models/config (secrets redacted)</li>
            <li>Optionally: archives of model weights and HF cache (can be huge)</li>
          </ul>
        </div>
      </InfoBox>

      <Card className="p-4 space-y-4" variant="blue">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm font-semibold text-white/80 mb-1">Output directory (absolute path)</div>
            <Input value={outputDir} onChange={(e) => setOutputDir(e.target.value)} placeholder="/var/cortex/exports" />
            <div className="text-[11px] text-white/60 mt-1">
              The gateway container writes files to this path. Make sure this directory is on persistent storage with sufficient free space.
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-semibold text-white/80">Host paths (detected)</div>
            <div className="text-[11px] text-white/70">
              Models: <code className="bg-white/10 px-1 py-0.5 rounded border border-white/10">{opts?.paths?.models_dir_host || '-'}</code>
            </div>
            <div className="text-[11px] text-white/70">
              HF cache: <code className="bg-white/10 px-1 py-0.5 rounded border border-white/10">{opts?.paths?.hf_cache_dir_host || '-'}</code>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeImages} onChange={(e) => setIncludeImages(e.target.checked)} />
            Export Docker images
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeDb} onChange={(e) => setIncludeDb(e.target.checked)} />
            Export database dump
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeConfigs} onChange={(e) => setIncludeConfigs(e.target.checked)} />
            Export config + models manifest
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeModelsManifest} onChange={(e) => setIncludeModelsManifest(e.target.checked)} />
            Export storage manifest
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={tarModels} onChange={(e) => setTarModels(e.target.checked)} />
            Archive models directory (large)
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={tarHfCache} onChange={(e) => setTarHfCache(e.target.checked)} />
            Archive HF cache (large)
          </label>
          <label className="inline-flex items-center gap-2 text-sm md:col-span-3">
            <input type="checkbox" checked={allowPullImages} onChange={(e) => setAllowPullImages(e.target.checked)} />
            Allow pulling missing images from registries (online only)
          </label>
        </div>
      </Card>

      <Card className="p-4 space-y-3" variant="cyan">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white/80">Export a single model</div>
          <Button variant="purple" size="sm" onClick={exportSelectedModel} disabled={modelExporting || running || !selectedModelId}>
            {modelExporting ? 'Starting…' : 'Export Model'}
          </Button>
        </div>
        <div className="text-[11px] text-white/70">
          Exports the model’s <strong>engine image</strong> under a unique export tag plus a per-model manifest. This avoids overwriting existing image tags on the offline machine.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-sm font-semibold text-white/80 mb-1">Model</div>
            <select className="input" value={selectedModelId} onChange={(e) => setSelectedModelId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Select model…</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  #{m.id} · {m.name} · {m.engine_type} · {m.served_model_name}
                </option>
              ))}
            </select>
            {selectedModelId && (
              <div className="text-[11px] text-white/60 mt-1">
                Tip: if this model is offline (has <code className="bg-white/10 px-1 py-0.5 rounded border border-white/10">local_path</code>), you can optionally archive just that model folder.
              </div>
            )}
          </div>
          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={modelTarFiles} onChange={(e) => setModelTarFiles(e.target.checked)} />
              Archive this model’s files directory
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={modelTarHfCache} onChange={(e) => setModelTarHfCache(e.target.checked)} />
              Archive HF cache (large)
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={modelAllowPull} onChange={(e) => setModelAllowPull(e.target.checked)} />
              Allow pulling missing images (online only)
            </label>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white/80">Job status</div>
          <Badge className={(status as any)?.status === 'completed' ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30' : (status as any)?.status === 'failed' ? 'bg-red-500/20 text-red-200 border-red-400/30' : 'bg-white/10 text-white/70 border-white/10'}>
            {(status as any)?.status || 'idle'}
          </Badge>
        </div>

        {(status as any)?.status !== 'idle' && (
          <>
            <div className="text-[11px] text-white/70">
              Step: <span className="font-mono">{step || '-'}</span> · Progress: <span className="font-mono">{pct}%</span>
            </div>
            {(status as any)?.output_dir && (
              <div className="text-[11px] text-white/70">
                Output: <code className="bg-white/10 px-1 py-0.5 rounded border border-white/10">{(status as any).output_dir}</code>
              </div>
            )}
            {(status as any)?.error && (
              <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-[11px] text-red-200 whitespace-pre-wrap">
                {(status as any).error}
              </div>
            )}
            <div className="p-2 bg-black/30 border border-white/10 rounded text-[11px] text-white/70 max-h-[260px] overflow-auto font-mono">
              {(((status as any)?.logs || []) as string[]).slice(-120).join('\n') || 'No logs yet.'}
            </div>
          </>
        )}
      </Card>

      <Card className="p-4 space-y-3" variant="purple">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white/80">Import model from manifest</div>
          <div className="flex items-center gap-2">
            <Button variant="cyan" size="sm" onClick={refreshManifests} disabled={manifestLoading}>
              {manifestLoading ? 'Scanning…' : 'Scan'}
            </Button>
            <Button variant="primary" size="sm" onClick={doImport} disabled={importing || !selectedManifestFile}>
              {importing ? 'Importing…' : 'Import'}
            </Button>
          </div>
        </div>
        <div className="text-[11px] text-white/70 space-y-1">
          <div>
            This creates a <strong>new</strong> model record in this Cortex instance (state: stopped). It does not start the container automatically.
          </div>
          <div>
            Before starting the model, ensure any exported engine images have been loaded on this machine (e.g. <code className="bg-white/10 px-1 py-0.5 rounded border border-white/10">docker load -i images/*.tar</code>) and the model files are present under <code className="bg-white/10 px-1 py-0.5 rounded border border-white/10">/var/cortex/models</code> if using offline weights.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-sm font-semibold text-white/80 mb-1">Import directory (absolute path)</div>
            <Input value={importDir} onChange={(e) => setImportDir(e.target.value)} placeholder="/var/cortex/exports" />
            <div className="text-[11px] text-white/60 mt-1">We scan <code className="bg-white/10 px-1 py-0.5 rounded border border-white/10">{importDir}/manifests</code> for <code className="bg-white/10 px-1 py-0.5 rounded border border-white/10">model-*.json</code>.</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-white/80 mb-1">Manifest</div>
            <select className="input" value={selectedManifestFile} onChange={(e) => setSelectedManifestFile(e.target.value)}>
              <option value="">Select manifest…</option>
              {manifestItems.map((it) => (
                <option key={it.file} value={it.file}>
                  {it.file} · {it.name || 'unknown'} · {it.engine_type || 'vllm'} · {it.served_model_name || ''}
                </option>
              ))}
            </select>
            {selectedManifest && (
              <div className="text-[11px] text-white/70 mt-2 space-y-1">
                <div>
                  Served name: <code className="bg-white/10 px-1 py-0.5 rounded border border-white/10">{selectedManifest.served_model_name || '-'}</code>
                </div>
                <div>
                  Engine image: <code className="bg-white/10 px-1 py-0.5 rounded border border-white/10">{selectedManifest.engine_image || '-'}</code>
                </div>
                {selectedManifest?.exported_engine_image?.export_tag && (
                  <div>
                    Export tag: <code className="bg-white/10 px-1 py-0.5 rounded border border-white/10">{selectedManifest.exported_engine_image.export_tag}</code>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-sm font-semibold text-white/80 mb-1">Conflict handling</div>
            <select className="input" value={importConflictStrategy} onChange={(e) => setImportConflictStrategy(e.target.value as any)}>
              <option value="rename">Auto-rename served_model_name if conflict</option>
              <option value="error">Error if served_model_name exists</option>
            </select>
          </div>
          <label className="inline-flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" checked={useExportedEngineImage} onChange={(e) => setUseExportedEngineImage(e.target.checked)} />
            Prefer exported engine image tag (if present in manifest)
          </label>
        </div>

        <details className="border-l-2 border-white/10 pl-4">
          <summary className="cursor-pointer text-sm text-white/70">Overrides (optional)</summary>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
            <div>
              <div className="text-sm font-semibold text-white/80 mb-1">served_model_name override</div>
              <Input value={importServedOverride} onChange={(e) => setImportServedOverride(e.target.value)} placeholder="leave empty to use manifest" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white/80 mb-1">Name override</div>
              <Input value={importNameOverride} onChange={(e) => setImportNameOverride(e.target.value)} placeholder="leave empty to use manifest" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white/80 mb-1">local_path override</div>
              <Input value={importLocalPathOverride} onChange={(e) => setImportLocalPathOverride(e.target.value)} placeholder="e.g. MyModelFolder" />
              <div className="text-[11px] text-white/60 mt-1">For offline weights, this should be relative under the models directory.</div>
            </div>
          </div>
        </details>
      </Card>
    </section>
  );
}


