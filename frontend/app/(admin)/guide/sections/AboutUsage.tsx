'use client';

import { Card, H1 } from '../../../../src/components/UI';
import { WipBanner } from '../../../../src/components/Wip';

export default function AboutUsage() {
  return (
    <section className="space-y-4">
      <H1>About Usage</H1>
      <WipBanner details="Understanding usage metrics, pricing units, and quota management." />
      <Card className="p-4">
        <div className="text-sm text-white/80">Token estimation, metering, and alerting.</div>
      </Card>
    </section>
  );
}


