from pydantic import BaseModel, Field
from typing import Optional


class PatchRange(BaseModel):
    start_line: int = Field(..., ge=1)
    end_line: int = Field(..., ge=1)


class PatchContract(BaseModel):
    file: str = Field(..., max_length=500)
    language: str = Field(..., max_length=50)
    range: PatchRange
    replacement_text: str = Field(..., max_length=50000)
    rationale: str = Field(..., max_length=1000)
    severity: str = Field(default="medium", pattern="^(low|medium|high|critical)$")
    original_text: str = Field(..., max_length=50000)
    claude_msg_id: Optional[str] = None
