'use client';

import Image from 'next/image';
import { Card } from '../../../../src/components/UI';

export default function AboutCortex() {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-lg font-semibold">What is CORTEX?</h2>
        <p className="mt-2 text-white/80 text-sm">
          CORTEX is a secure, OpenAI-compatible AI gateway developed by Aulendur LLC. The mission: make advanced AI
          capabilities usable, reliable, and governable inside classified and restricted networks, and to enable rapid
          integration of AI into mission workflows.
        </p>
      </Card>

      <Card className="p-4">
        <h3 className="font-medium">Design Goals</h3>
        <ul className="mt-2 list-disc pl-5 text-white/80 text-sm space-y-1">
          <li>Deliver high-performance LLM inference in secure, disconnected, or bandwidth-constrained environments.</li>
          <li>Provide an OpenAI-compatible API layer to simplify application integration and tool reuse.</li>
          <li>Support multi-model orchestration (generation, embeddings) with health checks, metrics, and routing.</li>
          <li>Serve and orchestrate enterprise‑scalable vLLM as the primary inference provider (single node to clustered pools).</li>
          <li>Enable attribution, auditing, and administrative controls (orgs, users, keys, usage metering).</li>
          <li>Fuse disparate tools and datasets through a common gateway to leverage AI across the enterprise.</li>
        </ul>
      </Card>

      <Card className="p-4">
        <h3 className="font-medium">How It Helps</h3>
        <p className="mt-2 text-white/80 text-sm">
          CORTEX abstracts the complexity of model hosting and security from end users and analysts. It provides
          a hardened entry point where teams can authenticate, attribute usage, and call a consistent API––whether the
          underlying engine is open-source, commercial, or a bespoke model. This lets planners focus on scenario design
          and analysis, while CORTEX handles performance, safety, and governance.
        </p>
      </Card>

      <Card className="p-4">
        <h3 className="font-medium">Key Capabilities</h3>
        <div className="mt-2 grid md:grid-cols-2 gap-3 text-sm">
          <ul className="list-disc pl-5 text-white/80 space-y-1">
            <li>OpenAI-compatible REST API (chat, completions, embeddings)</li>
            <li>Health monitoring and circuit breaking of upstream model servers</li>
            <li>Per-key usage metering with request IDs for traceability</li>
            <li>Admin UI for keys, orgs/programs, users, and usage insights</li>
          </ul>
          <ul className="list-disc pl-5 text-white/80 space-y-1">
            <li>vLLM orchestration: pool multiple engines, select by policy, and scale horizontally</li>
            <li>Attribution by user and organization/program</li>
            <li>Secure-by-default cookie auth (dev) and pluggable auth in production</li>
            <li>Composable frontend with a modern design system</li>
            <li>Dev/ops ready: Docker, Prometheus metrics, optional tracing</li>
          </ul>
        </div>
      </Card>

      <div className="text-xs text-white/60">
        Built for the mission: integrate advanced AI into secure environments while respecting security, attribution,
        and operational realities.
      </div>
    </div>
  );
}


