'use client';

import { ReactNode, useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '../lib/cn';

export type TabConfig = {
  id: string;
  label: string;
  content: ReactNode;
};

export function Tabs({ tabs, defaultId }: { tabs: TabConfig[]; defaultId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeId = useMemo(() => {
    const tabFromQuery = (searchParams as any)?.get?.('tab') as string | null | undefined;
    const firstId = tabs.length > 0 ? (tabs[0]?.id ?? '') : '';
    return tabFromQuery || defaultId || firstId;
  }, [searchParams, defaultId, tabs]);

  const onSelect = useCallback(
    (id: string) => {
      const base = (searchParams as any)?.toString?.() || '';
      const params = new URLSearchParams(base);
      params.set('tab', id);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Documentation sections" className="flex items-center gap-2 border-b border-white/10">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              className={cn(
                'px-3 py-2 text-sm rounded-t-md transition-colors',
                isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white hover:bg-white/5'
              )}
              onClick={() => onSelect(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div>
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <div
              key={tab.id}
              id={`panel-${tab.id}`}
              role="tabpanel"
              aria-labelledby={`tab-${tab.id}`}
              hidden={!isActive}
              className="focus:outline-none"
            >
              {isActive && tab.content}
            </div>
          );
        })}
      </div>
    </div>
  );
}


