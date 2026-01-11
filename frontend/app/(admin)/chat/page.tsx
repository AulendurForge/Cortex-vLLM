/**
 * Chat Playground Page
 * 
 * Allows users to interact with running inference models in a chat interface.
 * Features:
 * - Model selection from running models
 * - Streaming responses with real-time metrics
 * - Server-side chat persistence (user-scoped, cross-device)
 * - Context window tracking
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader, Card, InfoBox } from '../../../src/components/UI';
import { 
  ChatInput, 
  ChatSidebar, 
  MessageList, 
  ModelSelector,
  PerformanceMetrics,
} from '../../../src/components/chat';
import { useChat, ChatMessage } from '../../../src/hooks/useChat';
import { 
  fetchModelConstraints, 
  ModelConstraints,
  estimateContextUsage,
} from '../../../src/lib/chat-client';
import {
  listChatSessions,
  createChatSession,
  getChatSession,
  addChatMessage,
  deleteChatSession,
  clearAllChatSessions,
  apiMessageToHookMessage,
  ChatSessionSummary,
} from '../../../src/lib/chat-api';
import { useToast } from '../../../src/providers/ToastProvider';

export default function ChatPage() {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  
  // Current chat state
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [constraints, setConstraints] = useState<ModelConstraints | null>(null);
  
  // Determine if model is locked (has messages)
  const [isModelLocked, setIsModelLocked] = useState(false);
  
  // Track last saved message count to avoid duplicate saves
  const lastSavedCountRef = useRef(0);

  // Fetch sessions from API
  const sessionsQuery = useQuery({
    queryKey: ['chat-sessions'],
    queryFn: listChatSessions,
    staleTime: 5000,
  });

  const sessions = sessionsQuery.data || [];

  // Chat hook
  const {
    messages,
    isStreaming,
    error,
    currentMetrics,
    sendMessage,
    stopStreaming,
    clearChat,
    setMessages,
  } = useChat({
    model: selectedModel,
    maxTokens: constraints?.max_tokens_default ?? 512,
    onError: (err) => {
      addToast({ title: 'Chat Error', description: err, kind: 'error' });
    },
  });

  // Fetch constraints when model changes
  const constraintsQuery = useQuery({
    queryKey: ['model-constraints', selectedModel],
    queryFn: () => fetchModelConstraints(selectedModel),
    enabled: !!selectedModel,
  });

  // Handle constraints query results
  useEffect(() => {
    if (constraintsQuery.data) {
      setConstraints(constraintsQuery.data);
    }
  }, [constraintsQuery.data]);

  useEffect(() => {
    if (constraintsQuery.error) {
      addToast({ 
        title: 'Warning', 
        description: 'Could not fetch model constraints', 
        kind: 'info' 
      });
    }
  }, [constraintsQuery.error, addToast]);

  // Save new messages to server when they arrive
  useEffect(() => {
    if (!currentChatId || messages.length === 0) return;
    if (isStreaming) return; // Don't save while streaming
    
    // Only save if we have new messages
    if (messages.length <= lastSavedCountRef.current) return;
    
    // Save any new messages
    const saveNewMessages = async () => {
      for (let i = lastSavedCountRef.current; i < messages.length; i++) {
        const msg = messages[i];
        if (!msg) continue;
        await addChatMessage(
          currentChatId,
          msg.role,
          msg.content,
          msg.metrics as Record<string, unknown>
        );
      }
      lastSavedCountRef.current = messages.length;
      // Refresh sessions list
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
    };
    
    saveNewMessages();
  }, [messages, currentChatId, isStreaming, queryClient]);

  // Lock model when messages exist
  useEffect(() => {
    setIsModelLocked(messages.length > 0);
  }, [messages]);

  // Handle new chat
  const handleNewChat = useCallback(() => {
    clearChat();
    setCurrentChatId(null);
    setSelectedModel('');
    setConstraints(null);
    setIsModelLocked(false);
    lastSavedCountRef.current = 0;
  }, [clearChat]);

  // Handle chat selection
  const handleSelectChat = useCallback(async (chatId: string) => {
    const session = await getChatSession(chatId);
    if (session) {
      setCurrentChatId(chatId);
      setSelectedModel(session.model_name);
      setConstraints(session.constraints);
      const hookMessages = session.messages.map((m, i) => apiMessageToHookMessage(m, i));
      setMessages(hookMessages);
      lastSavedCountRef.current = hookMessages.length;
      setIsModelLocked(hookMessages.length > 0);
    }
  }, [setMessages]);

  // Handle model selection
  const handleModelChange = useCallback(async (modelName: string) => {
    if (isModelLocked) return;
    
    setSelectedModel(modelName);
    
    // Create new chat session when model is selected
    if (modelName && !currentChatId) {
      const newSession = await createChatSession(modelName, 'vllm', null);
      if (newSession) {
        setCurrentChatId(newSession.id);
        lastSavedCountRef.current = 0;
        queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
      }
    }
    
    // Fetch constraints for new model
    if (modelName) {
      constraintsQuery.refetch();
    }
  }, [isModelLocked, currentChatId, constraintsQuery, queryClient]);

  // Handle send message
  const handleSendMessage = useCallback(async (content: string) => {
    if (!selectedModel) {
      addToast({ title: 'Select a Model', description: 'Please select a model first', kind: 'info' });
      return;
    }
    
    // Create chat if doesn't exist
    if (!currentChatId) {
      const newSession = await createChatSession(
        selectedModel, 
        constraints?.engine_type || 'vllm', 
        constraints
      );
      if (newSession) {
        setCurrentChatId(newSession.id);
        lastSavedCountRef.current = 0;
        queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
      }
    }
    
    sendMessage(content);
  }, [selectedModel, currentChatId, constraints, sendMessage, addToast, queryClient]);

  // Refresh sessions list
  const handleRefreshSessions = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
    // If current chat was deleted, reset
    if (currentChatId) {
      getChatSession(currentChatId).then(session => {
        if (!session) {
          handleNewChat();
        }
      });
    }
  }, [currentChatId, handleNewChat, queryClient]);

  // Calculate context usage
  const contextUsed = estimateContextUsage(messages);
  const contextLimit = constraints?.context_size || constraints?.max_model_len || undefined;

  // Adapt sessions for sidebar (convert snake_case to camelCase)
  const sidebarSessions = sessions.map(s => ({
    id: s.id,
    title: s.title,
    modelName: s.model_name,
    engineType: s.engine_type,
    messageCount: s.message_count,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  }));

  return (
    <div className="space-y-4">
      <PageHeader 
        title="Chat Playground" 
        subtitle="Test and interact with your running inference models"
      />

      <Card className="p-0 overflow-hidden">
        <div className="flex h-[calc(100vh-220px)] min-h-[500px]">
          {/* Sidebar */}
          <ChatSidebar
            sessions={sidebarSessions}
            currentChatId={currentChatId}
            onSelectChat={handleSelectChat}
            onNewChat={handleNewChat}
            onRefresh={handleRefreshSessions}
          />

          {/* Main chat area */}
          <div className="flex-1 flex flex-col">
            {/* Header with model selector */}
            <div className="flex items-center justify-between p-4 border-b border-white/5 bg-black/10">
              <ModelSelector
                value={selectedModel}
                onChange={handleModelChange}
                disabled={isStreaming}
                locked={isModelLocked}
              />
              
              {/* Quick actions */}
              <div className="flex items-center gap-2">
                {messages.length > 0 && !isStreaming && (
                  <button
                    onClick={handleNewChat}
                    className="p-2 rounded-lg text-white/40 hover:text-white/60 hover:bg-white/5 transition-colors"
                    title="New chat"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Performance metrics bar */}
            <PerformanceMetrics metrics={currentMetrics} isStreaming={isStreaming} />

            {/* Error display */}
            {error && (
              <div className="mx-4 mt-4">
                <InfoBox variant="error">
                  {error}
                </InfoBox>
              </div>
            )}

            {/* Model locked warning */}
            {isModelLocked && (
              <div className="mx-4 mt-4">
                <InfoBox variant="warning" className="text-xs">
                  Model selection is locked for this conversation. Start a new chat to use a different model.
                </InfoBox>
              </div>
            )}

            {/* Messages */}
            <MessageList messages={messages} isStreaming={isStreaming} />

            {/* Input */}
            <ChatInput
              onSend={handleSendMessage}
              onStop={stopStreaming}
              disabled={!selectedModel}
              isStreaming={isStreaming}
              placeholder={selectedModel ? 'Type a message...' : 'Select a model to start chatting'}
              contextUsed={contextUsed}
              contextLimit={contextLimit}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
