'use client';

import React from 'react';

interface ModeSelectionProps {
  mode: 'online' | 'offline';
  onChange: (mode: 'online' | 'offline') => void;
  engineType: 'vllm' | 'llamacpp' | undefined;
  modeLocked?: boolean;
}

export function ModeSelection({ mode, onChange, engineType, modeLocked }: ModeSelectionProps) {
  if (!engineType || modeLocked) return null;

  return (
    <div className="md:col-span-2">
      <div className="text-xs font-medium text-white/70 mb-1">
        <span className="text-blue-400">Step 2:</span> Model Source
      </div>
      <div className="inline-flex items-center gap-3 text-xs">
        <label className="inline-flex items-center gap-1">
          <input 
            type="radio" 
            name="mode" 
            checked={mode === 'online'} 
            onChange={() => onChange('online')}
            disabled={engineType === 'llamacpp'}
          /> 
          Online (Hugging Face)
          {engineType === 'llamacpp' && (
            <span className="text-amber-300 text-[10px]">(Not available for llama.cpp)</span>
          )}
        </label>
        <label className="inline-flex items-center gap-1">
          <input 
            type="radio" 
            name="mode" 
            checked={mode === 'offline'} 
            onChange={() => onChange('offline')} 
          /> 
          Offline (Local Folder)
        </label>
      </div>
    </div>
  );
}


