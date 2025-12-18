from typing import List, Optional, Union
from pydantic import BaseModel, Field, validator
try:
    # Pydantic v2
    from pydantic import ConfigDict  # type: ignore
except Exception:
    ConfigDict = None  # type: ignore


class ChatMessage(BaseModel):
    role: str
    content: Union[str, List[dict]]
    if ConfigDict:
        model_config = ConfigDict(extra='allow')


class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    stream: Optional[bool] = False
    temperature: Optional[float] = None
    max_tokens: Optional[int] = Field(None, alias="max_tokens")
    # Repetition control parameters
    repetition_penalty: Optional[float] = None
    frequency_penalty: Optional[float] = None
    presence_penalty: Optional[float] = None
    top_k: Optional[int] = None
    top_p: Optional[float] = None

    @validator("messages")
    def ensure_messages_nonempty(cls, v):
        if not v:
            raise ValueError("messages must not be empty")
        return v
    if ConfigDict:
        model_config = ConfigDict(extra='allow')


class CompletionRequest(BaseModel):
    model: str
    prompt: Union[str, List[str]]
    stream: Optional[bool] = False
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    # Repetition control parameters
    repetition_penalty: Optional[float] = None
    frequency_penalty: Optional[float] = None
    presence_penalty: Optional[float] = None
    top_k: Optional[int] = None
    top_p: Optional[float] = None
    if ConfigDict:
        model_config = ConfigDict(extra='allow')


class EmbeddingsRequest(BaseModel):
    model: str
    # OpenAI standard: `input`
    # vLLM extension for multimodal + pooling runner: `messages` (chat-style parts including image_url)
    input: Union[str, List[str], None] = None
    messages: Optional[List[ChatMessage]] = None
    encoding_format: Optional[str] = None

    @validator("messages", always=True)
    def ensure_input_or_messages(cls, v, values):
        inp = values.get("input", None)
        if (inp is None or (isinstance(inp, str) and not inp) or (isinstance(inp, list) and len(inp) == 0)) and not v:
            raise ValueError("Either 'input' or 'messages' must be provided")
        return v
    if ConfigDict:
        model_config = ConfigDict(extra='allow')

