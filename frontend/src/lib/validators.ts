import { z } from 'zod';

// Keys
export const KeyItemSchema = z.object({
  id: z.number(),
  prefix: z.string(),
  scopes: z.string(),
  expires_at: z.string().nullable(),
  last_used_at: z.string().nullable(),
  disabled: z.boolean(),
  user_id: z.number().nullable().optional(),
  org_id: z.number().nullable().optional(),
  created_at: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  org_name: z.string().nullable().optional(),
});
export const KeysListSchema = z.array(KeyItemSchema);
export const CreateKeyResponseSchema = z.object({ id: z.number(), prefix: z.string(), token: z.string() });

// Usage
export const UsageItemSchema = z.object({
  id: z.number(),
  key_id: z.number().nullable(),
  model_name: z.string(),
  task: z.string(),
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
  latency_ms: z.number(),
  status_code: z.number(),
  req_id: z.string(),
  created_at: z.number(),
});
export const UsageListSchema = z.array(UsageItemSchema);

export const UsageSeriesItemSchema = z.object({
  ts: z.number(),
  requests: z.number(),
  total_tokens: z.number(),
});
export const UsageSeriesSchema = z.array(UsageSeriesItemSchema);

// Aggregates by model (existing endpoint)
export const UsageAggItemSchema = z.object({
  model_name: z.string(),
  requests: z.number(),
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
});
export const UsageAggListSchema = z.array(UsageAggItemSchema);

// Latency summary
export const LatencySummarySchema = z.object({ p50_ms: z.number(), p95_ms: z.number(), avg_ms: z.number() });
export const TtftSummarySchema = z.object({ p50_s: z.number(), p95_s: z.number() });


// System monitoring
export const ThroughputSummarySchema = z.object({
  req_per_sec: z.number(),
  prompt_tokens_per_sec: z.number(),
  generation_tokens_per_sec: z.number(),
  latency_p50_ms: z.number(),
  latency_p95_ms: z.number(),
  ttft_p50_ms: z.number(),
  ttft_p95_ms: z.number(),
});

export const GpuMetricsItemSchema = z.object({
  index: z.number(),
  name: z.string().nullable().optional(),
  utilization_pct: z.number().nullable().optional(),
  mem_used_mb: z.number().nullable().optional(),
  mem_total_mb: z.number().nullable().optional(),
  temperature_c: z.number().nullable().optional(),
});
export const GpuMetricsListSchema = z.array(GpuMetricsItemSchema);

// Host metrics
export const HostSummarySchema = z.object({
  cpu_util_pct: z.number(),
  load_avg_1m: z.number().nullable().optional(),
  mem_total_mb: z.number(),
  mem_used_mb: z.number(),
  disk_total_gb: z.number().nullable().optional(),
  disk_used_gb: z.number().nullable().optional(),
  disk_used_pct: z.number().nullable().optional(),
  net_rx_bps: z.number(),
  net_tx_bps: z.number(),
});

export const TimePointSchema = z.object({ ts: z.number(), value: z.number() });
export const HostTrendsSchema = z.object({
  cpu_util_pct: z.array(TimePointSchema),
  mem_used_mb: z.array(TimePointSchema),
  disk_used_pct: z.array(TimePointSchema),
  net_rx_bps: z.array(TimePointSchema),
  net_tx_bps: z.array(TimePointSchema),
  // Backend may include these keys with null when providers are unavailable (e.g., Windows psutil fallback).
  // Accept null as well as undefined to avoid parse failures that blank the System Monitor.
  cpu_per_core_pct: z
    .record(z.array(TimePointSchema))
    .nullable()
    .optional(),
  disk_rw_bps: z
    .record(z.object({ read: z.array(TimePointSchema), write: z.array(TimePointSchema) }))
    .nullable()
    .optional(),
  net_per_iface_bps: z
    .record(z.object({ rx: z.array(TimePointSchema), tx: z.array(TimePointSchema) }))
    .nullable()
    .optional(),
});

// Capabilities
export const PromTargetsSchema = z.object({
  up: z.boolean(),
  nodeExporter: z.string().nullable().optional(),
  dcgmExporter: z.string().nullable().optional(),
  cadvisor: z.string().nullable().optional(),
});

export const CapabilitiesSchema = z.object({
  os: z.string(),
  isContainer: z.boolean(),
  isWSL: z.boolean(),
  prometheus: PromTargetsSchema,
  gpu: z.object({ nvml: z.boolean(), count: z.number(), driver: z.string().nullable().optional() }),
  selectedProviders: z.object({ host: z.string(), gpu: z.string() }),
  suggestions: z.array(z.string()),
});


// Models (planned backend endpoints)
export const ModelItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  served_model_name: z.string(),
  task: z.enum(['generate', 'embed']).or(z.string()),
  repo_id: z.string().nullable().optional(),
  local_path: z.string().nullable().optional(),
  dtype: z.string().nullable().optional(),
  tp_size: z.number().nullable().optional(),
  gpu_memory_utilization: z.number().nullable().optional(),
  max_model_len: z.number().nullable().optional(),
  // Engine type and llamacpp-specific fields
  engine_type: z.enum(['vllm', 'llamacpp']).or(z.string()).optional().default('vllm'),
  ngl: z.number().nullable().optional(),
  tensor_split: z.string().nullable().optional(),
  batch_size: z.number().nullable().optional(),
  threads: z.number().nullable().optional(),
  context_size: z.number().nullable().optional(),
  rope_freq_base: z.number().nullable().optional(),
  rope_freq_scale: z.number().nullable().optional(),
  flash_attention: z.boolean().nullable().optional(),
  mlock: z.boolean().nullable().optional(),
  no_mmap: z.boolean().nullable().optional(),
  numa_policy: z.string().nullable().optional(),
  split_mode: z.string().nullable().optional(),
  state: z.enum(['stopped', 'starting', 'running', 'failed']).or(z.string()),
  port: z.number().nullable().optional(),
  container_name: z.string().nullable().optional(),
  archived: z.boolean().optional().default(false),
  // Optional tuning fields returned by backend; tolerate presence without requiring them
  kv_cache_dtype: z.string().nullable().optional(),
  max_num_batched_tokens: z.number().nullable().optional(),
  quantization: z.string().nullable().optional(),
  block_size: z.number().nullable().optional(),
  swap_space_gb: z.number().nullable().optional(),
  enforce_eager: z.boolean().nullable().optional(),
  trust_remote_code: z.boolean().nullable().optional(),
  cpu_offload_gb: z.number().nullable().optional(),
  enable_prefix_caching: z.boolean().nullable().optional(),
  prefix_caching_hash_algo: z.string().nullable().optional(),
  enable_chunked_prefill: z.boolean().nullable().optional(),
  max_num_seqs: z.number().nullable().optional(),
  cuda_graph_sizes: z.string().nullable().optional(),
  pipeline_parallel_size: z.number().nullable().optional(),
  device: z.string().nullable().optional(),
  tokenizer: z.string().nullable().optional(),
  hf_config_path: z.string().nullable().optional(),
});
export const ModelListSchema = z.array(ModelItemSchema);


