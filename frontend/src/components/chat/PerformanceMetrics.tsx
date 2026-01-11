/**
 * PerformanceMetrics - Real-time display of streaming metrics.
 */

'use client';

import { ChatMetrics } from '../../hooks/useChat';
import { cn } from '../../lib/cn';

interface PerformanceMetricsProps {
  metrics: ChatMetrics;
  isStreaming: boolean;
}

export function PerformanceMetrics({ metrics, isStreaming }: PerformanceMetricsProps) {
  if (!isStreaming && !metrics.ttftMs) {
    return null;
  }

  return (
    <div className={cn(
      'flex items-center gap-4 px-4 py-2 bg-black/20 border-b border-white/5',
      'text-[11px] font-mono',
      isStreaming && 'animate-pulse'
    )}>
      {/* Streaming indicator */}
      {isStreaming && (
        <div className="flex items-center gap-2 text-teal-400">
          <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
          <span>Streaming</span>
        </div>
      )}

      {/* Tokens per second */}
      {metrics.tokensPerSec > 0 && (
        <div className="flex items-center gap-1.5 text-white/60">
          <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>
            <span className="text-white/80">{metrics.tokensPerSec.toFixed(1)}</span>
            <span className="text-white/40 ml-1">tok/s</span>
          </span>
        </div>
      )}

      {/* Time to first token */}
      {metrics.ttftMs !== null && (
        <div className="flex items-center gap-1.5 text-white/60">
          <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            <span className="text-white/40">TTFT:</span>
            <span className="text-white/80 ml-1">{metrics.ttftMs}ms</span>
          </span>
        </div>
      )}
    </div>
  );
}

export default PerformanceMetrics;

