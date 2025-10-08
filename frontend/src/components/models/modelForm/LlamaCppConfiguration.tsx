'use client';

import React from 'react';
import { Tooltip } from '../../Tooltip';
import { ModelFormValues } from '../ModelForm';

interface LlamaCppConfigurationProps {
  values: ModelFormValues;
  onChange: (field: keyof ModelFormValues, value: any) => void;
}

export function LlamaCppConfiguration({ values, onChange }: LlamaCppConfigurationProps) {
  if (values.engineType !== 'llamacpp') return null;

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
          
          <label className="text-sm">Tensor Split
            <input 
              className="input mt-1" 
              placeholder="0.25,0.25,0.25,0.25" 
              value={values.tensorSplit || ''} 
              onChange={(e) => onChange('tensorSplit', e.target.value)} 
            />
            <p className="text-[11px] text-white/50 mt-1">
              GPU memory distribution (comma-separated ratios). Leave empty for auto. 
              <Tooltip text="Example for 4 GPUs: 0.25,0.25,0.25,0.25 (equal split)" />
            </p>
          </label>
          
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




