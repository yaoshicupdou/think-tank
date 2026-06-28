from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional

class DocumentResponse(BaseModel):
    id: int
    filename: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class ChatRequest(BaseModel):
    query: str

class SourceInfo(BaseModel):
    document_id: int
    filename: str
    content: str
    similarity: float
