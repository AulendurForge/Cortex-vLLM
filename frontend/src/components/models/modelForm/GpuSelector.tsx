'use client';

import React from 'react';
import { Tooltip } from '../../Tooltip';

interface GpuInfo {
  index: number;
  name?: string;
  mem_total_mb?: number;
  mem_used_mb?: number;
}

interface GpuSelectorProps {
  selectedGpus: number[];
  onGpuSelectionChange: (gpuIndices: number[]) => void;
  gpuInfo?: GpuInfo[];
  engineType: 'vllm' | 'llamacpp';
  maxGpus?: number;
}

export function GpuSelector({ 
  selectedGpus, 
  onGpuSelectionChange, 
  gpuInfo = [], 
  engineType,
  maxGpus = 8 
}: GpuSelectorProps) {
  const handleGpuToggle = (gpuIndex: number) => {
    if (selectedGpus.includes(gpuIndex)) {
      // Remove GPU from selection
      onGpuSelectionChange(selectedGpus.filter(i => i !== gpuIndex));
    } else {
      // Add GPU to selection (respect max limit)
      if (selectedGpus.length < maxGpus) {
        onGpuSelectionChange([...selectedGpus, gpuIndex].sort());
      }
    }
  };

  const handleSelectAll = () => {
    const availableGpus = gpuInfo.length > 0 ? gpuInfo.map(g => g.index) : Array.from({ length: maxGpus }, (_, i) => i);
    const gpusToSelect = availableGpus.slice(0, maxGpus);
    onGpuSelectionChange(gpusToSelect);
  };

  const handleSelectNone = () => {
    onGpuSelectionChange([]);
  };

  const getGpuDisplayName = (index: number) => {
    const gpu = gpuInfo.find(g => g.index === index);
    if (gpu?.name) {
      return `GPU ${index} • ${gpu.name}`;
    }
    return `GPU ${index}`;
  };

  const getGpuMemoryInfo = (index: number) => {
    const gpu = gpuInfo.find(g => g.index === index);
    if (gpu?.mem_total_mb) {
      const totalGb = (gpu.mem_total_mb / 1024).toFixed(1);
      const usedGb = gpu.mem_used_mb ? (gpu.mem_used_mb / 1024).toFixed(1) : '0.0';
      return `${usedGb}/${totalGb} GiB`;
    }
    return '';
  };

  const isAtMaxSelection = selectedGpus.length >= maxGpus;
  const isAtMinSelection = selectedGpus.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-white/70">
          GPU Selection
          <Tooltip text={
            engineType === 'vllm' 
              ? 'Select which GPUs to use for tensor parallelism. The model will be split across selected GPUs.'
              : 'Select which GPUs to use for model distribution. llama.cpp will distribute the model across selected GPUs.'
          } />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSelectAll}
            disabled={isAtMaxSelection}
            className="text-xs px-2 py-1 bg-blue-500/20 border border-blue-500/40 rounded hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={handleSelectNone}
            disabled={isAtMinSelection}
            className="text-xs px-2 py-1 bg-gray-500/20 border border-gray-500/40 rounded hover:bg-gray-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Select None
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {Array.from({ length: maxGpus }, (_, index) => {
          const isSelected = selectedGpus.includes(index);
          const isDisabled = !isSelected && isAtMaxSelection;
          const memoryInfo = getGpuMemoryInfo(index);
          
          return (
            <label
              key={index}
              className={`
                flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors
                ${isSelected 
                  ? 'bg-green-500/20 border-green-500/40 text-green-200' 
                  : isDisabled
                    ? 'bg-gray-500/10 border-gray-500/20 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-800/50 border-gray-600/40 text-white hover:bg-gray-700/50'
                }
              `}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleGpuToggle(index)}
                disabled={isDisabled}
                className="rounded border-gray-400 text-green-600 focus:ring-green-500"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">
                  {getGpuDisplayName(index)}
                </div>
                {memoryInfo && (
                  <div className="text-xs text-white/60">
                    {memoryInfo}
                  </div>
                )}
              </div>
            </label>
          );
        })}
      </div>

      <div className="text-xs text-white/60">
        Selected: {selectedGpus.length} GPU{selectedGpus.length !== 1 ? 's' : ''} 
        {selectedGpus.length > 0 && (
          <span className="ml-2">
            ({selectedGpus.join(', ')})
          </span>
        )}
        {isAtMaxSelection && (
          <span className="ml-2 text-amber-400">
            • Maximum {maxGpus} GPUs allowed
          </span>
        )}
      </div>

      {engineType === 'vllm' && selectedGpus.length > 1 && (
        <div className="text-xs text-blue-200 bg-blue-500/10 border border-blue-500/30 rounded p-2">
          <div className="font-medium">Tensor Parallelism Active</div>
          <div>Model will be split across {selectedGpus.length} GPUs for improved memory efficiency and potential speedup.</div>
        </div>
      )}

      {engineType === 'llamacpp' && selectedGpus.length > 1 && (
        <div className="text-xs text-green-200 bg-green-500/10 border border-green-500/30 rounded p-2">
          <div className="font-medium">Multi-GPU Distribution Active</div>
          <div>Model will be distributed across {selectedGpus.length} GPUs using tensor split.</div>
        </div>
      )}
    </div>
  );
}
