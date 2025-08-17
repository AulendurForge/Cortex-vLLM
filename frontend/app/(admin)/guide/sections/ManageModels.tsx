'use client';

import { Card, H1 } from '../../../../src/components/UI';
import { WipBanner } from '../../../../src/components/Wip';

export default function ManageModels() {
  return (
    <section className="space-y-4">
      <H1>Manage Models</H1>
      <WipBanner details="Documentation about adding, configuring, and monitoring models will appear here." />
      <Card className="p-4">
        <div className="text-sm text-white/80">Model pools, health monitoring, and configuration best practices.</div>
      </Card>
    </section>
  );
}


