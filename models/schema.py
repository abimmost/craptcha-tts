from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class ForwardRequest(BaseModel):
    source_channel_id: int
    message_id: int
    topic_id: int

class PhoneAuthRequest(BaseModel):
    phone: str
    code: Optional[str] = None

class PasswordRequest(BaseModel):
    password: str

class SelectChannelRequest(BaseModel):
    channel_id: int

class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = "Zephyr"
    speed: Optional[float] = 1.0 # 0.5, 1.0, 1.25, 1.5
