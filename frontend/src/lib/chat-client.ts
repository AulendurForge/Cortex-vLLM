/**
 * Chat streaming client for Cortex Chat Playground.
 * 
 * Uses native Fetch API with ReadableStream for SSE parsing.
 * Pattern validated from Next.js and AI SDK documentation.
 */

import { getGatewayBaseUrl } from './api-clients';

// ============================================================================
// Types
// ============================================================================

export type ChatStreamChunk = 
  | { type: 'content'; content: string }
  | { type: 'done'; usage?: { prompt_tokens: number; completion_tokens: number } }
  | { type: 'error'; error: string };

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface StreamChatOptions {
  signal?: AbortSignal;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  onFirstToken?: () => void;
}

export interface ModelConstraints {
  served_model_name: string;
  engine_type: string;
  task: string;
  context_size: number | null;
  max_model_len: number | null;
  max_tokens_default: number;
  request_defaults: Record<string, unknown> | null;
  supports_streaming: boolean;
  supports_system_prompt: boolean;
}

export interface RunningModel {
  served_model_name: string;
  task: string;
  engine_type: string;
  state: string;
}

// ============================================================================
// Error Classes
// ============================================================================

export class ChatError extends Error {
  constructor(
    message: string, 
    public status: number, 
    public code?: string
  ) {
    super(message);
    this.name = 'ChatError';
  }
}

// ============================================================================
// UUID Generator (reuse pattern from api-clients.ts)
// ============================================================================

function safeUuid(): string {
  try {
    if (typeof globalThis !== 'undefined') {
      const g = globalThis as { crypto?: { randomUUID?: () => string } };
      if (g.crypto?.randomUUID) {
        return g.crypto.randomUUID();
      }
    }
  } catch { /* fallback below */ }
  
  const rnd = Math.random().toString(16).slice(2);
  const t = Date.now().toString(16);
  return `${t}-${rnd}-${t}`.slice(0, 36);
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Fetch list of running models for chat selection.
 */
export async function fetchRunningModels(): Promise<RunningModel[]> {
  const response = await fetch(`${getGatewayBaseUrl()}/v1/models/running`, {
    method: 'GET',
    credentials: 'include',
  });
  
  if (!response.ok) {
    throw new ChatError('Failed to fetch running models', response.status);
  }
  
  return response.json();
}

/**
 * Fetch model constraints for context window tracking.
 */
export async function fetchModelConstraints(modelName: string): Promise<ModelConstraints> {
  const response = await fetch(
    `${getGatewayBaseUrl()}/v1/models/${encodeURIComponent(modelName)}/constraints`,
    {
      method: 'GET',
      credentials: 'include',
    }
  );
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ChatError(
      error.detail || 'Failed to fetch model constraints',
      response.status
    );
  }
  
  return response.json();
}

/**
 * Stream chat completions from Cortex backend.
 * 
 * Uses native Fetch API with ReadableStream - no external dependencies.
 * Pattern validated from Next.js and AI SDK documentation.
 */
export async function* streamChat(
  model: string,
  messages: ChatMessage[],
  options: StreamChatOptions = {}
): AsyncGenerator<ChatStreamChunk> {
  const response = await fetch(`${getGatewayBaseUrl()}/v1/chat/completions`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-request-id': safeUuid(),
    },
    credentials: 'include',
    signal: options.signal,
    body: JSON.stringify({
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
      max_tokens: options.maxTokens ?? 512,
      temperature: options.temperature,
      top_p: options.topP,
      // Request usage stats at end of stream
      stream_options: { include_usage: true },
    }),
  });

  // Handle HTTP errors before streaming
  if (!response.ok) {
    let errorMessage = 'Request failed';
    let errorCode: string | undefined;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error?.message || errorData.detail || errorData.message || errorMessage;
      errorCode = errorData.error?.code || errorData.code;
    } catch {
      errorMessage = response.statusText;
    }
    throw new ChatError(errorMessage, response.status, errorCode);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new ChatError('No response body', 500);
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let firstTokenReceived = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Decode chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });
      
      // Split by newlines (SSE format)
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        // Skip empty lines and comments
        if (!line.trim() || line.startsWith(':')) continue;
        
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          
          // Check for stream end
          if (data === '[DONE]') {
            yield { type: 'done' };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            
            // Extract content delta
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) {
              // Track first token for TTFT calculation
              if (!firstTokenReceived) {
                firstTokenReceived = true;
                options.onFirstToken?.();
              }
              yield { type: 'content', content: delta.content };
            }
            
            // Check for usage stats (sent at end with stream_options)
            if (parsed.usage) {
              yield { 
                type: 'done', 
                usage: {
                  prompt_tokens: parsed.usage.prompt_tokens,
                  completion_tokens: parsed.usage.completion_tokens,
                }
              };
            }
          } catch {
            // Skip malformed JSON - can happen with partial chunks
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ============================================================================
// Token Estimation Utilities
// ============================================================================

/**
 * Rough token estimation for context window tracking.
 * Uses ~4 characters per token heuristic (works for English).
 * 
 * Note: This is intentionally simple. For precise counting,
 * we'd need the actual tokenizer, but this is good enough
 * for UI feedback on context usage.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Average ~4 chars per token for English text
  // This tends to slightly overcount, which is safer for context limits
  return Math.ceil(text.length / 4);
}

/**
 * Estimate total context usage for a conversation.
 */
export function estimateContextUsage(messages: ChatMessage[]): number {
  let tokens = 0;
  for (const msg of messages) {
    // Add overhead for message formatting (~4 tokens per message)
    tokens += 4;
    tokens += estimateTokens(msg.content);
  }
  return tokens;
}

