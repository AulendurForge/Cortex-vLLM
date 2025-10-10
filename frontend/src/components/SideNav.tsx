'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { useToast } from '../providers/ToastProvider';
import { useUser } from '../providers/UserProvider';
import apiFetch from '../lib/api-clients';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

type NavItem = { href: string; label: string };

export function SideNav() {
  const pathname = usePathname();
  const { addToast } = useToast();
  const { user, setUser } = useUser();
  const router = useRouter();
  const [hostIP, setHostIP] = useState<string>('');

  // Detect host IP from environment variable or browser location
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Use environment variable if available, otherwise fall back to browser hostname
      const envHostIP = process.env.NEXT_PUBLIC_HOST_IP;
      if (envHostIP && envHostIP !== 'localhost') {
        setHostIP(envHostIP);
      } else {
        setHostIP(window.location.hostname);
      }
    }
  }, []);

  const onLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    (async () => {
      try {
        await apiFetch('/auth/logout', { method: 'POST' });
      } catch {}
      try {
        localStorage.removeItem('cortex_user_name');
        localStorage.removeItem('cortex_user_role');
      } catch {}
      setUser(null);
      addToast({ title: 'Logged out', kind: 'success' });
      router.push('/login');
    })();
  };
  return (
    <aside className="hidden md:flex md:flex-col justify-between p-6 w-[220px] glass rounded-2xl sticky top-6 h-[calc(100vh-3rem)] overflow-auto">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Image src={require('../assets/cortex logo white.PNG')} alt="CORTEX" width={50} height={50} />
          <span className="font-semibold tracking-wide text-xl">CORTEX</span>
        </div>
        
        {/* Host IP Display */}
        {hostIP && (
          <div className="flex flex-col items-center py-3 px-2 bg-white/5 rounded-lg border border-white/10">
            <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
              Cortex is running on IP:
            </div>
            <div className="text-sm font-mono text-emerald-400 font-medium">
              {hostIP}
            </div>
          </div>
        )}

        <nav className="flex flex-col text-sm">
          {/* Platform */}
          <div>
            <div className="px-3 text-[11px] uppercase tracking-wider text-white/60 mb-1">Platform</div>
            <div className="flex flex-col">
              {[
                { href: '/models', label: 'Models' },
                { href: '/health', label: 'Health' },
                { href: '/usage', label: 'Usage' },
                { href: '/keys', label: 'My API Keys' },
              ].map((item) => {
                const active = pathname?.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={'px-3 py-2 rounded-md transition-colors ' + (active ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/5 hover:text-white')}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <div className="h-px bg-white/10 my-3" />
          </div>

          {/* Administration */}
          {user?.role === 'admin' && (
            <div>
              <div className="px-3 text-[11px] uppercase tracking-wider text-white/60 mb-1">Administration</div>
              <div className="flex flex-col">
                {[
                  { href: '/orgs', label: 'Orgs & Programs' },
                  { href: '/users', label: 'Users' },
                  { href: '/keys', label: 'All API Keys' },
                  { href: '/system', label: 'System Monitor' },
                ].map((item) => {
                  const active = pathname?.startsWith(item.href);
                  return (
                    <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
                      className={'px-3 py-2 rounded-md transition-colors ' + (active ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/5 hover:text-white')}>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
              <div className="h-px bg-white/10 my-3" />
            </div>
          )}

          {/* Documentation */}
          <div>
            <div className="px-3 text-[11px] uppercase tracking-wider text-white/60 mb-1">Documentation</div>
            <div className="flex flex-col">
              {[{ href: '/guide', label: 'Guide' }].map((item) => {
                const active = pathname?.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
                    className={'px-3 py-2 rounded-md transition-colors ' + (active ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/5 hover:text-white')}>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
      </div>
      <div className="mt-auto space-y-2">
        {user && (
          <div className="text-xs text-white/70 px-3">
            Logged in as <span className="font-medium text-white">{user.role.toUpperCase()}</span>
            <div className="truncate text-white/80">{user.name}</div>
          </div>
        )}
        <a href="#" onClick={onLogout} className="block text-sm px-3 py-2 rounded-md text-white/70 hover:text-white hover:bg-white/5">
          Logout
        </a>
        <div className="px-3 pt-3">
          <div className="flex items-center justify-center gap-2 text-[11px] text-white/50">
            <span>Developed by Aulendur LLC</span>
          </div>
        </div>
      </div>
    </aside>
  );
}


