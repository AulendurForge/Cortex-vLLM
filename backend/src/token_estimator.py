from __future__ import annotations
from typing import Optional

def rough_token_count(text: str) -> int:
    """Cheap heuristic to approximate token count when engine doesn't return usage.
    Assumes ~4 chars per token on average for English. Bounds to >= 0.
    """
    if not text:
        return 0
    return max(0, int(len(text) / 4))

def estimate_chat_prompt_tokens(messages: list[dict]) -> int:
    total = 0
    for m in messages or []:
        c = m.get("content")
        if isinstance(c, str):
            total += rough_token_count(c)
        elif isinstance(c, list):
            for part in c:
                if isinstance(part, dict):
                    t = part.get("text") or part.get("content")
                    if isinstance(t, str):
                        total += rough_token_count(t)
    return total


