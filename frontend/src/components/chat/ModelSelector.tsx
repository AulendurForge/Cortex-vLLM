/**
 * ModelSelector - Dropdown for selecting a running model to chat with.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchRunningModels, RunningModel } from '../../lib/chat-client';
import { Select, Badge } from '../UI';
import { cn } from '../../lib/cn';

interface ModelSelectorProps {
  value: string;
  onChange: (modelName: string) => void;
  disabled?: boolean;
  locked?: boolean;
}

export function ModelSelector({ value, onChange, disabled, locked }: ModelSelectorProps) {
  const { data: models, isLoading, error, isRefetching } = useQuery({
    queryKey: ['running-models'],
    queryFn: fetchRunningModels,
    staleTime: 5000,      // Consider data stale after 5s
    refetchInterval: 10000, // Refetch every 10s to stay in sync with health checks
    retry: 3,             // Retry failed requests
    retryDelay: 1000,     // Wait 1s between retries
  });

  const selectedModel = models?.find(m => m.served_model_name === value);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-9 w-48 bg-white/5 rounded-lg animate-pulse" />
        <span className="text-xs text-white/40">Loading models...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 rounded-lg border border-red-500/20">
        <span className="text-xs text-red-400">Failed to load models</span>
      </div>
    );
  }

  if (!models?.length) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
        <span className="text-xs text-amber-400">
          {isRefetching ? 'Checking for models...' : 'No running models available'}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Model</label>
        {locked && (
          <span className="text-[10px] text-amber-400/80 flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            Locked
          </span>
        )}
      </div>
      
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || locked}
        selectSize="sm"
        className={`min-w-[200px] ${locked ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        <option value="">Select a model...</option>
        {models.map((model) => (
          <option key={model.served_model_name} value={model.served_model_name}>
            {model.served_model_name}
          </option>
        ))}
      </Select>
      
      {selectedModel && (
        <Badge className={cn(
          "text-[9px]",
          selectedModel.engine_type === 'llamacpp' 
            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' 
            : 'bg-blue-500/10 text-blue-300 border-blue-500/20'
        )}>
          {selectedModel.engine_type === 'llamacpp' ? 'llama.cpp' : 'vLLM'}
        </Badge>
      )}
    </div>
  );
}

export default ModelSelector;

