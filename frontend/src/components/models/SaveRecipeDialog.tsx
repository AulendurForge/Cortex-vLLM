'use client';

import React, { useState } from 'react';
import { Modal } from '../Modal';
import { Button, PrimaryButton } from '../UI';
import { useToast } from '../../providers/ToastProvider';
import apiFetch from '../../lib/api-clients';

interface SaveRecipeDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  modelId: number;
  modelName: string;
  engineType: string;
}

export function SaveRecipeDialog({ 
  open, 
  onClose, 
  onSuccess, 
  modelId, 
  modelName, 
  engineType 
}: SaveRecipeDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      addToast({ title: 'Recipe name is required', kind: 'error' });
      return;
    }

    setIsLoading(true);
    
    try {
      await apiFetch(`/admin/recipes/from-model/${modelId}`, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null
        })
      });

      addToast({ 
        title: 'Recipe saved successfully!', 
        kind: 'success' 
      });
      
      setName('');
      setDescription('');
      onSuccess();
      onClose();
    } catch (error: any) {
      addToast({ 
        title: `Failed to save recipe: ${error?.message || 'Unknown error'}`, 
        kind: 'error' 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setName('');
      setDescription('');
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Save Recipe">
      <div className="space-y-4">
        <div className="text-sm text-white/70">
          Save the current configuration of <strong>{modelName}</strong> ({engineType}) as a reusable recipe.
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              Recipe Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input w-full"
              placeholder="e.g., GPT-OSS 120B Optimized"
              disabled={isLoading}
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input w-full h-20 resize-none"
              placeholder="Optional description of this recipe's purpose and configuration..."
              disabled={isLoading}
            />
          </div>
          
          <div className="flex justify-end gap-2 pt-4">
            <Button 
              type="button" 
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <PrimaryButton 
              type="submit"
              disabled={isLoading || !name.trim()}
            >
              {isLoading ? 'Saving...' : 'Save Recipe'}
            </PrimaryButton>
          </div>
        </form>
      </div>
    </Modal>
  );
}
