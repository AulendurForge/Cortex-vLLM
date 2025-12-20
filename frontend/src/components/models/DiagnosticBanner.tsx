'use client';

import React from 'react';
import { Button } from '../UI';

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

  return (
    <div className={`mb-3 p-4 ${bgColor} border rounded-lg`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1">
          <div className={`font-semibold text-lg ${textColor} mb-1`}>
            {diagnosis.title}
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

