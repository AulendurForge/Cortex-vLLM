'use client';

import { Card, H1 } from '../../../../src/components/UI';

export default function ApiKeys() {
  return (
    <section className="space-y-4">
      <H1>Configure Cortex Connections</H1>

      <Card className="p-4 space-y-3">
        <div className="text-white/90 font-medium">1) Pick the base URL</div>
        <div className="text-sm text-white/80">
          Use the gateway host on your LAN (port 8084) as the OpenAI‑compatible API.
        </div>
        <pre className="text-xs bg-black/40 rounded p-3 overflow-x-auto"><code>http://YOUR-GATEWAY-LAN-IP:8084/v1</code></pre>
        <div className="text-xs text-white/60">Note: 3001 is the UI; do not send LLM requests there.</div>
        <div className="text-sm text-white/80">Quick health check:</div>
        <pre className="text-xs bg-black/40 rounded p-3 overflow-x-auto"><code>{`curl http://YOUR-GATEWAY-LAN-IP:8084/health`}</code></pre>
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
  baseURL: "http://YOUR-GATEWAY-LAN-IP:8084/v1",
  apiKey: "YOUR_TOKEN",
});`}</code></pre>
        <div className="text-sm text-white/80">Python (openai):</div>
        <pre className="text-xs bg-black/40 rounded p-3 overflow-x-auto"><code>{`from openai import OpenAI
client = OpenAI(base_url="http://YOUR-GATEWAY-LAN-IP:8084/v1", api_key="YOUR_TOKEN")`}</code></pre>
        <div className="text-xs text-white/60">CLI/cURL adds headers: Authorization: Bearer YOUR_TOKEN; Content-Type: application/json.</div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-white/90 font-medium">4) Discover available models</div>
        <div className="text-sm text-white/80">The standard <code>/v1/models</code> lists served names (from the registry/health poller).</div>
        <pre className="text-xs bg-black/40 rounded p-3 overflow-x-auto"><code>{`curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://YOUR-GATEWAY-LAN-IP:8084/v1/models`}</code></pre>
        <div className="text-sm text-white/80">Public status view (no auth):</div>
        <pre className="text-xs bg-black/40 rounded p-3 overflow-x-auto"><code>{`curl http://YOUR-GATEWAY-LAN-IP:8084/v1/models/status`}</code></pre>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-white/90 font-medium">5) Chat Completions</div>
        <div className="text-sm text-white/80">Request body matches OpenAI’s chat.completions.</div>
        <pre className="text-xs bg-black/40 rounded p-3 overflow-x-auto"><code>{`curl -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" \
  http://YOUR-GATEWAY-LAN-IP:8084/v1/chat/completions \
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
        <pre className="text-xs bg-black/40 rounded p-3 overflow-x-auto"><code>{`curl -N -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" \
  http://YOUR-GATEWAY-LAN-IP:8084/v1/chat/completions \
  -d '{"model":"YOUR_SERVED_MODEL_NAME","messages":[{"role":"user","content":"Hello!"}],"stream":true}'`}</code></pre>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-white/90 font-medium">6) Text Completions</div>
        <pre className="text-xs bg-black/40 rounded p-3 overflow-x-auto"><code>{`curl -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" \
  http://YOUR-GATEWAY-LAN-IP:8084/v1/completions \
  -d '{
    "model": "YOUR_SERVED_MODEL_NAME",
    "prompt": "Write a haiku about the sea",
    "max_tokens": 128,
    "temperature": 0.7
  }'`}</code></pre>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-white/90 font-medium">7) Embeddings</div>
        <pre className="text-xs bg-black/40 rounded p-3 overflow-x-auto"><code>{`curl -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" \
  http://YOUR-GATEWAY-LAN-IP:8084/v1/embeddings \
  -d '{
    "model": "YOUR_SERVED_EMBEDDING_MODEL",
    "input": ["first text", "second text"]
  }'`}</code></pre>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-white/90 font-medium">8) Remote browser apps (CORS)</div>
        <div className="text-sm text-white/80">If calling from a browser app on another machine, add that origin to the gateway’s CORS allowlist and restart the gateway.</div>
        <pre className="text-xs bg-black/40 rounded p-3 overflow-x-auto"><code>{`# docker.compose.dev.yaml → services.gateway.environment
CORS_ALLOW_ORIGINS: http://YOUR-APP-ORIGIN:PORT  # comma-separate multiple origins`}</code></pre>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-white/90 font-medium">Reference</div>
        <div className="text-sm text-white/80">Cortex implements the OpenAI‑compatible endpoints: <code>/v1/chat/completions</code>, <code>/v1/completions</code>, <code>/v1/embeddings</code>, and <code>/v1/models</code>. Authentication uses <code>Authorization: Bearer &lt;token&gt;</code>.</div>
      </Card>
    </section>
  );
}


