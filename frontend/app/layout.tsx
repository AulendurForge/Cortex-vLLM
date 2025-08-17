import '../src/styles/globals.css';
import type { Metadata } from 'next';
import type React from 'react';
import { AppProviders } from '../src/providers/AppProviders';

export const metadata: Metadata = {
  title: { default: 'Cortex', template: 'Cortex | %s' },
  description: 'CORTEX Admin UI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>
          <div className="mesh-bg" aria-hidden>
            <div className="blob indigo" />
            <div className="blob green" />
            <div className="blob cyan" />
          </div>
          <div className="min-h-screen">{children}</div>
        </AppProviders>
      </body>
    </html>
  );
}