/**
 * Chat API client for server-side chat persistence.
 * 
 * Replaces localStorage-based storage with API calls to the backend.
 * Chats are user-scoped and persist across devices.
 */

import { getGatewayBaseUrl } from './api-clients';
import type { ChatMessage } from '../hooks/useChat';
import type { ModelConstraints } from './chat-client';

// ============================================================================
// Types
// ============================================================================

export interface ChatSessionSummary {
  id: string;
  title: string;
  model_name: string;
  engine_type: string;
  message_count: number;
  created_at: number;
  updated_at: number;
}

export interface ChatSessionDetail {
  id: string;
  title: string;
  model_name: string;
  engine_type: string;
  constraints: ModelConstraints | null;
  messages: ChatMessageAPI[];
  created_at: number;
  updated_at: number;
}

export interface ChatMessageAPI {
  id?: number;
  role: string;
  content: string;
  metrics?: Record<string, unknown>;
  timestamp?: number;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * List all chat sessions for the current user (newest first).
 */
export async function listChatSessions(): Promise<ChatSessionSummary[]> {
  try {
    const response = await fetch(`${getGatewayBaseUrl()}/v1/chat/sessions`, {
      method: 'GET',
      credentials: 'include',
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to list chat sessions:', response.status, errorText);
      return [];
    }
    
    return response.json();
  } catch (error) {
    console.error('Failed to list chat sessions:', error);
    return [];
  }
}

/**
 * Create a new chat session.
 */
export async function createChatSession(
  modelName: string,
  engineType: string,
  constraints: ModelConstraints | null = null
): Promise<ChatSessionDetail | null> {
  try {
    const response = await fetch(`${getGatewayBaseUrl()}/v1/chat/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        model_name: modelName,
        engine_type: engineType,
        constraints: constraints,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to create chat session:', response.status, errorText);
      return null;
    }
    
    return response.json();
  } catch (error) {
    console.error('Failed to create chat session:', error);
    return null;
  }
}

/**
 * Get a chat session with all messages.
 */
export async function getChatSession(sessionId: string): Promise<ChatSessionDetail | null> {
  const response = await fetch(
    `${getGatewayBaseUrl()}/v1/chat/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'GET',
      credentials: 'include',
    }
  );
  
  if (!response.ok) {
    console.error('Failed to get chat session');
    return null;
  }
  
  return response.json();
}

/**
 * Add a message to a chat session.
 */
export async function addChatMessage(
  sessionId: string,
  role: string,
  content: string,
  metrics?: Record<string, unknown>
): Promise<ChatMessageAPI | null> {
  const response = await fetch(
    `${getGatewayBaseUrl()}/v1/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ role, content, metrics }),
    }
  );
  
  if (!response.ok) {
    console.error('Failed to add chat message');
    return null;
  }
  
  return response.json();
}

/**
 * Delete a chat session.
 */
export async function deleteChatSession(sessionId: string): Promise<boolean> {
  const response = await fetch(
    `${getGatewayBaseUrl()}/v1/chat/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'DELETE',
      credentials: 'include',
    }
  );
  
  return response.ok;
}

/**
 * Clear all chat sessions for the current user.
 */
export async function clearAllChatSessions(): Promise<boolean> {
  const response = await fetch(`${getGatewayBaseUrl()}/v1/chat/sessions`, {
    method: 'DELETE',
    credentials: 'include',
  });
  
  return response.ok;
}

// ============================================================================
// Conversion Helpers
// ============================================================================

/**
 * Convert API message format to hook message format.
 */
export function apiMessageToHookMessage(msg: ChatMessageAPI, index: number): ChatMessage {
  return {
    id: msg.id?.toString() || `msg-${index}-${Date.now()}`,
    role: msg.role as 'user' | 'assistant' | 'system',
    content: msg.content,
    timestamp: msg.timestamp || Date.now(),
    metrics: msg.metrics as ChatMessage['metrics'],
  };
}

/**
 * Convert hook message format to API message format.
 */
export function hookMessageToApiMessage(msg: ChatMessage): ChatMessageAPI {
  return {
    role: msg.role,
    content: msg.content,
    metrics: msg.metrics as Record<string, unknown>,
    timestamp: msg.timestamp,
  };
}

