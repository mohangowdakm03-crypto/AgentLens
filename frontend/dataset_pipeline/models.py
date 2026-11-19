"""
Data models and schemas for the AgentLens Detector Dataset.
Strictly mirrors the schema used in agentlens_detector_seeds_15.jsonl.
"""

from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field, model_validator


VALID_ACTION_TYPES = {"search", "read", "write", "delete", "send", "execute"}
VALID_DEVIATION_TYPES = {"none", "drift", "scope_creep", "prompt_misinterpretation", "tool_misuse"}
VALID_DIFFICULTIES = {"easy", "medium", "hard"}

ActionType = Literal["search", "read", "write", "delete", "send", "execute"]
DeviationType = Literal["none", "drift", "scope_creep", "prompt_misinterpretation", "tool_misuse"]
Difficulty = Literal["easy", "medium", "hard"]


class Step(BaseModel):
    step_id: int = Field(..., description="1-indexed sequence number of the step")
    action_type: ActionType = Field(..., description="High-level action type: search, read, write, delete, send, execute")
    tool_called: str = Field(..., description="Name of the tool invoked by the agent")
    tool_input: str = Field(..., description="Input string/arguments provided to the tool")
    agent_reasoning: str = Field(..., description="Internal thought/reasoning of the agent for taking this action")
    tool_output: str = Field(..., description="Simulated output or response returned by the tool")


class Intent(BaseModel):
    allowed_actions: List[ActionType] = Field(..., description="Set of actions explicitly or implicitly allowed")
    forbidden_actions: List[ActionType] = Field(..., description="Set of actions forbidden for this task")


class GroundTruth(BaseModel):
    deviation_detected: bool = Field(..., description="True if agent deviated or failed the task, False if normal execution")
    deviation_type: DeviationType = Field(..., description="Category of deviation: none, drift, scope_creep, prompt_misinterpretation, tool_misuse")
    flagged_step_id: Optional[int] = Field(None, description="1-indexed step_id where deviation first started; null if no deviation")
    trigger_phrase: Optional[str] = Field(None, description="Phrase in original prompt that triggered deviation, or null")
    explanation: Optional[str] = Field(None, description="Detailed causal explanation of the deviation, or null if none")
    label_source: str = Field("cohere_synthetic", description="Source of the label, e.g. synthetic_seed or cohere_synthetic")


class SeedMeta(BaseModel):
    scenario: str = Field(..., description="Scenario type matching deviation_type, e.g. none, drift, scope_creep")
    difficulty: Difficulty = Field("medium", description="Difficulty level: easy, medium, hard")
    hard_case: Optional[str] = Field(None, description="Explanation of why this example is an edge/hard case, or null")


class AgentTraceRecord(BaseModel):
    trace_id: str = Field(..., description="Unique trace identifier, e.g. syn_001")
    original_prompt: str = Field(..., description="The user's original task instruction to the agent")
    intent: Intent
    steps: List[Step]
    ground_truth: GroundTruth
    seed_meta: SeedMeta


class ValidationResult(BaseModel):
    is_valid: bool
    rejection_code: Optional[str] = None
    rejection_reason: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)
