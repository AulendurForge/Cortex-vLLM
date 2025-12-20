'use client';

import React from 'react';
import { Tooltip } from '../../Tooltip';

interface BasicModelInfoProps {
  name: string;
  servedModelName: string;
  task: 'generate' | 'embed';
  engineType: 'vllm' | 'llamacpp' | undefined;
  onNameChange: (value: string) => void;
  onServedModelNameChange: (value: string) => void;
  onTaskChange: (value: 'generate' | 'embed') => void;
  modeLocked?: boolean;
}

export function BasicModelInfo({
  name,
  servedModelName,
  task,
  engineType,
  onNameChange,
  onServedModelNameChange,
  onTaskChange,
  modeLocked = false,
}: BasicModelInfoProps) {
  if (!engineType) return null;

  return (
    <>
      <label className="text-sm">
        Display name <span className="text-red-400">*</span>
        <input 
          className="input mt-1" 
          value={name} 
          onChange={(e) => {
            const v = e.target.value;
            onNameChange(v);
            const derived = (v || '').toLowerCase().replace(/[^a-z0-9\-\_\s]/g, '').replace(/\s+/g, '-');
            onServedModelNameChange(derived);
          }} 
          required 
        />
        <p className="text-[11px] text-white/50 mt-1">Human‑readable model title shown in the UI.</p>
      </label>
      
      <label className="text-sm">
        Served model name <span className="text-red-400">*</span>
        <input 
          className="input mt-1" 
          value={servedModelName} 
          onChange={(e) => onServedModelNameChange(e.target.value)} 
          required 
        />
        <p className="text-[11px] text-white/50 mt-1">
          Identifier used by the OpenAI API. Lowercase, no spaces; we auto‑derive from the display name. 
          <Tooltip text="Also called 'served_model_name'. Clients call with { model: '<served-name>' }. Avoid special characters; use dashes instead of spaces." />
        </p>
      </label>

      <label className="text-sm">
        Task {modeLocked && <span className="text-amber-400 text-xs">(immutable after creation)</span>}
        <select 
          className={`input mt-1 ${modeLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
          value={task} 
          onChange={(e) => onTaskChange(e.target.value as 'generate' | 'embed')}
          disabled={modeLocked}
        >
          <option value="generate">generate</option>
          <option value="embed">embed</option>
        </select>
        <p className="text-[11px] text-white/50 mt-1">
          {modeLocked ? (
            <>Task field is immutable after creation. To change, delete and recreate model.</>
          ) : engineType === 'vllm' ? (
            <>Determines vLLM initialization (--runner pooling for embeddings) and gateway routing.</>
          ) : (
            <>Gateway routing hint. llama.cpp auto-detects model type from GGUF metadata.</>
          )}
        </p>
      </label>

      {/* STEP 3 Header */}
      <div className="md:col-span-2 mt-3 mb-2 text-xs font-medium text-white/70 border-t border-white/10 pt-3">
        <span className="text-blue-400">Step 3:</span> Configure {engineType === 'vllm' ? 'vLLM' : 'llama.cpp'} Settings
      </div>
    </>
  );
}




