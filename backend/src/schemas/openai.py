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
    input: Union[str, List[str]]
    if ConfigDict:
        model_config = ConfigDict(extra='allow')

