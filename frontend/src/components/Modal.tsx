'use client';

import { ReactNode } from 'react';

export function Modal({ open, onClose, title, children, variant = 'center' }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; variant?: 'center' | 'fullscreen' | 'workflow' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {variant === 'fullscreen' ? (
        <div className="relative w-[96vw] h-[92vh] glass rounded-2xl shadow-lg text-white overflow-hidden">
          <div className="px-4 py-3 border-b border-glass font-medium flex items-center justify-between">
            <div>{title}</div>
            <button className="btn" onClick={onClose} aria-label="Close">Close</button>
          </div>
          <div className="p-3 h-[calc(100%-56px)] overflow-auto">{children}</div>
        </div>
      ) : variant === 'workflow' ? (
        <div className="relative glass rounded-2xl shadow-2xl max-w-6xl w-full text-white min-h-[70vh] h-[85vh] max-h-[900px] overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-glass font-medium flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              {title}
            </div>
            <button className="btn btn-sm" onClick={onClose} aria-label="Close">Close</button>
          </div>
          <div className="flex-1 overflow-hidden">{children}</div>
        </div>
      ) : (
        <div className="relative glass rounded-2xl shadow-lg max-w-2xl w-full mx-4 text-white max-h-[92vh] overflow-hidden">
          <div className="px-4 py-3 border-b border-glass font-medium flex items-center justify-between">
            <div>{title}</div>
            <button className="btn" onClick={onClose} aria-label="Close">Close</button>
          </div>
          <div className="p-4 overflow-auto" style={{ maxHeight: 'calc(92vh - 56px)' }}>{children}</div>
        </div>
      )}
    </div>
  );
}


