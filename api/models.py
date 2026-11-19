from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field


class GroundTruthModel(BaseModel):
    isDeviated: bool
    deviationType: Optional[str] = None
    flaggedSteps: List[Any] = Field(default_factory=list)
    flaggedStepId: Optional[Any] = None
    annotationExplanation: str = ""
    sampleSplit: Optional[str] = None
    sample_split: Optional[str] = None
    notes: str = ""


class StepModel(BaseModel):
    stepId: str
    action: str
    reasoning: str = ""
    tool_input: str = ""
    tool_output: str = ""
    similarityScore: float = 0.0


class DetectorConfigModel(BaseModel):
    peltPenalty: float = 0.05
    minDrop: float = 0.15
    fallbackDrop: float = 0.20


class PeltResultModel(BaseModel):
    breakpointIndex: Optional[int] = None
    breakpointStepId: Optional[str] = None
    similarityBefore: Optional[float] = None
    similarityAfter: Optional[float] = None
    difference: Optional[float] = None
    thresholdUsed: float = 0.15


class FallbackResultModel(BaseModel):
    triggered: bool = False
    reason: Optional[str] = None


class ScopeViolationModel(BaseModel):
    stepId: str
    action: str
    reason: str


class ScopeResultModel(BaseModel):
    allowedActions: List[str] = Field(default_factory=list)
    forbiddenActions: List[str] = Field(default_factory=list)
    violations: List[ScopeViolationModel] = Field(default_factory=list)


class DetectionModel(BaseModel):
    detectorConfig: DetectorConfigModel = Field(default_factory=DetectorConfigModel)
    pelt: PeltResultModel = Field(default_factory=PeltResultModel)
    fallback: FallbackResultModel = Field(default_factory=FallbackResultModel)
    scope: ScopeResultModel = Field(default_factory=ScopeResultModel)


class AuditResultModel(BaseModel):
    isDeviated: bool
    deviationType: Optional[str] = None
    flaggedStepIds: List[str] = Field(default_factory=list)
    confidence: float = 0.0
    explanation: str = ""


class TraceModel(BaseModel):
    dataNote: str = Field(
        default="REAL ML DETECTOR OUTPUT — Computed via SentenceTransformer MiniLM embeddings & PELT changepoint detection.",
        alias="_dataNote"
    )
    traceId: str
    label: str
    groundTruth: GroundTruthModel
    prompt: str
    steps: List[StepModel]
    detection: DetectionModel
    audit: AuditResultModel

    model_config = {"populate_by_name": True}


class TraceListItem(BaseModel):
    traceId: str
    label: str
    stepCount: int = 0
    groundTruth: Optional[GroundTruthModel] = None


class HealthResponse(BaseModel):
    status: str
    version: str = "1.0.0"
    ml_core_available: bool = True
    trace_count: int = 0
    cached_embeddings: bool = True


class DetectRequest(BaseModel):
    prompt: Optional[str] = None
    original_prompt: Optional[str] = None
    allowed_actions: Optional[List[str]] = None
    forbidden_actions: Optional[List[str]] = None
    allowed_verbs: Optional[List[str]] = None
    forbidden_verbs: Optional[List[str]] = None
    steps: Optional[List[Dict[str, Any]]] = None
