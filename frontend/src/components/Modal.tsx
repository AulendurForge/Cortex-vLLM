'use client';

import { ReactNode } from 'react';
import { cn } from '../lib/cn';

export function Modal({ 
  open, 
  onClose, 
  title, 
  children, 
  variant = 'center' 
}: { 
  open: boolean; 
  onClose: () => void; 
  title?: string; 
  children: ReactNode; 
  variant?: 'center' | 'fullscreen' | 'workflow' 
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-300">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity" 
        onClick={onClose} 
      />

      {variant === 'fullscreen' ? (
        <div className="relative w-full h-full glass rounded-3xl shadow-2xl text-white overflow-hidden flex flex-col border border-white/10 animate-in zoom-in-95 duration-300">
          <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0">
            <div className="text-sm font-bold uppercase tracking-widest text-white/90">{title}</div>
            <button 
              className="p-1.5 hover:bg-white/10 rounded-xl transition-colors text-white/40 hover:text-white" 
              onClick={onClose} 
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4 custom-scrollbar">{children}</div>
        </div>
      ) : variant === 'workflow' ? (
        <div className="relative glass rounded-[2rem] shadow-2xl max-w-6xl w-full text-white min-h-[70vh] h-[85vh] max-h-[900px] overflow-hidden flex flex-col border border-white/10 animate-in zoom-in-95 duration-300">
          <div className="px-6 py-3.5 border-b border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
              <div className="text-sm font-black uppercase tracking-[0.2em] text-white/90 italic">{title}</div>
            </div>
            <button 
              className="p-1.5 hover:bg-white/10 rounded-xl transition-colors text-white/40 hover:text-white" 
              onClick={onClose} 
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col">{children}</div>
        </div>
      ) : (
        <div className="relative glass rounded-2xl shadow-2xl max-w-2xl w-full mx-2 text-white max-h-[92vh] overflow-hidden flex flex-col border border-white/10 animate-in zoom-in-95 duration-300">
          <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0">
            <div className="text-sm font-bold uppercase tracking-widest text-white/90">{title}</div>
            <button 
              className="p-1.5 hover:bg-white/10 rounded-xl transition-colors text-white/40 hover:text-white" 
              onClick={onClose} 
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4 custom-scrollbar">{children}</div>
        </div>
      )}
    </div>
  );
}
