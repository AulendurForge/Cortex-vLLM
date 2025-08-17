'use client';

import Image from 'next/image';
import { useToast } from '../../src/providers/ToastProvider';
import apiFetch from '../../src/lib/api-clients';
import { useRouter } from 'next/navigation';
import { useUser } from '../../src/providers/UserProvider';

export default function LoginPage() {
  const { addToast } = useToast();
  const router = useRouter();
  const { setUser } = useUser();

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = { username: String(form.get('username') || ''), password: String(form.get('password') || '') };
    try {
      const res: any = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(body) });
      const username = res?.user?.username || body.username;
      const roleRaw = String(res?.user?.role || '').toLowerCase();
      const role = roleRaw === 'admin' ? 'admin' : 'user';
      // Persist dev user locally so SideNav can show immediately even if cookie is strict in dev
      try {
        localStorage.setItem('cortex_user_name', username);
        localStorage.setItem('cortex_user_role', role);
      } catch {}
      setUser({ name: username, role: role as any });
      addToast({ title: 'Signed in', kind: 'success' });
      router.push('/guide');
    } catch (e: any) {
      addToast({ title: 'Invalid credentials', kind: 'error' });
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="glass rounded-2xl w-full max-w-md p-6 text-center">
        <div className="flex items-center justify-center">
          <Image src={require('../../src/assets/cortex logo and text white.png')} alt="CORTEX" width={160} height={160} />
        </div>
        <p className="mt-3 text-white/80 text-sm">
          Secure admin-managed access to your local LLM inference gateway.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-3 text-left">
          <label className="text-sm block">
            Username
            <input name="username" type="text" className="input mt-1" placeholder="username" required />
          </label>
          <label className="text-sm block">
            Password
            <input name="password" type="password" className="input mt-1" placeholder="••••••••" required />
          </label>
          <button className="btn btn-primary w-full mt-2" type="submit">Sign in</button>
        </form>

        <div className="mt-3 text-xs text-white/70">No self-service signup. Contact your administrator for credentials.</div>

        <div className="mt-6 text-xs text-white/60">Developed by Aulendur LLC</div>
      </div>
    </main>
  );
}


