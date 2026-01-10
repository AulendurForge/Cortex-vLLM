'use client';

import React from 'react';
import { ArchitectureCompatibilityBadge } from './ArchitectureCompatibility';

/**
 * GGUF metadata extracted from file headers (Gap #3)
 */
interface GGUFMetadata {
  architecture: string | null;
  model_name: string | null;
  context_length: number | null;
  embedding_length: number | null;  // hidden_size
  block_count: number | null;       // num_layers
  attention_head_count: number | null;
  attention_head_count_kv: number | null;  // for GQA
  vocab_size: number | null;
  file_type: number | null;
  quantization_version: number | null;
  file_type_name: string | null;
}

interface GGUFGroup {
  quant_type: string;
  display_name: string;
  files: string[];
  full_paths: string[];
  is_multipart: boolean;
  expected_parts: number | null;
  actual_parts: number;
  total_size_mb: number;
  status: string;
  can_use: boolean;
  warning: string | null;
  is_recommended: boolean;
  // Gap #3: GGUF metadata
  metadata?: GGUFMetadata | null;
}

interface GGUFGroupSelectorProps {
  groups: GGUFGroup[];
  selectedGroup: string;
  onSelectGroup: (quantType: string, firstFile: string) => void;
  onShowMergeHelp: () => void;
}

/**
 * Quantization quality/speed information
 * Higher quality = more bits, better output, but larger size and slower
 * Higher speed = faster inference, but may sacrifice quality
 */
interface QuantInfo {
  quality: number;  // 1-5 scale
  speed: number;    // 1-5 scale
  bits: string;     // Approximate bits per weight
  description: string;
  color: string;    // Tailwind color for badge
}

const QUANT_INFO: Record<string, QuantInfo> = {
  // Full precision
  'F32': { quality: 5, speed: 1, bits: '32', description: 'Full precision - maximum quality, very large', color: 'purple' },
  'F16': { quality: 5, speed: 2, bits: '16', description: 'Half precision - excellent quality, large size', color: 'purple' },
  'BF16': { quality: 5, speed: 2, bits: '16', description: 'Brain float - excellent for training models', color: 'purple' },
  
  // 8-bit quantization
  'Q8_0': { quality: 5, speed: 3, bits: '8', description: 'Best quantized quality, ~2x smaller than F16', color: 'emerald' },
  'Q8_1': { quality: 5, speed: 3, bits: '8', description: 'Similar to Q8_0 with different rounding', color: 'emerald' },
  
  // 6-bit quantization
  'Q6_K': { quality: 4, speed: 3, bits: '6.5', description: 'Very high quality, good balance', color: 'cyan' },
  
  // 5-bit quantization
  'Q5_K_M': { quality: 4, speed: 4, bits: '5.5', description: 'Great quality/size balance - popular choice', color: 'cyan' },
  'Q5_K_S': { quality: 4, speed: 4, bits: '5.5', description: 'Slightly smaller than Q5_K_M', color: 'cyan' },
  'Q5_K_L': { quality: 4, speed: 4, bits: '5.5', description: 'Slightly larger than Q5_K_M', color: 'cyan' },
  'Q5_K': { quality: 4, speed: 4, bits: '5.5', description: 'Good quality 5-bit quantization', color: 'cyan' },
  'Q5_0': { quality: 4, speed: 4, bits: '5', description: 'Basic 5-bit quantization', color: 'cyan' },
  'Q5_1': { quality: 4, speed: 4, bits: '5', description: 'Alternative 5-bit quantization', color: 'cyan' },
  
  // 4-bit quantization
  'Q4_K_M': { quality: 3, speed: 5, bits: '4.5', description: 'Best 4-bit quality - recommended for VRAM constrained', color: 'amber' },
  'Q4_K_S': { quality: 3, speed: 5, bits: '4.5', description: 'Smaller than Q4_K_M, slightly lower quality', color: 'amber' },
  'Q4_K_L': { quality: 3, speed: 5, bits: '4.5', description: 'Larger than Q4_K_M', color: 'amber' },
  'Q4_K': { quality: 3, speed: 5, bits: '4.5', description: 'Good 4-bit quantization', color: 'amber' },
  'Q4_0': { quality: 3, speed: 5, bits: '4', description: 'Basic 4-bit, fast but lower quality', color: 'amber' },
  'Q4_1': { quality: 3, speed: 5, bits: '4', description: 'Alternative 4-bit quantization', color: 'amber' },
  
  // 3-bit and lower (aggressive quantization)
  'Q3_K_M': { quality: 2, speed: 5, bits: '3.5', description: 'Aggressive - noticeable quality loss', color: 'orange' },
  'Q3_K_S': { quality: 2, speed: 5, bits: '3.5', description: 'Very aggressive quantization', color: 'orange' },
  'Q3_K_L': { quality: 2, speed: 5, bits: '3.5', description: 'Slightly better Q3 variant', color: 'orange' },
  'Q2_K': { quality: 1, speed: 5, bits: '2.5', description: 'Extreme quantization - significant quality loss', color: 'red' },
  
  // iQuants (importance-weighted)
  'IQ4_XS': { quality: 3, speed: 5, bits: '4.25', description: 'Importance-weighted 4-bit, better quality/size', color: 'blue' },
  'IQ4_NL': { quality: 3, speed: 5, bits: '4.5', description: 'Non-linear importance-weighted 4-bit', color: 'blue' },
  'IQ3_XXS': { quality: 2, speed: 5, bits: '3.0', description: 'Smallest iQuant, aggressive', color: 'orange' },
  'IQ3_XS': { quality: 2, speed: 5, bits: '3.3', description: 'Very small iQuant', color: 'orange' },
  'IQ2_XXS': { quality: 1, speed: 5, bits: '2.0', description: 'Extreme iQuant - experimental', color: 'red' },
};

function getQuantInfo(quantType: string): QuantInfo | null {
  // Try exact match first
  if (QUANT_INFO[quantType]) {
    return QUANT_INFO[quantType];
  }
  // Try normalized (uppercase, no dashes)
  const normalized = quantType.toUpperCase().replace(/-/g, '_');
  if (QUANT_INFO[normalized]) {
    return QUANT_INFO[normalized];
  }
  return null;
}

function QualityBars({ value, max = 5, type }: { value: number; max?: number; type: 'quality' | 'speed' }) {
  // Use static classes for Tailwind JIT compatibility
  const activeColor = type === 'quality' ? 'bg-emerald-400' : 'bg-blue-400';
  
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <div
          key={i}
          className={`w-1.5 h-3 rounded-sm ${i < value ? activeColor : 'bg-white/20'}`}
        />
      ))}
    </div>
  );
}

function QuantizationBadge({ quantType }: { quantType: string }) {
  const info = getQuantInfo(quantType);
  if (!info) return null;

  return (
    <div className="flex items-center gap-3 text-[10px] text-white/70 mt-1">
      <div className="flex items-center gap-1" title={`Quality: ${info.quality}/5 - Higher = better output quality`}>
        <span className="text-white/50">Quality:</span>
        <QualityBars value={info.quality} type="quality" />
      </div>
      <div className="flex items-center gap-1" title={`Speed: ${info.speed}/5 - Higher = faster inference`}>
        <span className="text-white/50">Speed:</span>
        <QualityBars value={info.speed} type="speed" />
      </div>
      <span className="text-white/40">~{info.bits} bits/weight</span>
    </div>
  );
}

/**
 * Display GGUF metadata in a compact format (Gap #3)
 */
function MetadataBadges({ metadata }: { metadata: GGUFMetadata | null | undefined }) {
  if (!metadata) return null;
  
  const badges: { label: string; value: string; title: string; color: string }[] = [];
  
  // Architecture badge
  if (metadata.architecture) {
    badges.push({
      label: 'Arch',
      value: metadata.architecture,
      title: 'Model architecture',
      color: 'purple'
    });
  }
  
  // Context length badge
  if (metadata.context_length) {
    const ctxK = Math.round(metadata.context_length / 1024);
    badges.push({
      label: 'Ctx',
      value: `${ctxK}K`,
      title: `Context length: ${metadata.context_length.toLocaleString()} tokens`,
      color: 'cyan'
    });
  }
  
  // Layers badge
  if (metadata.block_count) {
    badges.push({
      label: 'Layers',
      value: `${metadata.block_count}`,
      title: `Number of transformer blocks/layers`,
      color: 'blue'
    });
  }
  
  // Hidden size / embedding dimension
  if (metadata.embedding_length) {
    badges.push({
      label: 'Hidden',
      value: metadata.embedding_length.toLocaleString(),
      title: `Hidden size (embedding dimension): ${metadata.embedding_length}`,
      color: 'indigo'
    });
  }
  
  // Attention heads (show GQA ratio if applicable)
  if (metadata.attention_head_count) {
    let headsDisplay = `${metadata.attention_head_count}`;
    let headsTitle = `Attention heads: ${metadata.attention_head_count}`;
    
    if (metadata.attention_head_count_kv && metadata.attention_head_count_kv !== metadata.attention_head_count) {
      headsDisplay = `${metadata.attention_head_count}/${metadata.attention_head_count_kv}`;
      headsTitle = `Attention heads: ${metadata.attention_head_count} Q / ${metadata.attention_head_count_kv} KV (GQA)`;
    }
    
    badges.push({
      label: 'Heads',
      value: headsDisplay,
      title: headsTitle,
      color: 'violet'
    });
  }
  
  // Vocab size
  if (metadata.vocab_size) {
    const vocabK = Math.round(metadata.vocab_size / 1000);
    badges.push({
      label: 'Vocab',
      value: `${vocabK}K`,
      title: `Vocabulary size: ${metadata.vocab_size.toLocaleString()} tokens`,
      color: 'teal'
    });
  }
  
  if (badges.length === 0) return null;
  
  // Color mapping for Tailwind JIT
  const colorClasses: Record<string, string> = {
    purple: 'bg-purple-500/10 border-purple-500/20 text-purple-300',
    cyan: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300',
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
    indigo: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300',
    violet: 'bg-violet-500/10 border-violet-500/20 text-violet-300',
    teal: 'bg-teal-500/10 border-teal-500/20 text-teal-300',
  };
  
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {badges.map((badge, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium rounded border ${colorClasses[badge.color] || colorClasses.blue}`}
          title={badge.title}
        >
          <span className="opacity-60">{badge.label}:</span>
          <span>{badge.value}</span>
        </span>
      ))}
      {/* Gap #11: Architecture Compatibility Badge */}
      {metadata.architecture && (
        <ArchitectureCompatibilityBadge architecture={metadata.architecture} />
      )}
    </div>
  );
}

export function GGUFGroupSelector({ groups, selectedGroup, onSelectGroup, onShowMergeHelp }: GGUFGroupSelectorProps) {
  if (!groups || groups.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-white/90">Select Quantization Level</div>
        <div className="flex items-center gap-3 text-[10px] text-white/50">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-emerald-400"></span>
            Quality
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-blue-400"></span>
            Speed
          </span>
        </div>
      </div>
      {groups.map((group: GGUFGroup) => {
        const isSelected = selectedGroup === group.quant_type;
        // Allow selection if: ready, OR complete multi-part (will auto-merge)
        const canSelect = group.can_use || group.status === 'complete_but_needs_merge';
        const isDisabled = group.status === 'incomplete' || group.status === 'merged_available';
        
        const statusColor = group.can_use ? 'emerald' : 
                           group.status === 'complete_but_needs_merge' ? 'blue' : 'amber';
        const borderClass = isSelected 
          ? `border-${statusColor}-400` 
          : canSelect 
            ? 'border-white/10 hover:border-white/30' 
            : 'border-amber-500/30';
        
        return (
          <label 
            key={group.quant_type}
            className={`block p-3 rounded border-2 ${borderClass} ${
              canSelect ? 'cursor-pointer bg-white/5 hover:bg-white/10' : 'cursor-not-allowed bg-white/5 opacity-70'
            } transition-all`}
          >
            <div className="flex items-start gap-3">
              <input 
                type="radio" 
                name="gguf_group"
                checked={isSelected}
                disabled={isDisabled}
                onChange={() => {
                  const firstFile = group.files[0] || '';
                  onSelectGroup(group.quant_type, firstFile);
                }}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-white">{group.display_name}</span>
                  {group.is_recommended && (
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-medium rounded border border-emerald-500/40">
                      RECOMMENDED
                    </span>
                  )}
                  {group.can_use ? (
                    <span className="text-emerald-300 text-xs">✓ Ready</span>
                  ) : (
                    <span className="text-amber-300 text-xs">⚠ {group.status.replace(/_/g, ' ')}</span>
                  )}
                </div>
                
                {/* Quantization quality/speed indicators (Gap #12) */}
                <QuantizationBadge quantType={group.quant_type} />
                
                {/* GGUF Metadata badges (Gap #3) */}
                <MetadataBadges metadata={group.metadata} />
                
                {/* Description tooltip for quantization type */}
                {getQuantInfo(group.quant_type) && (
                  <div className="text-[10px] text-white/50 mt-0.5 italic">
                    {getQuantInfo(group.quant_type)?.description}
                  </div>
                )}
                
                <div className="text-xs text-white/60 mt-1 space-y-0.5">
                  {group.is_multipart ? (
                    <div>Multi-part: {group.actual_parts} files{group.expected_parts && ` (${group.actual_parts}/${group.expected_parts})`}</div>
                  ) : (
                    <div>File: {group.files[0]}</div>
                  )}
                  <div>Size: {group.total_size_mb.toFixed(0)} MB</div>
                </div>
                
                {group.warning && (
                  <div className="text-[11px] text-amber-300 mt-2 flex items-start gap-1">
                    <span>⚠</span>
                    <span>{group.warning}</span>
                    {group.status === 'complete_but_needs_merge' && (
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onShowMergeHelp();
                        }}
                        className="ml-2 underline hover:text-amber-200"
                      >
                        How to merge?
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </label>
        );
      })}
    </div>
  );
}




