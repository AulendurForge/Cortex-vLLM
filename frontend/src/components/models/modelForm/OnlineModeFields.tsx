'use client';

import React from 'react';
import { Tooltip } from '../../Tooltip';

interface OnlineModeFieldsProps {
  repoId: string;
  hfToken: string;
  onRepoIdChange: (value: string) => void;
  onHfTokenChange: (value: string) => void;
  modeLocked?: boolean;
}

export function OnlineModeFields({ repoId, hfToken, onRepoIdChange, onHfTokenChange, modeLocked }: OnlineModeFieldsProps) {
  return (
    <>
      <label className="text-sm md:col-span-2">Hugging Face repo_id
        <input 
          className="input mt-1" 
          placeholder="meta-llama/Meta-Llama-3-8B-Instruct" 
          value={repoId}
          onChange={(e) => onRepoIdChange(e.target.value)} 
          required 
          readOnly={modeLocked}
        />
        <p className="text-[11px] text-white/50 mt-1">
          Repository identifier on Hugging Face (owner/repo). The server will download weights into the shared HF cache. 
          <Tooltip text="Example: meta-llama/Meta-Llama-3-8B-Instruct. Requires network access or prewarmed cache." />
        </p>
      </label>
      <label className="text-sm md:col-span-2">Hugging Face access token (optional)
        <input 
          className="input mt-1" 
          type="password" 
          placeholder="hf_... (stored with this model)" 
          value={hfToken || ''}
          onChange={(e) => onHfTokenChange(e.target.value)} 
        />
        <p className="text-[11px] text-white/50 mt-1">
          Used to download gated/private repos. Leave blank to use the server environment token. 
          Stored server‑side and not shown after saving.
        </p>
      </label>
    </>
  );
}




