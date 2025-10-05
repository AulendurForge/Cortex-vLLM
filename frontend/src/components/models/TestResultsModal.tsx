'use client';

import { Modal } from '../Modal';
import { Button } from '../UI';
import { useToast } from '../../providers/ToastProvider';

type TestResult = {
  success: boolean;
  test_type: 'chat' | 'embeddings';
  request: any;
  response: any;
  error: string | null;
  latency_ms: number;
  timestamp: number;
};

export function TestResultsModal({ 
  open, 
  onClose, 
  result,
  modelName
}: { 
  open: boolean; 
  onClose: () => void; 
  result: TestResult | null;
  modelName?: string;
}) {
  const { addToast } = useToast();
  
  if (!result) return null;
  
  const copyResults = async () => {
    try {
      const text = JSON.stringify(result, null, 2);
      await navigator.clipboard.writeText(text);
      addToast({ title: 'Test results copied!', kind: 'success' });
    } catch {
      addToast({ title: 'Copy failed', kind: 'error' });
    }
  };
  
  return (
    <Modal open={open} onClose={onClose} title={`Model Test Results${modelName ? ` - ${modelName}` : ''}`}>
      <div className="space-y-4">
        {/* Success/Failure Badge */}
        {result.success ? (
          <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
            <span className="text-4xl">✅</span>
            <div className="flex-1">
              <div className="font-semibold text-emerald-200 text-lg">Test Passed</div>
              <div className="text-sm text-white/70 mt-1">
                Model responded successfully in {result.latency_ms}ms
              </div>
              <div className="text-xs text-white/60 mt-1">
                {result.test_type === 'chat' ? 
                  'Chat completion endpoint is working correctly' :
                  'Embeddings endpoint is working correctly'
                }
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <span className="text-4xl">❌</span>
            <div className="flex-1">
              <div className="font-semibold text-red-200 text-lg">Test Failed</div>
              <div className="text-sm text-white/70 mt-1">{result.error || 'Unknown error'}</div>
              <div className="text-xs text-white/60 mt-1">
                Check model logs for more details
              </div>
            </div>
          </div>
        )}
        
        {/* Request */}
        <div>
          <div className="text-sm font-medium text-white/90 mb-2 flex items-center justify-between">
            <span>Request Sent:</span>
            <span className="text-xs text-white/60">POST /v1/{result.test_type === 'chat' ? 'chat/completions' : 'embeddings'}</span>
          </div>
          <pre className="text-xs bg-black/40 rounded-lg p-3 overflow-x-auto border border-white/10">
            <code className="text-emerald-300">{JSON.stringify(result.request, null, 2)}</code>
          </pre>
        </div>
        
        {/* Response */}
        {result.response && (
          <div>
            <div className="text-sm font-medium text-white/90 mb-2">Response Received:</div>
            <pre className="text-xs bg-black/40 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto border border-white/10">
              <code className="text-blue-300">{JSON.stringify(result.response, null, 2)}</code>
            </pre>
          </div>
        )}
        
        {/* Metrics */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-white/5 rounded-lg border border-white/10">
            <div className="text-xs text-white/60 mb-1">Latency</div>
            <div className="text-lg font-semibold text-white/90">{result.latency_ms}ms</div>
          </div>
          <div className="p-3 bg-white/5 rounded-lg border border-white/10">
            <div className="text-xs text-white/60 mb-1">Test Type</div>
            <div className="text-lg font-semibold text-white/90 capitalize">{result.test_type}</div>
          </div>
          <div className="p-3 bg-white/5 rounded-lg border border-white/10">
            <div className="text-xs text-white/60 mb-1">Status</div>
            <div className={`text-lg font-semibold ${result.success ? 'text-emerald-300' : 'text-red-300'}`}>
              {result.success ? '✓ OK' : '✗ Failed'}
            </div>
          </div>
        </div>
        
        {/* Token Usage (if available in response) */}
        {result.response?.usage && (
          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="text-xs font-medium text-blue-200 mb-2">Token Usage:</div>
            <div className="flex gap-4 text-xs text-white/80">
              <div>Prompt: <span className="font-medium">{result.response.usage.prompt_tokens || 0}</span></div>
              <div>Completion: <span className="font-medium">{result.response.usage.completion_tokens || 0}</span></div>
              <div>Total: <span className="font-medium">{result.response.usage.total_tokens || 0}</span></div>
            </div>
          </div>
        )}
        
        {/* Embedding Info (if embedding test) */}
        {result.test_type === 'embeddings' && result.response?.data?.[0]?.embedding && (
          <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
            <div className="text-xs font-medium text-purple-200 mb-2">Embedding Info:</div>
            <div className="text-xs text-white/80">
              Vector dimensions: <span className="font-medium">{result.response.data[0].embedding.length}</span>
            </div>
            <div className="text-xs text-white/60 mt-1">
              First 5 values: [{result.response.data[0].embedding.slice(0, 5).map((v: number) => v.toFixed(4)).join(', ')}...]
            </div>
          </div>
        )}
        
        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={copyResults}>
            📋 Copy Results
          </Button>
          <Button onClick={onClose} className="btn-primary">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
