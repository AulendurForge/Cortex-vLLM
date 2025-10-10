'use client';

import { Card, H1 } from '../../../../src/components/UI';
import { useState, useEffect } from 'react';

export default function ApiKeys() {
  const [hostIP, setHostIP] = useState<string>('YOUR-GATEWAY-LAN-IP');

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

  return (
    <section className="space-y-4">
      <H1>Configure Cortex Connections</H1>

      <Card className="p-4 space-y-3">
        <div className="text-white/90 font-medium">1) Pick the base URL</div>
        <div className="text-sm text-white/80">
          Use the gateway host on your LAN (port 8084) as the OpenAI‑compatible API.
        </div>
        <div className="flex items-center justify-between gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded p-2 mb-2">
          <div className="text-xs text-emerald-200">
            <strong>Your Cortex Gateway URL:</strong>
          </div>
          <code className="text-sm text-emerald-300 font-mono font-semibold">http://{hostIP}:8084/v1</code>
        </div>
        <pre className="text-xs bg-black/40 rounded p-3 overflow-x-auto"><code>http://{hostIP}:8084/v1</code></pre>
        <div className="text-xs text-white/60">Note: 3001 is the UI; do not send LLM requests there.</div>
        <div className="text-sm text-white/80">Quick health check:</div>
        <pre className="text-xs bg-black/40 rounded p-3 overflow-x-auto"><code>{`curl http://${hostIP}:8084/health`}</code></pre>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-white/90 font-medium">2) Create an API key</div>
        <div className="text-sm text-white/80">
          Go to Admin → API Keys. Click “New Key”, select scopes (chat, completions, embeddings), then copy the token immediately.
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-white/90 font-medium">3) Set up your client (OpenAI‑compatible)</div>
        <div className="text-sm text-white/80">JavaScript (openai):</div>
        <pre className="text-xs bg-black/40 rounded p-3 overflow-x-auto"><code>{`import OpenAI from "openai";
const client = new OpenAI({
  baseURL: "http://${hostIP}:8084/v1",
  apiKey: "YOUR_TOKEN",
});`}</code></pre>
        <div className="text-sm text-white/80">Python (openai):</div>
        <pre className="text-xs bg-black/40 rounded p-3 overflow-x-auto"><code>{`from openai import OpenAI
client = OpenAI(base_url="http://${hostIP}:8084/v1", api_key="YOUR_TOKEN")`}</code></pre>
        <div className="text-xs text-white/60">CLI/cURL adds headers: Authorization: Bearer YOUR_TOKEN; Content-Type: application/json.</div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-white/90 font-medium">4) Discover available models</div>
        <div className="text-sm text-white/80">The standard <code>/v1/models</code> lists served names (from the registry/health poller).</div>
        <pre className="text-xs bg-black/40 rounded p-3 overflow-x-auto"><code>{`curl -H "Authorization: Bearer YOUR_TOKEN" \\
  http://${hostIP}:8084/v1/models`}</code></pre>
        <div className="text-sm text-white/80">Public status view (no auth):</div>
        <pre className="text-xs bg-black/40 rounded p-3 overflow-x-auto"><code>{`curl http://${hostIP}:8084/v1/models/status`}</code></pre>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-white/90 font-medium">5) Chat Completions</div>
        <div className="text-sm text-white/80">Request body matches OpenAI's chat.completions.</div>
        <pre className="text-xs bg-black/40 rounded p-3 overflow-x-auto"><code>{`curl -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" \\
  http://${hostIP}:8084/v1/chat/completions \\
  -d '{
    "model": "YOUR_SERVED_MODEL_NAME",
    "messages": [
      {"role":"user","content":"Hello!"}
    ],
    "temperature": 0.7,
    "max_tokens": 256,
    "stream": false
  }'`}</code></pre>
        <div className="text-sm text-white/80">Streaming (Server‑Sent Events):</div>
        <pre className="text-xs bg-black/40 rounded p-3 overflow-x-auto"><code>{`curl -N -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" \\
  http://${hostIP}:8084/v1/chat/completions \\
  -d '{"model":"YOUR_SERVED_MODEL_NAME","messages":[{"role":"user","content":"Hello!"}],"stream":true}'`}</code></pre>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-white/90 font-medium">6) Text Completions</div>
        <pre className="text-xs bg-black/40 rounded p-3 overflow-x-auto"><code>{`curl -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" \\
  http://${hostIP}:8084/v1/completions \\
  -d '{
    "model": "YOUR_SERVED_MODEL_NAME",
    "prompt": "Write a haiku about the sea",
    "max_tokens": 128,
    "temperature": 0.7
  }'`}</code></pre>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-white/90 font-medium">7) Embeddings</div>
        <pre className="text-xs bg-black/40 rounded p-3 overflow-x-auto"><code>{`curl -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" \\
  http://${hostIP}:8084/v1/embeddings \\
  -d '{
    "model": "YOUR_SERVED_EMBEDDING_MODEL",
    "input": ["first text", "second text"]
  }'`}</code></pre>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-white/90 font-medium">8) Remote browser apps (CORS)</div>
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded p-3 mb-2">
          <div className="text-xs text-emerald-200 font-medium mb-1">✓ CORS is already configured for this IP!</div>
          <div className="text-xs text-white/70">
            Your current IP (<code className="text-emerald-300">{hostIP}</code>) is automatically added to the CORS whitelist when Cortex starts.
            Other devices on your network can access the API without additional CORS configuration.
          </div>
        </div>
        <div className="text-sm text-white/80">If calling from a browser app on a different machine/port, you may need to add that origin to the gateway's CORS allowlist and restart:</div>
        <pre className="text-xs bg-black/40 rounded p-3 overflow-x-auto"><code>{`# docker.compose.dev.yaml → services.gateway.environment
CORS_ALLOW_ORIGINS: http://${hostIP}:3001,http://YOUR-OTHER-APP:PORT`}</code></pre>
        <div className="text-xs text-white/60 mt-2">Note: Standard API calls from servers/scripts don't need CORS. This is only for browser-based applications.</div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-white/90 font-medium">Reference</div>
        <div className="text-sm text-white/80">Cortex implements the OpenAI‑compatible endpoints: <code>/v1/chat/completions</code>, <code>/v1/completions</code>, <code>/v1/embeddings</code>, and <code>/v1/models</code>. Authentication uses <code>Authorization: Bearer &lt;token&gt;</code>.</div>
      </Card>
    </section>
  );
}


