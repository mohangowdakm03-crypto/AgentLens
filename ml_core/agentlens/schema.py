"""Shared contracts. Change only with agreement from all three members."""
from dataclasses import dataclass, field
from typing import Optional
import numpy as np


@dataclass
class Step:
    step_id: int                      # 1-indexed
    action_type: str                  # e.g. "search", "read", "write", "email"
    tool_called: Optional[str] = None
    tool_input: str = ""
    tool_output: str = ""
    agent_reasoning: str = ""


@dataclass
class Intent:
    prompt: str
    embedding: Optional[np.ndarray] = None
    allowed_verbs: set = field(default_factory=set)
    forbidden_verbs: set = field(default_factory=set)


@dataclass
class Deviation:
    step_id: Optional[int]            # None = no deviation found
    type: str                         # "scope_creep" | "drift" | "misinterpretation" | "none"
    confidence: float = 0.0
    similarity_curve: list = field(default_factory=list)
    flagged_steps: list = field(default_factory=list)


@dataclass
class RewriteResult:
    corrected_prompt: str
    diff: str
    reason: str
