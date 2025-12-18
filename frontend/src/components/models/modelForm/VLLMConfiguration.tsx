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
  if (values.engineType !== 'vllm') return null;

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
        selectedGpus={values.selectedGpus ?? [0]}
        onGpuSelectionChange={(gpuIndices) => {
          onChange('selectedGpus', gpuIndices);
          // Update tpSize for backward compatibility
          onChange('tpSize', gpuIndices.length);
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
          value={values.gpuMemoryUtilization ?? 0.9}
          onChange={(e) => onChange('gpuMemoryUtilization', Number(e.target.value))}
        />
        <div className="text-[11px] text-white/60">{(values.gpuMemoryUtilization ?? 0.9).toFixed(2)}</div>
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
          value={values.maxModelLen ?? (values.task === 'embed' ? 8192 : 8192)}
          onChange={(e) => onChange('maxModelLen', Number(e.target.value))}
        />
        <div className="text-[11px] text-white/60">
          {(values.maxModelLen ?? (values.task === 'embed' ? 8192 : 8192)) + ' tokens'}
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
          <input type="checkbox" checked={!!values.trustRemoteCode} onChange={(e) => onChange('trustRemoteCode', e.target.checked)} />
          Trust remote code 
          <Tooltip text="When enabled, allows executing custom code in model repos that define custom model classes or tokenizers. Only enable for trusted sources." />
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={!!values.hfOffline} onChange={(e) => onChange('hfOffline', e.target.checked)} />
          HF offline 
          <Tooltip text="Hint to run without reaching Hugging Face. For offline installs ensure weights/tokenizer/config exist locally or in the HF cache." />
        </label>
      </div>

      {/* Repetition Control */}
      <details className="md:col-span-2 mt-2 border-l-2 border-purple-500 pl-4">
        <summary className="cursor-pointer text-sm text-purple-400">Repetition Control</summary>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
          <label className="text-sm">Repetition Penalty
            <input 
              className="input mt-1" 
              type="number" 
              min={1.0} 
              max={2.0} 
              step={0.1} 
              value={values.repetitionPenalty ?? 1.2} 
              onChange={(e) => onChange('repetitionPenalty', Number(e.target.value) || 1.2)} 
            />
            <p className="text-[11px] text-white/50 mt-1">
              Penalty for repeated tokens. 1.0 = no penalty, 1.2 = moderate penalty. 
              <Tooltip text="Also called 'repetition_penalty'. Higher values reduce repetition but may make text less natural." />
            </p>
          </label>

          <label className="text-sm">Frequency Penalty
            <input 
              className="input mt-1" 
              type="number" 
              min={-2.0} 
              max={2.0} 
              step={0.1} 
              value={values.frequencyPenalty ?? 0.5} 
              onChange={(e) => onChange('frequencyPenalty', Number(e.target.value) || 0.5)} 
            />
            <p className="text-[11px] text-white/50 mt-1">
              Penalty based on token frequency. 0.0 = no penalty, 0.5 = moderate penalty. 
              <Tooltip text="Also called 'frequency_penalty'. Reduces likelihood of frequently used tokens." />
            </p>
          </label>

          <label className="text-sm">Presence Penalty
            <input 
              className="input mt-1" 
              type="number" 
              min={-2.0} 
              max={2.0} 
              step={0.1} 
              value={values.presencePenalty ?? 0.5} 
              onChange={(e) => onChange('presencePenalty', Number(e.target.value) || 0.5)} 
            />
            <p className="text-[11px] text-white/50 mt-1">
              Penalty for tokens already present in context. 0.0 = no penalty, 0.5 = moderate penalty. 
              <Tooltip text="Also called 'presence_penalty'. Encourages new topics and reduces repetition." />
            </p>
          </label>

          <label className="text-sm">Temperature
            <input 
              className="input mt-1" 
              type="number" 
              min={0.0} 
              max={2.0} 
              step={0.1} 
              value={values.temperature ?? 0.8} 
              onChange={(e) => onChange('temperature', Number(e.target.value) || 0.8)} 
            />
            <p className="text-[11px] text-white/50 mt-1">
              Sampling temperature. 0.0 = deterministic, 1.0 = balanced, 2.0 = very random. 
              <Tooltip text="Also called 'temperature'. Controls randomness in token selection." />
            </p>
          </label>

          <label className="text-sm">Top-K
            <input 
              className="input mt-1" 
              type="number" 
              min={1} 
              max={100} 
              step={1} 
              value={values.topK ?? 40} 
              onChange={(e) => onChange('topK', Number(e.target.value) || 40)} 
            />
            <p className="text-[11px] text-white/50 mt-1">
              Limit sampling to top K tokens. 1 = greedy, 40 = balanced, 100 = diverse. 
              <Tooltip text="Also called 'top_k'. Filters out low-probability tokens." />
            </p>
          </label>

          <label className="text-sm">Top-P
            <input 
              className="input mt-1" 
              type="number" 
              min={0.0} 
              max={1.0} 
              step={0.05} 
              value={values.topP ?? 0.9} 
              onChange={(e) => onChange('topP', Number(e.target.value) || 0.9)} 
            />
            <p className="text-[11px] text-white/50 mt-1">
              Nucleus sampling threshold. 0.1 = conservative, 0.9 = balanced, 1.0 = all tokens. 
              <Tooltip text="Also called 'top_p'. Samples from tokens that make up this probability mass." />
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
              value={values.maxNumBatchedTokens ?? 2048}
              onChange={(e) => onChange('maxNumBatchedTokens', Number(e.target.value))}
            />
            <div className="text-[11px] text-white/60">{values.maxNumBatchedTokens ?? 2048} tokens</div>
            <p className="text-[11px] text-white/50 mt-1">
              Limits total tokens processed per batch. 
              <Tooltip text="Also called '--max-num-batched-tokens'. Higher improves throughput but increases VRAM usage and latency per batch. Typical range 1024–8192." />
            </p>
          </label>
          <label className="text-sm">KV cache dtype
            <select className="input mt-1" value={values.kvCacheDtype || ''} onChange={(e) => onChange('kvCacheDtype', e.target.value)}>
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
              <option value="">none</option>
              <option value="awq">awq</option>
              <option value="gptq">gptq</option>
              <option value="fp8">fp8</option>
              <option value="int8">int8</option>
            </select>
            <p className="text-[11px] text-white/50 mt-1">
              Weight quantization scheme. Requires compatible weights. 
              <Tooltip text="Also called '--quantization'. AWQ/GPTQ need pre‑quantized repos; fp8/int8 require supported kernels. Reduces VRAM with possible quality/perf trade‑offs." />
            </p>
          </label>
          <label className="text-sm">KV cache block size
            <select className="input mt-1" value={(values.blockSize ?? 16)} onChange={(e) => onChange('blockSize', Number(e.target.value))}>
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
              value={values.swapSpaceGb ?? 4}
              onChange={(e) => onChange('swapSpaceGb', Number(e.target.value))}
            />
            <div className="text-[11px] text-white/60">{values.swapSpaceGb ?? 4} GiB</div>
            <p className="text-[11px] text-white/50 mt-1">
              CPU RAM spillover for KV cache. 
              <Tooltip text="Also called '--swap-space'. Helps fit longer contexts on small VRAM, at increased latency." />
            </p>
          </label>
          <div className="text-sm flex items-center gap-2 mt-6">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={!!values.enforceEager} onChange={(e) => onChange('enforceEager', e.target.checked)} />
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
              value={values.cpuOffloadGb ?? 0}
              onChange={(e) => onChange('cpuOffloadGb', Number(e.target.value))}
            />
            <div className="text-[11px] text-white/60">{values.cpuOffloadGb ?? 0} GiB</div>
            <p className="text-[11px] text-white/50 mt-1">
              Offload part of weights/KV to CPU RAM. 
              <Tooltip text="Also called '--cpu-offload-gb'. Requires fast PCIe/NVLink. Increases capacity at the cost of latency." />
            </p>
          </label>
          <div className="text-sm flex items-center gap-2 mt-6">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={!!values.enablePrefixCaching} onChange={(e) => onChange('enablePrefixCaching', e.target.checked)} />
              Enable prefix caching 
              <Tooltip text="Also called '--enable-prefix-caching'. Speeds up repeated prefixes across requests." />
            </label>
          </div>
          <label className="text-sm">Prefix cache hash
            <select className="input mt-1" value={values.prefixCachingHashAlgo || ''} onChange={(e) => onChange('prefixCachingHashAlgo', e.target.value)}>
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
              <input type="checkbox" checked={!!values.enableChunkedPrefill} onChange={(e) => onChange('enableChunkedPrefill', e.target.checked)} />
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
              value={values.maxNumSeqs ?? 256}
              onChange={(e) => onChange('maxNumSeqs', Number(e.target.value))}
            />
            <div className="text-[11px] text-white/60">{values.maxNumSeqs ?? 256}</div>
            <p className="text-[11px] text-white/50 mt-1">
              Upper bound for concurrently active sequences. 
              <Tooltip text="Also called '--max-num-seqs'. Higher values increase concurrency and can improve throughput for many small requests, but consume more VRAM and may raise latency. Start 128–512; increase only if VRAM headroom allows." />
            </p>
          </label>
          <label className="text-sm">CUDA graph sizes
            <input 
              className="input mt-1" 
              placeholder="e.g., 4096, 8192" 
              value={values.cudaGraphSizes || ''}
              onChange={(e) => {
                const cleaned = (e.target.value || '').replace(/[^0-9,\s]/g, '');
                onChange('cudaGraphSizes', cleaned);
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
              value={(values.pipelineParallelSize ?? 1)} 
              onChange={(e) => onChange('pipelineParallelSize', Number(e.target.value))} 
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




