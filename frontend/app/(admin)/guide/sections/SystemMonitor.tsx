'use client';

import { Card, H1 } from '../../../../src/components/UI';

export default function SystemMonitorGuide() {
  return (
    <section className="space-y-4">
      <H1>System Monitoring</H1>
      <Card className="p-4">
        <div className="text-sm text-white/80">
          This section will describe how Cortex detects GPUs, CUDA/NVIDIA drivers, and surfaces host metrics for administrators.
        </div>
      </Card>
    </section>
  );
}


