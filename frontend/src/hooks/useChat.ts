/**
 * useChat - Custom hook for managing chat state and streaming.
 * 
 * Provides state management for chat messages, streaming responses,
 * and performance metrics tracking.
 */

import { useState, useCallback, useRef } from 'react';
import { 
  streamChat, 
  ChatMessage as ApiChatMessage,
  ChatError,
  StreamChatOptions,
} from '../lib/chat-client';

// ============================================================================
// Types
// ============================================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metrics?: MessageMetrics;
}

export interface MessageMetrics {
  tokensPerSec?: number;
  ttftMs?: number;
  completionTokens?: number;
  latencyMs?: number;
}

export interface ChatMetrics {
  tokensPerSec: number;
  ttftMs: number | null;
}

export interface UseChatOptions {
  model: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  onError?: (error: string) => void;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  currentMetrics: ChatMetrics;
  sendMessage: (content: string) => Promise<void>;
  stopStreaming: () => void;
  clearChat: () => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

// ============================================================================
// UUID Generator
// ============================================================================

function generateId(): string {
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
  return `${t}-${rnd}`;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useChat(options: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentMetrics, setCurrentMetrics] = useState<ChatMetrics>({
    tokensPerSec: 0,
    ttftMs: null,
  });
  
  // Refs for tracking metrics during streaming
  const abortRef = useRef<AbortController | null>(null);
  const metricsRef = useRef({
    startTime: 0,
    firstTokenTime: 0,
    tokenCount: 0,
  });

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isStreaming || !options.model) return;
    
    setError(null);
    setIsStreaming(true);
    
    // Add user message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    };
    
    // Add placeholder assistant message
    const assistantId = generateId();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    
    setMessages(prev => [...prev, userMessage, assistantMessage]);
    
    // Setup abort controller
    abortRef.current = new AbortController();
    
    // Reset metrics
    metricsRef.current = { 
      startTime: Date.now(), 
      firstTokenTime: 0, 
      tokenCount: 0,
    };
    setCurrentMetrics({ tokensPerSec: 0, ttftMs: null });
    
    try {
      // Build messages array for API
      const apiMessages: ApiChatMessage[] = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content,
      }));
      
      let accumulatedContent = '';
      
      const streamOptions: StreamChatOptions = {
        signal: abortRef.current.signal,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        topP: options.topP,
        onFirstToken: () => {
          metricsRef.current.firstTokenTime = Date.now();
          const ttft = metricsRef.current.firstTokenTime - metricsRef.current.startTime;
          setCurrentMetrics(prev => ({ ...prev, ttftMs: ttft }));
        },
      };
      
      for await (const chunk of streamChat(options.model, apiMessages, streamOptions)) {
        if (chunk.type === 'content') {
          accumulatedContent += chunk.content;
          metricsRef.current.tokenCount++;
          
          // Calculate live tokens/sec
          const elapsed = (Date.now() - metricsRef.current.startTime) / 1000;
          const tokensPerSec = elapsed > 0 ? metricsRef.current.tokenCount / elapsed : 0;
          setCurrentMetrics(prev => ({ ...prev, tokensPerSec }));
          
          // Update message content
          setMessages(prev => prev.map(m => 
            m.id === assistantId 
              ? { ...m, content: accumulatedContent }
              : m
          ));
        } else if (chunk.type === 'done') {
          // Finalize metrics
          const latencyMs = Date.now() - metricsRef.current.startTime;
          const finalMetrics: MessageMetrics = {
            tokensPerSec: latencyMs > 0 
              ? metricsRef.current.tokenCount / (latencyMs / 1000) 
              : 0,
            ttftMs: metricsRef.current.firstTokenTime 
              ? metricsRef.current.firstTokenTime - metricsRef.current.startTime 
              : undefined,
            completionTokens: chunk.usage?.completion_tokens ?? metricsRef.current.tokenCount,
            latencyMs,
          };
          
          setMessages(prev => prev.map(m => 
            m.id === assistantId 
              ? { ...m, metrics: finalMetrics }
              : m
          ));
        }
      }
    } catch (err) {
      if (err instanceof ChatError) {
        setError(err.message);
        options.onError?.(err.message);
      } else if ((err as Error).name === 'AbortError') {
        // User cancelled - not an error, but mark the message
        setMessages(prev => prev.map(m => 
          m.id === assistantId && !m.content
            ? { ...m, content: '[Cancelled]' }
            : m
        ));
      } else {
        const errorMsg = 'An unexpected error occurred';
        setError(errorMsg);
        options.onError?.(errorMsg);
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [messages, isStreaming, options]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    setCurrentMetrics({ tokensPerSec: 0, ttftMs: null });
  }, []);

  return {
    messages,
    isStreaming,
    error,
    currentMetrics,
    sendMessage,
    stopStreaming,
    clearChat,
    setMessages,
  };
}

export default useChat;

