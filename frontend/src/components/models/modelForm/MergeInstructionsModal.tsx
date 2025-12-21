'use client';

import React from 'react';
import { Modal } from '../../Modal';
import { Button, InfoBox, SectionTitle } from '../../UI';

interface MergeInstructionsModalProps {
  open: boolean;
  onClose: () => void;
}

export function MergeInstructionsModal({ open, onClose }: MergeInstructionsModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="GGUF Assembly Protocol" variant="center">
      <div className="p-6 space-y-6 max-h-[80vh] overflow-auto custom-scrollbar">
        <header className="space-y-2">
          <p className="text-sm text-white/70 leading-relaxed">
            Multi-part GGUF files (e.g., <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs italic">model-Q8_0-00001-of-00006.gguf</code>) require unification before inference can initialize.
          </p>
        </header>
        
        <section className="space-y-4">
          <SectionTitle variant="purple">✨ Automatic Synchronization</SectionTitle>
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 space-y-3">
            <p className="text-xs text-emerald-300 font-bold uppercase tracking-widest">Logic Flow:</p>
            <ul className="space-y-3">
              {[
                "System detects split GGUF segments in target directory.",
                "Atomic binary merge initiated on first model launch.",
                "Merged artifact cached alongside original segments.",
                "Future initializations bypass merge logic for zero-latency startup."
              ].map((step, idx) => (
                <li key={idx} className="flex gap-3 text-xs text-white/70 leading-relaxed">
                  <span className="flex-shrink-0 w-5 h-5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-[10px] font-bold text-emerald-400">{idx + 1}</span>
                  {step}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="space-y-4">
          <SectionTitle variant="blue">🛠️ Manual Procedures (Optional)</SectionTitle>
          
          <div className="space-y-4">
            <div className="bg-black/20 border border-white/5 rounded-2xl p-5">
              <div className="text-[10px] uppercase font-black text-blue-400 tracking-widest mb-3">Segment Splitting Tool</div>
              <pre className="text-[10px] bg-black/40 rounded-xl p-4 overflow-x-auto border border-white/5 font-mono text-blue-300 leading-relaxed">
{`# Execute unification via llama-gguf-split:
./llama-gguf-split --merge \\
  model-Q8_0-00001-of-00006.gguf \\
  model-Q8_0-merged.gguf`}
              </pre>
            </div>

            <div className="bg-black/20 border border-white/5 rounded-2xl p-5">
              <div className="text-[10px] uppercase font-black text-amber-400 tracking-widest mb-3">Binary Concatenation (POSIX)</div>
              <pre className="text-[10px] bg-black/40 rounded-xl p-4 overflow-x-auto border border-white/5 font-mono text-amber-200/80 leading-relaxed">
{`# Sequence segments into a single pointer:
cat model-Q8_0-00001-of-00006.gguf \\
    model-Q8_0-00002-of-00006.gguf \\
    > model-Q8_0-merged.gguf`}
              </pre>
            </div>
          </div>
        </section>

        <div className="pt-4 border-t border-white/5 flex justify-end">
          <Button variant="primary" onClick={onClose} className="px-10">
            Acknowledge
          </Button>
        </div>
      </div>
    </Modal>
  );
}
