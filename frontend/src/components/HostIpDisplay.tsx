'use client';

import { useState, useEffect } from 'react';
import { useToast } from '../providers/ToastProvider';

/**
 * Reusable component to display and copy the host IP address
 */
export function HostIpDisplay({ 
  variant = 'inline', 
  showCopy = true,
  className = '' 
}: { 
  variant?: 'inline' | 'card' | 'banner';
  showCopy?: boolean;
  className?: string;
}) {
  const [hostIP, setHostIP] = useState<string>('');
  const { addToast } = useToast();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHostIP(window.location.hostname);
    }
  }, []);

  const copyIP = async () => {
    try {
      await navigator.clipboard.writeText(hostIP);
      addToast({ title: 'IP address copied!', kind: 'success' });
    } catch {
      // Fallback for older browsers
      try {
        const ta = document.createElement('textarea');
        ta.value = hostIP;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        addToast({ title: 'IP address copied!', kind: 'success' });
      } catch {
        addToast({ title: 'Copy failed', kind: 'error' });
      }
    }
  };

  const copyGatewayUrl = async () => {
    const url = `http://${hostIP}:8084`;
    try {
      await navigator.clipboard.writeText(url);
      addToast({ title: 'Gateway URL copied!', kind: 'success' });
    } catch {
      addToast({ title: 'Copy failed', kind: 'error' });
    }
  };

  const copyFrontendUrl = async () => {
    const url = `http://${hostIP}:3001`;
    try {
      await navigator.clipboard.writeText(url);
      addToast({ title: 'UI URL copied!', kind: 'success' });
    } catch {
      addToast({ title: 'Copy failed', kind: 'error' });
    }
  };

  if (!hostIP) return null;

  if (variant === 'banner') {
    return (
      <div className={`bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 ${className}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <div className="text-xs font-medium text-emerald-200 mb-1">Your Cortex Instance</div>
                <div className="flex items-center gap-3 flex-wrap">
              <div>
                <div className="text-[10px] text-white/60">Host IP:</div>
                <code className="text-sm font-mono text-emerald-300 font-semibold">{hostIP}</code>
              </div>
              <div>
                <div className="text-[10px] text-white/60">Gateway:</div>
                <code className="text-sm font-mono text-emerald-300 font-semibold">http://{hostIP}:8084</code>
              </div>
                  <div>
                    <div className="text-[10px] text-white/60">Access Cortex on your network with:</div>
                    <code className="text-sm font-mono text-emerald-300 font-semibold">http://{hostIP}:3001</code>
                  </div>
            </div>
          </div>
          {showCopy && (
            <div className="flex gap-2">
              <button 
                onClick={copyIP}
                className="btn text-xs"
                title="Copy IP address"
              >
                Copy IP
              </button>
              <button 
                onClick={copyGatewayUrl}
                className="btn text-xs"
                title="Copy gateway URL"
              >
                Copy Gateway URL
              </button>
                  <button 
                    onClick={copyFrontendUrl}
                    className="btn text-xs"
                    title="Copy UI URL"
                  >
                    Copy UI URL
                  </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className={`flex flex-col items-center py-3 px-2 bg-white/5 rounded-lg border border-white/10 ${className}`}>
        <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
          Cortex is running on IP:
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm font-mono text-emerald-400 font-medium">
            {hostIP}
          </div>
          {showCopy && (
            <button 
              onClick={copyIP}
              className="text-emerald-400 hover:text-emerald-300 transition-colors"
              title="Copy IP address"
              aria-label="Copy IP"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    );
  }

  // inline variant
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <code className="font-mono text-emerald-400 font-medium">{hostIP}</code>
      {showCopy && (
        <button 
          onClick={copyIP}
          className="text-emerald-400 hover:text-emerald-300 transition-colors"
          title="Copy IP address"
          aria-label="Copy IP"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      )}
    </span>
  );
}

/**
 * Hook to get the host IP programmatically
 */
export function useHostIP(): string {
  const [hostIP, setHostIP] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHostIP(window.location.hostname);
    }
  }, []);

  return hostIP;
}

