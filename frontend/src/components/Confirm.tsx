'use client';

import { ReactNode } from 'react';
import { Modal } from './Modal';
import { PrimaryButton, Button } from './UI';

type Props = {
  open: boolean;
  title?: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmDialog({ open, title = 'Confirm', description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onClose }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        {description && <div className="text-white/80 text-sm">{description}</div>}
        <div className="flex items-center justify-end gap-2">
          <Button onClick={onClose}>{cancelLabel}</Button>
          <PrimaryButton onClick={onConfirm}>{confirmLabel}</PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}


