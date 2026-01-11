/**
 * ChatSidebar - List of chat sessions with create/delete functionality.
 */

'use client';

import { useState } from 'react';
import { deleteChatSession, clearAllChatSessions } from '../../lib/chat-api';
import { Button } from '../UI';
import { cn } from '../../lib/cn';

// Local type that matches what we receive from the page
interface ChatSessionSummary {
  id: string;
  title: string;
  modelName: string;
  engineType: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

interface ChatSidebarProps {
  sessions: ChatSessionSummary[];
  currentChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onRefresh: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return new Date(timestamp).toLocaleDateString();
}

export function ChatSidebar({
  sessions,
  currentChatId,
  onSelectChat,
  onNewChat,
  onRefresh,
}: ChatSidebarProps) {
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const handleDelete = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    await deleteChatSession(chatId);
    onRefresh();
  };

  const handleClearAll = async () => {
    if (confirmClearAll) {
      await clearAllChatSessions();
      onRefresh();
      setConfirmClearAll(false);
    } else {
      setConfirmClearAll(true);
      setTimeout(() => setConfirmClearAll(false), 3000);
    }
  };

  return (
    <div className="w-64 flex flex-col bg-white/[0.02] border-r border-white/5">
      {/* Header */}
      <div className="p-4 border-b border-white/5">
        <Button
          onClick={onNewChat}
          variant="cyan"
          size="sm"
          className="w-full justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Chat
        </Button>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <div className="text-center py-8 text-white/30 text-sm">
            No conversations yet
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => onSelectChat(session.id)}
                className={cn(
                  'group relative p-3 rounded-xl cursor-pointer transition-all duration-200',
                  currentChatId === session.id
                    ? 'bg-teal-500/10 border border-teal-500/20'
                    : 'hover:bg-white/5 border border-transparent'
                )}
              >
                {/* Title */}
                <div className="text-sm font-medium text-white/80 truncate pr-6">
                  {session.title}
                </div>
                
                {/* Meta */}
                <div className="flex items-center gap-2 mt-1">
                  <span className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded',
                    session.engineType === 'llamacpp'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-blue-500/10 text-blue-400'
                  )}>
                    {session.engineType === 'llamacpp' ? 'llama.cpp' : 'vLLM'}
                  </span>
                  <span className="text-[10px] text-white/30">
                    {formatRelativeTime(session.updatedAt)}
                  </span>
                </div>
                
                {/* Message count */}
                <div className="text-[10px] text-white/20 mt-1">
                  {session.messageCount} messages
                </div>

                {/* Delete button */}
                <button
                  onClick={(e) => handleDelete(e, session.id)}
                  className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-all"
                  title="Delete chat"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {sessions.length > 0 && (
        <div className="p-3 border-t border-white/5">
          <button
            onClick={handleClearAll}
            className={cn(
              'w-full text-[11px] py-2 rounded-lg transition-colors',
              confirmClearAll
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'text-white/30 hover:text-white/50 hover:bg-white/5'
            )}
          >
            {confirmClearAll ? 'Click again to confirm' : 'Clear all chats'}
          </button>
        </div>
      )}
    </div>
  );
}

export default ChatSidebar;

