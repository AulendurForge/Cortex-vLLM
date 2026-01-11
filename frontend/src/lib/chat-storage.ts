/**
 * Chat storage utilities for persisting chat sessions in localStorage.
 * 
 * Provides functions for saving, loading, listing, and deleting chat sessions.
 * Uses localStorage for simplicity - suitable for playground/testing use case.
 */

import type { ChatMessage } from '../hooks/useChat';
import type { ModelConstraints } from './chat-client';

// ============================================================================
// Types
// ============================================================================

export interface ChatSession {
  id: string;
  title: string;
  modelName: string;
  engineType: string;
  constraints: ModelConstraints | null;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  modelName: string;
  engineType: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'cortex_chat_sessions';
const MAX_SESSIONS = 50; // Limit to prevent localStorage overflow
const STORAGE_WARNING_THRESHOLD = 0.8; // Warn at 80% capacity

// ============================================================================
// Helper Functions
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

function generateTitle(messages: ChatMessage[]): string {
  // Use first user message as title, truncated
  const firstUserMsg = messages.find(m => m.role === 'user');
  if (firstUserMsg) {
    const content = firstUserMsg.content.trim();
    if (content.length > 40) {
      return content.slice(0, 37) + '...';
    }
    return content || 'New Chat';
  }
  return 'New Chat';
}

function getAllSessions(): Record<string, ChatSession> {
  if (typeof window === 'undefined') return {};
  
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return {};
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveSessions(sessions: Record<string, ChatSession>): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (e) {
    // localStorage might be full
    console.error('Failed to save chat sessions:', e);
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Create a new chat session.
 */
export function createChat(
  modelName: string,
  engineType: string,
  constraints: ModelConstraints | null = null
): ChatSession {
  const now = Date.now();
  const session: ChatSession = {
    id: generateId(),
    title: 'New Chat',
    modelName,
    engineType,
    constraints,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  
  const sessions = getAllSessions();
  sessions[session.id] = session;
  
  // Enforce max sessions limit (remove oldest)
  const sessionList = Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt);
  if (sessionList.length > MAX_SESSIONS) {
    const toRemove = sessionList.slice(MAX_SESSIONS);
    for (const s of toRemove) {
      delete sessions[s.id];
    }
  }
  
  saveSessions(sessions);
  return session;
}

/**
 * Save/update a chat session.
 */
export function saveChat(
  chatId: string,
  messages: ChatMessage[],
  modelName?: string,
  constraints?: ModelConstraints | null
): void {
  const sessions = getAllSessions();
  const existing = sessions[chatId];
  
  if (!existing) {
    // Create new session if doesn't exist
    const now = Date.now();
    sessions[chatId] = {
      id: chatId,
      title: generateTitle(messages),
      modelName: modelName || 'unknown',
      engineType: 'vllm',
      constraints: constraints || null,
      messages,
      createdAt: now,
      updatedAt: now,
    };
  } else {
    // Update existing session
    sessions[chatId] = {
      ...existing,
      messages,
      title: generateTitle(messages),
      updatedAt: Date.now(),
      ...(modelName && { modelName }),
      ...(constraints !== undefined && { constraints }),
    };
  }
  
  saveSessions(sessions);
}

/**
 * Load a chat session by ID.
 */
export function loadChat(chatId: string): ChatSession | null {
  const sessions = getAllSessions();
  return sessions[chatId] || null;
}

/**
 * List all chat sessions (summaries only, sorted by newest first).
 */
export function listChats(): ChatSessionSummary[] {
  const sessions = getAllSessions();
  
  return Object.values(sessions)
    .map(s => ({
      id: s.id,
      title: s.title,
      modelName: s.modelName,
      engineType: s.engineType,
      messageCount: s.messages.length,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }))
    // Sort by creation time, newest first (most recent at top)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Delete a chat session.
 */
export function deleteChat(chatId: string): void {
  const sessions = getAllSessions();
  delete sessions[chatId];
  saveSessions(sessions);
}

/**
 * Delete all chat sessions.
 */
export function clearAllChats(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Export a chat session as JSON string.
 */
export function exportChat(chatId: string): string | null {
  const session = loadChat(chatId);
  if (!session) return null;
  
  return JSON.stringify({
    title: session.title,
    model: session.modelName,
    engine: session.engineType,
    messages: session.messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: new Date(m.timestamp).toISOString(),
      metrics: m.metrics,
    })),
    exportedAt: new Date().toISOString(),
  }, null, 2);
}

/**
 * Check storage usage and return warning if near capacity.
 */
export function checkStorageUsage(): { 
  usedBytes: number; 
  warning: boolean; 
  message?: string;
} {
  if (typeof window === 'undefined') {
    return { usedBytes: 0, warning: false };
  }
  
  try {
    const data = localStorage.getItem(STORAGE_KEY) || '';
    const usedBytes = new Blob([data]).size;
    const estimatedMax = 5 * 1024 * 1024; // 5MB typical localStorage limit
    const usageRatio = usedBytes / estimatedMax;
    
    if (usageRatio > STORAGE_WARNING_THRESHOLD) {
      return {
        usedBytes,
        warning: true,
        message: `Chat storage is ${Math.round(usageRatio * 100)}% full. Consider deleting old chats.`,
      };
    }
    
    return { usedBytes, warning: false };
  } catch {
    return { usedBytes: 0, warning: false };
  }
}

/**
 * Update chat title manually.
 */
export function updateChatTitle(chatId: string, title: string): void {
  const sessions = getAllSessions();
  if (sessions[chatId]) {
    sessions[chatId].title = title;
    sessions[chatId].updatedAt = Date.now();
    saveSessions(sessions);
  }
}

