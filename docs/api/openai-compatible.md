# OpenAI-compatible API

The gateway implements the following endpoints under `/v1`:

- `POST /v1/chat/completions`
- `POST /v1/completions`
- `POST /v1/embeddings`

Authenticate with an API key: `Authorization: Bearer <token>`.

## Chat completions (example)
```bash
curl -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "$GATEWAY/v1/chat/completions" \
  -d '{
    "model":"meta-llama/Llama-3-8B-Instruct",
    "messages":[{"role":"user","content":"Hello!"}],
    "stream": false
  }'
```

Streaming is supported with `"stream": true`.

## Token usage
- If upstream reports usage, gateway forwards it.
- If not, gateway estimates usage (configurable) based on prompt length and message content.

## Scopes
- `chat` for `/chat/completions`, `completions` for `/completions`, `embeddings` for `/embeddings`.

## Errors
Errors use a consistent envelope:
```json
{
  "error": {"code": 401, "message": "invalid_credentials"},
  "request_id": "..."
}
```
Log and share `request_id` when reporting issues.
