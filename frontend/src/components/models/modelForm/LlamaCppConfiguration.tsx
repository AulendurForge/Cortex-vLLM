'use client';

import React, { useState } from 'react';
import { Tooltip } from '../../Tooltip';
import { ModelFormValues } from '../ModelForm';
import { GpuSelector } from './GpuSelector';
import { SpeculativeDecodingExplainer } from './SpeculativeDecodingExplainer';
import { useQuery } from '@tanstack/react-query';
import apiFetch from '../../../lib/api-clients';

interface LlamaCppConfigurationProps {
  values: ModelFormValues;
  onChange: (field: keyof ModelFormValues, value: any) => void;
}

export function LlamaCppConfiguration({ values, onChange }: LlamaCppConfigurationProps) {
  const [showSpecDecodeExplainer, setShowSpecDecodeExplainer] = useState(false);
  
  if (values.engine_type !== 'llamacpp') return null;

  // Fetch GPU information including Flash Attention compatibility (Gap #8)
  const { data: gpuInfo } = useQuery({
    queryKey: ['gpu-info'],
    queryFn: async () => {
      try {
        const gpus: any[] = await apiFetch('/admin/system/gpus');
        return (Array.isArray(gpus) ? gpus : []).map((g: any) => ({ 
          index: g.index, 
          name: g.name, 
          mem_total_mb: g.mem_total_mb, 
          mem_used_mb: g.mem_used_mb,
          compute_capability: g.compute_capability,
          architecture: g.architecture,
          flash_attention_supported: g.flash_attention_supported
        }));
      } catch {
        return [];
      }
    },
    staleTime: 30000, // Cache for 30 seconds
  });

  return (
    <>
      {/* Basic llama.cpp Settings */}
      <label className="text-sm">Context Size
        <input 
          className="input mt-1" 
          type="number" 
          min={512} 
          max={131072} 
          step={512} 
          value={values.context_size ?? 16384} 
          onChange={(e) => onChange('context_size', Number(e.target.value) || 16384)} 
        />
        <p className="text-[11px] text-white/50 mt-1">
          Total context window in tokens. Divided among parallel slots. 
          <Tooltip text="Also called '-c'. Total context is split: context_per_slot = total_context / parallel_slots. For 36K+ prompts, use fewer slots or higher total context." />
        </p>
      </label>

      <label className="text-sm">Parallel Slots
        <input 
          className="input mt-1" 
          type="number" 
          min={1} 
          max={32} 
          step={1} 
          value={values.parallel_slots ?? 16} 
          onChange={(e) => onChange('parallel_slots', Number(e.target.value) || 16)} 
        />
        <div className="mt-2 p-2 bg-blue-500/10 border border-blue-500/30 rounded text-xs">
          <div className="font-medium text-blue-200 mb-1">📊 Context per slot calculation:</div>
          <div className="text-white/80">
            {Math.floor((values.context_size ?? 16384) / (values.parallel_slots ?? 16)).toLocaleString()} tokens per slot
          </div>
          <div className="text-white/60 mt-1">
            ({(values.context_size ?? 16384).toLocaleString()} total context ÷ {values.parallel_slots ?? 16} slots)
          </div>
        </div>
        <p className="text-[11px] text-white/50 mt-1">
          Number of concurrent request slots. Each slot gets: total_context / parallel_slots. 
          <Tooltip text="Also called '--parallel'. More slots = more concurrency but less context per request. For large prompts (30K+ tokens), use 1-2 slots. For many small requests, use 16-32 slots." />
        </p>
      </label>

      <label className="text-sm">Ubatch Size
        <input 
          className="input mt-1" 
          type="number" 
          min={128} 
          max={4096} 
          step={128} 
          value={values.ubatch_size ?? 2048} 
          onChange={(e) => onChange('ubatch_size', Number(e.target.value) || 2048)} 
        />
        <p className="text-[11px] text-white/50 mt-1">
          Physical batch size for prompt processing. Higher = faster prefill. 
          <Tooltip text="Also called '-ub' or '--ubatch-size'. Controls how many tokens are processed in parallel during prompt ingestion. Larger values speed up long prompts but use more VRAM." />
        </p>
      </label>

      <label className="text-sm">KV Cache Type K
        <select className="input mt-1" value={values.cache_type_k ?? 'q8_0'} onChange={(e) => onChange('cache_type_k', e.target.value)}>
          <option value="f16">f16 (2 bytes, full precision)</option>
          <option value="q8_0">q8_0 (1 byte, 50% savings, recommended)</option>
          <option value="q4_0">q4_0 (0.5 bytes, 75% savings)</option>
        </select>
        <p className="text-[11px] text-white/50 mt-1">
          Quantization for KV cache keys. q8_0 recommended (50% memory reduction, minimal quality loss). 
          <Tooltip text="Also called '--cache-type-k'. Reduces KV cache memory usage. q8_0 is near-lossless. q4_0 saves more but may reduce quality." />
        </p>
      </label>

      <label className="text-sm">KV Cache Type V
        <select className="input mt-1" value={values.cache_type_v ?? 'q8_0'} onChange={(e) => onChange('cache_type_v', e.target.value)}>
          <option value="f16">f16 (2 bytes, full precision)</option>
          <option value="q8_0">q8_0 (1 byte, 50% savings, recommended)</option>
          <option value="q4_0">q4_0 (0.5 bytes, 75% savings)</option>
        </select>
        <p className="text-[11px] text-white/50 mt-1">
          Quantization for KV cache values. q8_0 recommended (50% memory reduction, minimal quality loss). 
          <Tooltip text="Also called '--cache-type-v'. Reduces KV cache memory usage. q8_0 is near-lossless. q4_0 saves more but may reduce quality." />
        </p>
      </label>

      {/* NOTE: Repetition/sampling controls moved to RequestDefaultsSection (Plane C) */}
      {/* These are request-time parameters, not container startup parameters */}
      {/* See cortexSustainmentPlan.md for details on Phase 1 changes */}

      {/* Advanced llama.cpp configuration */}
      <details className="md:col-span-2 mt-2 border-l-2 border-green-500 pl-4">
        <summary className="cursor-pointer text-sm text-green-400 flex items-center gap-2">
          <span>🦙</span> Advanced llama.cpp Configuration
        </summary>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
          <label className="text-sm">GPU Layers (ngl)
            <input 
              className="input mt-1" 
              type="number" 
              min={0} 
              max={999} 
              value={values.ngl ?? 999} 
              onChange={(e) => onChange('ngl', Number(e.target.value) || 999)} 
            />
            <p className="text-[11px] text-white/50 mt-1">
              Number of layers to offload to GPU. 999 = all layers. 
              <Tooltip text="0 = CPU only (slow), 999 = offload all layers possible (recommended)" />
            </p>
          </label>
          
          <GpuSelector
            selectedGpus={values.selected_gpus ?? [0]}
            onGpuSelectionChange={(gpuIndices) => {
              onChange('selected_gpus', gpuIndices);
              // Generate tensor_split string for backward compatibility
              if (gpuIndices.length > 0) {
                const ratio = (1.0 / gpuIndices.length).toFixed(2);
                const tensorSplit = gpuIndices.map(() => ratio).join(',');
                onChange('tensor_split', tensorSplit);
              } else {
                onChange('tensor_split', '');
              }
            }}
            gpuInfo={gpuInfo}
            engineType="llamacpp"
            maxGpus={gpuInfo?.length || 4}
          />
          
          <label className="text-sm">Batch Size
            <input 
              className="input mt-1" 
              type="number" 
              min={1} 
              max={2048} 
          value={values.batch_size ?? 512} 
          onChange={(e) => onChange('batch_size', Number(e.target.value) || 512)} 
            />
            <p className="text-[11px] text-white/50 mt-1">Batch size for prompt processing. Higher = faster prefill.</p>
          </label>
          
          <label className="text-sm">CPU Threads
            <input 
              className="input mt-1" 
              type="number" 
              min={1} 
              max={128} 
              value={values.threads ?? 32} 
              onChange={(e) => onChange('threads', Number(e.target.value) || 32)} 
            />
            <p className="text-[11px] text-white/50 mt-1">Number of CPU threads. Set to (CPU cores - 2) typically.</p>
          </label>
          
          <div className="text-sm flex flex-col gap-2 mt-2">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={!!values.flash_attention} onChange={(e) => onChange('flash_attention', e.target.checked)} />
              Flash Attention
              {/* Flash Attention compatibility badge (Gap #8) */}
              {gpuInfo && gpuInfo.length > 0 && (
                gpuInfo[0].flash_attention_supported === true ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 border border-green-500/30">
                    ✓ {gpuInfo[0].architecture || 'Supported'}
                  </span>
                ) : gpuInfo[0].flash_attention_supported === false ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">
                    ✗ {gpuInfo[0].architecture || 'Unsupported'}
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-300 border border-gray-500/30" title="GPU compute capability not available. FA2 requires SM 80+ (Ampere/Ada/Hopper).">
                    ? Requires SM 80+
                  </span>
                )
              )}
            </label>
            {/* Flash Attention info message */}
            <p className="text-[10px] text-white/40 ml-6">
              Flash Attention 2 requires Ampere (RTX 30xx, A100), Ada (RTX 40xx), or newer GPUs.
            </p>
            {/* Flash Attention warning for incompatible GPUs */}
            {values.flash_attention && gpuInfo && gpuInfo.length > 0 && gpuInfo[0].flash_attention_supported === false && (
              <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
                ⚠️ Your GPU ({gpuInfo[0].name || gpuInfo[0].architecture}) may not fully support Flash Attention 2. 
                FA2 requires SM 80+ (Ampere/Ada/Hopper). Performance may be degraded.
              </div>
            )}
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={!!values.mlock} onChange={(e) => onChange('mlock', e.target.checked)} />
              Memory Lock (mlock)
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={!!values.no_mmap} onChange={(e) => onChange('no_mmap', e.target.checked)} />
              Disable Memory Mapping
            </label>
          </div>
          
          <label className="text-sm">NUMA Policy
            <select className="input mt-1" value={values.numa_policy || ''} onChange={(e) => onChange('numa_policy', e.target.value)}>
              <option value="">default</option>
              <option value="isolate">isolate</option>
              <option value="distribute">distribute</option>
            </select>
            <p className="text-[11px] text-white/50 mt-1">NUMA memory policy.</p>
          </label>
        </div>
      </details>

      {/* Speculative Decoding (Gap #6) */}
      <details className="md:col-span-2 mt-2 border-l-2 border-purple-500 pl-4">
        <summary className="cursor-pointer text-sm text-purple-400 flex items-center gap-2">
          <span>⚡</span> Speculative Decoding (Advanced)
        </summary>
        <div className="mt-3 p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg">
          <div className="flex items-start justify-between mb-3">
            <p className="text-xs text-white/60 flex-1">
              Use a smaller "draft" model to speculatively predict tokens, which can significantly improve 
              inference throughput. Ideal for using small models (like 0.5B) to accelerate larger models.
            </p>
            <button
              type="button"
              onClick={() => setShowSpecDecodeExplainer(true)}
              className="ml-3 px-3 py-1.5 text-xs bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 
                         text-purple-300 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>🤔</span>
              What is this?
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm md:col-span-2">Draft Model Path
              <input 
                className="input mt-1" 
                type="text" 
                placeholder="/models/draft-model-folder/model.gguf"
                value={values.draft_model_path || ''} 
                onChange={(e) => onChange('draft_model_path', e.target.value || undefined)} 
              />
              <p className="text-[11px] text-white/50 mt-1">
                Path to a smaller GGUF model inside the container. 
                Example: <code className="text-purple-300">/models/alamios_Mistral-Small-3.1-DRAFT-0.5B-GGUF/model-Q8_0.gguf</code>
                <Tooltip text="The draft model should be a smaller version of the same architecture. It predicts tokens speculatively, and the main model verifies them. Good draft models are 4-10x smaller than the main model." />
              </p>
            </label>
            
            <label className="text-sm">Draft Tokens (n)
              <input 
                className="input mt-1" 
                type="number" 
                min={1} 
                max={64}
                step={1}
                value={values.draft_n ?? 16} 
                onChange={(e) => onChange('draft_n', Number(e.target.value) || 16)} 
              />
              <p className="text-[11px] text-white/50 mt-1">
                Number of tokens to draft at once. Higher = more speculative but may reduce acceptance rate.
                <Tooltip text="Default is 16. Values between 8-32 work well. Higher values increase throughput when drafts are accepted, but waste compute if they're rejected." />
              </p>
            </label>
            
            <label className="text-sm">Min Acceptance Probability
              <input 
                className="input mt-1" 
                type="number" 
                min={0} 
                max={1}
                step={0.05}
                value={values.draft_p_min ?? 0.5} 
                onChange={(e) => onChange('draft_p_min', Number(e.target.value) || 0.5)} 
              />
              <p className="text-[11px] text-white/50 mt-1">
                Minimum probability threshold for accepting draft tokens. Lower = more aggressive speculative decoding.
                <Tooltip text="Default is 0.5. Lower values (0.2-0.4) accept more drafts but may reduce quality. Higher values (0.6-0.8) are more conservative." />
              </p>
            </label>
          </div>
          
          {values.draft_model_path && (
            <div className="mt-3 p-2 bg-purple-500/10 border border-purple-500/30 rounded text-xs">
              <div className="font-medium text-purple-200 mb-1">✓ Speculative Decoding Enabled</div>
              <div className="text-white/60">
                Draft model: <code className="text-purple-300">{values.draft_model_path}</code>
              </div>
              <div className="text-white/60">
                Will draft {values.draft_n || 16} tokens with p_min = {values.draft_p_min || 0.5}
              </div>
            </div>
          )}
        </div>
      </details>

      {/* Speculative Decoding Explainer Modal */}
      <SpeculativeDecodingExplainer 
        isOpen={showSpecDecodeExplainer} 
        onClose={() => setShowSpecDecodeExplainer(false)} 
      />
    </>
  );
}




