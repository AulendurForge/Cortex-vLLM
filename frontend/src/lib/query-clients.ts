import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error: any) => {
        if (error?.code === 429) return false;
        return failureCount < 2;
      },
    },
  },
});