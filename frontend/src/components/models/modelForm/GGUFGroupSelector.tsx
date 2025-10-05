'use client';

import React from 'react';

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
}

interface GGUFGroupSelectorProps {
  groups: GGUFGroup[];
  selectedGroup: string;
  onSelectGroup: (quantType: string, firstFile: string) => void;
  onShowMergeHelp: () => void;
}

export function GGUFGroupSelector({ groups, selectedGroup, onSelectGroup, onShowMergeHelp }: GGUFGroupSelectorProps) {
  if (!groups || groups.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-white/90">Select Quantization Level</div>
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

