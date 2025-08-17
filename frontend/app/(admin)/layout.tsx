"use client";
import { SideNav } from '../../src/components/SideNav';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch((process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8084') + '/auth/me', { credentials: 'include', cache: 'no-store' });
        if (!cancelled && r.status === 401) {
          router.replace('/login');
        }
      } catch {
        if (!cancelled) router.replace('/login');
      }
    })();
    return () => { cancelled = true; };
  }, [router]);
  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
        <SideNav />
        <main className="space-y-4">{children}</main>
      </div>
    </div>
  );
}
