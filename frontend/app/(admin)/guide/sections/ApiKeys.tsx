'use client';

import { Card, SectionTitle, InfoBox, Button, Badge } from '../../../../src/components/UI';
import { useState, useEffect } from 'react';
import { useToast } from '../../../../src/providers/ToastProvider';
import { cn } from '../../../../src/lib/cn';
import { safeCopyToClipboard } from '../../../../src/lib/clipboard';

export default function ApiKeys() {
  const { addToast } = useToast();
  const [hostIP, setHostIP] = useState<string>('YOUR-GATEWAY-LAN-IP');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const envHostIP = process.env.NEXT_PUBLIC_HOST_IP;
      setHostIP(envHostIP && envHostIP !== 'localhost' ? envHostIP : window.location.hostname);
    }
  }, []);

  const copyToClipboard = async (text: string) => {
    const ok = await safeCopyToClipboard(text);
    if (ok) {
      addToast({ title: 'Copied!', kind: 'success' });
    } else {
      addToast({ title: 'Failed', kind: 'error' });
    }
  };

  return (
    <section className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-700">
      <header className="space-y-1">
        <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">Connectivity Protocol</h1>
        <p className="text-white/60 text-xs leading-relaxed max-w-2xl">
          Standardized OpenAI-compatible SDK integration via local private network.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <section className="space-y-2">
            <SectionTitle variant="purple" className="text-[10px]">1. Network Endpoint</SectionTitle>
            <Card className="p-4 bg-white/[0.02] border-white/5 space-y-3">
              <div className="flex items-center justify-between p-2.5 bg-black/40 rounded-xl border border-white/5 shadow-inner">
                <code className="text-xs text-emerald-400 font-mono font-bold">http://{hostIP}:8084/v1</code>
                <Button variant="default" size="sm" className="h-7 px-3 text-[9px]" onClick={() => copyToClipboard(`http://${hostIP}:8084/v1`)}>Copy</Button>
              </div>
              <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-[9px] text-white/30 uppercase font-black">Ping Diagnostic</span>
                <code className="text-[10px] text-cyan-300/70 font-mono">{`curl http://${hostIP}:8084/health`}</code>
              </div>
            </Card>
          </section>

          <section className="space-y-2">
            <SectionTitle variant="cyan" className="text-[10px]">2. Authentication</SectionTitle>
            <Card className="p-4 bg-white/[0.02] border-white/5">
              <InfoBox variant="cyan" className="text-[10px] p-2 leading-tight">
                Cortex uses Bearer token authentication. Provision scoped keys in <strong>Administration → API Keys</strong>.
              </InfoBox>
            </Card>
          </section>
        </div>

        <section className="space-y-2">
          <SectionTitle variant="blue" className="text-[10px]">3. SDK Implementation</SectionTitle>
          <Card className="p-4 bg-white/[0.02] border-white/5 h-full space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between"><span className="text-[9px] uppercase font-black text-indigo-400">Node.js</span><Badge className="bg-indigo-500/5 text-indigo-300 text-[8px]">openai-js</Badge></div>
              <pre className="text-[10px] bg-black/40 rounded-xl p-3 overflow-x-auto border border-white/5 text-white/60 font-mono leading-tight">
{`const client = new OpenAI({
  baseURL: "http://${hostIP}:8084/v1",
  apiKey: "YOUR_TOKEN",
});`}
              </pre>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><span className="text-[9px] uppercase font-black text-cyan-400">Python</span><Badge className="bg-cyan-500/5 text-cyan-300 text-[8px]">openai-python</Badge></div>
              <pre className="text-[10px] bg-black/40 rounded-xl p-3 overflow-x-auto border border-white/5 text-white/60 font-mono leading-tight">
{`client = OpenAI(
    base_url="http://${hostIP}:8084/v1", 
    api_key="YOUR_TOKEN"
)`}
              </pre>
            </div>
          </Card>
        </section>
      </div>

      <section className="space-y-2">
        <SectionTitle variant="purple" className="text-[10px]">4. Capability Matrix</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <CapSmall title="Chat" endpoint="/chat/completions" color="indigo" />
          <CapSmall title="Legacy" endpoint="/completions" color="purple" />
          <CapSmall title="Embed" endpoint="/embeddings" color="cyan" />
        </div>
      </section>
    </section>
  );
}

function CapSmall({ title, endpoint, color }: { title: string; endpoint: string; color: any }) {
  const textColors = { indigo: 'text-indigo-300', purple: 'text-purple-300', cyan: 'text-cyan-300' };
  return (
    <Card className="p-3 bg-white/[0.01] border-white/5 flex items-center justify-between">
      <span className="text-[10px] font-bold text-white uppercase">{title}</span>
      <code className={cn("text-[9px] font-mono", textColors[color as keyof typeof textColors])}>{endpoint}</code>
    </Card>
  );
}
