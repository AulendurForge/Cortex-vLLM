'use client';

import React from 'react';
import { Tooltip } from '../../Tooltip';
import { ModelFormValues } from '../ModelForm';
import { GpuSelector } from './GpuSelector';
import { useQuery } from '@tanstack/react-query';
import apiFetch from '../../../lib/api-clients';

interface VLLMConfigurationProps {
  values: ModelFormValues;
  gpuCount: number;
  onChange: (field: keyof ModelFormValues, value: any) => void;
}

export function VLLMConfiguration({ values, gpuCount, onChange }: VLLMConfigurationProps) {
  if (values.engine_type !== 'vllm') return null;

  // Fetch GPU information
  const { data: gpuInfo } = useQuery({
    queryKey: ['gpu-info'],
    queryFn: async () => {
      try {
        const gpus: any[] = await apiFetch('/admin/system/gpus');
        return (Array.isArray(gpus) ? gpus : []).map((g: any) => ({ 
          index: g.index, 
          name: g.name, 
          mem_total_mb: g.mem_total_mb, 
          mem_used_mb: g.mem_used_mb 
        }));
      } catch {
        return [];
      }
    },
    staleTime: 30000, // Cache for 30 seconds
  });

  return (
    <>
      {/* Basic vLLM Settings */}
      <label className="text-sm">DType
        <select className="input mt-1" value={values.dtype} onChange={(e) => onChange('dtype', e.target.value)}>
          <option value="auto">auto</option>
          <option value="float16">float16</option>
          <option value="bfloat16">bfloat16</option>
        </select>
        <p className="text-[11px] text-white/50 mt-1">
          Computation precision. 
          <Tooltip text="Also called '--dtype'. 'auto' lets vLLM choose; 'float16' or 'bfloat16' use half precision. Lower precision can reduce VRAM with possible quality trade‑offs." />
        </p>
      </label>

      <GpuSelector
        selectedGpus={values.selected_gpus ?? [0]}
        onGpuSelectionChange={(gpuIndices) => {
          onChange('selected_gpus', gpuIndices);
          // Keep tp_size aligned with selected GPU count
          onChange('tp_size', gpuIndices.length);
        }}
        gpuInfo={gpuInfo}
        engineType="vllm"
        maxGpus={gpuInfo?.length || gpuCount || 8}
      />
      
      <label className="text-sm">GPU Memory Util
        <input
          className="input mt-1"
          type="range"
          min={0.05}
          max={0.98}
          step={0.01}
          value={values.gpu_memory_utilization ?? 0.9}
          onChange={(e) => onChange('gpu_memory_utilization', Number(e.target.value))}
        />
        <div className="text-[11px] text-white/60">{(values.gpu_memory_utilization ?? 0.9).toFixed(2)}</div>
        <p className="text-[11px] text-white/50 mt-1">
          How much VRAM vLLM is allowed to use (0.05–0.98). Higher allows larger KV cache and batch sizes. 
          <Tooltip text="Also called '--gpu-memory-utilization'. If you see 'not enough KV cache' errors, increase this or lower 'max_model_len'." />
        </p>
      </label>

      <label className="text-sm">Max context length
        <input
          className="input mt-1"
          type="range"
          min={512}
          max={131072}
          step={512}
          value={values.max_model_len ?? (values.task === 'embed' ? 8192 : 8192)}
          onChange={(e) => onChange('max_model_len', Number(e.target.value))}
        />
        <div className="text-[11px] text-white/60">
          {(values.max_model_len ?? (values.task === 'embed' ? 8192 : 8192)) + ' tokens'}
        </div>
        <p className="text-[11px] text-white/50 mt-1">
          {values.task === 'embed' ? (
            <>Maximum input sequence length. Some models (e.g., BGE-Large) support 8192 tokens despite config saying 512. Override if needed. <Tooltip text="vLLM auto-detects from model config, but some models have incorrect max_position_embeddings. Set this to override (e.g., 8192 for BGE-Large)." /></>
          ) : (
            <>Upper bound of tokens per request. Larger values need more KV cache VRAM. <Tooltip text="Also called '--max-model-len'. Start with 8192–32768 on small GPUs; 131072 requires significant VRAM." /></>
          )}
        </p>
      </label>
      
      <div className="text-sm flex items-center gap-2 mt-6">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={!!values.trust_remote_code} onChange={(e) => onChange('trust_remote_code', e.target.checked)} />
          Trust remote code 
          <Tooltip text="When enabled, allows executing custom code in model repos that define custom model classes or tokenizers. Only enable for trusted sources." />
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={!!values.hf_offline} onChange={(e) => onChange('hf_offline', e.target.checked)} />
          HF offline 
          <Tooltip text="Hint to run without reaching Hugging Face. For offline installs ensure weights/tokenizer/config exist locally or in the HF cache." />
        </label>
      </div>

      {/* NOTE: Repetition/sampling controls moved to RequestDefaultsSection (Plane C) */}
      {/* These are request-time parameters, not container startup parameters */}
      {/* See cortexSustainmentPlan.md for details on Phase 1 changes */}

      {/* Production Settings */}
      <details className="md:col-span-2 mt-2">
        <summary className="cursor-pointer text-sm text-white/80">Production Settings</summary>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
          <label className="text-sm">Attention Backend
            <select className="input mt-1" value={values.attention_backend || ''} onChange={(e) => onChange('attention_backend', e.target.value || null)}>
              <option value="">auto (default)</option>
              <option value="FLASH_ATTN">Flash Attention</option>
              <option value="FLASHINFER">FlashInfer</option>
              <option value="XFORMERS">xFormers</option>
              <option value="TRITON_ATTN">Triton</option>
            </select>
            <p className="text-[11px] text-white/50 mt-1">
              Force specific attention implementation. 
              <Tooltip text="Also called '--attention-backend'. Auto lets vLLM choose the best. Flash Attention is fastest on most hardware. FlashInfer supports longer contexts. xFormers has broader compatibility." />
            </p>
          </label>
          <div className="text-sm flex flex-col gap-2 mt-1">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={!!values.disable_log_requests} onChange={(e) => onChange('disable_log_requests', e.target.checked)} />
              Disable request logging 
              <Tooltip text="Also called '--disable-log-requests'. Reduces log spam in production. Recommended for high-throughput deployments." />
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={!!values.disable_log_stats} onChange={(e) => onChange('disable_log_stats', e.target.checked)} />
              Disable stats logging 
              <Tooltip text="Also called '--disable-log-stats'. Slightly faster startup and reduced log volume. Enable when Prometheus metrics are sufficient." />
            </label>
          </div>
          <div className="text-sm flex flex-col gap-2 mt-1">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={!!values.vllm_v1_enabled} onChange={(e) => onChange('vllm_v1_enabled', e.target.checked)} />
              <span className="text-amber-300">Enable V1 Engine (Experimental)</span>
              <Tooltip text="Sets VLLM_USE_V1=1. V1 is a major re-architecture with significant performance improvements, but removes some features like 'best_of' sampling. Only use with vLLM 0.8+." />
            </label>
            {values.vllm_v1_enabled && (
              <p className="text-[10px] text-amber-200/70 ml-6">⚠️ V1 removes: best_of, per-request logits processors, GPU↔CPU KV swap</p>
            )}
          </div>
          <label className="text-sm md:col-span-3">Entrypoint Override
            <input
              className="input mt-1"
              placeholder="e.g., python3,-m,vllm.entrypoints.openai.api_server"
              value={values.entrypoint_override || ''}
              onChange={(e) => onChange('entrypoint_override', e.target.value || null)}
            />
            <p className="text-[11px] text-white/50 mt-1">
              Custom container entrypoint (comma-separated). Leave empty for auto-detection. 
              <Tooltip text="Override the default entrypoint for compatibility with different vLLM versions. Format: comma-separated command parts, e.g., 'vllm,serve' or 'python3,-m,vllm.entrypoints.openai.api_server'. Auto-detection uses python module entrypoint for v0.6-0.12." />
            </p>
          </label>
          {/* Debug Logging Settings */}
          <div className="md:col-span-3 border-t border-white/10 pt-2 mt-2">
            <span className="text-xs text-white/60">Debug &amp; Logging</span>
            <div className="flex flex-wrap gap-4 mt-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!values.debug_logging} onChange={(e) => onChange('debug_logging', e.target.checked)} />
                <span>Debug Logging</span>
                <Tooltip text="Sets VLLM_LOGGING_LEVEL=DEBUG. Enables verbose debug output for troubleshooting. May impact performance slightly." />
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!values.trace_mode} onChange={(e) => onChange('trace_mode', e.target.checked)} />
                <span className="text-orange-300">Trace Mode</span>
                <Tooltip text="Sets VLLM_TRACE_FUNCTION=1 and CUDA_LAUNCH_BLOCKING=1. Traces all function calls for deep debugging. WARNING: Significant performance impact!" />
              </label>
            </div>
            {values.trace_mode && (
              <p className="text-[10px] text-orange-200/70 mt-1">⚠️ Trace mode has significant performance impact - for debugging only!</p>
            )}
          </div>
          {/* Request timeout settings (Gap #13) */}
          <label className="text-sm">Engine Timeout (sec)
            <input
              className="input mt-1"
              type="number"
              min={0}
              placeholder="Engine timeout (0=disabled)"
              value={values.engine_request_timeout ?? ''}
              onChange={(e) => onChange('engine_request_timeout', e.target.value ? Number(e.target.value) : null)}
            />
            <p className="text-[11px] text-white/50 mt-1">
              <Tooltip text="Sets VLLM_ENGINE_ITERATION_TIMEOUT_S environment variable. Controls max time for engine iterations. 0 or empty uses default (300s). Useful for limiting very long generations." />
            </p>
          </label>
          <label className="text-sm">Max Log Length
            <input
              className="input mt-1"
              type="number"
              min={0}
              placeholder="Chars to log (0=disabled)"
              value={values.max_log_len ?? ''}
              onChange={(e) => onChange('max_log_len', e.target.value ? Number(e.target.value) : null)}
            />
            <p className="text-[11px] text-white/50 mt-1">
              <Tooltip text="vLLM --max-log-len: Truncate logged prompts to this length. Useful for reducing log volume with long prompts." />
            </p>
          </label>
        </div>
      </details>

      {/* Advanced vLLM Tuning */}
      <details className="md:col-span-2 mt-2">
        <summary className="cursor-pointer text-sm text-white/80">Advanced vLLM Tuning</summary>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
          <label className="text-sm">Max batched tokens
            <input
              className="input mt-1"
              type="range"
              min={512}
              max={16384}
              step={128}
              value={values.max_num_batched_tokens ?? 2048}
              onChange={(e) => onChange('max_num_batched_tokens', Number(e.target.value))}
            />
            <div className="text-[11px] text-white/60">{values.max_num_batched_tokens ?? 2048} tokens</div>
            <p className="text-[11px] text-white/50 mt-1">
              Limits total tokens processed per batch. 
              <Tooltip text="Also called '--max-num-batched-tokens'. Higher improves throughput but increases VRAM usage and latency per batch. Typical range 1024–8192." />
            </p>
          </label>
          <label className="text-sm">KV cache dtype
            <select className="input mt-1" value={values.kv_cache_dtype || ''} onChange={(e) => onChange('kv_cache_dtype', e.target.value)}>
              <option value="">auto</option>
              <option value="fp8">fp8</option>
              <option value="fp8_e4m3">fp8_e4m3</option>
              <option value="fp8_e5m2">fp8_e5m2</option>
            </select>
            <p className="text-[11px] text-white/50 mt-1">
              Precision for KV cache. 
              <Tooltip text="Also called '--kv-cache-dtype'. 'fp8' variants reduce KV memory significantly with minor quality impact; 'auto' lets vLLM pick." />
            </p>
          </label>
          <label className="text-sm">Quantization
            <select className="input mt-1" value={values.quantization || ''} onChange={(e) => onChange('quantization', e.target.value)}>
              <option value="">none (use original weights)</option>
              <option value="awq">AWQ (requires AWQ-quantized model)</option>
              <option value="gptq">GPTQ (requires GPTQ-quantized model)</option>
              <option value="fp8">FP8 (dynamic, any model)</option>
              <option value="int8">INT8 (W8A8, any model)</option>
            </select>
            <p className="text-[11px] text-white/50 mt-1">
              Weight quantization scheme. 
              <Tooltip text="Also called '--quantization'. AWQ/GPTQ need pre‑quantized repos; fp8/int8 require supported kernels. Reduces VRAM with possible quality/perf trade‑offs." />
            </p>
            {/* Quantization validation warnings (Gap #14) */}
            {values.quantization === 'awq' && (
              <p className="text-[11px] text-amber-400 mt-1 bg-amber-500/10 px-2 py-1 rounded">
                ⚠️ AWQ requires a model repo with AWQ-quantized weights (e.g., &quot;TheBloke/...-AWQ&quot;). Using AWQ with non-AWQ weights will fail.
                <a href="https://docs.vllm.ai/en/latest/features/quantization/awq.html" target="_blank" rel="noopener noreferrer" className="text-cyan-400 ml-1 underline">Docs →</a>
              </p>
            )}
            {values.quantization === 'gptq' && (
              <p className="text-[11px] text-amber-400 mt-1 bg-amber-500/10 px-2 py-1 rounded">
                ⚠️ GPTQ requires a model repo with GPTQ-quantized weights (e.g., &quot;TheBloke/...-GPTQ&quot;). Using GPTQ with non-GPTQ weights will fail.
                <a href="https://docs.vllm.ai/en/latest/features/quantization/gptq.html" target="_blank" rel="noopener noreferrer" className="text-cyan-400 ml-1 underline">Docs →</a>
              </p>
            )}
            {values.quantization === 'fp8' && (
              <p className="text-[11px] text-blue-400 mt-1 bg-blue-500/10 px-2 py-1 rounded">
                ℹ️ FP8 applies dynamic quantization at runtime. Works with any model but requires Hopper/Ada GPU (SM 8.9+).
                <a href="https://docs.vllm.ai/en/latest/features/quantization/fp8.html" target="_blank" rel="noopener noreferrer" className="text-cyan-400 ml-1 underline">Docs →</a>
              </p>
            )}
            {values.quantization === 'int8' && (
              <p className="text-[11px] text-blue-400 mt-1 bg-blue-500/10 px-2 py-1 rounded">
                ℹ️ INT8 (W8A8) applies activation-aware quantization. Works with any model. ~2x memory savings.
                <a href="https://docs.vllm.ai/en/latest/features/quantization/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 ml-1 underline">Docs →</a>
              </p>
            )}
          </label>
          <label className="text-sm">KV cache block size
            <select className="input mt-1" value={(values.block_size ?? 16)} onChange={(e) => onChange('block_size', Number(e.target.value))}>
              {[1, 8, 16, 32].map((n) => (<option key={n} value={n}>{n}</option>))}
            </select>
            <p className="text-[11px] text-white/50 mt-1">
              Granularity of KV cache paging. Typical: 16. 
              <Tooltip text="Also called '--block-size'. On CUDA, valid values are 1, 8, 16, 32. Smaller blocks (1–8) reduce fragmentation and help fit long contexts in tight VRAM, at slightly higher overhead. Larger blocks (16–32) can improve throughput when memory is plentiful, but may waste memory. Recommended: 16 for balanced performance; try 8 if hitting KV fragmentation; 32 only when VRAM headroom is large." />
            </p>
          </label>
          <label className="text-sm">Swap space (GiB)
            <input
              className="input mt-1"
              type="range"
              min={0}
              max={64}
              step={1}
              value={values.swap_space_gb ?? 4}
              onChange={(e) => onChange('swap_space_gb', Number(e.target.value))}
            />
            <div className="text-[11px] text-white/60">{values.swap_space_gb ?? 4} GiB</div>
            <p className="text-[11px] text-white/50 mt-1">
              CPU RAM spillover for KV cache. 
              <Tooltip text="Also called '--swap-space'. Helps fit longer contexts on small VRAM, at increased latency." />
            </p>
          </label>
          <div className="text-sm flex items-center gap-2 mt-6">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={!!values.enforce_eager} onChange={(e) => onChange('enforce_eager', e.target.checked)} />
              Disable CUDA graphs (enforce eager)
            </label>
            <p className="text-[11px] text-white/50">
              Eager mode simplifies debugging; disabling CUDA graphs can reduce performance slightly. 
              <Tooltip text="Also called '--enforce-eager'. Leave enabled (checked) for maximal compatibility; uncheck to allow CUDA graph capture if stable." />
            </p>
          </div>
        </div>
      </details>

      {/* Advanced cache/offload and scheduling */}
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
              value={values.cpu_offload_gb ?? 0}
              onChange={(e) => onChange('cpu_offload_gb', Number(e.target.value))}
            />
            <div className="text-[11px] text-white/60">{values.cpu_offload_gb ?? 0} GiB</div>
            <p className="text-[11px] text-white/50 mt-1">
              Offload part of weights/KV to CPU RAM. 
              <Tooltip text="Also called '--cpu-offload-gb'. Requires fast PCIe/NVLink. Increases capacity at the cost of latency." />
            </p>
          </label>
          <div className="text-sm flex items-center gap-2 mt-6">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={!!values.enable_prefix_caching} onChange={(e) => onChange('enable_prefix_caching', e.target.checked)} />
              Enable prefix caching 
              <Tooltip text="Also called '--enable-prefix-caching'. Speeds up repeated prefixes across requests." />
            </label>
          </div>
          <label className="text-sm">Prefix cache hash
            <select className="input mt-1" value={values.prefix_caching_hash_algo || ''} onChange={(e) => onChange('prefix_caching_hash_algo', e.target.value)}>
              <option value="">builtin</option>
              <option value="sha256">sha256</option>
              <option value="sha256_cbor_64bit">sha256_cbor_64bit</option>
            </select>
            <p className="text-[11px] text-white/50 mt-1">
              <Tooltip text="Also called '--prefix-caching-hash-algo'. Choose sha256 variants for reproducible, cross-language caches." />
            </p>
          </label>
          <div className="text-sm flex items-center gap-2 mt-6">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={!!values.enable_chunked_prefill} onChange={(e) => onChange('enable_chunked_prefill', e.target.checked)} />
              Enable chunked prefill 
              <Tooltip text="Also called '--enable-chunked-prefill'. Improves prefill throughput for long prompts." />
            </label>
          </div>
          <label className="text-sm">Max sequences (concurrency)
            <input
              className="input mt-1"
              type="range"
              min={1}
              max={2048}
              step={1}
              value={values.max_num_seqs ?? 256}
              onChange={(e) => onChange('max_num_seqs', Number(e.target.value))}
            />
            <div className="text-[11px] text-white/60">{values.max_num_seqs ?? 256}</div>
            <p className="text-[11px] text-white/50 mt-1">
              Upper bound for concurrently active sequences. 
              <Tooltip text="Also called '--max-num-seqs'. Higher values increase concurrency and can improve throughput for many small requests, but consume more VRAM and may raise latency. Start 128–512; increase only if VRAM headroom allows." />
            </p>
          </label>
          <label className="text-sm">CUDA graph sizes
            <input 
              className="input mt-1" 
              placeholder="e.g., 4096, 8192" 
              value={values.cuda_graph_sizes || ''}
              onChange={(e) => {
                const cleaned = (e.target.value || '').replace(/[^0-9,\s]/g, '');
                onChange('cuda_graph_sizes', cleaned);
              }} 
            />
            <p className="text-[11px] text-white/50 mt-1">
              Fixed token sizes for graph capture. 
              <Tooltip text="Also called '--cuda-graph-sizes'. Pre-captures kernels at common sequence sizes (e.g., 2048/4096/8192) to reduce overhead and improve throughput on steady workloads. Use when requests have common lengths. Note: CUDA graphs are disabled when 'enforce eager' is enabled." />
            </p>
          </label>
        </div>
      </details>

      {/* Distributed / device */}
      <details className="md:col-span-2 mt-2">
        <summary className="cursor-pointer text-sm text-white/80">Distributed / device</summary>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
          <label className="text-sm">Pipeline parallel size
            <select 
              className="input mt-1" 
              value={(values.pipeline_parallel_size ?? 1)} 
              onChange={(e) => onChange('pipeline_parallel_size', Number(e.target.value))} 
              disabled={(values.device || 'cuda') === 'cpu'}
            >
              {Array.from({ length: Math.max(1, (gpuCount && gpuCount > 0) ? Math.min(8, gpuCount) : 8) }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <p className="text-[11px] text-white/50 mt-1">
              Split layers across devices/nodes. Recommended: 1 for most models. 
              <Tooltip text="Also called '--pipeline-parallel-size'. Shards model layers across stages. Effects: (1) Memory per device decreases as PP increases; (2) Inter‑stage comms add latency; (3) Throughput benefits mainly for very large models. Use >1 when the model cannot fit with TP/quant/KV tweaks alone or in multi‑node. Values >4 are rare and typically for very large (e.g., 70B+) or multi‑node setups with fast interconnects. If GPU count is unknown, options up to 8 are shown; starting will fail if hardware is insufficient." />
            </p>
          </label>
          <div className="text-sm">
            <div className="mt-1 inline-flex items-center gap-3">
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="device" checked={(values.device || 'cuda') === 'cuda'} onChange={() => onChange('device', 'cuda')} />
                GPU
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="device" checked={(values.device || 'cuda') === 'cpu'} onChange={() => onChange('device', 'cpu')} />
                CPU
              </label>
            </div>
            <p className="text-[11px] text-white/50 mt-1">
              Choose compute device. 
              <Tooltip text="When CPU is selected, the container starts without GPU access; throughput will be significantly lower." />
            </p>
          </div>
        </div>
      </details>
    </>
  );
}




