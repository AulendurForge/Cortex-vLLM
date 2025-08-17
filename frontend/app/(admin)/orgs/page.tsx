'use client';

import { Card, Table, Button, PrimaryButton, PageHeader } from '../../../src/components/UI';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiFetch from '../../../src/lib/api-clients';
import { useState } from 'react';
import { Modal } from '../../../src/components/Modal';
import { ConfirmDialog } from '../../../src/components/Confirm';

type Org = { id: number; name: string };

export default function OrgsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editOrg, setEditOrg] = useState<Org | null>(null);
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: () => apiFetch<Org[]>('/admin/orgs') });
  const create = useMutation({
    mutationFn: (name: string) => apiFetch<Org>('/admin/orgs', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orgs'] }),
  });
  const update = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => apiFetch<Org>(`/admin/orgs/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orgs'] }),
  });
  const [confirmDelete, setConfirmDelete] = useState<Org | null>(null);
  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/orgs/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orgs'] }),
    onError: (e: any) => {
      alert(`Delete failed${e?.request_id ? ` (request_id: ${e.request_id})` : ''}`);
    },
  });

  const onCreate = async (form: FormData) => {
    const name = String(form.get('name') || '').trim();
    if (!name) return;
    await create.mutateAsync(name);
    setOpen(false);
  };

  return (
    <section className="space-y-4">
      <PageHeader title="Organizations / Programs" actions={<PrimaryButton onClick={() => setOpen(true)}>New Org/Program</PrimaryButton>} />

      <Card className="p-2">
        <Table>
          <thead className="text-left">
            <tr>
              <th>Name</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(orgs.data || []).map((o) => (
              <tr key={o.id}>
                <td>{o.name}</td>
                <td className="text-right space-x-2">
                  <Button onClick={() => setEditOrg(o)}>Rename</Button>
                  <Button onClick={() => setConfirmDelete(o)}>Delete</Button>
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete org/program?"
        description={<span>Are you sure you want to delete org/program <b>{confirmDelete?.name}</b>? This cannot be undone.</span>}
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

      <Modal open={open} onClose={() => setOpen(false)} title="Create Org/Program">
        <form action={(fd) => onCreate(fd)} className="grid grid-cols-1 gap-3">
          <label className="text-sm">Name<input name="name" className="input mt-1" placeholder="Unit Alpha" /></label>
          <div><PrimaryButton type="submit">Create</PrimaryButton></div>
        </form>
      </Modal>

      <Modal open={!!editOrg} onClose={() => setEditOrg(null)} title="Rename Org/Program">
        <form action={(fd) => {
          const name = String(fd.get('name') || '').trim();
          if (editOrg && name) update.mutate({ id: editOrg.id, name });
          setEditOrg(null);
        }} className="grid grid-cols-1 gap-3">
          <label className="text-sm">Name<input name="name" defaultValue={editOrg?.name || ''} className="input mt-1" /></label>
          <div><PrimaryButton type="submit">Save</PrimaryButton></div>
        </form>
      </Modal>
    </section>
  );
}


