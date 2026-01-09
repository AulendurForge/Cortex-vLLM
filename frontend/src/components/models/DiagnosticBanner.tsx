'use client';

import React from 'react';
import { Button } from '../UI';
import { useToast } from '../../providers/ToastProvider';
import { safeCopyToClipboard } from '../../lib/clipboard';

type Diagnosis = {
  detected: boolean;
  title: string;
  message: string;
  fixes: string[];
  severity: 'error' | 'warning' | 'info';
  error_type: string;
};

interface DiagnosticBannerProps {
  modelId: number;
  modelState: string;
}

/**
 * DiagnosticBanner - Displays startup failure diagnosis above logs
 * 
 * Fetches diagnosis from backend and shows actionable fixes.
 * Phase 3 feature for improved observability.
 */
export function DiagnosticBanner({ modelId, modelState }: DiagnosticBannerProps) {
  const [diagnosis, setDiagnosis] = React.useState<Diagnosis | null>(null);
  const [loading, setLoading] = React.useState(false);
  const { addToast } = useToast();

  React.useEffect(() => {
    // Always try to diagnose when logs are opened
    // Backend will only return diagnosis if errors are detected
    setLoading(true);
    
    (async () => {
      try {
        const response = await fetch(
          `http://${window.location.hostname}:8084/admin/models/${modelId}/logs?diagnose=true`,
          { credentials: 'include' }
        );
        
        if (response.ok) {
          const data = await response.json();
          if (data.diagnosis && data.diagnosis.detected) {
            setDiagnosis(data.diagnosis);
          }
        }
      } catch (error) {
        console.error('Failed to fetch diagnosis:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [modelId]);

  if (loading) {
    return (
      <div className="mb-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded">
        <div className="text-sm text-blue-200">🔍 Analyzing startup failure...</div>
      </div>
    );
  }

  if (!diagnosis || !diagnosis.detected) return null;

  const bgColor = diagnosis.severity === 'error' ? 'bg-red-500/10 border-red-500/30' :
                  diagnosis.severity === 'warning' ? 'bg-amber-500/10 border-amber-500/30' :
                  'bg-blue-500/10 border-blue-500/30';
  
  const textColor = diagnosis.severity === 'error' ? 'text-red-200' :
                    diagnosis.severity === 'warning' ? 'text-amber-200' :
                    'text-blue-200';
  
  const icon = diagnosis.severity === 'error' ? '❌' :
               diagnosis.severity === 'warning' ? '⚠️' : 'ℹ️';

  const copyDiagnosis = async () => {
    // Format diagnosis for copying
    const diagnosisText = [
      `Diagnosis: ${diagnosis.title}`,
      `Severity: ${diagnosis.severity.toUpperCase()}`,
      `Error Type: ${diagnosis.error_type}`,
      '',
      `Message:`,
      diagnosis.message,
      '',
      diagnosis.fixes && diagnosis.fixes.length > 0 ? 'Suggested Fixes:' : '',
      diagnosis.fixes && diagnosis.fixes.length > 0 
        ? diagnosis.fixes.map((fix, idx) => `${idx + 1}. ${fix}`).join('\n')
        : '',
    ].filter(Boolean).join('\n');

    const ok = await safeCopyToClipboard(diagnosisText);
    if (ok) {
      addToast({ title: 'Diagnosis copied to clipboard', kind: 'success' });
    } else {
      addToast({ title: 'Failed to copy diagnosis', kind: 'error' });
    }
  };

  return (
    <div className={`mb-3 p-4 ${bgColor} border rounded-lg`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className={`font-semibold text-lg ${textColor}`}>
              {diagnosis.title}
            </div>
            <button
              onClick={copyDiagnosis}
              className="px-2 py-1 text-xs bg-white/10 hover:bg-white/20 border border-white/20 rounded transition-colors flex items-center gap-1.5 text-white/80 hover:text-white"
              title="Copy diagnosis to clipboard"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </button>
          </div>
          <div className="text-sm text-white/80 mb-3">
            {diagnosis.message}
          </div>
          
          {diagnosis.fixes && diagnosis.fixes.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-white/90">💡 Suggested Fixes:</div>
              <ul className="list-disc pl-5 text-sm text-white/80 space-y-1">
                {diagnosis.fixes.map((fix, index) => (
                  <li key={index}>{fix}</li>
                ))}
              </ul>
            </div>
          )}
          
          <div className="mt-3 text-xs text-white/60">
            Error Type: <span className="font-mono">{diagnosis.error_type}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

