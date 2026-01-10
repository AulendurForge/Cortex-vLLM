'use client';

import React from 'react';

/**
 * Engine recommendation option from backend
 */
interface EngineOption {
  engine: 'vllm' | 'llamacpp';
  format: 'safetensors' | 'gguf';
  label: string;
  description: string;
  is_recommended: boolean;
  requires_merge?: boolean;
}

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
  options: EngineOption[];
}

interface EngineGuidanceProps {
  engineType: 'vllm' | 'llamacpp' | undefined;
  recommendation: EngineRecommendation | null | undefined;
  useGguf: boolean;
  onSwitchEngine: (engine: 'vllm' | 'llamacpp') => void;
  onSwitchToSafeTensors: () => void;
  onShowMergeHelp: () => void;
}

/**
 * Smart engine guidance component that shows contextual recommendations
 * based on folder contents and current engine selection.
 * 
 * Addresses Gap #1 (vLLM GGUF limitations) and Gap #2 (smart engine recommendation)
 */
export function EngineGuidance({
  engineType,
  recommendation,
  useGguf,
  onSwitchEngine,
  onSwitchToSafeTensors,
  onShowMergeHelp,
}: EngineGuidanceProps) {
  if (!recommendation) return null;

  const { has_multipart_gguf, has_safetensors, has_gguf, vllm_gguf_compatible, options } = recommendation;

  // Case 1: vLLM selected with multi-part GGUF (critical warning)
  if (engineType === 'vllm' && has_multipart_gguf && useGguf) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <span className="text-amber-400 text-xl flex-shrink-0">⚠️</span>
          <div className="space-y-1">
            <p className="text-amber-200 font-medium">Multi-part GGUF Incompatible with vLLM</p>
            <p className="text-amber-200/70 text-sm">
              vLLM only supports single-file GGUF models. Your selected GGUF is split into multiple parts.
            </p>
          </div>
        </div>
        
        <div className="space-y-2 ml-8">
          {has_safetensors && (
            <button 
              type="button"
              onClick={onSwitchToSafeTensors}
              className="w-full text-left px-4 py-3 rounded-lg bg-emerald-500/10 
                         border border-emerald-500/30 hover:bg-emerald-500/20 transition group"
            >
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 font-medium">✓ Recommended</span>
                <span className="text-white/90">Use SafeTensors with vLLM</span>
              </div>
              <p className="text-emerald-300/60 text-xs mt-1 group-hover:text-emerald-300/80">
                Best performance, native HuggingFace format support
              </p>
            </button>
          )}
          
          <button 
            type="button"
            onClick={() => onSwitchEngine('llamacpp')}
            className={`w-full text-left px-4 py-3 rounded-lg transition group
                       ${has_safetensors 
                         ? 'bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20' 
                         : 'bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20'}`}
          >
            <div className="flex items-center gap-2">
              <span className={`font-medium ${has_safetensors ? 'text-blue-400' : 'text-emerald-400'}`}>
                {has_safetensors ? '○ Alternative' : '✓ Recommended'}
              </span>
              <span className="text-white/90">Switch to llama.cpp</span>
            </div>
            <p className={`text-xs mt-1 ${has_safetensors ? 'text-blue-300/60 group-hover:text-blue-300/80' : 'text-emerald-300/60 group-hover:text-emerald-300/80'}`}>
              Native multi-part GGUF support, no extra disk space needed
            </p>
          </button>
          
          <details className="text-xs text-white/50 mt-2">
            <summary className="cursor-pointer hover:text-white/70 flex items-center gap-1">
              <span>Manual option: Merge GGUF files first</span>
            </summary>
            <div className="mt-2 p-3 bg-black/30 rounded-lg border border-white/10 space-y-2">
              <p className="text-white/60">
                If you must use vLLM, you can merge the multi-part files into a single GGUF:
              </p>
              <code className="block text-[11px] bg-black/40 px-2 py-1 rounded text-cyan-300/80 font-mono">
                llama-gguf-split --merge part-00001.gguf merged.gguf
              </code>
              <p className="text-white/50">
                ⚠️ Requires 2x disk space. One-time operation.
              </p>
              <button 
                type="button"
                onClick={onShowMergeHelp}
                className="text-cyan-400 hover:text-cyan-300 underline text-xs"
              >
                View detailed merge instructions →
              </button>
            </div>
          </details>
        </div>
      </div>
    );
  }

  // Case 2: vLLM selected with single GGUF when SafeTensors is available (soft suggestion)
  if (engineType === 'vllm' && has_gguf && has_safetensors && useGguf) {
    return (
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <span className="text-blue-400 flex-shrink-0">💡</span>
          <div className="space-y-1">
            <p className="text-blue-200 text-sm">
              <strong>Tip:</strong> SafeTensors detected in this folder. vLLM performs better with SafeTensors than GGUF.
            </p>
            <button 
              type="button"
              onClick={onSwitchToSafeTensors}
              className="text-blue-400 hover:text-blue-300 underline text-sm"
            >
              Switch to SafeTensors for better performance
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Case 3: vLLM selected with GGUF only (no SafeTensors) - show limitations warning
  if (engineType === 'vllm' && has_gguf && !has_safetensors && useGguf) {
    return (
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <span className="text-amber-400/70 flex-shrink-0">ℹ️</span>
          <div className="space-y-2">
            <p className="text-amber-200/80 text-sm">
              <strong>vLLM GGUF Support is Experimental</strong>
            </p>
            <ul className="text-amber-200/60 text-xs space-y-1 list-disc list-inside">
              <li>Performance is lower than native HuggingFace format</li>
              <li>Requires external tokenizer (HF repo ID or local)</li>
              <li>May be incompatible with some vLLM features</li>
            </ul>
            <p className="text-amber-200/60 text-xs">
              Consider using <button 
                type="button"
                onClick={() => onSwitchEngine('llamacpp')}
                className="text-amber-300 hover:text-amber-200 underline"
              >
                llama.cpp
              </button> for optimal GGUF support.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Case 4: llama.cpp selected when SafeTensors available (informational)
  if (engineType === 'llamacpp' && has_safetensors && has_gguf) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <span className="text-white/50 flex-shrink-0">ℹ️</span>
          <p className="text-white/60 text-xs">
            SafeTensors files are also available in this folder. If you need maximum throughput, 
            consider <button 
              type="button"
              onClick={() => {
                onSwitchEngine('vllm');
                onSwitchToSafeTensors();
              }}
              className="text-blue-400 hover:text-blue-300 underline"
            >
              vLLM with SafeTensors
            </button>.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * Compact badge showing current engine/format recommendation status
 */
export function EngineRecommendationBadge({ 
  recommendation,
  engineType,
  useGguf,
}: { 
  recommendation: EngineRecommendation | null | undefined;
  engineType: 'vllm' | 'llamacpp' | undefined;
  useGguf: boolean;
}) {
  if (!recommendation) return null;

  const { has_multipart_gguf, has_safetensors, recommended } = recommendation;

  // Show warning badge for problematic combinations
  if (engineType === 'vllm' && has_multipart_gguf && useGguf) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-medium">
        ⚠️ Multi-part GGUF incompatible
      </span>
    );
  }

  // Show optimal badge when using recommended configuration
  if (
    (engineType === 'vllm' && !useGguf && has_safetensors) ||
    (engineType === 'llamacpp' && useGguf)
  ) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-medium">
        ✓ Optimal configuration
      </span>
    );
  }

  return null;
}

