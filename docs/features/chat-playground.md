# Chat Playground

The Chat Playground is an interactive interface for testing and evaluating running inference models directly within Cortex. It allows users to quickly validate model performance, measure generation speed, and experiment with different prompts without writing any code.

---

## Overview

**Key Features:**

- **Model Selection**: Choose from any currently running inference model
- **Streaming Responses**: Real-time token generation with SSE
- **Performance Metrics**: Token/second, time-to-first-token (TTFT), total tokens
- **Context Tracking**: Visual indicator of context window usage
- **Server-Side Persistence**: Chats are stored in the database (user-scoped)
- **Cross-Device Access**: Access your chat history from any machine
- **Model Locking**: Prevents mid-conversation model changes to ensure consistency

---

## Accessing the Chat Playground

Navigate to **Chat → Playground** in the Cortex Admin UI sidebar. The Chat section appears between "Platform" and "Administration" sections.

```
Admin UI: http://YOUR_IP:3001/chat
```

---

## User Interface

### Layout

The Chat Playground has a two-column layout:

```
┌─────────────────────────────────────────────────────────────────┐
│  Chat Playground                                                │
├────────────────┬────────────────────────────────────────────────┤
│                │                                                │
│  Chat History  │  Model Selector: [Select Model ▼]              │
│  ────────────  │  ─────────────────────────────────────────     │
│  + New Chat    │  Performance: 32.5 tok/s | TTFT: 145ms         │
│                │  ─────────────────────────────────────────     │
│  Chat 1        │                                                │
│  Chat 2        │  User: What is Python?                         │
│  Chat 3        │                                                │
│                │  Assistant: Python is a high-level...          │
│                │                                                │
│  [Clear All]   │  ─────────────────────────────────────────     │
│                │  [Type a message...               ] [Send]     │
│                │  Context: 1,234 / 32,768 tokens                │
└────────────────┴────────────────────────────────────────────────┘
```

### Components

| Component | Description |
|-----------|-------------|
| **Chat Sidebar** | Lists chat history, create new chats, delete sessions |
| **Model Selector** | Dropdown of running models, locked once conversation starts |
| **Performance Metrics** | Real-time generation speed and latency |
| **Message List** | Conversation display with markdown rendering |
| **Chat Input** | Message input with context usage indicator |

---

## Using the Chat Playground

### Starting a New Chat

1. Click **+ New Chat** in the sidebar (or navigate to `/chat`)
2. Select a running model from the dropdown
3. Type your message and press Enter or click Send

!!! note "Model Selection"
    Only models that are currently running and healthy appear in the dropdown. If no models are available, you'll see "No models running" - start a model from the Models page first.

### Model Locking

Once you send a message, the model selection becomes locked for that conversation:

- ✅ **Why locked**: Different models have different context windows, tokenizers, and capabilities. Mixing models mid-conversation could cause errors or unexpected behavior.
- ✅ **How to switch**: Start a new chat to use a different model
- ✅ **Visual indicator**: A warning banner appears when model is locked

### Performance Metrics

During streaming responses, real-time metrics are displayed:

| Metric | Description |
|--------|-------------|
| **tok/s** | Tokens generated per second |
| **TTFT** | Time to first token (latency) |
| **Tokens** | Total tokens generated in current response |

### Context Window Tracking

The input area shows an estimate of context usage:

```
Context: 2,048 / 32,768 tokens
```

- Uses ~4 characters per token heuristic
- Helps avoid context overflow errors
- Updates in real-time as you type and receive responses

---

## Chat Persistence

### Server-Side Storage

Chats are stored in the database (not browser localStorage), providing:

- **User Isolation**: Each user only sees their own chats
- **Cross-Device Access**: Access your chat history from any machine
- **Persistence**: Chats survive browser cache clears
- **Admin Visibility**: Usage is logged for admin monitoring

### Database Schema

Two tables store chat data:

```
chat_sessions
├── id (UUID)
├── user_id (FK → users)
├── title (auto-generated from first message)
├── model_name
├── engine_type
├── constraints_json
├── created_at
└── updated_at

chat_messages
├── id (auto-increment)
├── session_id (FK → chat_sessions, CASCADE delete)
├── role ('user', 'assistant', 'system')
├── content
├── metrics_json (tokens/sec, TTFT, etc.)
└── created_at
```

### Chat History

- Sorted newest-to-oldest
- Title auto-generated from first user message
- Click to restore previous conversations
- Delete individual chats or clear all

---

## API Endpoints

The Chat Playground uses dedicated API endpoints (not the OpenAI-compatible endpoints):

### Model Information

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/models/running` | GET | List healthy running models |
| `/v1/models/{name}/constraints` | GET | Get model context limits and defaults |

### Chat Sessions

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/sessions` | GET | List user's chat sessions |
| `/v1/chat/sessions` | POST | Create new chat session |
| `/v1/chat/sessions/{id}` | GET | Get session with messages |
| `/v1/chat/sessions/{id}/messages` | POST | Add message to session |
| `/v1/chat/sessions/{id}` | DELETE | Delete chat session |
| `/v1/chat/sessions` | DELETE | Clear all user's sessions |

!!! info "Authentication"
    These endpoints use session cookie authentication (`require_user_session`), not API key authentication. They're designed for the Admin UI, not external API access.

### Model Constraints Response

```json
{
  "served_model_name": "Qwen-2-7B-Instruct",
  "engine_type": "vllm",
  "task": "generate",
  "context_size": null,
  "max_model_len": 32768,
  "max_tokens_default": 512,
  "request_defaults": null,
  "supports_streaming": true,
  "supports_system_prompt": true
}
```

---

## Technical Architecture

### Frontend Components

```
frontend/src/
├── app/(admin)/chat/
│   └── page.tsx           # Main chat page
├── components/chat/
│   ├── index.ts           # Barrel exports
│   ├── ChatInput.tsx      # Message input with context display
│   ├── ChatSidebar.tsx    # Session list and management
│   ├── MessageList.tsx    # Conversation display
│   ├── MessageContent.tsx # Markdown/code rendering
│   ├── ModelSelector.tsx  # Running model dropdown
│   └── PerformanceMetrics.tsx # Real-time metrics display
├── hooks/
│   └── useChat.ts         # Chat state management hook
└── lib/
    ├── chat-client.ts     # Streaming client & model APIs
    └── chat-api.ts        # Session persistence APIs
```

### Backend Routes

```
backend/src/routes/chat.py
├── GET  /v1/models/running           # List healthy models
├── GET  /v1/models/{name}/constraints # Get model limits
├── GET  /v1/chat/sessions            # List sessions
├── POST /v1/chat/sessions            # Create session
├── GET  /v1/chat/sessions/{id}       # Get session
├── POST /v1/chat/sessions/{id}/messages # Add message
├── DELETE /v1/chat/sessions/{id}     # Delete session
└── DELETE /v1/chat/sessions          # Clear all sessions
```

### Streaming Implementation

The chat uses Server-Sent Events (SSE) via the standard OpenAI-compatible `/v1/chat/completions` endpoint:

```typescript
// Frontend streaming pattern (chat-client.ts)
async function* streamChat(model, messages, options) {
  const response = await fetch('/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    }),
  });
  
  const reader = response.body.getReader();
  // Parse SSE chunks...
}
```

---

## Usage Logging

Chat interactions are logged to the Usage database, similar to API requests:

- User and organization IDs are captured
- Prompt and completion token counts
- Latency measurements
- Enables admin visibility into internal Cortex usage

Access usage data via:
- Admin UI → Usage page
- API: `GET /admin/usage`

---

## Health Check Integration

The Chat Playground relies on the backend health checking system:

1. **Health Poller** (`health.py`): Background task polls model endpoints every `HEALTH_POLL_SEC` (default: 15s)
2. **Health State**: Results cached in `HEALTH_STATE` dictionary
3. **Health TTL**: Data valid for `HEALTH_CHECK_TTL_SEC` (default: 20s)
4. **Model Selector**: Fetches `/v1/models/running`, which filters by health status

!!! tip "No Models Showing?"
    If the Chat Playground shows "No models running" but models are healthy:
    
    1. Wait 15-30 seconds for health check to refresh
    2. Check `HEALTH_CHECK_TTL_SEC` > `HEALTH_POLL_SEC` in config
    3. Verify model is actually running: `make status`
    4. Check gateway logs: `make logs-gateway`

---

## Troubleshooting

### "No models running" when models are healthy

**Cause**: Health check timing mismatch or stale data

**Solution**:
1. Ensure `HEALTH_CHECK_TTL_SEC` (20s) > `HEALTH_POLL_SEC` (15s)
2. Wait for next health check cycle
3. Refresh the page

### Chat not persisting

**Cause**: Backend routes not deployed

**Solution**:
```bash
# Rebuild and restart the gateway
make down
make quick-start
```

### Model selector shows wrong models

**Cause**: Model registry out of sync with health state

**Solution**:
```bash
# Trigger health refresh
curl -X POST http://YOUR_IP:8084/admin/upstreams/refresh-health \
  -b cookies.txt
```

### Streaming not working

**Cause**: CORS or cookie issues

**Solution**:
1. Ensure accessing via correct IP (not `localhost` if others access by IP)
2. Verify session cookie is set: Check browser dev tools → Application → Cookies
3. Run `make validate` to check CORS configuration

---

## Best Practices

### For Users

1. **Start fresh**: Use "New Chat" for different topics/tasks
2. **Monitor context**: Watch the context usage indicator
3. **Check metrics**: Use TTFT and tok/s to evaluate model performance
4. **Test prompts**: Use Chat Playground to iterate on prompts before API integration

### For Administrators

1. **Monitor usage**: Check Usage page for internal usage patterns
2. **Health checks**: Ensure health polling is working correctly
3. **User management**: Chat sessions are user-scoped for privacy
4. **Database backups**: Include `chat_sessions` and `chat_messages` tables

---

## Related Documentation

- [Backend Architecture](../architecture/backend.md) - Chat routes integration
- [Frontend Architecture](../architecture/frontend.md) - Chat components
- [OpenAI-Compatible API](../api/openai-compatible.md) - Streaming endpoint used by chat
- [Admin API](../api/admin-api.md) - Chat session endpoints

