'use client';

import { Card, SectionTitle, InfoBox, Badge } from '../../../../../src/components/UI';
import { cn } from '../../../../../src/lib/cn';

export default function ConfigurationGuide() {
  return (
    <section className="space-y-6">
      {/* Introduction */}
      <Card className="p-5 bg-gradient-to-r from-amber-500/5 via-orange-500/5 to-red-500/5 border-white/5">
        <p className="text-[13px] text-white/80 leading-relaxed">
          Model configuration determines resource allocation, performance characteristics, and behavior. 
          This guide covers the key settings for both vLLM and llama.cpp engines, helping you optimize 
          for your specific hardware and workload requirements.
        </p>
      </Card>

      {/* vLLM Configuration */}
      <section className="space-y-3">
        <SectionTitle variant="blue" className="text-[10px]">vLLM Configuration</SectionTitle>
        
        {/* vLLM Recipes callout */}
        <Card className="p-3 bg-blue-500/10 border-blue-500/30 flex items-start gap-3">
          <span className="text-lg">💡</span>
          <div className="flex-1">
            <p className="text-[11px] text-white/80 leading-relaxed">
              <strong className="text-blue-300">Looking for model-specific settings?</strong> The{' '}
              <a 
                href="https://docs.vllm.ai/projects/recipes/en/latest/index.html" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-300 hover:text-blue-200 underline underline-offset-2"
              >
                vLLM Recipes
              </a>
              {' '}site provides official guidance on parameters and requirements for popular models like Llama, Qwen, DeepSeek, and more.
              Not all models are documented—some online searching may help for newer or less common architectures.
            </p>
          </div>
        </Card>
        
        <div className="space-y-4">
          {/* Core Settings */}
          <Card className="p-4 bg-blue-500/5 border-blue-500/20 space-y-4">
            <div className="text-[11px] font-bold text-blue-300 uppercase tracking-wider">Core Settings</div>
            
            <ConfigItem 
              name="DType (Data Type)"
              options={['auto', 'float16', 'bfloat16']}
              default="auto"
              description="Precision for model weights. 'auto' lets vLLM choose based on your GPU. bfloat16 is recommended for Ampere+ GPUs."
              tip="float16 is slightly more precise but can cause numerical issues with some models. bfloat16 handles larger value ranges."
            />

            <ConfigItem 
              name="Selected GPUs"
              options={['GPU indices (0, 1, 2...)']}
              default="GPU 0"
              description="Which GPUs to use for this model. Select multiple for tensor parallelism."
              tip="Models are split across selected GPUs. Ensure even VRAM distribution for best performance."
            />

            <ConfigItem 
              name="GPU Memory Utilization"
              options={['0.05 - 0.98']}
              default="0.9"
              description="Fraction of GPU VRAM vLLM is allowed to use. Higher values allow larger KV cache."
              tip="If you see 'Not enough KV cache memory' errors, try increasing this (up to 0.95) or reducing context length."
            />

            <ConfigItem 
              name="Max Context Length"
              options={['512 - 131072']}
              default="8192"
              description="Maximum tokens per request. Larger contexts require significantly more VRAM for KV cache."
              tip="KV cache VRAM scales linearly with context. 8K is safe for most; 32K+ needs substantial VRAM headroom."
            />

            <ConfigItem 
              name="Trust Remote Code"
              options={['true', 'false']}
              default="false"
              description="Allow executing custom Python code from model repositories. Required for some custom architectures."
              tip="Only enable for trusted sources. Not applicable when using GGUF files."
            />
          </Card>

          {/* Production Settings */}
          <Card className="p-4 bg-orange-500/5 border-orange-500/20 space-y-4">
            <div className="text-[11px] font-bold text-orange-300 uppercase tracking-wider">Production Settings</div>
            
            <ConfigItem 
              name="Attention Backend"
              options={['auto', 'FLASH_ATTN', 'FLASHINFER', 'XFORMERS', 'TRITON_ATTN']}
              default="auto"
              description="Which attention implementation to use. Flash Attention 2 is fastest on Ampere+ GPUs."
              tip="auto selects the best option for your hardware. Force XFORMERS if Flash Attention causes issues."
            />

            <ConfigItem 
              name="Disable Request Logging"
              options={['true', 'false']}
              default="false"
              description="Suppress per-request log entries. Recommended for high-throughput production."
              tip="Reduces log volume significantly. Enable when you have Prometheus metrics for monitoring."
            />

            <ConfigItem 
              name="V1 Engine (Experimental)"
              options={['true', 'false']}
              default="false"
              description="Enable vLLM's new V1 architecture with improved performance. Removes some features like 'best_of'."
              tip="Only use with vLLM 0.8+. Test thoroughly before production—V1 removes GPU↔CPU KV swap."
            />
          </Card>

          {/* Advanced Tuning */}
          <Card className="p-4 bg-blue-500/5 border-blue-500/20 space-y-4">
            <div className="text-[11px] font-bold text-blue-300 uppercase tracking-wider">Advanced Tuning</div>
            
            <ConfigItem 
              name="Max Batched Tokens"
              options={['512 - 16384']}
              default="2048"
              description="Maximum tokens processed per batch iteration. Higher improves throughput but increases latency."
              tip="Start with 2048. Increase to 4096-8192 for throughput-optimized deployments."
            />

            <ConfigItem 
              name="KV Cache DType"
              options={['auto', 'fp8', 'fp8_e4m3', 'fp8_e5m2']}
              default="auto"
              description="Precision for KV cache storage. FP8 variants reduce memory usage by ~50% with minimal quality impact."
              tip="fp8 is excellent for fitting longer contexts. Requires Hopper/Ada GPUs for best performance."
            />

            <ConfigItem 
              name="Quantization"
              options={['none', 'awq', 'gptq', 'fp8', 'int8']}
              default="none"
              description="Weight quantization scheme. AWQ/GPTQ need pre-quantized models; FP8/INT8 work with any model."
              tip="AWQ/GPTQ: Use with specific quantized repos (e.g., 'TheBloke/*-AWQ'). FP8: Runtime quantization."
            />

            <ConfigItem 
              name="Block Size"
              options={['1', '8', '16', '32']}
              default="16"
              description="KV cache paging granularity. Smaller blocks reduce fragmentation; larger blocks improve throughput."
              tip="16 is balanced. Try 8 if hitting KV fragmentation with long contexts."
            />

            <ConfigItem 
              name="Max Sequences (Concurrency)"
              options={['1 - 2048']}
              default="256"
              description="Maximum concurrent active sequences. Higher enables more parallelism."
              tip="Start with 128-256. Increase only if VRAM allows and you need higher concurrency."
            />
          </Card>
        </div>
      </section>

      {/* llama.cpp Configuration */}
      <section className="space-y-3">
        <SectionTitle variant="emerald" className="text-[10px]">llama.cpp Configuration</SectionTitle>
        <div className="space-y-4">
          {/* Core Settings */}
          <Card className="p-4 bg-emerald-500/5 border-emerald-500/20 space-y-4">
            <div className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">Core Settings</div>
            
            <ConfigItem 
              name="Context Size"
              options={['512 - 131072']}
              default="16384"
              description="Total context window divided among parallel slots. Each slot gets context_size / parallel_slots tokens."
              tip="For a 36K prompt with 16 slots, you'd need 576K+ total context. Use fewer slots for large prompts."
            />

            <ConfigItem 
              name="Parallel Slots"
              options={['1 - 32']}
              default="16"
              description="Number of concurrent request slots. More slots = more concurrency but less context per request."
              tip="For large prompts (30K+), use 1-2 slots. For many small requests, use 16-32 slots."
            />

            <ConfigItem 
              name="Ubatch Size"
              options={['128 - 4096']}
              default="2048"
              description="Physical batch size for prompt processing. Higher values speed up prefill."
              tip="Larger ubatch uses more VRAM during prompt processing. 2048 is a good default."
            />

            <ConfigItem 
              name="KV Cache Type K/V"
              options={['f16', 'q8_0', 'q4_0']}
              default="q8_0"
              description="Quantization for KV cache. q8_0 provides 50% memory reduction with minimal quality loss."
              tip="q8_0 is recommended for most cases. q4_0 saves more memory but may affect generation quality."
            />
          </Card>

          {/* GPU Settings */}
          <Card className="p-4 bg-emerald-500/5 border-emerald-500/20 space-y-4">
            <div className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">GPU Settings</div>
            
            <ConfigItem 
              name="GPU Layers (ngl)"
              options={['0 - 999']}
              default="999"
              description="Number of model layers to offload to GPU. 999 means 'all layers that fit'."
              tip="Set to 999 for full GPU acceleration. Lower values enable CPU+GPU hybrid inference."
            />

            <ConfigItem 
              name="Selected GPUs"
              options={['GPU indices (0, 1, 2...)']}
              default="GPU 0"
              description="Which GPUs to use. When multiple selected, model weights are distributed (tensor_split)."
              tip="Cortex automatically calculates even tensor_split ratios for selected GPUs."
            />

            <ConfigItem 
              name="Flash Attention"
              options={['true', 'false']}
              default="true"
              description="Enable Flash Attention 2 for faster attention computation. Requires Ampere+ GPUs."
              tip="Disable if you see FA2-related errors on older GPUs (pre-RTX 30xx)."
            />
          </Card>

          {/* Advanced llama.cpp */}
          <Card className="p-4 bg-emerald-500/5 border-emerald-500/20 space-y-4">
            <div className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">Advanced Settings</div>
            
            <ConfigItem 
              name="Batch Size"
              options={['1 - 2048']}
              default="512"
              description="Logical batch size for prompt processing."
              tip="Higher values speed up long prompts. Balance with VRAM availability."
            />

            <ConfigItem 
              name="CPU Threads"
              options={['1 - 128']}
              default="32"
              description="Number of CPU threads for computation. Set to (CPU cores - 2) typically."
              tip="More threads help with CPU-bound operations but can cause contention if too high."
            />

            <ConfigItem 
              name="Memory Lock (mlock)"
              options={['true', 'false']}
              default="true"
              description="Lock model weights in RAM to prevent swapping. Recommended for production."
              tip="Requires sufficient RAM. Disable if you see mlock permission errors."
            />

            <ConfigItem 
              name="NUMA Policy"
              options={['default', 'isolate', 'distribute']}
              default="isolate"
              description="Memory allocation policy for multi-socket systems."
              tip="'isolate' works best for single-socket. 'distribute' for multi-socket NUMA systems."
            />
          </Card>

          {/* Speculative Decoding */}
          <Card className="p-4 bg-purple-500/5 border-purple-500/20 space-y-4">
            <div className="text-[11px] font-bold text-purple-300 uppercase tracking-wider">Speculative Decoding</div>
            
            <p className="text-[11px] text-white/70 leading-relaxed mb-3">
              Use a smaller "draft" model to predict tokens speculatively, which the main model then verifies.
              Can significantly improve throughput when draft predictions match.
            </p>
            
            <ConfigItem 
              name="Draft Model Path"
              options={['Container path to GGUF']}
              default="(empty)"
              description="Path to a smaller GGUF model inside the container (e.g., /models/draft/model-Q8_0.gguf)."
              tip="Use a 0.5B-2B model as draft for larger 7B+ models. Same architecture family works best."
            />

            <ConfigItem 
              name="Draft Tokens (n)"
              options={['1 - 64']}
              default="16"
              description="Number of tokens to draft at once. Higher increases potential speedup but may reduce acceptance."
              tip="8-32 works well for most cases. Lower values are safer; higher values are more speculative."
            />

            <ConfigItem 
              name="Min Acceptance Probability"
              options={['0.0 - 1.0']}
              default="0.5"
              description="Threshold for accepting drafted tokens. Lower values accept more drafts but may reduce quality."
              tip="0.5 is balanced. Lower (0.2-0.4) for speed; higher (0.6-0.8) for quality."
            />
          </Card>
        </div>
      </section>

      {/* Request Defaults */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">Request Defaults (Both Engines)</SectionTitle>
        <Card className="p-4 bg-purple-500/5 border-purple-500/20 space-y-4">
          <p className="text-[11px] text-white/70 leading-relaxed mb-3">
            These parameters set defaults for API requests when clients don't specify them.
            They affect generation behavior, not model loading or VRAM usage.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ConfigItem 
              name="Temperature"
              options={['0.0 - 2.0']}
              default="0.8"
              description="Randomness in generation. Lower = more deterministic; higher = more creative."
              tip="0.0 = greedy (always pick highest probability). 0.7-0.9 for balanced output."
            />

            <ConfigItem 
              name="Top P (Nucleus Sampling)"
              options={['0.0 - 1.0']}
              default="0.9"
              description="Sample from tokens comprising top P probability mass."
              tip="0.9-0.95 is typical. Lower values focus on higher-probability tokens."
            />

            <ConfigItem 
              name="Top K"
              options={['0 - 100']}
              default="40"
              description="Sample from top K highest probability tokens. 0 disables."
              tip="40-50 is common. Lower values make output more focused."
            />

            <ConfigItem 
              name="Repetition Penalty"
              options={['1.0 - 2.0']}
              default="1.2"
              description="Penalizes repeating tokens. 1.0 = no penalty; higher = less repetition."
              tip="1.1-1.3 helps prevent loops without making output unnatural."
            />

            <ConfigItem 
              name="Frequency Penalty"
              options={['0.0 - 2.0']}
              default="0.5"
              description="Penalizes tokens based on how frequently they've appeared."
              tip="Works with repetition_penalty. Higher values encourage vocabulary diversity."
            />

            <ConfigItem 
              name="Presence Penalty"
              options={['0.0 - 2.0']}
              default="0.5"
              description="Penalizes tokens that have appeared at all, regardless of frequency."
              tip="Encourages talking about new topics. Higher values increase novelty."
            />
          </div>
        </Card>
      </section>

      {/* VRAM Estimation */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">VRAM Estimation Guide</SectionTitle>
        <Card className="p-4 bg-cyan-500/5 border-cyan-500/20 space-y-4">
          <p className="text-[11px] text-white/70 leading-relaxed mb-3">
            Use the <strong className="text-cyan-300">🧮 Calculator</strong> button in the Models page to estimate 
            VRAM requirements. Here's a rough guide for common scenarios:
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-white/50 border-b border-white/10">
                  <th className="pb-2 pr-4">Model Size</th>
                  <th className="pb-2 px-4">FP16 VRAM</th>
                  <th className="pb-2 px-4">Q8_0 VRAM</th>
                  <th className="pb-2 px-4">Q4_K_M VRAM</th>
                  <th className="pb-2 px-4">Recommended GPU(s)</th>
                </tr>
              </thead>
              <tbody className="text-white/70">
                <VramRow model="7B-8B" fp16="~14-16 GB" q8="~8-9 GB" q4="~5-6 GB" gpus="1× 24GB" />
                <VramRow model="13B-14B" fp16="~26-28 GB" q8="~14-15 GB" q4="~8-10 GB" gpus="1× 48GB or 2× 24GB" />
                <VramRow model="32B-34B" fp16="~64-68 GB" q8="~34-36 GB" q4="~20-24 GB" gpus="2× 48GB or 4× 24GB" />
                <VramRow model="70B-72B" fp16="~140-144 GB" q8="~72-76 GB" q4="~40-48 GB" gpus="4× 48GB or 8× 24GB" />
                <VramRow model="120B (GPT-OSS)" fp16="N/A" q8="~120 GB" q4="~60-72 GB" gpus="4× 48GB (llama.cpp)" />
              </tbody>
            </table>
          </div>

          <InfoBox variant="blue" className="text-[10px] p-3">
            <strong>Note:</strong> These are base model weights only. KV cache for long contexts adds significant 
            VRAM overhead. A 70B model at 32K context may need 20-40GB additional VRAM for KV cache.
          </InfoBox>
        </Card>
      </section>

      <div className="text-[9px] text-white/20 uppercase font-black tracking-[0.3em] text-center pt-4 border-t border-white/5">
        Cortex Configuration Guide • <a href="https://www.aulendur.com" target="_blank" rel="noopener noreferrer" className="hover:text-white/40 hover:underline transition-colors">Aulendur Labs</a>
      </div>
    </section>
  );
}

// Helper Components
function ConfigItem({ 
  name, 
  options, 
  default: defaultVal, 
  description, 
  tip 
}: { 
  name: string; 
  options: string[]; 
  default: string; 
  description: string; 
  tip: string;
}) {
  return (
    <div className="p-3 bg-black/20 rounded-lg border border-white/5 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-[12px] font-semibold text-white">{name}</span>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-white/40">Default:</span>
          <Badge className="bg-white/10 text-white/70 border-white/10 text-[9px]">{defaultVal}</Badge>
        </div>
      </div>
      <p className="text-[11px] text-white/60 leading-relaxed">{description}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <Badge key={opt} className="bg-white/5 text-white/50 border-white/5 text-[9px]">{opt}</Badge>
        ))}
      </div>
      <p className="text-[10px] text-cyan-300/70 italic">💡 {tip}</p>
    </div>
  );
}

function VramRow({ 
  model, 
  fp16, 
  q8, 
  q4, 
  gpus 
}: { 
  model: string; 
  fp16: string; 
  q8: string; 
  q4: string; 
  gpus: string;
}) {
  return (
    <tr className="border-b border-white/5">
      <td className="py-2 pr-4 font-medium text-white">{model}</td>
      <td className="py-2 px-4">{fp16}</td>
      <td className="py-2 px-4">{q8}</td>
      <td className="py-2 px-4">{q4}</td>
      <td className="py-2 px-4 text-cyan-300">{gpus}</td>
    </tr>
  );
}

