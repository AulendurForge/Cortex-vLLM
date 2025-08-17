'use client';

import { Card, H1 } from '../../../../src/components/UI';
import { WipBanner } from '../../../../src/components/Wip';

export default function ApiKeys() {
  return (
    <section className="space-y-4">
      <H1>API Keys</H1>
      <WipBanner details="How to create, rotate, and manage API keys securely." />
      <Card className="p-4">
        <div className="text-sm text-white/80">Scopes, expiration, and recommended operational procedures.</div>
      </Card>
    </section>
  );
}


