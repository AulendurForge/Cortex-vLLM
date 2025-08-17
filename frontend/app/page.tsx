"use client";

import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    let cancelled = false;
    const base = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8084';
    (async () => {
      try {
        const r = await fetch(base + '/auth/me', { credentials: 'include', cache: 'no-store' });
        if (!cancelled) window.location.href = r.ok ? '/guide' : '/login';
      } catch {
        if (!cancelled) window.location.href = '/login';
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return (
    <main className="p-6 text-white/70 text-sm">Loading…</main>
  );
}