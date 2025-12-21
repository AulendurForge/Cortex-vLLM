'use client';

import { ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './UI';

type Props = {
  open: boolean;
  title?: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmDialog({ 
  open, 
  title = 'Confirm Action', 
  description, 
  confirmLabel = 'Confirm', 
  cancelLabel = 'Cancel', 
  onConfirm, 
  onClose 
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-6">
        {description && (
          <div className="text-white/70 text-sm leading-relaxed bg-white/5 p-4 rounded-2xl border border-white/5">
            {description}
          </div>
        )}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="default" onClick={onClose} className="px-6">
            {cancelLabel}
          </Button>
          <Button variant="primary" onClick={onConfirm} className="px-8 shadow-lg shadow-indigo-500/20">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
