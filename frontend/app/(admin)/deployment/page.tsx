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
  const [importPreview, setImportPreview] = React.useState<any>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);

  // Database restore state
  const [dbRestoreDir, setDbRestoreDir] = React.useState('/var/cortex/exports');
  const [dbDumpInfo, setDbDumpInfo] = React.useState<any>(null);
  const [dbRestoreBackupFirst, setDbRestoreBackupFirst] = React.useState(true);
  const [dbRestoreDropExisting, setDbRestoreDropExisting] = React.useState(false);
  const [dbRestoring, setDbRestoring] = React.useState(false);
  const [dbDumpLoading, setDbDumpLoading] = React.useState(false);

  // Job history state
  const [jobHistory, setJobHistory] = React.useState<any[]>([]);
  const [showJobHistory, setShowJobHistory] = React.useState(false);

  // Disk space estimation state
  const [sizeEstimate, setSizeEstimate] = React.useState<any>(null);
  const [estimating, setEstimating] = React.useState(false);

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

  const doExport = async () => {
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

  const doPreview = async () => {
    if (!selectedManifestFile) {
      addToast({ title: 'Select a manifest first', kind: 'error' });
      return;
    }
    setPreviewLoading(true);
    setImportPreview(null);
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
          dry_run: true,
        }),
      });
      setImportPreview(res);
    } catch (e: any) {
      addToast({ title: `Preview failed: ${e?.message || 'error'}`, kind: 'error' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const doImport = async () => {
    if (!selectedManifestFile) {
      addToast({ title: 'Select a manifest first', kind: 'error' });
      return;
    }
    // Check preview first if we have one with validation errors
    if (importPreview && !importPreview.can_import) {
      addToast({ title: 'Cannot import: resolve validation errors first', kind: 'error' });
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
          dry_run: false,
        }),
      });
      addToast({ title: `Imported model #${res?.id}`, kind: 'success' });
      setImportPreview(null); // Clear preview after successful import
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

  // Disk space estimation
  const estimateSize = async () => {
    setEstimating(true);
    try {
      const res = await apiFetch<any>('/admin/deployment/estimate-size', {
        method: 'POST',
        body: JSON.stringify({
          output_dir: outputDir,
          include_images: includeImages,
          include_db: includeDb,
          tar_models: tarModels,
          tar_hf_cache: tarHfCache,
        }),
      });
      setSizeEstimate(res);
      if (res?.disk_space?.sufficient === false) {
        addToast({ title: `⚠️ Insufficient disk space: ${res.disk_space.available_formatted} available, ${res.disk_space.required_formatted} required`, kind: 'error' });
      }
    } catch (e: any) {
      addToast({ title: `Failed to estimate size: ${e?.message || 'error'}`, kind: 'error' });
    } finally {
      setEstimating(false);
    }
  };

  // Job history functions
  const refreshJobHistory = async () => {
    try {
      const res = await apiFetch<any>('/admin/deployment/jobs?limit=20');
      setJobHistory(Array.isArray(res?.jobs) ? res.jobs : []);
    } catch (e: any) {
      addToast({ title: `Failed to load job history: ${e?.message || 'error'}`, kind: 'error' });
    }
  };

  const cancelJob = async (jobId: string) => {
    try {
      await apiFetch<any>(`/admin/deployment/jobs/${jobId}`, { method: 'DELETE' });
      addToast({ title: 'Job cancelled', kind: 'success' });
      refreshJobHistory();
    } catch (e: any) {
      addToast({ title: `Failed to cancel job: ${e?.message || 'error'}`, kind: 'error' });
    }
  };

  // Database restore functions
  const checkDbDump = async () => {
    setDbDumpLoading(true);
    try {
      const info = await apiFetch<any>(`/admin/deployment/database-dump?output_dir=${encodeURIComponent(dbRestoreDir)}`);
      setDbDumpInfo(info);
      if (!info?.exists) {
        addToast({ title: 'No database dump found in directory', kind: 'error' });
      }
    } catch (e: any) {
      addToast({ title: `Failed to check dump: ${e?.message || 'error'}`, kind: 'error' });
      setDbDumpInfo(null);
    } finally {
      setDbDumpLoading(false);
    }
  };

  const doDbRestore = async () => {
    if (!dbDumpInfo?.exists) {
      addToast({ title: 'Check for database dump first', kind: 'error' });
      return;
    }
    // Confirm destructive operation
    if (!window.confirm(
      'WARNING: This will restore the database from the dump file.\n\n' +
      (dbRestoreDropExisting ? '⚠️ DROP EXISTING is enabled - all current data will be deleted!\n\n' : '') +
      (dbRestoreBackupFirst ? '✓ A backup will be created first.\n\n' : '⚠️ No backup will be created!\n\n') +
      'Are you sure you want to proceed?'
    )) {
      return;
    }
    setDbRestoring(true);
    try {
      const res = await apiFetch<any>('/admin/deployment/restore-database', {
        method: 'POST',
        body: JSON.stringify({
          output_dir: dbRestoreDir,
          backup_first: dbRestoreBackupFirst,
          drop_existing: dbRestoreDropExisting,
        }),
      });
      setStatus(res);
      addToast({ title: 'Database restore started', kind: 'success' });
    } catch (e: any) {
      addToast({ title: `Restore failed: ${e?.message || 'error'}`, kind: 'error' });
    } finally {
      setDbRestoring(false);
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
            <Button variant="cyan" size="sm" onClick={doExport} disabled={loading || running}>
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

        {/* Size estimation and export button */}
        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          <div className="flex items-center gap-3">
            <Button variant="default" size="sm" onClick={estimateSize} disabled={estimating || loading}>
              {estimating ? 'Estimating…' : 'Check Size'}
            </Button>
            {sizeEstimate && (
              <div className="text-[11px] text-white/70">
                Estimated: <strong className="text-white">{sizeEstimate.estimated_formatted}</strong>
                {sizeEstimate.disk_space && (
                  <span className={`ml-2 ${sizeEstimate.disk_space.sufficient ? 'text-emerald-400' : 'text-red-400'}`}>
                    ({sizeEstimate.disk_space.available_formatted} available)
                    {!sizeEstimate.disk_space.sufficient && ' ⚠️ Insufficient!'}
                  </span>
                )}
              </div>
            )}
          </div>
          <Button variant="primary" size="sm" onClick={doExport} disabled={loading || running}>
            {loading ? 'Starting…' : 'Start Full Export'}
          </Button>
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
          <div className="flex items-center gap-2">
            <Button variant="default" size="sm" onClick={() => { setShowJobHistory(!showJobHistory); if (!showJobHistory) refreshJobHistory(); }}>
              {showJobHistory ? 'Hide History' : 'Show History'}
            </Button>
            <Badge className={(status as any)?.status === 'completed' ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30' : (status as any)?.status === 'failed' ? 'bg-red-500/20 text-red-200 border-red-400/30' : (status as any)?.status === 'cancelled' ? 'bg-yellow-500/20 text-yellow-200 border-yellow-400/30' : 'bg-white/10 text-white/70 border-white/10'}>
              {(status as any)?.status || 'idle'}
            </Badge>
          </div>
        </div>

        {(status as any)?.status !== 'idle' && (
          <>
            <div className="text-[11px] text-white/70">
              Step: <span className="font-mono">{step || '-'}</span> · Progress: <span className="font-mono">{pct}%</span>
              {(status as any)?.job_type && <span className="ml-2 text-white/50">({(status as any).job_type})</span>}
              {(status as any)?.estimated_size_bytes > 0 && (
                <span className="ml-2">
                  · {((status as any)?.bytes_written / 1024 / 1024).toFixed(1)} MB / {((status as any)?.estimated_size_bytes / 1024 / 1024).toFixed(1)} MB
                </span>
              )}
              {(status as any)?.eta_seconds != null && (
                <span className="ml-2 text-white/50">
                  (ETA: {Math.round((status as any).eta_seconds / 60)}m {Math.round((status as any).eta_seconds % 60)}s)
                </span>
              )}
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

        {/* Job History Section */}
        {showJobHistory && (
          <div className="mt-3 border-t border-white/10 pt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-white/70">Recent Jobs</div>
              <Button variant="default" size="sm" onClick={refreshJobHistory}>Refresh</Button>
            </div>
            {jobHistory.length === 0 ? (
              <div className="text-[11px] text-white/50 text-center py-2">No jobs in history</div>
            ) : (
              <div className="space-y-1 max-h-[200px] overflow-auto">
                {jobHistory.map((job: any) => (
                  <div key={job.id} className="flex items-center justify-between p-2 bg-white/5 rounded text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        job.status === 'completed' ? 'bg-emerald-400' : 
                        job.status === 'failed' ? 'bg-red-400' : 
                        job.status === 'cancelled' ? 'bg-yellow-400' : 
                        job.status === 'running' ? 'bg-blue-400 animate-pulse' : 'bg-white/30'
                      }`} />
                      <span className="font-mono text-white/80">{job.id}</span>
                      <span className="text-white/50">{job.job_type || 'export'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white/50">{job.status}</span>
                      {(job.status === 'running' || job.status === 'pending') && (
                        <Button variant="default" size="sm" onClick={() => cancelJob(job.id)}>Cancel</Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3" variant="purple">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white/80">Import model from manifest</div>
          <div className="flex items-center gap-2">
            <Button variant="cyan" size="sm" onClick={refreshManifests} disabled={manifestLoading}>
              {manifestLoading ? 'Scanning…' : 'Scan'}
            </Button>
            <Button variant="default" size="sm" onClick={doPreview} disabled={previewLoading || !selectedManifestFile}>
              {previewLoading ? 'Checking…' : 'Preview'}
            </Button>
            <Button variant="primary" size="sm" onClick={doImport} disabled={importing || !selectedManifestFile || (importPreview && !importPreview.can_import)}>
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
            <select className="input" value={selectedManifestFile} onChange={(e) => { setSelectedManifestFile(e.target.value); setImportPreview(null); }}>
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

        {/* Import Preview Section */}
        {importPreview && (
          <div className={`p-3 rounded border ${importPreview.can_import ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-white/90">
                {importPreview.can_import ? '✓ Ready to Import' : '✗ Cannot Import'}
              </div>
              <Badge className={importPreview.can_import ? 'bg-emerald-500/20 text-emerald-200' : 'bg-red-500/20 text-red-200'}>
                Preview
              </Badge>
            </div>
            
            <div className="text-[11px] text-white/80 space-y-2">
              <div className="font-semibold">Would create:</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 pl-2">
                <div>Name:</div>
                <code className="bg-white/10 px-1 rounded">{importPreview.would_create?.name || '-'}</code>
                <div>Served name:</div>
                <code className="bg-white/10 px-1 rounded">{importPreview.would_create?.served_model_name || '-'}</code>
                <div>Engine:</div>
                <code className="bg-white/10 px-1 rounded">{importPreview.would_create?.engine_type || '-'}</code>
                <div>Engine image:</div>
                <code className="bg-white/10 px-1 rounded text-[10px]">{importPreview.would_create?.engine_image || '(default)'}</code>
                <div>Local path:</div>
                <code className="bg-white/10 px-1 rounded text-[10px]">{importPreview.would_create?.local_path || '(none)'}</code>
              </div>
              
              {importPreview.conflict && (
                <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded">
                  <div className="font-semibold text-yellow-200">⚠️ Conflict detected:</div>
                  <div className="pl-2 text-yellow-100">
                    Existing model #{importPreview.conflict.existing_id}: "{importPreview.conflict.existing_name}" uses served_model_name "{importPreview.conflict.served_model_name}"
                    {importConflictStrategy === 'rename' && (
                      <span className="text-emerald-300"> → Will rename to "{importPreview.would_create?.served_model_name}"</span>
                    )}
                  </div>
                </div>
              )}
              
              {importPreview.warnings?.length > 0 && (
                <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded">
                  <div className="font-semibold text-yellow-200">Warnings:</div>
                  <ul className="list-disc pl-5 text-yellow-100">
                    {importPreview.warnings.map((w: string, i: number) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {importPreview.validation_errors?.length > 0 && (
                <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded">
                  <div className="font-semibold text-red-200">Errors (must resolve):</div>
                  <ul className="list-disc pl-5 text-red-100">
                    {importPreview.validation_errors.map((e: string, i: number) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Database Restore Section */}
      <Card className="p-4 space-y-3" variant="blue">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white/80">Restore database from export</div>
          <div className="flex items-center gap-2">
            <Button variant="cyan" size="sm" onClick={checkDbDump} disabled={dbDumpLoading}>
              {dbDumpLoading ? 'Checking…' : 'Check Dump'}
            </Button>
            <Button 
              variant="primary" 
              size="sm" 
              onClick={doDbRestore} 
              disabled={dbRestoring || !dbDumpInfo?.exists || running}
            >
              {dbRestoring ? 'Restoring…' : 'Restore Database'}
            </Button>
          </div>
        </div>
        
        <InfoBox variant="purple" title="⚠️ Destructive Operation">
          <div className="text-sm text-white/80">
            Database restore will overwrite existing data. Always ensure you have a backup before proceeding.
            The restore process will stop all running models first.
          </div>
        </InfoBox>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-sm font-semibold text-white/80 mb-1">Import directory (absolute path)</div>
            <Input 
              value={dbRestoreDir} 
              onChange={(e) => { setDbRestoreDir(e.target.value); setDbDumpInfo(null); }} 
              placeholder="/var/cortex/exports" 
            />
            <div className="text-[11px] text-white/60 mt-1">
              We look for <code className="bg-white/10 px-1 py-0.5 rounded border border-white/10">{dbRestoreDir}/db/cortex.sql</code>
            </div>
          </div>
          <div className="space-y-2">
            {dbDumpInfo?.exists && (
              <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded text-[11px] text-emerald-200">
                <div>✓ Database dump found</div>
                <div>Size: {Math.round((dbDumpInfo.size_bytes || 0) / 1024)} KB</div>
                <div>Modified: {dbDumpInfo.modified_at || 'unknown'}</div>
              </div>
            )}
            {dbDumpInfo && !dbDumpInfo.exists && (
              <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-[11px] text-red-200">
                ✗ No database dump found at {dbDumpInfo.path}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input 
              type="checkbox" 
              checked={dbRestoreBackupFirst} 
              onChange={(e) => setDbRestoreBackupFirst(e.target.checked)} 
            />
            Create backup before restore (recommended)
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-yellow-300">
            <input 
              type="checkbox" 
              checked={dbRestoreDropExisting} 
              onChange={(e) => setDbRestoreDropExisting(e.target.checked)} 
            />
            Drop existing tables first (clean restore)
          </label>
        </div>
      </Card>
    </section>
  );
}


