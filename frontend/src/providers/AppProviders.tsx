'use client';

import { ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from './ToastProvider';
import { UserProvider } from './UserProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error: any) => {
          if ((error as any)?.code === 429) return false;
          return failureCount < 2;
        },
      },
    },
  }));
  return (
    <QueryClientProvider client={client}>
      <UserProvider>
        <ToastProvider>{children}</ToastProvider>
      </UserProvider>
    </QueryClientProvider>
  );
}