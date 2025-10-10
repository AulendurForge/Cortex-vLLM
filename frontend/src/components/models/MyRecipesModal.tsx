'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../Modal';
import { Button, PrimaryButton, Card, Table, Badge } from '../UI';
import { ConfirmDialog } from '../Confirm';
import { useToast } from '../../providers/ToastProvider';
import apiFetch from '../../lib/api-clients';

interface Recipe {
  id: number;
  name: string;
  description: string | null;
  model_id: number | null;
  model_name: string;
  served_model_name: string;
  task: string;
  engine_type: string;
  created_at: string;
}

interface MyRecipesModalProps {
  open: boolean;
  onClose: () => void;
  onSelectRecipe?: (recipe: Recipe) => void;
}

export function MyRecipesModal({ 
  open, 
  onClose, 
  onSelectRecipe 
}: MyRecipesModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [engineFilter, setEngineFilter] = useState<string>('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: ['recipes', searchQuery, engineFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('q', searchQuery);
      if (engineFilter) params.append('engine_type', engineFilter);
      
      const response = await apiFetch<Recipe[]>(`/admin/recipes?${params.toString()}`);
      return response;
    },
    enabled: open,
  });

  const deleteRecipe = useMutation({
    mutationFn: async (id: number) => {
      await apiFetch(`/admin/recipes/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      addToast({ title: 'Recipe deleted successfully', kind: 'success' });
      setDeleteId(null);
    },
    onError: (error: any) => {
      addToast({ 
        title: `Failed to delete recipe: ${error?.message || 'Unknown error'}`, 
        kind: 'error' 
      });
    }
  });

  const handleSelectRecipe = (recipe: Recipe) => {
    if (onSelectRecipe) {
      onSelectRecipe(recipe);
    }
    onClose();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="My Recipes" variant="fullscreen">
        <div className="space-y-4">
          {/* Filters */}
          <Card className="p-4">
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Search Recipes
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input w-full"
                  placeholder="Search by name, description, or model..."
                />
              </div>
              <div className="w-48">
                <label className="block text-sm font-medium text-white/90 mb-2">
                  Engine Type
                </label>
                <select
                  value={engineFilter}
                  onChange={(e) => setEngineFilter(e.target.value)}
                  className="input w-full"
                >
                  <option value="">All Engines</option>
                  <option value="vllm">vLLM</option>
                  <option value="llamacpp">llama.cpp</option>
                </select>
              </div>
            </div>
          </Card>

          {/* Recipes Table */}
          <Card className="p-2">
            {isLoading ? (
              <div className="text-center py-8 text-white/70">
                Loading recipes...
              </div>
            ) : recipes.length === 0 ? (
              <div className="text-center py-8 text-white/70">
                {searchQuery || engineFilter ? 'No recipes match your filters.' : 'No recipes saved yet.'}
              </div>
            ) : (
              <Table>
                <thead className="text-left">
                  <tr>
                    <th>Name</th>
                    <th>Model</th>
                    <th>Engine</th>
                    <th>Description</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recipes.map((recipe) => (
                    <tr key={recipe.id} className="group">
                      <td>
                        <div className="font-medium text-white/90">
                          {recipe.name}
                        </div>
                      </td>
                      <td>
                        <div className="text-sm">
                          <div className="font-mono text-xs text-white/70">
                            {recipe.served_model_name}
                          </div>
                          <div className="text-white/60">
                            {recipe.model_name}
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge className={
                          recipe.engine_type === 'llamacpp' ? 
                            'bg-green-500/20 text-green-200 border border-green-400/30' :
                            'bg-blue-500/20 text-blue-200 border border-blue-400/30'
                        }>
                          {recipe.engine_type === 'llamacpp' ? 'llama.cpp' : 'vLLM'}
                        </Badge>
                      </td>
                      <td>
                        <div className="text-sm text-white/70 max-w-xs truncate">
                          {recipe.description || 'No description'}
                        </div>
                      </td>
                      <td>
                        <div className="text-sm text-white/70">
                          {formatDate(recipe.created_at)}
                        </div>
                      </td>
                      <td className="text-right space-x-2">
                        {onSelectRecipe && (
                          <Button
                            onClick={() => handleSelectRecipe(recipe)}
                            className="bg-emerald-500/20 border-emerald-500/40 hover:bg-emerald-500/30"
                          >
                            Use Recipe
                          </Button>
                        )}
                        <Button
                          onClick={() => setDeleteId(recipe.id)}
                          className="bg-red-500/20 border-red-500/40 hover:bg-red-500/30 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          {/* Summary */}
          <div className="text-sm text-white/60 text-center">
            {recipes.length} recipe{recipes.length !== 1 ? 's' : ''} found
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteId !== null}
        title="Delete Recipe?"
        description={
          <div>
            Are you sure you want to delete this recipe? This action cannot be undone.
            {deleteId && (
              <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded">
                <strong className="text-red-300">
                  {recipes.find(r => r.id === deleteId)?.name}
                </strong>
              </div>
            )}
          </div>
        }
        confirmLabel={deleteRecipe.isPending ? 'Deleting...' : 'Delete Recipe'}
        onConfirm={() => deleteId && deleteRecipe.mutate(deleteId)}
        onClose={() => setDeleteId(null)}
      />
    </>
  );
}
