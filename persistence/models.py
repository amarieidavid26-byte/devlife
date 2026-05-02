from dataclasses import dataclass
from typing import Optional


@dataclass
class Session:
    id: int
    started_at: float
    ended_at: Optional[float]
    mode: str
    whoop_connected: bool


@dataclass
class Intervention:
    id: int
    session_id: int
    ts: float
    state: str
    source: str
    content_hash: Optional[str]
    claude_text: Optional[str]
    fallback_used: bool
    suppressed: bool


@dataclass
class BiometricSample:
    id: int
    session_id: int
    ts: float
    hr: Optional[float]
    hrv: Optional[float]
    recovery: Optional[float]
    strain: Optional[float]
    source: Optional[str]


@dataclass
class Feedback:
    id: int
    intervention_id: int
    ts: float
    rating: Optional[str]
    comment: Optional[str]


@dataclass
class ApplyFixAudit:
    id: int
    session_id: int
    ts: float
    file: Optional[str]
    range_before: Optional[str]
    patch_hash: Optional[str]
    action: str
    reason: Optional[str]
