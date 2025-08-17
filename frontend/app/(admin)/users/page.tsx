'use client';

import { Card, Table, Button, PrimaryButton, PageHeader } from '../../../src/components/UI';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiFetch from '../../../src/lib/api-clients';
import { useMemo, useState } from 'react';
import { Modal } from '../../../src/components/Modal';
import { ConfirmDialog } from '../../../src/components/Confirm';

type User = { id: number; username: string; role: string; org_id: number | null; status: string };
type Org = { id: number; name: string };

export default function UsersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<User | null>(null);
  const [filters, setFilters] = useState<{ q: string; org_id?: number | ''; role?: string | ''; status?: string | ''; sort: string }>({ q: '', sort: 'created_at:desc' });
  const users = useQuery({
    queryKey: ['users', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.q) params.set('q', filters.q);
      if (filters.org_id) params.set('org_id', String(filters.org_id));
      if (filters.role) params.set('role', String(filters.role));
      if (filters.status) params.set('status', String(filters.status));
      if (filters.sort) params.set('sort', filters.sort);
      return await apiFetch<User[]>(`/admin/users?${params.toString()}`);
    }
  });
  const orgs = useQuery({ queryKey: ['orgsLookup'], queryFn: () => apiFetch<Org[]>('/admin/orgs/lookup') });
  const orgNameById = useMemo(() => {
    const map = new Map<number, string>();
    (orgs.data || []).forEach(o => map.set(o.id, o.name));
    return map;
  }, [orgs.data]);
  const create = useMutation({
    mutationFn: (body: { username: string; password: string; role: string; org_id?: number }) =>
      apiFetch<User>('/admin/users', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
  const update = useMutation({
    mutationFn: (body: { id: number; role?: string; org_id?: number; password?: string; status?: string }) =>
      apiFetch<User>(`/admin/users/${body.id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);
  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: any) => {
      alert(`Delete failed${e?.request_id ? ` (request_id: ${e.request_id})` : ''}`);
    }
  });

  const onCreate = async (fd: FormData) => {
    const username = String(fd.get('username') || '').trim();
    const password = String(fd.get('password') || '').trim();
    const role = String(fd.get('role') || 'User');
    const org_id = Number(fd.get('org_id') || '') || undefined;
    if (!username || !password) return;
    await create.mutateAsync({ username, password, role, org_id });
    setOpen(false);
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title="Users"
        actions={
          <div className="flex items-end gap-2">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              <label className="text-xs">Search
                <input className="input mt-1" placeholder="username…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
              </label>
              <label className="text-xs">Org/Program
                <select className="input mt-1" value={String(filters.org_id ?? '')} onChange={(e) => setFilters({ ...filters, org_id: e.target.value ? Number(e.target.value) : '' })}>
                  <option value="">—</option>
                  {(orgs.data || []).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </label>
              <label className="text-xs">Role
                <select className="input mt-1" value={String(filters.role ?? '')} onChange={(e) => setFilters({ ...filters, role: e.target.value || '' })}>
                  <option value="">Any</option>
                  <option>User</option>
                  <option>Admin</option>
                </select>
              </label>
              <label className="text-xs">Status
                <select className="input mt-1" value={String(filters.status ?? '')} onChange={(e) => setFilters({ ...filters, status: e.target.value || '' })}>
                  <option value="">Any</option>
                  <option>active</option>
                  <option>disabled</option>
                </select>
              </label>
              <label className="text-xs">Sort
                <select className="input mt-1" value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}>
                  <option value="created_at:desc">Newest</option>
                  <option value="created_at:asc">Oldest</option>
                  <option value="username:asc">Username (A→Z)</option>
                  <option value="username:desc">Username (Z→A)</option>
                </select>
              </label>
            </div>
            <PrimaryButton onClick={() => setOpen(true)}>New User</PrimaryButton>
          </div>
        }
      />

      <Card className="p-2">
        <Table>
          <thead className="text-left">
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th>Org/Prog</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(users.data || []).map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.role}</td>
                <td>{u.org_id ? (orgNameById.get(u.org_id) || u.org_id) : '-'}</td>
                <td>{u.status}</td>
                <td className="text-right space-x-2">
                  <Button onClick={() => setEdit(u)}>Edit</Button>
                  <Button onClick={() => setConfirmDelete(u)}>Delete</Button>
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete user?"
        description={<span>Are you sure you want to delete user <b>{confirmDelete?.username}</b>? This cannot be undone.</span>}
        confirmLabel="Delete"
        onConfirm={() => { if (confirmDelete) remove.mutate(confirmDelete.id); setConfirmDelete(null); }}
        onClose={() => setConfirmDelete(null)}
      />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Create User">
        <form action={(fd) => onCreate(fd)} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm">Username<input name="username" className="input mt-1" /></label>
          <label className="text-sm">Password<input name="password" type="password" className="input mt-1" /></label>
          <label className="text-sm">Role
            <select name="role" className="input mt-1">
              <option>User</option>
              <option>Admin</option>
            </select>
          </label>
          <label className="text-sm">Org/Program
            <select name="org_id" className="input mt-1">
              <option value="">—</option>
              {(orgs.data || []).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <div className="md:col-span-2"><PrimaryButton type="submit">Create</PrimaryButton></div>
        </form>
      </Modal>

      <Modal open={!!edit} onClose={() => setEdit(null)} title="Edit User">
        <form action={(fd) => {
          if (!edit) return;
          const role = String(fd.get('role') || edit.role);
          const org_id = (fd.get('org_id') as string) ? Number(fd.get('org_id')) : undefined;
          const password = String(fd.get('password') || '');
          update.mutate({ id: edit.id, role, org_id, password: password || undefined });
          setEdit(null);
        }} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="text-sm opacity-80">User: {edit?.username} (id: {edit?.id})</div>
          <label className="text-sm">Role
            <select name="role" defaultValue={edit?.role} className="input mt-1">
              <option>User</option>
              <option>Admin</option>
            </select>
          </label>
          <label className="text-sm">Org/Program
            <select name="org_id" defaultValue={String(edit?.org_id ?? '')} className="input mt-1">
              <option value="">—</option>
              {(orgs.data || []).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className="text-sm md:col-span-2">Reset Password
            <input name="password" type="password" placeholder="leave blank to keep" className="input mt-1" />
          </label>
          <div className="md:col-span-2"><PrimaryButton type="submit">Save</PrimaryButton></div>
        </form>
      </Modal>
    </section>
  );
}


