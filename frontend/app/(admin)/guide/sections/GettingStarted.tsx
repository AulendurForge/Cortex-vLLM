'use client';

import Link from 'next/link';
import { Card, SectionTitle, Button, InfoBox } from '../../../../src/components/UI';
import { HostIpDisplay } from '../../../../src/components/HostIpDisplay';
import { cn } from '../../../../src/lib/cn';

type Step = {
  id: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  Icon: (props: { className?: string }) => JSX.Element;
};

const platformCards: Step[] = [
  { id: 'resources', title: 'Hardware Health', description: 'Monitor GPU/CPU and VRAM topology.', href: '/health', cta: 'Review', Icon: ({ className }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}><path d="M3 12h4l2 7 4-14 2 7h4" strokeWidth="1.5"/></svg> },
  { id: 'models', title: 'Inference Pools', description: 'Orchestrate and deploy local LLMs.', href: '/models', cta: 'Manage', Icon: ({ className }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}><rect x="3" y="3" width="7" height="7" rx="1.5" strokeWidth="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5" strokeWidth="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5" strokeWidth="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5" strokeWidth="1.5"/></svg> },
  { id: 'observe', title: 'Traffic Analytics', description: 'Track tokens and request latency.', href: '/usage', cta: 'Analyze', Icon: ({ className }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}><path d="M4 20V8m6 12V4m6 16v-6m6 6V10" strokeWidth="1.5"/></svg> },
];

const adminCards: Step[] = [
  { id: 'access', title: 'API Management', description: 'Provision scoped access tokens.', href: '/keys', cta: 'Security', Icon: ({ className }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}><path d="M12 2l7 4v6c0 4.418-3.582 8-7 8s-7-3.582-7-8V6l7-4z" strokeWidth="1.5"/><path d="M9 12a3 3 0 116 0v2H9v-2z" strokeWidth="1.5"/><path d="M13 14l6 6m-2-4l-2 2" strokeWidth="1.5"/></svg> },
  { id: 'rbac', title: 'Identity Controls', description: 'Configure multi-tenant Orgs & Users.', href: '/orgs', cta: 'Configure', Icon: ({ className }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}><path d="M12 12a4 4 0 110-8 4 4 0 010 8z" strokeWidth="1.5"/><path d="M3 21a7 7 0 0114 0" strokeWidth="1.5"/><path d="M17 11a3 3 0 116 0 3 3 0 01-6 0z" strokeWidth="1.5"/></svg> },
];

export default function GettingStarted() {
  return (
    <section className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-700">
      <header className="space-y-1">
        <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">Platform Initialization</h1>
        <p className="text-white/60 text-xs leading-relaxed max-w-2xl">
          Secure, private LLM orchestration for mission-critical infrastructure.
        </p>
      </header>

      <HostIpDisplay variant="banner" className="py-2.5" />

      <InfoBox variant="blue" title="Network Configuration" className="text-xs p-2.5">
        Cortex detects your host address automatically. Use <code className="bg-black/40 px-1 rounded text-cyan-300">http://HOST_IP:8084</code> for SDK integration.
      </InfoBox>

      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">Operations Workflow</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {platformCards.map((card) => (
            <Card key={card.id} className="p-3.5 h-full border-white/5 hover:border-indigo-500/30 bg-white/[0.02] flex flex-col group transition-all duration-300">
              <div className="flex items-center gap-3">
                <div className="shrink-0 rounded-xl bg-indigo-500/10 p-2 text-indigo-400 border border-indigo-500/20 group-hover:scale-110 transition-transform">
                  <card.Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-[11px] font-bold text-white uppercase tracking-wider">{card.title}</h2>
                  <p className="text-[10px] text-white/40 leading-tight mt-0.5">{card.description}</p>
                </div>
              </div>
              <div className="mt-3">
                <Link href={card.href} className="inline-flex w-full">
                  <Button variant="default" size="sm" className="w-full text-[9px] font-black uppercase tracking-[0.2em] h-7">{card.cta}</Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">Governance</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {adminCards.map((card) => (
            <Card key={card.id} className="p-3.5 h-full border-white/5 hover:border-cyan-500/30 bg-white/[0.02] flex flex-col group transition-all duration-300">
              <div className="flex items-center gap-3">
                <div className="shrink-0 rounded-xl bg-cyan-500/10 p-2 text-cyan-400 border border-cyan-500/20 group-hover:scale-110 transition-transform">
                  <card.Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-[11px] font-bold text-white uppercase tracking-wider">{card.title}</h2>
                  <p className="text-[10px] text-white/40 leading-tight mt-0.5">{card.description}</p>
                </div>
              </div>
              <div className="mt-3">
                <Link href={card.href} className="inline-flex w-full">
                  <Button variant="default" size="sm" className="w-full text-[9px] font-black uppercase tracking-[0.2em] h-7">{card.cta}</Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </section>
  );
}
