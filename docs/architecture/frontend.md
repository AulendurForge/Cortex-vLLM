# Frontend Architecture

Next.js App Router + TypeScript admin UI (`frontend/`).

## Structure
- `app/(admin)/*`: Pages for Health, Keys, Usage, Models, Orgs, Users, Chat, Guide
- `src/components/*`: UI primitives, charts, monitoring widgets, models tools, chat UI
- `src/lib/api-clients.ts`: fetch helper adds `x-request-id` and normalizes error envelope
- `src/lib/chat-client.ts`: streaming chat client and model constraint fetching
- `src/lib/chat-api.ts`: server-side chat session persistence
- `src/hooks/useChat.ts`: chat state management hook
- `providers/*`: App/Toast/User providers
- Styling: Tailwind CSS with custom utility classes in `styles/globals.css`

## Chat Playground Components

The Chat Playground (`src/components/chat/`) provides an interactive chat interface:

### Core Components
| Component | Purpose |
|-----------|---------|
| `ChatInput.tsx` | Message input with context window tracking |
| `ChatSidebar.tsx` | Session list, new chat, delete operations |
| `MessageList.tsx` | Conversation display with auto-scroll |
| `MessageContent.tsx` | Markdown and code syntax highlighting |
| `ModelSelector.tsx` | Running model dropdown with health awareness |
| `PerformanceMetrics.tsx` | Real-time tok/s, TTFT, token count |

### Supporting Libraries
| File | Purpose |
|------|---------|
| `lib/chat-client.ts` | SSE streaming, model constraints, token estimation |
| `lib/chat-api.ts` | Session CRUD operations via REST API |
| `hooks/useChat.ts` | State management, streaming control, metrics |

### Feature Highlights

**Streaming Chat**:
- Native Fetch + ReadableStream for SSE parsing
- No external dependencies (no LangChain, no AI SDK)
- Real-time token counting and TTFT measurement
- Abort support via AbortController

**Chat Persistence**:
- Server-side storage (database, not localStorage)
- User-scoped sessions (isolation between users)
- Cross-device access to chat history
- Auto-generated titles from first message

**Model Selection**:
- Fetches running models via `/v1/models/running`
- Health-aware filtering (only shows healthy models)
- Model locking once conversation starts
- Constraint fetching for context tracking

**See also**: [Chat Playground Guide](../features/chat-playground.md)

---

## Model Form Components

The model management UI (`src/components/models/`) provides comprehensive configuration:

### Core Components
| Component | Purpose |
|-----------|---------|
| `ModelForm.tsx` | Main form container, state management |
| `ModelWorkflowForm.tsx` | Multi-step wizard variant |
| `EngineSelection.tsx` | vLLM vs llama.cpp selection |
| `ModeSelection.tsx` | Online vs Offline mode |

### Engine-Specific Configuration
| Component | Purpose |
|-----------|---------|
| `VLLMConfiguration.tsx` | vLLM-specific settings (TP, memory, attention) |
| `LlamaCppConfiguration.tsx` | llama.cpp settings (ngl, tensor split, speculative decoding) |

### GGUF-Specific Components
| Component | Purpose |
|-----------|---------|
| `GGUFGroupSelector.tsx` | Quantization selection with quality indicators |
| `EngineGuidance.tsx` | Smart engine/format recommendations |
| `SafeTensorDisplay.tsx` | SafeTensor model metadata display |
| `ArchitectureCompatibility.tsx` | vLLM/llama.cpp compatibility badges |
| `SpeculativeDecodingExplainer.tsx` | Modal explaining speculative decoding |
| `MergeInstructionsModal.tsx` | GGUF merge instructions |

### Feature Highlights

**GGUF Group Selector**:
- Visual quantization selection with radio buttons
- Quality/speed bar indicators (1-5 scale)
- Bits-per-weight and description tooltips
- Multi-part status badges
- Metadata badges (architecture, context, layers)

**Engine Guidance**:
- Contextual warnings (multi-part GGUF + vLLM)
- One-click engine/format switching
- Recommendation badges on engine selector
- SafeTensors availability tips

**Speculative Decoding**:
- Collapsible advanced section
- Draft model path input with example
- Draft tokens and acceptance probability sliders
- "What is this?" explainer modal (React Portal for proper layering)

**Architecture Compatibility**:
- Inline badges showing vLLM/llama.cpp support
- Color-coded: green (full), yellow (partial), orange (experimental), red (none)
- Tooltips with detailed compatibility notes

## Conditional UI Logic

The form dynamically shows/hides fields based on context:

| Condition | Visible Fields |
|-----------|----------------|
| `engineType === 'vllm'` | vLLM configuration section |
| `engineType === 'llamacpp'` | llama.cpp configuration section |
| `useGguf === true` | GGUF weight format dropdown (vLLM) |
| `useGguf === true` | Hide SafeTensor-specific options |
| `useGguf === false` | Show quantization dropdown (vLLM) |

## Data fetching
- TanStack Query for caching and retries; error toasts map backend error structure.
- Env `NEXT_PUBLIC_GATEWAY_URL` controls gateway base URL.

## Accessibility & UX
- Keyboard-friendly components, focus management, skeletons and loading states.
- Loading indicators during folder inspection ("Scanning model folder...")
- React Portals for modals to prevent clipping

## Authentication
- Dev cookie session (`cortex_session`) expected by admin pages; replace with production auth later.
