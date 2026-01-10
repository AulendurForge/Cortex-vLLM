'use client';

import React from 'react';
import { Tooltip } from '../../Tooltip';
import { GGUFGroupSelector } from './GGUFGroupSelector';
import { SafeTensorDisplay } from './SafeTensorDisplay';
import { EngineGuidance } from './EngineGuidance';
import { safeCopyToClipboard } from '../../../lib/clipboard';

/**
 * Common tokenizer patterns for auto-suggestions (Gap #4)
 * Maps model name patterns to likely HuggingFace tokenizer repos
 */
const TOKENIZER_SUGGESTIONS: Array<{
  pattern: RegExp;
  repos: string[];
  label: string;
}> = [
  { 
    pattern: /llama.*3.*70b/i, 
    repos: ['meta-llama/Llama-3.1-70B-Instruct', 'meta-llama/Meta-Llama-3-70B-Instruct'],
    label: 'Llama 3 70B'
  },
  { 
    pattern: /llama.*3.*8b/i, 
    repos: ['meta-llama/Llama-3.1-8B-Instruct', 'meta-llama/Meta-Llama-3-8B-Instruct'],
    label: 'Llama 3 8B'
  },
  { 
    pattern: /llama.*3/i, 
    repos: ['meta-llama/Llama-3.1-8B-Instruct', 'meta-llama/Meta-Llama-3-8B-Instruct'],
    label: 'Llama 3'
  },
  { 
    pattern: /llama.*2/i, 
    repos: ['meta-llama/Llama-2-7b-chat-hf', 'meta-llama/Llama-2-13b-chat-hf'],
    label: 'Llama 2'
  },
  { 
    pattern: /mistral.*small/i, 
    repos: ['mistralai/Mistral-Small-24B-Instruct-2501', 'mistralai/Mistral-Small-Instruct-2409'],
    label: 'Mistral Small'
  },
  { 
    pattern: /mistral.*large/i, 
    repos: ['mistralai/Mistral-Large-Instruct-2407'],
    label: 'Mistral Large'
  },
  { 
    pattern: /mistral/i, 
    repos: ['mistralai/Mistral-7B-Instruct-v0.3', 'mistralai/Mistral-7B-Instruct-v0.2'],
    label: 'Mistral'
  },
  { 
    pattern: /qwen.*2.*72b/i, 
    repos: ['Qwen/Qwen2.5-72B-Instruct', 'Qwen/Qwen2-72B-Instruct'],
    label: 'Qwen 2 72B'
  },
  { 
    pattern: /qwen.*3/i, 
    repos: ['Qwen/Qwen3-8B', 'Qwen/Qwen3-14B', 'Qwen/Qwen3-32B'],
    label: 'Qwen 3'
  },
  { 
    pattern: /qwen.*2/i, 
    repos: ['Qwen/Qwen2.5-7B-Instruct', 'Qwen/Qwen2.5-14B-Instruct'],
    label: 'Qwen 2'
  },
  { 
    pattern: /qwen/i, 
    repos: ['Qwen/Qwen2.5-7B-Instruct', 'Qwen/Qwen-7B-Chat'],
    label: 'Qwen'
  },
  { 
    pattern: /phi.*3/i, 
    repos: ['microsoft/Phi-3-mini-4k-instruct', 'microsoft/Phi-3-medium-4k-instruct'],
    label: 'Phi 3'
  },
  { 
    pattern: /phi/i, 
    repos: ['microsoft/phi-2', 'microsoft/Phi-3-mini-4k-instruct'],
    label: 'Phi'
  },
  { 
    pattern: /gemma.*2/i, 
    repos: ['google/gemma-2-9b-it', 'google/gemma-2-27b-it'],
    label: 'Gemma 2'
  },
  { 
    pattern: /gemma/i, 
    repos: ['google/gemma-7b-it', 'google/gemma-2b-it'],
    label: 'Gemma'
  },
  { 
    pattern: /yi.*1\.5/i, 
    repos: ['01-ai/Yi-1.5-34B-Chat', '01-ai/Yi-1.5-9B-Chat'],
    label: 'Yi 1.5'
  },
  { 
    pattern: /yi/i, 
    repos: ['01-ai/Yi-34B-Chat', '01-ai/Yi-6B-Chat'],
    label: 'Yi'
  },
  { 
    pattern: /deepseek.*v3/i, 
    repos: ['deepseek-ai/DeepSeek-V3'],
    label: 'DeepSeek V3'
  },
  { 
    pattern: /deepseek.*coder/i, 
    repos: ['deepseek-ai/deepseek-coder-33b-instruct', 'deepseek-ai/deepseek-coder-6.7b-instruct'],
    label: 'DeepSeek Coder'
  },
  { 
    pattern: /deepseek/i, 
    repos: ['deepseek-ai/DeepSeek-V2-Lite', 'deepseek-ai/deepseek-llm-7b-chat'],
    label: 'DeepSeek'
  },
  { 
    pattern: /codellama/i, 
    repos: ['codellama/CodeLlama-34b-Instruct-hf', 'codellama/CodeLlama-7b-Instruct-hf'],
    label: 'CodeLlama'
  },
  { 
    pattern: /tinyllama/i, 
    repos: ['TinyLlama/TinyLlama-1.1B-Chat-v1.0'],
    label: 'TinyLlama'
  },
  { 
    pattern: /falcon/i, 
    repos: ['tiiuae/falcon-7b-instruct', 'tiiuae/falcon-40b-instruct'],
    label: 'Falcon'
  },
  { 
    pattern: /vicuna/i, 
    repos: ['lmsys/vicuna-7b-v1.5', 'lmsys/vicuna-13b-v1.5'],
    label: 'Vicuna'
  },
  { 
    pattern: /wizard/i, 
    repos: ['WizardLM/WizardLM-7B-V1.0', 'WizardLM/WizardCoder-15B-V1.0'],
    label: 'WizardLM'
  },
];

/**
 * Get tokenizer suggestions based on model/folder name
 */
function getTokenizerSuggestions(modelName: string): string[] {
  if (!modelName) return [];
  
  const suggestions: string[] = [];
  const seen = new Set<string>();
  
  for (const entry of TOKENIZER_SUGGESTIONS) {
    if (entry.pattern.test(modelName)) {
      for (const repo of entry.repos) {
        if (!seen.has(repo)) {
          seen.add(repo);
          suggestions.push(repo);
        }
      }
    }
  }
  
  return suggestions.slice(0, 5); // Limit to top 5 suggestions
}

/**
 * Tokenizer input with smart suggestions dropdown (Gap #4)
 */
function TokenizerInput({ 
  value, 
  onChange, 
  modelName 
}: { 
  value: string; 
  onChange: (value: string) => void; 
  modelName: string;
}) {
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const suggestions = React.useMemo(() => getTokenizerSuggestions(modelName), [modelName]);
  
  return (
    <div className="relative">
      <input 
        className="input mt-1 w-full" 
        placeholder="e.g., meta-llama/Llama-3.1-8B-Instruct" 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
      />
      
      {/* Suggestions dropdown */}
      {suggestions.length > 0 && (
        <div className="mt-1">
          {showSuggestions && !value && (
            <div className="absolute z-10 w-full bg-zinc-900 border border-white/20 rounded-lg shadow-xl overflow-hidden">
              <div className="px-3 py-1.5 text-[10px] text-white/50 bg-white/5 border-b border-white/10">
                💡 Suggested tokenizers for "{modelName}"
              </div>
              {suggestions.map((repo) => (
                <button
                  key={repo}
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 transition-colors flex items-center gap-2"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(repo);
                    setShowSuggestions(false);
                  }}
                >
                  <span className="text-cyan-400">🤗</span>
                  <span className="font-mono text-xs">{repo}</span>
                </button>
              ))}
            </div>
          )}
          
          {/* Inline suggestion pills (always visible when not focused on input) */}
          {!showSuggestions && !value && (
            <div className="flex flex-wrap gap-1 mt-1">
              <span className="text-[10px] text-white/40">Suggestions:</span>
              {suggestions.slice(0, 3).map((repo) => (
                <button
                  key={repo}
                  type="button"
                  className="px-2 py-0.5 text-[10px] bg-cyan-500/10 text-cyan-300 rounded border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors"
                  onClick={() => onChange(repo)}
                >
                  {repo.split('/')[1] || repo}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* No suggestions helper */}
      {suggestions.length === 0 && !value && (
        <p className="text-[10px] text-white/40 mt-1">
          Enter the HuggingFace repo ID (e.g., meta-llama/Llama-3.1-8B-Instruct)
        </p>
      )}
    </div>
  );
}

/**
 * Engine recommendation option from backend
 */
interface EngineOption {
  engine: 'vllm' | 'llamacpp';
  format: 'safetensors' | 'gguf';
  label: string;
  description: string;
  is_recommended: boolean;
  requires_merge?: boolean;
}

/**
 * Engine recommendation from backend inspect-folder endpoint
 */
interface EngineRecommendation {
  recommended: string;
  reason: string;
  has_multipart_gguf: boolean;
  has_safetensors: boolean;
  has_gguf: boolean;
  vllm_gguf_compatible: boolean;
  options: EngineOption[];
}

/**
 * GGUF validation summary (Gap #5)
 */
interface GGUFValidationSummary {
  total_files: number;
  valid_files: number;
  invalid_files: number;
  warnings: string[];
  errors: string[];
}

/**
 * Component to display GGUF validation results (Gap #5)
 */
function GGUFValidationBadge({ validation }: { validation: GGUFValidationSummary | null | undefined }) {
  if (!validation) return null;
  
  const { total_files, valid_files, invalid_files, warnings, errors } = validation;
  
  // All files valid - show success badge
  if (invalid_files === 0 && errors.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
          ✓ {valid_files} GGUF file{valid_files !== 1 ? 's' : ''} validated
        </span>
        {warnings.length > 0 && (
          <span className="text-amber-300/70" title={warnings.join('\n')}>
            ⚠ {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    );
  }
  
  // Some files invalid - show error
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-300">
          ❌ {invalid_files} of {total_files} GGUF file{total_files !== 1 ? 's' : ''} failed validation
        </span>
      </div>
      {errors.length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-red-300/80 hover:text-red-300">
            View validation errors
          </summary>
          <ul className="mt-1 space-y-0.5 pl-2 text-red-300/70 max-h-32 overflow-y-auto">
            {errors.map((err, i) => (
              <li key={i} className="break-all">• {err}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * GGUF metadata extracted from file headers (Gap #3)
 */
interface GGUFMetadata {
  architecture: string | null;
  model_name: string | null;
  context_length: number | null;
  embedding_length: number | null;
  block_count: number | null;
  attention_head_count: number | null;
  attention_head_count_kv: number | null;
  vocab_size: number | null;
  file_type: number | null;
  quantization_version: number | null;
  file_type_name: string | null;
}

interface SafeTensorInfo {
  files: string[];
  total_size_gb: number;
  file_count: number;
  architecture: string | null;
  model_type: string | null;
  vocab_size: number | null;
  max_position_embeddings: number | null;
  torch_dtype: string | null;
  tie_word_embeddings: boolean | null;
}

interface InspectResult {
  has_safetensors: boolean;
  safetensor_info?: SafeTensorInfo | null;  // Detailed SafeTensor info
  gguf_files: string[];
  gguf_groups: Array<{
    quant_type: string;
    display_name: string;
    files: string[];
    full_paths: string[];
    is_multipart: boolean;
    expected_parts: number | null;
    actual_parts: number;
    total_size_mb: number;
    status: string;
    can_use: boolean;
    warning: string | null;
    is_recommended: boolean;
    // Gap #3: GGUF metadata
    metadata?: GGUFMetadata | null;
  }>;
  tokenizer_files: string[];
  config_files: string[];
  warnings: string[];
  // Additional config data
  hidden_size?: number | null;
  num_hidden_layers?: number | null;
  num_attention_heads?: number | null;
  // Smart engine recommendation (Gap #2)
  engine_recommendation?: EngineRecommendation | null;
  // GGUF validation summary (Gap #5)
  gguf_validation?: GGUFValidationSummary | null;
}

interface OfflineModeFieldsProps {
  baseDir: string;
  folders: string[];
  localPath: string;
  tokenizer: string;
  hfConfigPath: string;
  loadingFolders: boolean;
  loadingInspect?: boolean;  // Loading state for folder inspection
  savingBase: boolean;
  inspect: InspectResult | null;
  useGguf: boolean;
  selectedGguf: string;
  selectedGgufGroup: string;
  useLocalTokenizer: boolean;
  showGgufHelp: boolean;
  modeLocked?: boolean;
  // Engine context for smart guidance (Gap #2)
  engineType?: 'vllm' | 'llamacpp';
  onSwitchEngine?: (engine: 'vllm' | 'llamacpp') => void;
  onBaseDirChange: (value: string) => void;
  onFolderSelect: (folder: string) => void;
  onRefreshFolders: () => void;
  onSaveBaseDir?: () => void;
  onUseGgufChange: (value: boolean) => void;
  onSelectedGgufChange: (value: string) => void;
  onSelectedGgufGroupChange: (quantType: string, firstFile: string) => void;
  onUseLocalTokenizerChange: (value: boolean) => void;
  onShowGgufHelpToggle: () => void;
  onShowMergeHelp: () => void;
  onTokenizerChange: (value: string) => void;
  onHfConfigPathChange: (value: string) => void;
}

export function OfflineModeFields({
  baseDir,
  folders,
  localPath,
  tokenizer,
  hfConfigPath,
  loadingFolders,
  loadingInspect,
  savingBase,
  inspect,
  useGguf,
  selectedGguf,
  selectedGgufGroup,
  useLocalTokenizer,
  showGgufHelp,
  modeLocked,
  engineType,
  onSwitchEngine,
  onBaseDirChange,
  onFolderSelect,
  onRefreshFolders,
  onSaveBaseDir,
  onUseGgufChange,
  onSelectedGgufChange,
  onSelectedGgufGroupChange,
  onUseLocalTokenizerChange,
  onShowGgufHelpToggle,
  onShowMergeHelp,
  onTokenizerChange,
  onHfConfigPathChange,
}: OfflineModeFieldsProps) {
  return (
    <>
      <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2">
        <label className="text-sm">Models base directory
          <input 
            className="input mt-1" 
            placeholder="/var/cortex/models or C:\\cortex\\models" 
            value={baseDir}
            onChange={(e) => onBaseDirChange(e.target.value)} 
            readOnly={modeLocked} 
          />
          <p className="text-[11px] text-white/50 mt-1">
            Root folder that contains your offline model directories. It is mounted read‑only into vLLM as /models. 
            <Tooltip text="On Windows set to C:/cortex/models; on Linux, /var/cortex/models. Subfolders appear in the dropdown below." />
          </p>
        </label>
        <div className="flex items-end gap-2">
          <button 
            type="button" 
            className="btn" 
            onClick={onRefreshFolders} 
            disabled={!baseDir || loadingFolders}
          >
            {loadingFolders ? 'Loading…' : 'Refresh'}
          </button>
          {(!modeLocked && onSaveBaseDir) && (
            <button 
              type="button" 
              className="btn" 
              onClick={onSaveBaseDir} 
              disabled={!baseDir || savingBase}
            >
              {savingBase ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
        <div className="flex items-end">
          <button 
            type="button" 
            className="btn" 
            onClick={async () => {
              const ok = await safeCopyToClipboard(baseDir);
              if (ok) {
                alert('Path copied to clipboard!\n\nOpen this path in your file explorer:\n' + baseDir);
              } else {
                alert('Path: ' + baseDir + '\n\nCopy this path and open it in your file explorer.');
              }
            }} 
            title="Copy path to clipboard"
          >
            Copy Path
          </button>
        </div>
      </div>
      
      <label className="text-sm md:col-span-2">Select your model item
        <div className="flex items-center gap-2 mt-1">
          <select 
            className="input w-full" 
            value={localPath || ''} 
            onChange={(e) => onFolderSelect(e.target.value)}
            disabled={modeLocked}
          >
            <option value="">Select a folder…</option>
            {folders.map((f) => (<option key={f} value={f}>{f}</option>))}
          </select>
        </div>
        <p className="text-[11px] text-white/50 mt-1">
          Pick a subfolder (SafeTensors) or a .gguf file. 
          <Tooltip text="Folders are mounted as /models/<name> and used as --model /models/<name>. If you choose a .gguf file, we will pass --model /models/<file.gguf> and you must provide a tokenizer HF repo id below." />
        </p>
      </label>
      
      {/* Loading indicator while scanning folder */}
      {loadingInspect && (
        <div className="md:col-span-2 p-4 rounded-lg border border-cyan-500/20 bg-cyan-500/5 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 border-cyan-400 border-t-transparent rounded-full" />
            <div>
              <div className="text-cyan-300 font-medium">Scanning model folder…</div>
              <div className="text-[11px] text-cyan-300/60 mt-0.5">
                Detecting available model formats, validating GGUF files, and extracting metadata
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Folder inspection and GGUF/SafeTensors choice */}
      {!loadingInspect && !!inspect && (
        <div className="md:col-span-2 space-y-3 text-sm">
          {(inspect.has_safetensors && ((inspect.gguf_files||[]).length>0 || (inspect.gguf_groups||[]).length>0)) && (
            <div className="inline-flex items-center gap-4">
              <label className="inline-flex items-center gap-2">
                <input type="radio" checked={!useGguf} onChange={() => onUseGgufChange(false)} />
                Use SafeTensors in this folder
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" checked={useGguf} onChange={() => onUseGgufChange(true)} />
                Use GGUF
              </label>
            </div>
          )}
          {(!inspect.has_safetensors && ((inspect.gguf_files||[]).length>0 || (inspect.gguf_groups||[]).length>0)) && (
            <div className="inline-flex items-center gap-2">
              <input type="radio" checked readOnly /> GGUF detected
            </div>
          )}
          {(inspect.has_safetensors && !((inspect.gguf_files||[]).length>0 || (inspect.gguf_groups||[]).length>0)) && (
            <div className="inline-flex items-center gap-2 text-emerald-300">
              <span className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-[10px]">✓</span>
              SafeTensors model detected
            </div>
          )}
          
          {/* Smart Engine Guidance (Gap #1 + #2) */}
          <EngineGuidance
            engineType={engineType}
            recommendation={inspect.engine_recommendation}
            useGguf={useGguf || (!inspect.has_safetensors && ((inspect.gguf_files||[]).length>0 || (inspect.gguf_groups||[]).length>0))}
            onSwitchEngine={(engine) => onSwitchEngine?.(engine)}
            onSwitchToSafeTensors={() => onUseGgufChange(false)}
            onShowMergeHelp={onShowMergeHelp}
          />
          
          {/* SafeTensor Model Info Display */}
          {!useGguf && inspect.has_safetensors && inspect.safetensor_info && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
              <SafeTensorDisplay 
                info={inspect.safetensor_info}
                hiddenSize={inspect.hidden_size}
                numLayers={inspect.num_hidden_layers}
                numHeads={inspect.num_attention_heads}
              />
              {/* Tokenizer and config files */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/50 mt-3 pt-3 border-t border-white/5">
                {(inspect.tokenizer_files || []).length > 0 && (
                  <span>✓ Tokenizer: {inspect.tokenizer_files.join(', ')}</span>
                )}
                {(inspect.config_files || []).length > 0 && (
                  <span>✓ Config: {inspect.config_files.join(', ')}</span>
                )}
              </div>
            </div>
          )}
          
          {useGguf && (
            <div className="rounded border border-white/10 bg-white/5 p-2">
              <div className="flex items-center justify-between">
                <div className="text-[12px] text-white/80">Requirements for GGUF</div>
                <button 
                  type="button" 
                  className="btn px-2 py-0 text-xs" 
                  onClick={onShowGgufHelpToggle}
                >
                  {showGgufHelp ? 'Collapse' : 'Show more…'}
                </button>
              </div>
              {showGgufHelp && (
                <ul className="text-[12px] text-white/70 list-disc pl-5 mt-2 space-y-1">
                  <li>Choose a single .gguf file in this folder.</li>
                  <li>Recommended: provide the base Hugging Face repo id for the original model (passed as <code>--tokenizer</code>).</li>
                  <li>Advanced: use local tokenizer. Folder must contain <code>config.json</code> (or <code>params.json</code> for Mistral-family) and <code>tokenizer.json</code> or <code>tokenizer.model</code>. We pass the folder via <code>--hf-config-path</code>.</li>
                  <li>Optional but helpful: <code>tokenizer_config.json</code>, <code>special_tokens_map.json</code>, <code>generation_config.json</code>.</li>
                  <li>vLLM supports single-file GGUF; pass a local path (not a remote repo) for the .gguf.</li>
                </ul>
              )}
              {!!(inspect.gguf_files||[]).length && (
                <div className="text-[11px] text-white/60 mt-2">Detected GGUF files: {(inspect.gguf_files||[]).join(', ')}</div>
              )}
              
              {/* GGUF Validation Badge (Gap #5) */}
              {inspect.gguf_validation && (
                <div className="mt-2">
                  <GGUFValidationBadge validation={inspect.gguf_validation} />
                </div>
              )}
              
              {!!(inspect.tokenizer_files||[]).length && (
                <div className="text-[11px] text-white/60">Detected tokenizer files: {(inspect.tokenizer_files||[]).join(', ')}</div>
              )}
              {!!(inspect.warnings||[]).length && (
                <div className="text-[11px] text-amber-300/90">Warnings: {(inspect.warnings||[]).join(', ')}</div>
              )}
            </div>
          )}
          
          {/* Smart Grouped GGUF Selection */}
          {useGguf && inspect.gguf_groups && inspect.gguf_groups.length > 0 && (
            <GGUFGroupSelector 
              groups={inspect.gguf_groups}
              selectedGroup={selectedGgufGroup}
              onSelectGroup={onSelectedGgufGroupChange}
              onShowMergeHelp={onShowMergeHelp}
            />
          )}
          
          {/* Legacy: Fallback to old dropdown if gguf_groups not available */}
          {useGguf && (!inspect.gguf_groups || inspect.gguf_groups.length === 0) && (inspect.gguf_files||[]).length>1 && (
            <label className="block">Select GGUF file
              <select className="input mt-1" value={selectedGguf} onChange={(e) => onSelectedGgufChange(e.target.value)}>
                <option value="">Select .gguf…</option>
                {inspect.gguf_files.map((g) => (<option key={g} value={g}>{g}</option>))}
              </select>
            </label>
          )}
          {useGguf && (inspect.tokenizer_files||[]).length>1 && (
            <div className="text-red-300">Multiple tokenizer files detected in this folder. Keep only one tokenizer.* file.</div>
          )}
        </div>
      )}
      
      {/* Tokenizer source selection for GGUF */}
      {useGguf && (
        <>
          <div className="md:col-span-2 space-y-1">
            <div className="text-[12px] text-white/80">Tokenizer source for GGUF</div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="radio" checked={!useLocalTokenizer} onChange={() => onUseLocalTokenizerChange(false)} />
              Provide Hugging Face repo id (recommended)
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="radio" checked={useLocalTokenizer} onChange={() => onUseLocalTokenizerChange(true)} />
              Use tokenizer.json in this folder (advanced)
            </label>
            {!useLocalTokenizer && (
              <>
                {/* Tokenizer input with suggestions (Gap #4) */}
                <TokenizerInput
                  value={tokenizer || ''}
                  onChange={onTokenizerChange}
                  modelName={localPath}
                />
                <p className="text-[11px] text-white/50">
                  The HF repo id of the base Transformers model this GGUF came from (find it on Hugging Face). 
                  This is passed to vLLM as <code>--tokenizer</code>. Using the base model's tokenizer is recommended for stability.
                </p>
                <p className="text-[11px] text-amber-300/90">
                  Note: in offline mode, vLLM will not download this tokenizer. It will only work if the tokenizer is already present in the shared HF cache,
                  or if you switch to "Use tokenizer.json in this folder".
                </p>
              </>
            )}
            {useLocalTokenizer && (
              <p className="text-[11px] text-amber-300/90">
                We will try to use the tokenizer files present in this folder via <code>--hf-config-path</code>. 
                This may be slower/less stable for some GGUFs.
              </p>
            )}
          </div>
          <label className="text-sm">HF config path (optional)
            <input 
              className="input mt-1" 
              placeholder="e.g., /models/folder" 
              value={hfConfigPath || ''}
              onChange={(e) => onHfConfigPathChange(e.target.value)} 
            />
            <p className="text-[11px] text-white/50 mt-1">
              If tokenizer conversion fails, provide a path with a compatible Hugging Face config. Passed as --hf-config-path.
            </p>
          </label>
        </>
      )}
    </>
  );
}




