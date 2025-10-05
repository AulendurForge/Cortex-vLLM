'use client';

import React from 'react';
import { Tooltip } from '../../Tooltip';
import { GGUFGroupSelector } from './GGUFGroupSelector';

interface InspectResult {
  has_safetensors: boolean;
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
  }>;
  tokenizer_files: string[];
  config_files: string[];
  warnings: string[];
}

interface OfflineModeFieldsProps {
  baseDir: string;
  folders: string[];
  localPath: string;
  tokenizer: string;
  hfConfigPath: string;
  loadingFolders: boolean;
  savingBase: boolean;
  inspect: InspectResult | null;
  useGguf: boolean;
  selectedGguf: string;
  selectedGgufGroup: string;
  useLocalTokenizer: boolean;
  showGgufHelp: boolean;
  modeLocked?: boolean;
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
  savingBase,
  inspect,
  useGguf,
  selectedGguf,
  selectedGgufGroup,
  useLocalTokenizer,
  showGgufHelp,
  modeLocked,
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
              try {
                await navigator.clipboard.writeText(baseDir);
                alert('Path copied to clipboard!\n\nOpen this path in your file explorer:\n' + baseDir);
              } catch {
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
      
      {/* Folder inspection and GGUF/SafeTensors choice */}
      {!!inspect && (
        <div className="md:col-span-2 space-y-2 text-sm">
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
                <input 
                  className="input mt-1" 
                  placeholder="e.g., TinyLlama/TinyLlama-1.1B-Chat-v1.0" 
                  value={tokenizer || ''}
                  onChange={(e) => onTokenizerChange(e.target.value)} 
                />
                <p className="text-[11px] text-white/50">
                  The HF repo id of the base Transformers model this GGUF came from (find it on Hugging Face). 
                  This is passed to vLLM as <code>--tokenizer</code>. Using the base model's tokenizer is recommended for stability.
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


