'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiFetch from '../../../src/lib/api-clients';
import { KeysListSchema, CreateKeyResponseSchema } from '../../../src/lib/validators';
import { useState } from 'react';
import { useToast } from '../../../src/providers/ToastProvider';
import { Modal } from '../../../src/components/Modal';
import { PageHeader } from '../../../src/components/UI';
import { ConfirmDialog } from '../../../src/components/Confirm';
import { useEffect, useState as useReactState } from 'react';
import { z } from 'zod';

const KeyCreateSchema = z.object({
  scopes: z.string().default('chat,completions,embeddings'),
  expires_at: z.string().nullable().optional(),
  ip_allowlist: z.string().default(''),
  user_id: z.number().optional(),
  org_id: z.number().optional(),
});

type KeyRow = { id: number; prefix: string; scopes: string; expires_at: string | null; last_used_at: string | null; disabled: boolean };
type CreateResp = { id: number; prefix: string; token: string };

export default function KeysPage() {
  const qc = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { addToast } = useToast();
  const [orgOptions, setOrgOptions] = useReactState<{ id: number; name: string }[]>([]);
  const [userOptions, setUserOptions] = useReactState<{ id: number; username: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const orgs = await apiFetch<any>('/admin/orgs/lookup');
        setOrgOptions(orgs || []);
      } catch {}
      try {
        const users = await apiFetch<any>('/admin/users/lookup');
        setUserOptions(users || []);
      } catch {}
    })();
  }, []);

  const [filters, setFilters] = useReactState<{ q: string; user_id?: number | ''; org_id?: number | ''; sort: string }>({ q: '', sort: 'created_at:desc' });
  const list = useQuery({
    queryKey: ['keys', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.q) params.set('q', filters.q);
      if (filters.user_id) params.set('user_id', String(filters.user_id));
      if (filters.org_id) params.set('org_id', String(filters.org_id));
      if (filters.sort) params.set('sort', filters.sort);
      params.set('include_names', 'true');
      const raw = await apiFetch<any>(`/admin/keys?${params.toString()}`);
      const parsed = KeysListSchema.parse(raw);
      return parsed as KeyRow[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: z.infer<typeof KeyCreateSchema>) => {
      const raw = await apiFetch<any>('/admin/keys', { method: 'POST', body: JSON.stringify(input) });
      const parsed = CreateKeyResponseSchema.parse(raw);
      return parsed as CreateResp;
    },
    onSuccess: (data) => {
      setToken(data.token);
      setTokenModalOpen(true);
      qc.invalidateQueries({ queryKey: ['keys'] });
      setErrorMsg(null);
      addToast({ title: 'Key created', kind: 'success' });
      setOpen(false);
    },
    onError: (e: any) => {
      const rid = e?.request_id ? ` (request_id: ${e.request_id})` : '';
      setErrorMsg(`Create failed: ${e?.message ?? 'unknown'}${rid}`);
      setMessage(null);
      addToast({ title: `Create failed: ${e?.message ?? 'unknown'}`, kind: 'error' });
    }
  });

  const [confirmRevoke, setConfirmRevoke] = useReactState<number | null>(null);
  const revoke = useMutation({
    mutationFn: async (id: number) => apiFetch(`/admin/keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['keys'] });
      setMessage('Key revoked');
      setErrorMsg(null);
    },
    onError: (e: any) => {
      const rid = e?.request_id ? ` (request_id: ${e.request_id})` : '';
      setErrorMsg(`Revoke failed: ${e?.message ?? 'unknown'}${rid}`);
      setMessage(null);
    }
  });

  const onCreate = async (formData: FormData) => {
    const userRaw = String(formData.get('user_id') || '').trim();
    const orgRaw = String(formData.get('org_id') || '').trim();
    const payload = KeyCreateSchema.parse({
      scopes: formData.get('scopes') || 'chat,completions,embeddings',
      expires_at: formData.get('expires_at') || null,
      ip_allowlist: formData.get('ip_allowlist') || '',
      user_id: userRaw ? Number(userRaw) : undefined,
      org_id: orgRaw ? Number(orgRaw) : undefined,
    });
    await create.mutateAsync(payload);
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title="API Keys"
        actions={
          <div className="flex items-end gap-2">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <label className="text-xs">
                Search
                <input className="input mt-1" placeholder="prefix…" value={filters.q}
                  onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
              </label>
              <label className="text-xs">
                User
                <select className="input mt-1" value={String(filters.user_id ?? '')}
                  onChange={(e) => setFilters({ ...filters, user_id: e.target.value ? Number(e.target.value) : '' })}>
                  <option value="">—</option>
                  {userOptions.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                </select>
              </label>
              <label className="text-xs">
                Org/Program
                <select className="input mt-1" value={String(filters.org_id ?? '')}
                  onChange={(e) => setFilters({ ...filters, org_id: e.target.value ? Number(e.target.value) : '' })}>
                  <option value="">—</option>
                  {orgOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
              <label className="text-xs">
                Sort
                <select className="input mt-1" value={filters.sort}
                  onChange={(e) => setFilters({ ...filters, sort: e.target.value })}>
                  <option value="created_at:desc">Newest</option>
                  <option value="created_at:asc">Oldest</option>
                  <option value="last_used_at:desc">Last used (desc)</option>
                  <option value="last_used_at:asc">Last used (asc)</option>
                </select>
              </label>
            </div>
            <button className="btn btn-primary" onClick={() => setOpen(true)}>New Key</button>
          </div>
        }
      />

      {/* removed inline token banner; success is now handled via modal */}
      {errorMsg && (
        <div className="card p-3 border border-glass bg-red-500/10 text-red-200" role="alert">{errorMsg}</div>
      )}

      

      <Modal open={open} onClose={() => setOpen(false)} title="Create API Key">
        <form action={onCreate} className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="text-sm">
          Scopes
          <input name="scopes" defaultValue="chat,completions,embeddings" className="input mt-1" />
        </label>
        <label className="text-sm">
          Expires At (ISO)
          <input name="expires_at" placeholder="YYYY-MM-DDTHH:mm:ssZ" className="input mt-1" />
        </label>
        <label className="text-sm">
          IP Allowlist (comma-separated)
          <input name="ip_allowlist" placeholder="1.2.3.4,5.6.7.8" className="input mt-1" />
        </label>
        <label className="text-sm">
          Attribute to User (optional)
          <select name="user_id" className="input mt-1">
            <option value="">—</option>
            {userOptions.map(u => (<option key={u.id} value={u.id}>{u.username}</option>))}
          </select>
        </label>
        <label className="text-sm">
          Attribute to Org/Program (optional)
          <select name="org_id" className="input mt-1">
            <option value="">—</option>
            {orgOptions.map(o => (<option key={o.id} value={o.id}>{o.name}</option>))}
          </select>
        </label>
          <div className="md:col-span-3">
            <button className="btn btn-primary bg-white text-black hover:bg-white/90" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create Key'}
          </button>
        </div>
        </form>
      </Modal>

      <Modal open={tokenModalOpen} onClose={() => { setTokenModalOpen(false); setToken(null); }} title="API Key Created">
        <div className="space-y-3">
          <div className="text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-sm">
            Copy this token now. You will not be able to view it again.
          </div>
          <div className="glass rounded-md px-3 py-2 flex items-center justify-between gap-2">
            <code className="font-mono text-sm break-all select-all">{token}</code>
            <button
              className="btn"
              onClick={async () => { if (token) { await navigator.clipboard.writeText(token); addToast({ title: 'Copied to clipboard', kind: 'success' }); } }}
              aria-label="Copy API key"
              title="Copy API key"
            >
              {/* Copy icon (inline SVG) */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v12h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
              </svg>
            </button>
          </div>
          <div className="text-right">
            <button className="btn btn-primary" onClick={() => { setTokenModalOpen(false); setToken(null); }}>Done</button>
          </div>
        </div>
      </Modal>

      <div className="overflow-x-auto card p-2">
        <table className="table">
          <thead className="text-left">
            <tr>
              <th className="p-2">Prefix</th>
              <th className="p-2">Scopes</th>
              <th className="p-2">Expires</th>
              <th className="p-2">Last Used</th>
              <th className="p-2">User</th>
                <th className="p-2">Org/Prog</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {(list.data || []).map((k) => (
              <tr key={k.id} className="border-t">
                <td className="p-2 font-mono">{k.prefix}</td>
                <td className="p-2">{k.scopes}</td>
                <td className="p-2">{k.expires_at ? new Date(k.expires_at).toLocaleString() : '-'}</td>
                <td className="p-2">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : '-'}</td>
                <td className="p-2">{(k as any).username ?? (k as any).user_id ?? '-'}</td>
                <td className="p-2">{(k as any).org_name ?? (k as any).org_id ?? '-'}</td>
                <td className="p-2 text-right">
                  {!k.disabled && (
                    <button className="text-sm underline text-red-300 hover:text-red-200" onClick={() => setConfirmRevoke(k.id)} disabled={revoke.isPending}>
                      {revoke.isPending ? 'Revoking…' : 'Revoke'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={confirmRevoke != null}
        title="Revoke API key?"
        description={<span>This will disable the key immediately. This action cannot be undone.</span>}
        confirmLabel="Revoke"
        onConfirm={() => { if (confirmRevoke != null) revoke.mutate(confirmRevoke); setConfirmRevoke(null); }}
        onClose={() => setConfirmRevoke(null)}
      />
    </section>
  );
}