'use client';

import React from 'react';

interface MergeInstructionsModalProps {
  open: boolean;
  onClose: () => void;
}

export function MergeInstructionsModal({ open, onClose }: MergeInstructionsModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4" onClick={onClose}>
      <div 
        className="bg-zinc-900 border border-white/20 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-white">How to Merge Multi-Part GGUF Files</h3>
          <button 
            onClick={onClose}
            className="text-white/60 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>
        
        <div className="space-y-4 text-sm text-white/80">
          <p>
            Multi-part GGUF files (e.g., <code className="bg-white/10 px-1.5 py-0.5 rounded">model-Q8_0-00001-of-00006.gguf</code>) 
            will be automatically merged when you start the model.
          </p>
          
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded p-3">
            <div className="font-medium text-emerald-300 mb-2">✨ Automatic Merging</div>
            <p className="mb-2">When you select a multi-part quantization and click "Add Model", Cortex will:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Detect that the GGUF file is split into multiple parts</li>
              <li>Automatically merge all parts into a single file when you start the model</li>
              <li>Store the merged file in the same directory as the parts</li>
              <li>Use the merged file for all future starts (no re-merging needed)</li>
            </ol>
          </div>
          
          <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3">
            <div className="font-medium text-blue-300 mb-2">📌 Manual Merging (Optional)</div>
            <p className="mb-2">If you prefer to merge manually before adding the model:</p>
            <ol className="list-decimal pl-5 space-y-2">
              <li>Install llama.cpp if you haven't already:
                <pre className="bg-black/50 p-2 rounded mt-1 text-xs overflow-x-auto">
{`git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp
make`}
                </pre>
              </li>
              <li>Use the <code className="bg-white/10 px-1 rounded">llama-gguf-split</code> tool to merge:
                <pre className="bg-black/50 p-2 rounded mt-1 text-xs overflow-x-auto">
{`# Syntax:
./llama-gguf-split --merge <input-prefix> <output-file>

# Example:
./llama-gguf-split --merge model-Q8_0-00001-of-00006.gguf model-Q8_0-merged.gguf`}
                </pre>
              </li>
            </ol>
          </div>
          
          <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3">
            <div className="font-medium text-amber-300 mb-2">ℹ️ Alternative: Binary concatenation</div>
            <p className="mb-2">On Linux/Mac, you can also use <code className="bg-white/10 px-1 rounded">cat</code>:</p>
            <pre className="bg-black/50 p-2 rounded text-xs overflow-x-auto">
{`# Navigate to the directory
cd /path/to/model/directory

# Concatenate all parts in order
cat model-Q8_0-00001-of-00006.gguf \\
    model-Q8_0-00002-of-00006.gguf \\
    model-Q8_0-00003-of-00006.gguf \\
    model-Q8_0-00004-of-00006.gguf \\
    model-Q8_0-00005-of-00006.gguf \\
    model-Q8_0-00006-of-00006.gguf \\
    > model-Q8_0-merged.gguf`}
            </pre>
          </div>
          
          <div className="pt-3 border-t border-white/10 flex justify-end">
            <button 
              onClick={onClose}
              className="px-4 py-2 bg-blue-500/20 border border-blue-500/40 rounded hover:bg-blue-500/30 text-white"
            >
              Got it!
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


