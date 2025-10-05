'use client';

import React from 'react';
import { Tooltip } from '../../Tooltip';

interface EngineSelectionProps {
  engineType: 'vllm' | 'llamacpp' | undefined;
  onChange: (engineType: 'vllm' | 'llamacpp') => void;
  mode: 'online' | 'offline';
  onModeChange: (mode: 'offline') => void;
  modeLocked?: boolean;
}

export function EngineSelection({ engineType, onChange, mode, onModeChange, modeLocked }: EngineSelectionProps) {
  if (modeLocked) return null;

  return (
    <div className="md:col-span-2 p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
      <label className="text-sm font-medium flex items-center gap-2">
        <span className="text-blue-400">Step 1:</span> Choose Inference Engine
        <Tooltip text="The engine determines how your model runs. This choice affects which models you can serve and performance characteristics. vLLM offers best performance for standard models, while llama.cpp enables GPT-OSS 120B and GGUF models." />
      </label>
      <select 
        className="input mt-2 font-medium" 
        value={engineType || ''} 
        onChange={(e) => {
          const newEngine = e.target.value as 'vllm' | 'llamacpp';
          onChange(newEngine);
          // Auto-switch to offline mode for llama.cpp (required)
          if (newEngine === 'llamacpp' && mode === 'online') {
            onModeChange('offline');
          }
        }}
      >
        <option value="" disabled>Select an engine to begin...</option>
        <option value="vllm">vLLM - Best Performance (Llama, Mistral, Qwen, etc.)</option>
        <option value="llamacpp">llama.cpp - For GPT-OSS 120B & GGUF Models (Offline Only)</option>
      </select>
      
      <details className="text-[11px] text-white/60 mt-2">
        <summary className="cursor-pointer hover:text-white/80 font-medium">📖 How to choose the right engine</summary>
        <div className="mt-3 space-y-3 bg-white/5 p-3 rounded border border-white/10">
          <div>
            <div className="text-emerald-300 font-medium mb-1">✅ Choose vLLM if you have:</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>A standard model on HuggingFace (Llama 3, Mistral, Qwen, Phi, Gemma, etc.)</li>
              <li>Need for maximum throughput (50-70 tokens/sec per request)</li>
              <li>Many concurrent users (40+ simultaneous requests)</li>
              <li>Sufficient GPU VRAM (PagedAttention is very memory efficient)</li>
            </ul>
          </div>
          <div>
            <div className="text-emerald-300 font-medium mb-1">✅ Choose llama.cpp if you have:</div>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-yellow-300">GPT-OSS 120B or 20B models</strong> (Harmony architecture - vLLM cannot load these!)</li>
              <li>A GGUF-only model (no HuggingFace checkpoint available)</li>
              <li>A custom/experimental architecture not supported by vLLM</li>
              <li>Need for aggressive quantization (Q4_K_M, Q5_K_M for tight VRAM)</li>
              <li>CPU+GPU hybrid inference requirements</li>
            </ul>
          </div>
          <div className="mt-2 text-xs text-amber-200 bg-amber-500/10 p-2 rounded">
            <strong>💡 Pro Tip:</strong> If your model is on HuggingFace and is NOT GPT-OSS, choose vLLM for 2-3x better performance.
            llama.cpp was added specifically to support GPT-OSS models that vLLM cannot handle.
          </div>
        </div>
      </details>
    </div>
  );
}



