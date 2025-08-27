'use client';

import { H1 } from '../../../src/components/UI';
import { Tabs } from '../../../src/components/Tabs';
import { Suspense } from 'react';

import GettingStarted from './sections/GettingStarted';
import ManageModels from './sections/ManageModels';
import ApiKeys from './sections/ApiKeys';
import AboutUsage from './sections/AboutUsage';
import ManageUsersOrgs from './sections/ManageUsersOrgs';
import AboutCortex from './sections/AboutCortex';

export default function GuidePage() {
  return (
    <section className="space-y-4">
      <H1>Documentation</H1>
      <Suspense fallback={<div className="text-sm text-white/60">Loading…</div>}>
        <Tabs
          defaultId="getting-started"
          tabs={[
            { id: 'getting-started', label: 'Getting Started', content: <GettingStarted /> },
            { id: 'manage-models', label: 'Manage Models', content: <ManageModels /> },
            { id: 'api-keys', label: 'API Keys', content: <ApiKeys /> },
            { id: 'about-usage', label: 'About Usage', content: <AboutUsage /> },
            { id: 'manage-users-orgs', label: 'Manage Users/Orgs & Programs', content: <ManageUsersOrgs /> },
            { id: 'about-cortex', label: 'About Cortex', content: <AboutCortex /> },
          ]}
        />
      </Suspense>
    </section>
  );
}


