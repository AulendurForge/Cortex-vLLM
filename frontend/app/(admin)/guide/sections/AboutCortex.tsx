'use client';

import { Card, SectionTitle, InfoBox } from '../../../../src/components/UI';
import { cn } from '../../../../src/lib/cn';

export default function AboutCortex() {
  return (
    <section className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-700">
      <header className="space-y-2 text-center md:text-left">
        <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">Platform Architecture</h1>
        <p className="text-white/60 text-sm leading-relaxed max-w-3xl">
          CORTEX is a secure AI gateway developed by Aulendur Labs. 
          Enabling usable, reliable, and governable advanced AI within restricted environments.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 bg-white/[0.02] border-white/5 space-y-2">
          <SectionTitle variant="purple" className="mb-1 text-[10px]">Design Philosophy</SectionTitle>
          <ul className="list-disc pl-4 text-white/70 text-xs space-y-2 leading-relaxed font-medium">
            <li><span className="text-indigo-300">Offline Resilience</span>: High-performance in disconnected networks.</li>
            <li><span className="text-indigo-300">Standardized I/O</span>: Native OpenAI-compatible API layer.</li>
            <li><span className="text-indigo-300">Orchestration</span>: Unified routing for generation and embeddings.</li>
            <li><span className="text-indigo-300">Enterprise Scale</span>: vLLM clusters from single-node to pools.</li>
          </ul>
        </Card>

        <Card className="p-4 bg-white/[0.02] border-white/5 space-y-2">
          <SectionTitle variant="cyan" className="mb-1 text-[10px]">Mission Impact</SectionTitle>
          <p className="text-[11px] text-white/70 leading-relaxed italic">
            "CORTEX abstracts model hosting complexity. It provides a hardened entry point where teams can authenticate and attribute usage."
          </p>
          <div className="pt-2 border-t border-white/5">
            <InfoBox variant="blue" className="text-[10px] p-2 leading-tight">
              Planners focus on scenario design while CORTEX handles safety and governance.
            </InfoBox>
          </div>
        </Card>
      </div>

      <section className="space-y-2">
        <SectionTitle variant="blue" className="text-[10px]">Capabilities Matrix</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <FeatureCard title="Protocols" items={["OpenAI REST API", "Streaming SSE"]} color="indigo" />
          <FeatureCard title="Audit" items={["Per-key metering", "Org attribution"]} color="purple" />
          <FeatureCard title="Stability" items={["Live health checks", "Circuit breaking"]} color="cyan" />
        </div>
      </section>

      <div className="text-[9px] text-white/20 uppercase font-black tracking-[0.3em] text-center pt-4 border-t border-white/5">
        Aulendur Labs
      </div>
    </section>
  );
}

function FeatureCard({ title, items, color }: { title: string; items: string[]; color: 'indigo' | 'purple' | 'cyan' }) {
  const iconColors = {
    indigo: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  };
  return (
    <Card className="p-3 bg-white/[0.01] border-white/5 transition-colors">
      <div className={cn("text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border w-fit mb-2", iconColors[color])}>{title}</div>
      <ul className="space-y-1">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-start gap-1.5 text-[10px] text-white/60">
            <span className="text-white/20">•</span> {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}
