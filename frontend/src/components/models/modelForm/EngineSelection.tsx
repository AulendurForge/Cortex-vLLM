'use client';

import React from 'react';
import { Tooltip } from '../../Tooltip';

/**
 * Engine recommendation from backend inspect-folder endpoint
 */
interface EngineRecommendation {
  recommended: string;
  reason: string;
  has_multipart_gguf: boolean;
  has_safetensors: boolean;
  has_gguf: boolean;
  vllm_gguf_compatible: boolean;
  options: Array<{
    engine: string;
    format: string;
    label: string;
    description: string;
    is_recommended: boolean;
  }>;
}

interface EngineSelectionProps {
  engineType: 'vllm' | 'llamacpp' | undefined;
  onChange: (engineType: 'vllm' | 'llamacpp') => void;
  mode: 'online' | 'offline';
  onModeChange: (mode: 'offline') => void;
  modeLocked?: boolean;
  // Optional: folder inspection result for smart recommendations
  engineRecommendation?: EngineRecommendation | null;
}

export function EngineSelection({ 
  engineType, 
  onChange, 
  mode, 
  onModeChange, 
  modeLocked,
  engineRecommendation 
}: EngineSelectionProps) {
  if (modeLocked) return null;

  // Determine if current selection conflicts with recommendation
  const hasConflict = engineRecommendation && 
    engineType === 'vllm' && 
    engineRecommendation.has_multipart_gguf && 
    !engineRecommendation.has_safetensors;

  return (
    <div className={`md:col-span-2 p-4 rounded-lg border transition-colors ${
      hasConflict 
        ? 'bg-amber-500/5 border-amber-500/30' 
        : 'bg-blue-500/5 border-blue-500/20'
    }`}>
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
      
      {/* Smart recommendation badge based on folder inspection */}
      {engineRecommendation && mode === 'offline' && (
        <div className="mt-2">
          {engineRecommendation.recommended === 'llamacpp' && engineType !== 'llamacpp' && (
            <div className="inline-flex items-center gap-2 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20">
              <span className="text-amber-400 text-xs">💡</span>
              <span className="text-amber-200 text-xs">
                {engineRecommendation.has_multipart_gguf 
                  ? 'Multi-part GGUF detected — llama.cpp recommended'
                  : 'GGUF-only folder — llama.cpp recommended'}
              </span>
              <button
                type="button"
                onClick={() => onChange('llamacpp')}
                className="text-amber-300 hover:text-amber-200 underline text-xs ml-1"
              >
                Switch
              </button>
            </div>
          )}
          {engineRecommendation.recommended === 'vllm' && engineType !== 'vllm' && engineRecommendation.has_safetensors && (
            <div className="inline-flex items-center gap-2 px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20">
              <span className="text-blue-400 text-xs">💡</span>
              <span className="text-blue-200 text-xs">SafeTensors available — vLLM recommended for best performance</span>
              <button
                type="button"
                onClick={() => onChange('vllm')}
                className="text-blue-300 hover:text-blue-200 underline text-xs ml-1"
              >
                Switch
              </button>
            </div>
          )}
        </div>
      )}
      
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
              <li className="text-amber-200">⚠️ Note: vLLM GGUF support is experimental and only works with single-file GGUFs</li>
            </ul>
          </div>
          <div>
            <div className="text-emerald-300 font-medium mb-1">✅ Choose llama.cpp if you have:</div>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-yellow-300">GPT-OSS 120B or 20B models</strong> (Harmony architecture - vLLM cannot load these!)</li>
              <li>A GGUF-only model (no HuggingFace checkpoint available)</li>
              <li><strong className="text-cyan-300">Multi-part GGUF files</strong> (native split-file loading support)</li>
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




