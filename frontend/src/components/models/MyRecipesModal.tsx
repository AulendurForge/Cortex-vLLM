'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiFetch from '../../lib/api-clients';
import { Card, Table, Button, PageHeader, Badge, InfoBox, SectionTitle } from '../UI';
import { Modal } from '../Modal';
import { ConfirmDialog } from '../Confirm';
import { useState } from 'react';
import { useToast } from '../../providers/ToastProvider';
import { cn } from '../../lib/cn';

interface Recipe {
  id: number;
  name: string;
  model_name: string;
  engine_type: string;
  created_at: string;
}

interface MyRecipesModalProps {
  open: boolean;
  onClose: () => void;
  onSelectRecipe: (recipe: Recipe) => void;
}

export function MyRecipesModal({ 
  open, 
  onClose, 
  onSelectRecipe 
}: MyRecipesModalProps) {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const recipes = useQuery({
    queryKey: ['recipes'],
    queryFn: async () => await apiFetch<Recipe[]>('/admin/recipes'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/recipes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipes'] });
      addToast({ title: 'Recipe deleted', kind: 'success' });
      setDeleteId(null);
    },
    onError: (e: any) => {
      addToast({ title: `Delete failed: ${e?.message || 'Unknown error'}`, kind: 'error' });
    }
  });

  return (
    <>
      <Modal open={open} onClose={onClose} title="Configuration Catalog" variant="fullscreen">
        <div className="space-y-4 max-w-6xl mx-auto py-2">
          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">My Recipes</h1>
            <p className="text-white/50 text-xs leading-relaxed max-w-2xl">
              Reusable model deployment blueprints. Load a recipe to pre-populate configuration fields with tested hardware and software parameters.
            </p>
          </header>

          <Card className="p-0 overflow-hidden shadow-2xl border-white/5 bg-white/[0.01]">
            <Table>
              <thead>
                <tr>
                  <th className="pl-6">Recipe Name</th>
                  <th>Hardware Class</th>
                  <th>Engine Strategy</th>
                  <th>Created</th>
                  <th className="text-right pr-6">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(recipes.data || []).map((r) => (
                  <tr key={r.id} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="pl-6">
                      <div className="flex items-center gap-3 py-1.5">
                        <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-xs font-bold text-purple-400 group-hover:scale-110 transition-transform duration-500">
                          📜
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-white text-xs">{r.name}</span>
                          <span className="text-[9px] text-white/30 uppercase tracking-widest">{r.model_name}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge className="bg-indigo-500/10 text-indigo-300 border-indigo-500/20 text-[8px]">
                        OPTIMIZED
                      </Badge>
                    </td>
                    <td>
                      <Badge className={r.engine_type === 'llamacpp' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-blue-500/10 text-blue-300 border-blue-500/20'}>
                        {r.engine_type}
                      </Badge>
                    </td>
                    <td className="text-[9px] text-white/40 font-mono">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td className="text-right pr-6">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                          variant="cyan" 
                          size="sm" 
                          onClick={() => { onSelectRecipe(r); onClose(); }}
                          className="px-3 font-bold uppercase tracking-widest text-[8px]"
                        >
                          Load Blueprint
                        </Button>
                        <Button 
                          variant="danger" 
                          size="sm" 
                          onClick={() => setDeleteId(r.id)}
                          className="px-2"
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(recipes.data || []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-16 text-white/40">
                      <div className="text-4xl mb-4 opacity-10">📜</div>
                      <div className="text-xs font-bold uppercase tracking-[0.2em]">No Blueprints cataloged</div>
                      <p className="text-[10px] mt-1 italic">Save a configuration from the Models page to see it here.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>

          <InfoBox variant="blue" title="Efficiency Tip" className="text-[10px] p-2">
            Using recipes reduces deployment errors by locking in Tensor Parallel sizes and quantization levels that have been pre-validated for your cluster.
          </InfoBox>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        title="Purge Recipe?"
        description="This will permanently remove this deployment blueprint from your local catalog. Actual running models will not be affected."
        confirmLabel="Purge Blueprint"
        onConfirm={() => deleteId && remove.mutate(deleteId)}
        onClose={() => setDeleteId(null)}
      />
    </>
  );
}
