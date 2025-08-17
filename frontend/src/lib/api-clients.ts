export type ApiError = {
    code: number;
    message: string;
    request_id?: string;
  };
  
  export async function apiFetch<T>(
    path: string,
    options: RequestInit = {},
    // Default to 8084 to avoid conflicts with common local services on 8080.
    // Can be overridden by NEXT_PUBLIC_GATEWAY_URL at build/runtime.
    baseUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8084'
  ): Promise<T> {
    const url = `${baseUrl}${path}`;
    const headers = new Headers(options.headers || {});
    if (!headers.has('x-request-id')) {
      headers.set('x-request-id', crypto.randomUUID());
    }
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    const res = await fetch(url, { ...options, headers, cache: 'no-store', credentials: 'include' });
    const reqId = res.headers.get('x-request-id') || headers.get('x-request-id') || undefined;
    if (!res.ok) {
      let payload: any = undefined;
      try {
        payload = await res.json();
      } catch {
        payload = { error: { code: res.status, message: await res.text() } };
      }
      const err: ApiError = {
        code: payload?.error?.code ?? res.status,
        message: payload?.error?.message ?? 'unknown_error',
        request_id: payload?.request_id ?? reqId,
      };
      throw err;
    }
    return (await res.json()) as T;
  }

  export default apiFetch;