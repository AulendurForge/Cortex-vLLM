'use client';

import { Card } from './UI';

export function WipBanner({ title = 'Work in progress', details }: { title?: string; details?: string }) {
  return (
    <Card className="p-3 bg-amber-500/10 text-amber-100 border border-glass">
      <div className="font-medium">{title}</div>
      <div className="text-sm mt-1 opacity-90">
        {details || 'This view is a stub. Functionality and full CRUD are being implemented. See plan for status.'}
      </div>
    </Card>
  );
}


