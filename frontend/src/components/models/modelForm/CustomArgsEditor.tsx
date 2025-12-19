'use client';

import React, { useState } from 'react';
import { Button, PrimaryButton } from '../../UI';
import { Tooltip } from '../../Tooltip';

export type CustomArg = {
  flag: string;
  type: 'string' | 'int' | 'float' | 'bool' | 'flag' | 'string_list';
  value: any;
};

export type CustomEnvVar = {
  key: string;
  value: string;
};

interface CustomArgsEditorProps {
  args: CustomArg[];
  envVars: CustomEnvVar[];
  onArgsChange: (args: CustomArg[]) => void;
  onEnvVarsChange: (envVars: CustomEnvVar[]) => void;
  engineType: 'vllm' | 'llamacpp';
}

/**
 * CustomArgsEditor - Dynamic editor for custom startup arguments (Plane B)
 * 
 * Allows users to add engine-specific flags without code changes.
 * Validates against forbidden args (--host, --port, etc.)
 * 
 * See cortexSustainmentPlan.md Phase 2 for architecture details.
 */
export function CustomArgsEditor({ args, envVars, onArgsChange, onEnvVarsChange, engineType }: CustomArgsEditorProps) {
  const [activeTab, setActiveTab] = useState<'args' | 'env'>('args');
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editFlag, setEditFlag] = useState('');
  const [editType, setEditType] = useState<CustomArg['type']>('string');
  const [editValue, setEditValue] = useState<string>('');
  
  // Environment variable editing
  const [editEnvIndex, setEditEnvIndex] = useState<number | null>(null);
  const [editEnvKey, setEditEnvKey] = useState('');
  const [editEnvValue, setEditEnvValue] = useState('');

  const addNew = () => {
    setEditIndex(-1);
    setEditFlag('');
    setEditType('string');
    setEditValue('');
  };
  
  const addNewEnv = () => {
    setEditEnvIndex(-1);
    setEditEnvKey('');
    setEditEnvValue('');
  };

  const saveEdit = () => {
    if (!editFlag.trim()) {
      alert('Flag name is required');
      return;
    }

    // Basic validation
    if (!editFlag.startsWith('--') && !editFlag.startsWith('-')) {
      alert('Flag must start with -- or -');
      return;
    }

    // Parse value based on type
    let parsedValue: any = editValue;
    if (editType === 'bool' || editType === 'flag') {
      parsedValue = editValue.toLowerCase() === 'true' || editValue === '1';
    } else if (editType === 'int') {
      parsedValue = parseInt(editValue);
      if (isNaN(parsedValue)) {
        alert('Invalid integer value');
        return;
      }
    } else if (editType === 'float') {
      parsedValue = parseFloat(editValue);
      if (isNaN(parsedValue)) {
        alert('Invalid float value');
        return;
      }
    } else if (editType === 'string_list') {
      parsedValue = editValue.split(',').map(s => s.trim()).filter(Boolean);
    }

    const newArg: CustomArg = {
      flag: editFlag.trim(),
      type: editType,
      value: parsedValue,
    };

    if (editIndex === -1) {
      // Adding new
      onArgsChange([...args, newArg]);
    } else if (editIndex !== null) {
      // Editing existing
      const updated = [...args];
      updated[editIndex] = newArg;
      onArgsChange(updated);
    }

    setEditIndex(null);
  };

  const deleteArg = (index: number) => {
    onArgsChange(args.filter((_, i) => i !== index));
  };

  const editArg = (index: number) => {
    const arg = args[index];
    if (!arg) return;
    
    setEditIndex(index);
    setEditFlag(arg.flag);
    setEditType(arg.type);
    
    // Convert value to string for editing
    if (arg.type === 'string_list' && Array.isArray(arg.value)) {
      setEditValue(arg.value.join(', '));
    } else if (arg.type === 'bool' || arg.type === 'flag') {
      setEditValue(arg.value ? 'true' : 'false');
    } else {
      setEditValue(String(arg.value || ''));
    }
  };
  
  // Environment variable handlers
  const saveEnv = () => {
    if (!editEnvKey.trim()) {
      alert('Environment variable name is required');
      return;
    }

    const newEnv: CustomEnvVar = {
      key: editEnvKey.trim(),
      value: editEnvValue,
    };

    if (editEnvIndex === -1) {
      onEnvVarsChange([...envVars, newEnv]);
    } else if (editEnvIndex !== null) {
      const updated = [...envVars];
      updated[editEnvIndex] = newEnv;
      onEnvVarsChange(updated);
    }

    setEditEnvIndex(null);
  };

  const deleteEnvVar = (index: number) => {
    onEnvVarsChange(envVars.filter((_, i) => i !== index));
  };

  const editEnvVar = (index: number) => {
    const env = envVars[index];
    if (!env) return;
    
    setEditEnvIndex(index);
    setEditEnvKey(env.key);
    setEditEnvValue(env.value);
  };

  return (
    <details className="md:col-span-2 mt-4 border-l-4 border-cyan-500 pl-4 bg-cyan-500/5 p-3 rounded">
      <summary className="cursor-pointer text-sm font-medium text-cyan-300 mb-2">
        ⚙️ Custom Startup Configuration (Advanced)
      </summary>

      <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded text-xs mb-3">
        <div className="font-medium text-blue-200 mb-1">ℹ️ What is Custom Startup Config?</div>
        <div className="text-white/80">
          Add engine-specific <strong>arguments</strong> (e.g., <code>--async-scheduling</code>) and 
          <strong>environment variables</strong> (e.g., <code>VLLM_USE_FLASHINFER_MOE_FP8=1</code>).
          These are applied at <strong>container startup</strong>, not per-request. Requires container restart to take effect.
        </div>
      </div>
      
      {/* Tabs for Args vs Env Vars */}
      <div className="flex gap-2 mb-3 border-b border-white/10">
        <button
          type="button"
          onClick={() => setActiveTab('args')}
          className={`px-3 py-2 text-sm transition-colors ${
            activeTab === 'args'
              ? 'text-cyan-300 border-b-2 border-cyan-500'
              : 'text-white/60 hover:text-white/80'
          }`}
        >
          Arguments ({args.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('env')}
          className={`px-3 py-2 text-sm transition-colors ${
            activeTab === 'env'
              ? 'text-cyan-300 border-b-2 border-cyan-500'
              : 'text-white/60 hover:text-white/80'
          }`}
        >
          Environment Variables ({envVars.length})
        </button>
      </div>

      {/* Arguments Tab */}
      {activeTab === 'args' && (
        <>
          {/* Current Args List */}
          {args.length > 0 && (
            <div className="space-y-2 mb-3">
              {args.map((arg, index) => (
            <div key={index} className="flex items-center gap-2 p-2 bg-white/5 border border-white/10 rounded">
              <code className="flex-1 text-xs text-cyan-300 font-mono">
                {arg.flag} {arg.type !== 'bool' && arg.type !== 'flag' && `= ${JSON.stringify(arg.value)}`}
              </code>
              <span className="text-[10px] text-white/50 uppercase">{arg.type}</span>
              <button
                type="button"
                onClick={() => editArg(index)}
                className="text-xs px-2 py-0.5 bg-blue-500/20 border border-blue-500/40 rounded hover:bg-blue-500/30"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => deleteArg(index)}
                className="text-xs px-2 py-0.5 bg-red-500/20 border border-red-500/40 rounded hover:bg-red-500/30"
              >
                Delete
              </button>
                </div>
              ))}
            </div>
          )}

          {/* Add/Edit Form */}
          {editIndex !== null ? (
        <div className="space-y-3 p-3 bg-white/10 border border-white/20 rounded">
          <div className="text-sm font-medium text-white/90">
            {editIndex === -1 ? 'Add Custom Argument' : 'Edit Argument'}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-sm">
              Flag <span className="text-red-400">*</span>
              <input
                className="input mt-1 font-mono text-xs"
                placeholder="--enable-lora"
                value={editFlag}
                onChange={(e) => setEditFlag(e.target.value)}
              />
              <p className="text-[10px] text-white/50 mt-1">
                Must start with -- or -
              </p>
            </label>

            <label className="text-sm">
              Type
              <select className="input mt-1" value={editType} onChange={(e) => setEditType(e.target.value as CustomArg['type'])}>
                <option value="string">String</option>
                <option value="int">Integer</option>
                <option value="float">Float</option>
                <option value="bool">Boolean</option>
                <option value="flag">Flag (presence-only)</option>
                <option value="string_list">String List</option>
              </select>
            </label>

            <label className="text-sm">
              Value
              <input
                className="input mt-1"
                placeholder={
                  editType === 'bool' ? 'true/false' :
                  editType === 'flag' ? 'N/A (presence-only)' :
                  editType === 'string_list' ? 'item1, item2, item3' :
                  'value'
                }
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                disabled={editType === 'flag'}
              />
              <p className="text-[10px] text-white/50 mt-1">
                {editType === 'string_list' && 'Comma-separated values'}
                {editType === 'flag' && 'No value needed (flag presence only)'}
              </p>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" onClick={() => setEditIndex(null)}>Cancel</Button>
            <PrimaryButton type="button" onClick={saveEdit}>
              {editIndex === -1 ? 'Add Argument' : 'Save Changes'}
            </PrimaryButton>
          </div>
          </div>
          ) : (
            <div>
              <Button type="button" onClick={addNew}>
                + Add Custom Argument
              </Button>
            </div>
          )}

          {/* Warning About Forbidden Args */}
          <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs">
            <div className="font-medium text-amber-200 mb-1">⚠️ Security Note:</div>
            <div className="text-white/70">
              Some flags are blocked for security: <code>--host</code>, <code>--port</code>, <code>--api-key</code>.
              Request-time parameters (e.g., <code>--temperature</code>) should go in "Request Defaults" instead.
            </div>
          </div>
        </>
      )}

      {/* Environment Variables Tab */}
      {activeTab === 'env' && (
        <>
          <div className="mb-3 p-3 bg-purple-500/10 border border-purple-500/30 rounded text-xs">
            <div className="font-medium text-purple-200 mb-1">💡 Common Use Cases:</div>
            <ul className="text-white/70 space-y-1 list-disc pl-4">
              <li><strong>Nemotron FP8 MoE</strong>: <code>VLLM_USE_FLASHINFER_MOE_FP8=1</code></li>
              <li><strong>HuggingFace offline</strong>: <code>HF_HUB_OFFLINE=1</code></li>
              <li><strong>Logging level</strong>: <code>VLLM_LOGGING_LEVEL=DEBUG</code></li>
            </ul>
          </div>

          {/* Current Env Vars List */}
          {envVars.length > 0 && (
            <div className="space-y-2 mb-3">
              {envVars.map((env, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-white/5 border border-white/10 rounded">
                  <code className="flex-1 text-xs text-purple-300 font-mono">
                    {env.key}={env.value}
                  </code>
                  <button
                    type="button"
                    onClick={() => editEnvVar(index)}
                    className="text-xs px-2 py-0.5 bg-blue-500/20 border border-blue-500/40 rounded hover:bg-blue-500/30"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteEnvVar(index)}
                    className="text-xs px-2 py-0.5 bg-red-500/20 border border-red-500/40 rounded hover:bg-red-500/30"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add/Edit Env Form */}
          {editEnvIndex !== null ? (
            <div className="space-y-3 p-3 bg-white/10 border border-white/20 rounded">
              <div className="text-sm font-medium text-white/90">
                {editEnvIndex === -1 ? 'Add Environment Variable' : 'Edit Environment Variable'}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-sm">
                  Name <span className="text-red-400">*</span>
                  <input
                    className="input mt-1 font-mono text-xs"
                    placeholder="VLLM_USE_FLASHINFER_MOE_FP8"
                    value={editEnvKey}
                    onChange={(e) => setEditEnvKey(e.target.value)}
                  />
                  <p className="text-[10px] text-white/50 mt-1">
                    Environment variable name (uppercase recommended)
                  </p>
                </label>

                <label className="text-sm">
                  Value
                  <input
                    className="input mt-1"
                    placeholder="1"
                    value={editEnvValue}
                    onChange={(e) => setEditEnvValue(e.target.value)}
                  />
                  <p className="text-[10px] text-white/50 mt-1">
                    Value (empty string allowed)
                  </p>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Button type="button" onClick={() => setEditEnvIndex(null)}>Cancel</Button>
                <PrimaryButton type="button" onClick={saveEnv}>
                  {editEnvIndex === -1 ? 'Add Variable' : 'Save Changes'}
                </PrimaryButton>
              </div>
            </div>
          ) : (
            <div>
              <Button type="button" onClick={addNewEnv}>
                + Add Environment Variable
              </Button>
            </div>
          )}

          {/* Warning About Protected Env Vars */}
          <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs">
            <div className="font-medium text-amber-200 mb-1">⚠️ Protected Variables:</div>
            <div className="text-white/70">
              Some env vars are managed by Cortex: <code>CUDA_VISIBLE_DEVICES</code>, <code>NCCL_*</code>, <code>HF_HUB_OFFLINE</code> (for offline mode).
            </div>
          </div>
        </>
      )}
    </details>
  );
}

