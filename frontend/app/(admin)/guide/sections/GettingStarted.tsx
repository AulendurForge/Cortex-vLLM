'use client';

import Link from 'next/link';
import { Card, H1 } from '../../../../src/components/UI';
import { HostIpDisplay } from '../../../../src/components/HostIpDisplay';

type Step = {
  id: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  Icon: (props: { className?: string }) => JSX.Element;
};

const platformCards: Step[] = [
  {
    id: 'resources',
    title: 'Allocate System Resources',
    description:
      'Plan GPU/CPU and memory allocations for predictable performance. Pin critical models, set concurrency, and avoid resource contention.',
    href: '/health',
    cta: 'Review Health',
    Icon: ({ className = '' }) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
        <path d="M3 12h4l2 7 4-14 2 7h4" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    id: 'models',
    title: 'Add and Configure Models',
    description:
      'Register local or remote models. Define routing and fallbacks, set policies (max tokens, timeouts), and monitor readiness.',
    href: '/models',
    cta: 'Manage Models',
    Icon: ({ className = '' }) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" strokeWidth="1.5"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5" strokeWidth="1.5"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5" strokeWidth="1.5"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    id: 'observe',
    title: 'Measure and Optimize Usage',
    description:
      'Track requests, tokens, and latency. Set alerts, understand cost drivers, and ensure SLOs for critical workloads.',
    href: '/usage',
    cta: 'View Usage',
    Icon: ({ className = '' }) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
        <path d="M4 20V8m6 12V4m6 16v-6m6 6V10" strokeWidth="1.5"/>
      </svg>
    ),
  },
];

const adminCards: Step[] = [
  {
    id: 'access',
    title: 'Secure Access & API Keys',
    description:
      'Provision scoped keys, rotate safely, enforce quotas, and review audit trails. Keep sensitive data local and compliant.',
    href: '/keys',
    cta: 'Manage Access',
    Icon: ({ className = '' }) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
        <path d="M12 2l7 4v6c0 4.418-3.582 8-7 8s-7-3.582-7-8V6l7-4z" strokeWidth="1.5"/>
        <path d="M9 12a3 3 0 116 0v2H9v-2z" strokeWidth="1.5"/>
        <path d="M13 14l6 6m-2-4l-2 2" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    id: 'rbac',
    title: 'Organize Users and Orgs/Programs',
    description:
      'Model multi-tenant access with organizations/programs and roles. Grant least-privilege permissions and manage lifecycles confidently.',
    href: '/orgs',
    cta: 'Manage Users/Orgs & Programs',
    Icon: ({ className = '' }) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
        <path d="M12 12a4 4 0 110-8 4 4 0 010 8z" strokeWidth="1.5"/>
        <path d="M3 21a7 7 0 0114 0" strokeWidth="1.5"/>
        <path d="M17 11a3 3 0 116 0 3 3 0 01-6 0z" strokeWidth="1.5"/>
      </svg>
    ),
  },
];

export default function GettingStarted() {
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <H1>Welcome to CORTEX</H1>
        <p className="text-white/80 text-sm leading-relaxed">
          Operate LLMs on your own infrastructure. CORTEX provides secure, observable, and efficient
          administration of models, access, and resources across teams and organizations.
        </p>
      </header>

      <HostIpDisplay variant="banner" />

      <section>
        <div className="px-1 text-[11px] uppercase tracking-wider text-white/60 mb-2">Platform</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {platformCards.map((card) => (
            <Card key={card.id} className="p-4 h-full min-h-[180px] flex flex-col">
              <div className="flex items-start gap-3">
                <div className="shrink-0 rounded-full bg-white/10 p-2 text-white/90">
                  <card.Icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold tracking-wide">{card.title}</h2>
                  <p className="text-sm text-white/80 mt-1">{card.description}</p>
                </div>
              </div>
              <div className="mt-auto pt-3 flex justify-center">
                <Link href={card.href} className="btn btn-primary btn-sm whitespace-nowrap">{card.cta}</Link>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <div className="px-1 text-[11px] uppercase tracking-wider text-white/60 mb-2 mt-1">Administration</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {adminCards.map((card) => (
            <Card key={card.id} className="p-4 h-full min-h-[180px] flex flex-col">
              <div className="flex items-start gap-3">
                <div className="shrink-0 rounded-full bg-white/10 p-2 text-white/90">
                  <card.Icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold tracking-wide">{card.title}</h2>
                  <p className="text-sm text-white/80 mt-1">{card.description}</p>
                </div>
              </div>
              <div className="mt-auto pt-3 flex justify-center">
                <Link href={card.href} className="btn btn-primary btn-sm whitespace-nowrap">{card.cta}</Link>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </section>
  );
}


