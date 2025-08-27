export type ApiError = {
    code: number;
    message: string;
    request_id?: string;
  };

// Resolve gateway base URL:
// - Prefer NEXT_PUBLIC_GATEWAY_URL when provided
// - Else, on browsers, derive from current hostname with port 8084 (LAN-friendly)
// - Else, fallback to localhost:8084 (SSR/build-time)
export function getGatewayBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_GATEWAY_URL;
  if (fromEnv && typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv;
  if (typeof window !== 'undefined' && window.location) {
    const proto = window.location.protocol || 'http:';
    const host = window.location.hostname || 'localhost';
    return `${proto}//${host}:8084`;
  }
  return 'http://localhost:8084';
}

// Safe UUID generator with fallbacks for older browsers/environments
function safeUuid(): string {
  try {
    // Modern browsers / Node 19+
    if (typeof globalThis !== 'undefined') {
      const g: any = globalThis as any;
      const anyCrypto: any = g && g.crypto ? g.crypto : undefined;
      if (anyCrypto && typeof anyCrypto.randomUUID === 'function') {
        return anyCrypto.randomUUID();
      }
    }
  } catch {}
  try {
    // Standards-based Web Crypto
    if (typeof globalThis !== 'undefined') {
      const g: any = globalThis as any;
      const anyCrypto: any = g && g.crypto ? g.crypto : undefined;
      if (anyCrypto && typeof anyCrypto.getRandomValues === 'function') {
        const arr = new Uint8Array(16);
        anyCrypto.getRandomValues(arr);
        // Per RFC 4122 v4
        arr[6] = ((arr[6] ?? 0) & 0x0f) | 0x40;
        arr[8] = ((arr[8] ?? 0) & 0x3f) | 0x80;
        const h = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
        return `${h.substring(0,8)}-${h.substring(8,12)}-${h.substring(12,16)}-${h.substring(16,20)}-${h.substring(20)}`;
      }
    }
  } catch {}
  // Last-resort: time+random (not cryptographically strong, but stable for request id)
  const rnd = Math.random().toString(16).slice(2);
  const t = Date.now().toString(16);
  return `${t}-${rnd}-${t}`.slice(0, 36);
}

export async function apiFetch<T>(
    path: string,
    options: RequestInit = {},
    // Default is derived from env or current host for LAN friendliness
    baseUrl = getGatewayBaseUrl()
  ): Promise<T> {
    const url = `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', headers.get('Content-Type') || 'application/json');
    // x-request-id for tracing across services
    headers.set('x-request-id', safeUuid());
    const resp = await fetch(url, { ...options, headers, credentials: 'include' });
    if (!resp.ok) {
      let err: any;
      try {
        const data = await resp.json();
        err = (data && (data as any).error) ? (data as any).error : data;
      } catch {
        err = { code: resp.status, message: resp.statusText };
      }
      const rid = resp.headers ? resp.headers.get('x-request-id') || undefined : undefined;
      const e: ApiError = { code: (err && err.code) ?? resp.status, message: (err && err.message) ?? 'request_failed', request_id: (err && err.request_id) || rid };
      throw e as any;
    }
    const ct = resp.headers ? (resp.headers.get('Content-Type') || '') : '';
    if (ct.includes('application/json')) return await resp.json();
    // @ts-expect-error caller knows type
    return await resp.text();
  }

  export default apiFetch;