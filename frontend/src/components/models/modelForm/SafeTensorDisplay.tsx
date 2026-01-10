/**
 * SafeTensorDisplay - Displays information about SafeTensor model files
 * Similar to GGUFGroupSelector but for SafeTensor/HuggingFace format models
 */

import React from 'react';
import { ArchitectureCompatibilityBadge } from './ArchitectureCompatibility';

interface SafeTensorInfo {
  files: string[];
  total_size_gb: number;
  file_count: number;
  architecture: string | null;
  model_type: string | null;
  vocab_size: number | null;
  max_position_embeddings: number | null;
  torch_dtype: string | null;
  tie_word_embeddings: boolean | null;
}

interface SafeTensorDisplayProps {
  info: SafeTensorInfo;
  hiddenSize?: number | null;
  numLayers?: number | null;
  numHeads?: number | null;
}

function formatSize(gb: number): string {
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(gb * 1024).toFixed(0)} MB`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

// Friendly architecture names
const ARCH_DISPLAY_NAMES: Record<string, string> = {
  'LlamaForCausalLM': 'Llama',
  'MistralForCausalLM': 'Mistral',
  'Qwen2ForCausalLM': 'Qwen2',
  'Phi3ForCausalLM': 'Phi-3',
  'GemmaForCausalLM': 'Gemma',
  'Gemma2ForCausalLM': 'Gemma 2',
  'GPTNeoXForCausalLM': 'GPT-NeoX',
  'FalconForCausalLM': 'Falcon',
  'MPTForCausalLM': 'MPT',
  'StableLmForCausalLM': 'StableLM',
  'StarcoderForCausalLM': 'StarCoder',
  'Starcoder2ForCausalLM': 'StarCoder2',
  'DeepseekForCausalLM': 'DeepSeek',
  'DeepseekV2ForCausalLM': 'DeepSeek V2',
};

function getArchDisplayName(arch: string | null): string {
  if (!arch) return 'Unknown';
  return ARCH_DISPLAY_NAMES[arch] || arch.replace('ForCausalLM', '').replace('For', '');
}

// dtype display with color coding
function DtypeBadge({ dtype }: { dtype: string | null }) {
  if (!dtype) return null;
  
  const colors: Record<string, string> = {
    'float16': 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    'bfloat16': 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
    'float32': 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  };
  
  const colorClass = colors[dtype] || 'bg-gray-500/10 text-gray-300 border-gray-500/20';
  
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] border ${colorClass}`}>
      {dtype}
    </span>
  );
}

export function SafeTensorDisplay({ info, hiddenSize, numLayers, numHeads }: SafeTensorDisplayProps) {
  const archName = getArchDisplayName(info.architecture);
  
  return (
    <div className="space-y-3">
      {/* Header with architecture and size */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
            <span className="text-emerald-400 text-sm">ST</span>
          </div>
          <div>
            <div className="font-medium text-emerald-300">{archName}</div>
            <div className="text-[11px] text-white/50">
              {info.model_type && <span className="mr-2">{info.model_type}</span>}
              SafeTensors format
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-mono text-emerald-300">{formatSize(info.total_size_gb)}</div>
          <div className="text-[10px] text-white/40">{info.file_count} file{info.file_count !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Model metadata badges */}
      <div className="flex flex-wrap gap-2 text-[10px]">
        {info.max_position_embeddings && (
          <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
            Ctx: {Math.round(info.max_position_embeddings / 1024)}K
          </span>
        )}
        {(numLayers || numLayers === 0) && (
          <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
            Layers: {numLayers}
          </span>
        )}
        {(hiddenSize || hiddenSize === 0) && (
          <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
            Hidden: {formatNumber(hiddenSize)}
          </span>
        )}
        {(numHeads || numHeads === 0) && (
          <span className="px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20">
            Heads: {numHeads}
          </span>
        )}
        {info.vocab_size && (
          <span className="px-2 py-0.5 rounded bg-teal-500/10 text-teal-300 border border-teal-500/20">
            Vocab: {formatNumber(info.vocab_size)}
          </span>
        )}
        <DtypeBadge dtype={info.torch_dtype} />
        {info.tie_word_embeddings !== null && (
          <span className={`px-2 py-0.5 rounded border ${
            info.tie_word_embeddings 
              ? 'bg-green-500/10 text-green-300 border-green-500/20' 
              : 'bg-gray-500/10 text-gray-300 border-gray-500/20'
          }`}>
            {info.tie_word_embeddings ? 'Tied Embeddings' : 'Separate Embeddings'}
          </span>
        )}
        {/* Gap #11: Architecture Compatibility */}
        {info.architecture && (
          <ArchitectureCompatibilityBadge architecture={info.architecture} />
        )}
      </div>

      {/* File list (collapsible) */}
      {info.file_count > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-white/40 hover:text-white/60 transition-colors">
            View {info.file_count} SafeTensor file{info.file_count !== 1 ? 's' : ''}
          </summary>
          <div className="mt-2 p-2 rounded bg-black/20 border border-white/5 max-h-32 overflow-y-auto font-mono">
            {info.files.map((f, i) => (
              <div key={i} className="text-white/50 truncate">{f}</div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

