'use client';

import React from 'react';
import { Tooltip } from '../../Tooltip';
import { ModelFormValues } from '../ModelForm';

interface RequestDefaultsSectionProps {
  values: ModelFormValues;
  onChange: (field: keyof ModelFormValues, value: any) => void;
}

/**
 * Request Defaults Section (Plane C)
 * 
 * These parameters are applied at REQUEST TIME by the gateway, not at container startup.
 * Client-specified values always take precedence over these defaults.
 * 
 * See cortexSustainmentPlan.md for architectural details.
 */
export function RequestDefaultsSection({ values, onChange }: RequestDefaultsSectionProps) {
  if (!values.engine_type) return null;

  return (
    <div className="md:col-span-2 space-y-4">
      <div className="text-sm font-medium text-purple-300 flex items-center gap-2 mb-2">
        📊 Request Defaults (Sampling Parameters)
      </div>
      
      <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded text-xs">
        <div className="font-medium text-blue-200 mb-1">ℹ️ What are Request Defaults?</div>
        <div className="text-white/80">
          These parameters are applied <strong>per-request</strong> by the gateway, NOT at container startup.
          Clients can override these values in their API calls. Use this to set sensible defaults for
          temperature, repetition control, etc.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="text-sm">
          Temperature
          <input 
            className="input mt-1" 
            type="number" 
            min={0.0} 
            max={2.0} 
            step={0.1} 
            value={values.temperature ?? 0.8} 
            onChange={(e) => onChange('temperature', Number(e.target.value) || 0.8)} 
          />
          <p className="text-[11px] text-white/50 mt-1">
            Sampling temperature. 0.0 = deterministic, 1.0 = balanced, 2.0 = very random. 
            <Tooltip text="Controls randomness in token selection. Applied per-request. Client can override." />
          </p>
        </label>

        <label className="text-sm">
          Top-P
          <input 
            className="input mt-1" 
            type="number" 
            min={0.0} 
            max={1.0} 
            step={0.05} 
            value={values.top_p ?? 0.9} 
            onChange={(e) => onChange('top_p', Number(e.target.value) || 0.9)} 
          />
          <p className="text-[11px] text-white/50 mt-1">
            Nucleus sampling threshold. 0.1 = conservative, 0.9 = balanced, 1.0 = all tokens. 
            <Tooltip text="Samples from tokens that make up this probability mass. Applied per-request." />
          </p>
        </label>

        <label className="text-sm">
          Top-K
          <input 
            className="input mt-1" 
            type="number" 
            min={1} 
            max={100} 
            step={1} 
            value={values.top_k ?? 40} 
            onChange={(e) => onChange('top_k', Number(e.target.value) || 40)} 
          />
          <p className="text-[11px] text-white/50 mt-1">
            Limit sampling to top K tokens. 1 = greedy, 40 = balanced, 100 = diverse. 
            <Tooltip text="Filters out low-probability tokens. Applied per-request." />
          </p>
        </label>

        <label className="text-sm">
          Repetition Penalty
          <input 
            className="input mt-1" 
            type="number" 
            min={1.0} 
            max={2.0} 
            step={0.1} 
            value={values.repetition_penalty ?? 1.2} 
            onChange={(e) => onChange('repetition_penalty', Number(e.target.value) || 1.2)} 
          />
          <p className="text-[11px] text-white/50 mt-1">
            Penalty for repeated tokens. 1.0 = no penalty, 1.2 = moderate penalty. 
            <Tooltip text="Higher values reduce repetition. Applied per-request. Gateway translates to engine-specific key." />
          </p>
        </label>

        <label className="text-sm">
          Frequency Penalty
          <input 
            className="input mt-1" 
            type="number" 
            min={-2.0} 
            max={2.0} 
            step={0.1} 
            value={values.frequency_penalty ?? 0.5} 
            onChange={(e) => onChange('frequency_penalty', Number(e.target.value) || 0.5)} 
          />
          <p className="text-[11px] text-white/50 mt-1">
            Penalty based on token frequency. 0.0 = no penalty, 0.5 = moderate penalty. 
            <Tooltip text="Reduces likelihood of frequently used tokens. Applied per-request." />
          </p>
        </label>

        <label className="text-sm">
          Presence Penalty
          <input 
            className="input mt-1" 
            type="number" 
            min={-2.0} 
            max={2.0} 
            step={0.1} 
            value={values.presence_penalty ?? 0.5} 
            onChange={(e) => onChange('presence_penalty', Number(e.target.value) || 0.5)} 
          />
          <p className="text-[11px] text-white/50 mt-1">
            Penalty for tokens already present in context. 0.0 = no penalty, 0.5 = moderate penalty. 
            <Tooltip text="Encourages new topics and reduces repetition. Applied per-request." />
          </p>
        </label>
      </div>

      <div className="mt-3 p-2 bg-white/5 border border-white/10 rounded text-xs">
        <div className="font-medium text-white/80 mb-1">⚡ How this works:</div>
        <ul className="text-white/70 space-y-1 list-disc pl-4">
          <li>These are <strong>defaults</strong> - clients can override them in API requests</li>
          <li>Gateway merges these into requests that don't specify values</li>
          <li>Gateway automatically translates parameter names for llama.cpp (e.g., "temperature" → "temp")</li>
          <li>Changes take effect immediately - no container restart needed!</li>
        </ul>
      </div>

      {/* Advanced: Custom Request Extensions */}
      <details className="mt-3 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded border-l-2 border-l-cyan-500">
        <summary className="cursor-pointer text-sm font-medium text-cyan-300 mb-2 flex items-center gap-2">
          <span>⚙️</span> Advanced: Custom Request Extensions
        </summary>
        
        <div className="mt-3 text-xs text-white/80 mb-2">
          Add model-specific request parameters as JSON. These will be merged with every request.
          Use this for <code>vllm_xargs</code>, custom chat templates, or model-specific fields.
        </div>

        <label className="text-sm block">
          Custom Request JSON
          <textarea
            className="input mt-1 font-mono text-xs"
            rows={6}
            placeholder={`{
  "vllm_xargs": {
    "custom_param": "value"
  },
  "stop": ["###", "</s>"]
}`}
            value={values.custom_request_json || ''}
            onChange={(e) => onChange('custom_request_json', e.target.value)}
          />
          <p className="text-[11px] text-white/50 mt-1">
            Enter valid JSON. Gateway will merge these fields into all requests.
            <Tooltip text="Use this for vllm_xargs (model-specific SamplingParams), custom chat templates, or any model-specific request parameters. Must be valid JSON." />
          </p>
        </label>

        <div className="mt-2 p-2 bg-blue-500/10 border border-blue-500/30 rounded text-xs">
          <div className="font-medium text-blue-200 mb-1">💡 Example Use Cases:</div>
          <ul className="text-white/70 space-y-1 list-disc pl-4">
            <li><strong>DeepSeek R1 reasoning</strong>: <code>{`{"vllm_xargs": {"min_thinking_tokens": 100}}`}</code></li>
            <li><strong>Custom stop sequences</strong>: <code>{`{"stop": ["</s>", "###"]}`}</code></li>
            <li><strong>Model-specific params</strong>: Any field your model's API accepts</li>
          </ul>
        </div>
      </details>
    </div>
  );
}

