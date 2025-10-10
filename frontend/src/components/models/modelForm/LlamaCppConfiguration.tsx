'use client';

import React from 'react';
import { Tooltip } from '../../Tooltip';
import { ModelFormValues } from '../ModelForm';
import { GpuSelector } from './GpuSelector';
import { useQuery } from '@tanstack/react-query';
import apiFetch from '../../../lib/api-clients';

interface LlamaCppConfigurationProps {
  values: ModelFormValues;
  onChange: (field: keyof ModelFormValues, value: any) => void;
}

export function LlamaCppConfiguration({ values, onChange }: LlamaCppConfigurationProps) {
  if (values.engineType !== 'llamacpp') return null;

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
      {/* Basic llama.cpp Settings */}
      <label className="text-sm">Context Size
        <input 
          className="input mt-1" 
          type="number" 
          min={512} 
          max={131072} 
          step={512} 
          value={values.contextSize ?? 16384} 
          onChange={(e) => onChange('contextSize', Number(e.target.value) || 16384)} 
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
          value={values.parallelSlots ?? 16} 
          onChange={(e) => onChange('parallelSlots', Number(e.target.value) || 16)} 
        />
        <div className="mt-2 p-2 bg-blue-500/10 border border-blue-500/30 rounded text-xs">
          <div className="font-medium text-blue-200 mb-1">📊 Context per slot calculation:</div>
          <div className="text-white/80">
            {Math.floor((values.contextSize ?? 16384) / (values.parallelSlots ?? 16)).toLocaleString()} tokens per slot
          </div>
          <div className="text-white/60 mt-1">
            ({(values.contextSize ?? 16384).toLocaleString()} total context ÷ {values.parallelSlots ?? 16} slots)
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
          value={values.ubatchSize ?? 2048} 
          onChange={(e) => onChange('ubatchSize', Number(e.target.value) || 2048)} 
        />
        <p className="text-[11px] text-white/50 mt-1">
          Physical batch size for prompt processing. Higher = faster prefill. 
          <Tooltip text="Also called '-ub' or '--ubatch-size'. Controls how many tokens are processed in parallel during prompt ingestion. Larger values speed up long prompts but use more VRAM." />
        </p>
      </label>

      <label className="text-sm">KV Cache Type K
        <select className="input mt-1" value={values.cacheTypeK ?? 'q8_0'} onChange={(e) => onChange('cacheTypeK', e.target.value)}>
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
        <select className="input mt-1" value={values.cacheTypeV ?? 'q8_0'} onChange={(e) => onChange('cacheTypeV', e.target.value)}>
          <option value="f16">f16 (2 bytes, full precision)</option>
          <option value="q8_0">q8_0 (1 byte, 50% savings, recommended)</option>
          <option value="q4_0">q4_0 (0.5 bytes, 75% savings)</option>
        </select>
        <p className="text-[11px] text-white/50 mt-1">
          Quantization for KV cache values. q8_0 recommended (50% memory reduction, minimal quality loss). 
          <Tooltip text="Also called '--cache-type-v'. Reduces KV cache memory usage. q8_0 is near-lossless. q4_0 saves more but may reduce quality." />
        </p>
      </label>

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
              <Tooltip text="Also called '--repeat-penalty'. Higher values reduce repetition but may make text less natural." />
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
              <Tooltip text="Also called '--frequency-penalty'. Reduces likelihood of frequently used tokens." />
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
              <Tooltip text="Also called '--presence-penalty'. Encourages new topics and reduces repetition." />
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
              <Tooltip text="Also called '--temp'. Controls randomness in token selection." />
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
              <Tooltip text="Also called '--top-k'. Filters out low-probability tokens." />
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
              <Tooltip text="Also called '--top-p'. Samples from tokens that make up this probability mass." />
            </p>
          </label>
        </div>
      </details>

      {/* Advanced llama.cpp configuration */}
      <details className="md:col-span-2 mt-2 border-l-2 border-green-500 pl-4">
        <summary className="cursor-pointer text-sm text-green-400">Advanced llama.cpp Configuration</summary>
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
            selectedGpus={values.selectedGpus ?? [0]}
            onGpuSelectionChange={(gpuIndices) => {
              onChange('selectedGpus', gpuIndices);
              // Generate tensor_split string for backward compatibility
              if (gpuIndices.length > 0) {
                const ratio = (1.0 / gpuIndices.length).toFixed(2);
                const tensorSplit = gpuIndices.map(() => ratio).join(',');
                onChange('tensorSplit', tensorSplit);
              } else {
                onChange('tensorSplit', '');
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
              value={values.batchSize ?? 512} 
              onChange={(e) => onChange('batchSize', Number(e.target.value) || 512)} 
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
              <input type="checkbox" checked={!!values.flashAttention} onChange={(e) => onChange('flashAttention', e.target.checked)} />
              Flash Attention
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={!!values.mlock} onChange={(e) => onChange('mlock', e.target.checked)} />
              Memory Lock (mlock)
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={!!values.noMmap} onChange={(e) => onChange('noMmap', e.target.checked)} />
              Disable Memory Mapping
            </label>
          </div>
          
          <label className="text-sm">NUMA Policy
            <select className="input mt-1" value={values.numaPolicy || ''} onChange={(e) => onChange('numaPolicy', e.target.value)}>
              <option value="">default</option>
              <option value="isolate">isolate</option>
              <option value="distribute">distribute</option>
            </select>
            <p className="text-[11px] text-white/50 mt-1">NUMA memory policy.</p>
          </label>
        </div>
      </details>
    </>
  );
}




