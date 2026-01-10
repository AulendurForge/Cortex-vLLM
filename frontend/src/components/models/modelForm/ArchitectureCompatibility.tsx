/**
 * ArchitectureCompatibility - Gap #11: GGUF Compatibility Matrix
 * 
 * Displays architecture compatibility information for vLLM and llama.cpp engines.
 * Helps users understand what level of support their model architecture has.
 */

import React from 'react';

export type SupportLevel = 'full' | 'partial' | 'experimental' | 'none' | 'unknown';

export interface ArchCompatibility {
  vllm: SupportLevel;
  llamacpp: SupportLevel;
  notes?: string;
}

/**
 * Compatibility matrix for model architectures
 * Based on vLLM supported models and llama.cpp model support
 */
export const ARCHITECTURE_COMPATIBILITY: Record<string, ArchCompatibility> = {
  // LLaMA family
  'llama': { vllm: 'full', llamacpp: 'full' },
  'llama2': { vllm: 'full', llamacpp: 'full' },
  'llama3': { vllm: 'full', llamacpp: 'full' },
  'codellama': { vllm: 'full', llamacpp: 'full' },
  
  // Mistral family
  'mistral': { vllm: 'full', llamacpp: 'full' },
  'mixtral': { vllm: 'full', llamacpp: 'full', notes: 'MoE architecture' },
  
  // Qwen family
  'qwen': { vllm: 'full', llamacpp: 'full' },
  'qwen2': { vllm: 'full', llamacpp: 'full' },
  'qwen2vl': { vllm: 'full', llamacpp: 'partial', notes: 'Vision features limited in llama.cpp' },
  
  // Google/DeepMind
  'gemma': { vllm: 'full', llamacpp: 'full' },
  'gemma2': { vllm: 'full', llamacpp: 'full' },
  
  // Microsoft
  'phi': { vllm: 'full', llamacpp: 'full' },
  'phi2': { vllm: 'full', llamacpp: 'full' },
  'phi3': { vllm: 'full', llamacpp: 'full' },
  'phi4': { vllm: 'full', llamacpp: 'full' },
  
  // Stability AI
  'stablelm': { vllm: 'full', llamacpp: 'full' },
  'starcoder': { vllm: 'full', llamacpp: 'full' },
  'starcoder2': { vllm: 'full', llamacpp: 'full' },
  
  // Other popular
  'falcon': { vllm: 'full', llamacpp: 'full' },
  'mpt': { vllm: 'full', llamacpp: 'full' },
  'bloom': { vllm: 'full', llamacpp: 'full' },
  'opt': { vllm: 'full', llamacpp: 'partial' },
  'gpt2': { vllm: 'full', llamacpp: 'full' },
  'gptneox': { vllm: 'full', llamacpp: 'full' },
  'gptj': { vllm: 'full', llamacpp: 'full' },
  'baichuan': { vllm: 'full', llamacpp: 'full' },
  'yi': { vllm: 'full', llamacpp: 'full' },
  'deepseek': { vllm: 'full', llamacpp: 'full' },
  'deepseekv2': { vllm: 'full', llamacpp: 'full' },
  'internlm': { vllm: 'full', llamacpp: 'full' },
  'internlm2': { vllm: 'full', llamacpp: 'full' },
  'chatglm': { vllm: 'partial', llamacpp: 'full', notes: 'vLLM support may vary by version' },
  'glm4': { vllm: 'full', llamacpp: 'full' },
  
  // Architectures with limited support
  'mamba': { vllm: 'experimental', llamacpp: 'full', notes: 'State-space model' },
  'mamba2': { vllm: 'experimental', llamacpp: 'full', notes: 'State-space model' },
  'rwkv': { vllm: 'none', llamacpp: 'partial', notes: 'RNN architecture' },
  'rwkv4': { vllm: 'none', llamacpp: 'partial', notes: 'RNN architecture' },
  'rwkv5': { vllm: 'none', llamacpp: 'partial', notes: 'RNN architecture' },
  
  // GPT-OSS / Harmony (Custom)
  'harmony': { vllm: 'none', llamacpp: 'full', notes: 'GPT-OSS custom architecture - llama.cpp only' },
  'gptoss': { vllm: 'none', llamacpp: 'full', notes: 'GPT-OSS custom architecture - llama.cpp only' },
  
  // Multimodal (limited GGUF support generally)
  'llava': { vllm: 'full', llamacpp: 'full', notes: 'Vision-language model' },
  'llava-next': { vllm: 'full', llamacpp: 'partial', notes: 'Vision features may vary' },
  'bakllava': { vllm: 'full', llamacpp: 'full' },
  'minicpm-v': { vllm: 'full', llamacpp: 'partial' },
  'fuyu': { vllm: 'partial', llamacpp: 'none' },
  'paligemma': { vllm: 'full', llamacpp: 'partial' },
  'pixtral': { vllm: 'full', llamacpp: 'none' },
  
  // Embedding models
  'bert': { vllm: 'none', llamacpp: 'full', notes: 'Embedding model only' },
  'nomic-bert': { vllm: 'none', llamacpp: 'full', notes: 'Embedding model' },
  'jina': { vllm: 'none', llamacpp: 'partial', notes: 'Embedding model' },
};

/**
 * Normalize architecture name for lookup
 */
export function normalizeArchName(arch: string | null | undefined): string {
  if (!arch) return '';
  
  // Lowercase and remove common suffixes/prefixes
  let normalized = arch.toLowerCase()
    .replace(/^(microsoft|meta|google|alibaba|01-ai|stability|bigscience|nomic-ai|jinaai|mistralai)[-_/]?/i, '')
    .replace(/[-_.]?for[-_.]?(causal|sequence|token|masked)[-_.]?(lm|classification|generation)?$/i, '')
    .replace(/[-_.]?(instruct|chat|base|hf|gguf)$/i, '')
    .replace(/[-_]v?\d+(\.\d+)?$/i, '')  // Remove version numbers
    .replace(/[-_]/g, '')
    .trim();
  
  // Handle specific mappings
  const mappings: Record<string, string> = {
    'llamaforcausallm': 'llama',
    'llama2': 'llama',
    'llama3': 'llama',
    'codellamaforcausallm': 'codellama',
    'mistralforcausallm': 'mistral',
    'mixtralformoe': 'mixtral',
    'qwen2forcausallm': 'qwen2',
    'gemmaforcausallm': 'gemma',
    'gemma2forcausallm': 'gemma2',
    'phi3forcausallm': 'phi3',
    'phiforcausallm': 'phi',
    'stablelmforcausallm': 'stablelm',
    'starcodermoeforcausallm': 'starcoder2',
    'gpt2lmhead': 'gpt2',
    'gptneoxforcausallm': 'gptneox',
    'gptjforcausallm': 'gptj',
    'falconforcausallm': 'falcon',
    'mptforcausallm': 'mpt',
    'bloomforcausallm': 'bloom',
    'internlm2forcausallm': 'internlm2',
    'chatglmforcondgen': 'chatglm',
    'glm4forcausallm': 'glm4',
    'deepseekv2forcausallm': 'deepseekv2',
    'mambaformcausallm': 'mamba',
    'rwkv4forcausallm': 'rwkv4',
    'llavaforcondgen': 'llava',
    'llavanextforcondgen': 'llava-next',
    // GPT-OSS / Harmony
    'gptoss': 'harmony',
    'gptoss120b': 'harmony',
    'gptoss20b': 'harmony',
  };
  
  return mappings[normalized] || normalized;
}

/**
 * Get compatibility info for an architecture
 */
export function getArchCompatibility(arch: string | null | undefined): ArchCompatibility {
  const normalized = normalizeArchName(arch);
  return ARCHITECTURE_COMPATIBILITY[normalized] || { vllm: 'unknown', llamacpp: 'unknown' };
}

/**
 * Get support level badge color
 */
function getSupportColor(level: SupportLevel): string {
  switch (level) {
    case 'full':
      return 'bg-green-500/10 text-green-300 border-green-500/20';
    case 'partial':
      return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20';
    case 'experimental':
      return 'bg-orange-500/10 text-orange-300 border-orange-500/20';
    case 'none':
      return 'bg-red-500/10 text-red-300 border-red-500/20';
    default:
      return 'bg-gray-500/10 text-gray-300 border-gray-500/20';
  }
}

/**
 * Get support level icon
 */
function getSupportIcon(level: SupportLevel): string {
  switch (level) {
    case 'full':
      return '✓';
    case 'partial':
      return '◐';
    case 'experimental':
      return '⚡';
    case 'none':
      return '✗';
    default:
      return '?';
  }
}

/**
 * Get support level label
 */
function getSupportLabel(level: SupportLevel): string {
  switch (level) {
    case 'full':
      return 'Full Support';
    case 'partial':
      return 'Partial';
    case 'experimental':
      return 'Experimental';
    case 'none':
      return 'Not Supported';
    default:
      return 'Unknown';
  }
}

interface ArchitectureCompatibilityBadgeProps {
  architecture: string | null | undefined;
  engine?: 'vllm' | 'llamacpp' | 'both';
  compact?: boolean;
}

/**
 * Display a compatibility badge for a specific architecture and engine
 */
export function ArchitectureCompatibilityBadge({ 
  architecture, 
  engine = 'both',
  compact = false 
}: ArchitectureCompatibilityBadgeProps) {
  if (!architecture) return null;
  
  const compat = getArchCompatibility(architecture);
  
  if (engine === 'both') {
    return (
      <div className="flex items-center gap-1.5">
        <span 
          className={`px-1.5 py-0.5 rounded border text-[10px] ${getSupportColor(compat.vllm)}`}
          title={`vLLM: ${getSupportLabel(compat.vllm)}${compat.notes ? ` - ${compat.notes}` : ''}`}
        >
          {getSupportIcon(compat.vllm)} vLLM
        </span>
        <span 
          className={`px-1.5 py-0.5 rounded border text-[10px] ${getSupportColor(compat.llamacpp)}`}
          title={`llama.cpp: ${getSupportLabel(compat.llamacpp)}${compat.notes ? ` - ${compat.notes}` : ''}`}
        >
          {getSupportIcon(compat.llamacpp)} llama.cpp
        </span>
      </div>
    );
  }
  
  const level = engine === 'vllm' ? compat.vllm : compat.llamacpp;
  const engineLabel = engine === 'vllm' ? 'vLLM' : 'llama.cpp';
  
  if (compact) {
    return (
      <span 
        className={`px-1.5 py-0.5 rounded border text-[10px] ${getSupportColor(level)}`}
        title={`${engineLabel}: ${getSupportLabel(level)}${compat.notes ? ` - ${compat.notes}` : ''}`}
      >
        {getSupportIcon(level)}
      </span>
    );
  }
  
  return (
    <span 
      className={`px-1.5 py-0.5 rounded border text-[10px] ${getSupportColor(level)}`}
      title={`${engineLabel}: ${getSupportLabel(level)}${compat.notes ? ` - ${compat.notes}` : ''}`}
    >
      {getSupportIcon(level)} {getSupportLabel(level)}
    </span>
  );
}

interface ArchitectureCompatibilityInfoProps {
  architecture: string | null | undefined;
  selectedEngine?: 'vllm' | 'llamacpp';
}

/**
 * Display compatibility info with warning if selected engine has issues
 */
export function ArchitectureCompatibilityInfo({ 
  architecture, 
  selectedEngine 
}: ArchitectureCompatibilityInfoProps) {
  if (!architecture) return null;
  
  const compat = getArchCompatibility(architecture);
  const selectedLevel = selectedEngine === 'vllm' ? compat.vllm : selectedEngine === 'llamacpp' ? compat.llamacpp : null;
  const otherEngine = selectedEngine === 'vllm' ? 'llamacpp' : 'vllm';
  const otherLevel = selectedEngine === 'vllm' ? compat.llamacpp : compat.vllm;
  
  // Show warning if selected engine has issues but other engine is better
  const showWarning = selectedEngine && (selectedLevel === 'none' || selectedLevel === 'partial' || selectedLevel === 'experimental') && 
                      (otherLevel === 'full' || (selectedLevel === 'none' && otherLevel !== 'none'));
  
  return (
    <div className="space-y-1">
      {/* Compatibility badges */}
      <ArchitectureCompatibilityBadge architecture={architecture} />
      
      {/* Warning message */}
      {showWarning && (
        <div className={`text-[11px] px-2 py-1 rounded border ${
          selectedLevel === 'none' 
            ? 'bg-red-500/10 text-red-300 border-red-500/20' 
            : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
        }`}>
          {selectedLevel === 'none' ? '⚠️' : '💡'} This architecture has {getSupportLabel(selectedLevel!).toLowerCase()} in {selectedEngine === 'vllm' ? 'vLLM' : 'llama.cpp'}
          {otherLevel === 'full' && `, but full support in ${otherEngine === 'vllm' ? 'vLLM' : 'llama.cpp'}`}.
          {compat.notes && ` Note: ${compat.notes}`}
        </div>
      )}
    </div>
  );
}

