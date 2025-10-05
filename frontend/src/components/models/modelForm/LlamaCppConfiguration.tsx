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
      {/* Basic context size */}
      <label className="text-sm">Context Size
        <input 
          className="input mt-1" 
          type="number" 
          min={512} 
          max={131072} 
          step={512} 
          value={values.contextSize ?? 8192} 
          onChange={(e) => onChange('contextSize', Number(e.target.value) || 8192)} 
        />
        <p className="text-[11px] text-white/50 mt-1">
          Maximum context window in tokens. 
          <Tooltip text="Also called '-c'. Controls how much context the model can process. Larger values require more memory." />
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


