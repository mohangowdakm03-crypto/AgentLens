// AgentLens — Standardized Data Contracts (Section 2 of the spec)

export type ActionType = "tool_call" | "thought" | "final_response" | "error" | (string & {});

export type FailureType =
  | "Scope Creep"
  | "Semantic Drift"
  | "Prompt Misinterpretation"
  | "Tool Misuse";

/** A single step in an agent's execution trace. */
export interface TraceStep {
  stepNumber: number;
  actionType: ActionType;
  toolName?: string;
  toolInput?: string;
  agentReasoning?: string;
  observation?: string;
  similarityScore?: number | null;
  rawText: string;
  isDeviation: boolean;
  status?: string | null;
}

/** The full normalized agent trace. */
export interface AgentTrace {
  sessionId: string;
  userInstruction: string;
  steps: TraceStep[];
  detectedDeviationStep?: number;
  failureType?: FailureType;
  traceInfo?: {
    traceId?: string;
    allowedActions?: string[];
    forbiddenActions?: string[];
  };
  groundTruth?: GroundTruth;
}

/** Dataset/evaluation labels. Kept separate from model detector output. */
export interface GroundTruth {
  deviationDetected?: boolean;
  deviationType?: string;
  flaggedStepId?: number | null;
  triggerPhrase?: string | null;
  explanation?: string | null;
  labelSource?: string;
}

/** Values supplied by the detector backend. Missing values remain unavailable. */
export interface DetectorAnalysis {
  similarity?: number | null;
  drift?: number | null;
  scope?: number | null;
  result?: string | null;
  model?: string | null;
  confidence?: number | null;
  step_id?: number | null;
  flagged_steps?: number[] | null;
  similarityCurve?: { stepNumber: number; score: number }[] | null;
}

/** A single word-level diff entry. */
export interface PromptDiff {
  old: string;
  new: string;
  reason: string;
}

/** The audit result returned by the backend. */
export interface AuditResult {
  causalExplanation: string;
  triggerTokens: string[];
  correctedPrompt: string;
  diff: PromptDiff[];
  justification: string;
  detectorAnalysis?: DetectorAnalysis;
}

/** Raw API response shape from POST /api/audit (Section 5). */
export interface AuditApiResponse {
  status: "success" | "error";
  causal_attribution: {
    explanation: string;
    trigger_tokens: string[];
  };
  prompt_repair: {
    corrected_prompt: string;
    diff: { old: string; new: string; reason: string }[];
    justification: string;
  };
}

/** Step fields from the detector's Python Step dataclass. */
export interface DetectorV1Step {
  step_id: number;
  action_type: string;
  tool_called?: string | null;
  tool_input?: string | null;
  tool_output?: string | null;
  agent_reasoning?: string | null;
}

/** Detector's primary Deviation result, serialized using its dataclass field names. */
export interface DetectorV1Result {
  step_id: number | null;
  type: string;
  confidence: number | null;
  similarity_curve: number[] | null;
  flagged_steps: number[] | null;
}

/** V1 detector response envelope. Analysis sub-objects remain opaque until their schema is supplied. */
export interface DetectorV1Response {
  trace_id: string;
  original_prompt: string;
  steps: DetectorV1Step[];
  intent: unknown;
  similarity_analysis: unknown;
  drift_analysis: unknown;
  scope_analysis: unknown;
  result: DetectorV1Result;
  ground_truth: unknown;
}

/** API request shape for POST /api/audit (Section 5). */
export interface AuditApiRequest {
  user_instruction: string;
  trace: string[];
  deviation_step: number;
  failure_type: FailureType;
}
