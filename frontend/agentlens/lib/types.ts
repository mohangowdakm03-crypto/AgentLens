// AgentLens — Authoritative Data Contracts (Aligned with FastAPI Backend & ML Core)

export type ActionType = "tool_call" | "thought" | "final_response" | "error" | (string & {});

export type FailureType =
  | "Scope Creep"
  | "Semantic Drift"
  | "Prompt Misinterpretation"
  | "Tool Misuse";

export type DeviationClassification = 'none' | 'drift' | 'scope_creep' | 'misinterpretation';

/** A single step in an agent's execution trace. */
export interface TraceStep {
  stepNumber: number;
  stepId?: string;
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
  flaggedStepId?: number | string | null;
  flaggedSteps?: (number | string)[];
  triggerPhrase?: string | null;
  explanation?: string | null;
  labelSource?: string;
  sampleSplit?: string | null;
  notes?: string;
}

/** Values supplied by the detector backend diagnostics. */
export interface DetectorAnalysis {
  similarity?: number | null;
  drift?: number | null;
  scope?: number | null;
  result?: string | null;
  model?: string | null;
  confidence?: number | null;
  similarityCurve?: { stepNumber: number; score: number; stepId?: string }[] | null;
  pelt?: BackendPeltResultModel | null;
  fallback?: BackendFallbackResultModel | null;
  scopeDetails?: BackendScopeResultModel | null;
}

/** A single word-level diff entry. */
export interface PromptDiff {
  old: string;
  new: string;
  reason: string;
}

/** The audit result returned by the backend adapter. */
export interface AuditResult {
  causalExplanation: string;
  triggerTokens: string[];
  correctedPrompt: string;
  diff: PromptDiff[];
  justification: string;
  detectorAnalysis?: DetectorAnalysis;
  backendAudit?: BackendAuditResultModel;
}

// ============================================================================
// Authoritative Backend Models (Direct 1:1 match with api/models.py)
// ============================================================================

/** Step model matching api.models.StepModel */
export interface BackendStepModel {
  stepId: string;
  action: string;
  reasoning: string;
  tool_input: string;
  tool_output: string;
  similarityScore: number;
}

/** Ground truth metadata matching api.models.GroundTruthModel */
export interface BackendGroundTruthModel {
  isDeviated: boolean;
  deviationType: string | null;
  flaggedSteps: (string | number)[];
  flaggedStepId: string | number | null;
  annotationExplanation: string;
  sampleSplit?: string | null;
  sample_split?: string | null;
  notes: string;
}

/** PELT changepoint diagnostics matching api.models.PeltResultModel */
export interface BackendPeltResultModel {
  breakpointIndex: number | null;
  breakpointStepId: string | null;
  similarityBefore: number | null;
  similarityAfter: number | null;
  difference: number | null;
  thresholdUsed: number;
}

/** Fallback single-step drop diagnostics matching api.models.FallbackResultModel */
export interface BackendFallbackResultModel {
  triggered: boolean;
  reason: string | null;
}

/** Individual scope violation matching api.models.ScopeViolationModel */
export interface BackendScopeViolationModel {
  stepId: string;
  action: string;
  reason: string;
}

/** Scope verification results matching api.models.ScopeResultModel */
export interface BackendScopeResultModel {
  allowedActions: string[];
  forbiddenActions: string[];
  violations: BackendScopeViolationModel[];
}

/** Detector hyperparameters matching api.models.DetectorConfigModel */
export interface BackendDetectorConfigModel {
  peltPenalty: number;
  minDrop: number;
  fallbackDrop: number;
}

/** Diagnostics envelope matching api.models.DetectionModel */
export interface BackendDetectionModel {
  detectorConfig: BackendDetectorConfigModel;
  pelt: BackendPeltResultModel;
  fallback: BackendFallbackResultModel;
  scope: BackendScopeResultModel;
}

/** Primary audit decision matching api.models.AuditResultModel */
export interface BackendAuditResultModel {
  isDeviated: boolean;
  deviationType: 'none' | 'drift' | 'scope_creep' | null;
  flaggedStepIds: string[];
  confidence: number;
  explanation: string;
}

/** Full trace response matching api.models.TraceModel */
export interface BackendTraceModel {
  _dataNote?: string;
  dataNote?: string;
  traceId: string;
  label: string;
  groundTruth: BackendGroundTruthModel;
  prompt: string;
  steps: BackendStepModel[];
  detection: BackendDetectionModel;
  audit: BackendAuditResultModel;
}

/** Catalog item matching api.models.TraceListItem */
export interface BackendTraceListItem {
  traceId: string;
  label: string;
  stepCount: number;
  groundTruth?: BackendGroundTruthModel | null;
}

/** Health check matching api.models.HealthResponse */
export interface BackendHealthResponse {
  status: string;
  version: string;
  ml_core_available: boolean;
  trace_count: number;
  cached_embeddings: boolean;
}

/** Custom detect payload matching api.models.DetectRequest */
export interface BackendDetectRequest {
  prompt?: string;
  original_prompt?: string;
  allowed_actions?: string[];
  forbidden_actions?: string[];
  allowed_verbs?: string[];
  forbidden_verbs?: string[];
  steps?: Array<{
    step_id?: string | number;
    stepId?: string | number;
    action_type?: string;
    action?: string;
    tool_called?: string | null;
    tool_input?: string;
    tool_output?: string;
    agent_reasoning?: string;
    reasoning?: string;
  }>;
}

// ============================================================================
// Authoritative Evaluation Report Contracts (Direct 1:1 match with api/evaluate.py)
// ============================================================================

export interface TraceLevelMetrics {
  positive_class_convention: string;
  total: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  exact_class_accuracy: number;
  macro_precision: number;
  macro_recall: number;
  macro_f1: number;
  weighted_precision: number;
  weighted_recall: number;
  weighted_f1: number;
  deviation_macro_precision: number;
  deviation_macro_recall: number;
  deviation_macro_f1: number;
}

export interface PerClassMetric {
  class: DeviationClassification;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  support: number;
  predicted_count: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface StepLevelMetrics {
  positive_class_convention: string;
  total_steps: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  f1: number;
  exact_flagged_set_match_rate: number;
  first_step_exact_match_count: number;
  deviated_trace_count: number;
  first_step_exact_match_rate: number;
}

export interface ConfusionMatrixReport {
  labels: ('none' | 'drift' | 'scope_creep' | 'misinterpretation')[];
  matrix: Record<string, Record<string, number>>;
  rows: number[][]; // 4x4 rows=actual, cols=predicted
  total: number;
}

export interface LimitationSubsetSummary {
  description: string;
  count: number;
  trace_ids: string[];
  ground_truth_distribution: Record<string, number>;
  predicted_distribution: Record<string, number>;
  exact_class_matches: number;
  binary_tp: number;
  binary_fp: number;
  binary_fn: number;
  binary_tn: number;
}

export interface PerTraceComparison {
  trace_id: string;
  step_count: number;
  ground_truth_is_deviated: boolean;
  ground_truth_type: string;
  ground_truth_flagged_step_ids: string[];
  ground_truth_flagged_step_id: string | null;
  predicted_is_deviated: boolean;
  predicted_type: string;
  predicted_flagged_step_ids: string[];
  predicted_first_flagged_step_id: string | null;
  confidence: number;
  binary_outcome: 'TP' | 'FP' | 'FN' | 'TN';
  exact_type_match: boolean;
  step_set_match: boolean;
  pelt_breakpoint_step_id: string | null;
  fallback_triggered: boolean;
  scope_violation_count: number;
}

export interface EvaluationReport {
  available: boolean;
  dataset_source: string;
  evaluation_split: string;
  dataset_count: number;
  evaluated_count: number;
  excluded_count: number;
  split_class_distribution: Record<string, number>;
  class_distribution_in_evaluated_split?: Record<string, number>;
  skipped_count: number;
  skipped_traces: Array<{ trace_id: string; reason: string }>;
  positive_class_convention: Record<string, string>;
  trace_level: TraceLevelMetrics;
  step_level: StepLevelMetrics;
  confusion_matrix: ConfusionMatrixReport;
  per_class: Record<DeviationClassification, PerClassMetric>;
  false_positives: PerTraceComparison[];
  false_negatives: PerTraceComparison[];
  type_mismatches: PerTraceComparison[];
  per_trace: PerTraceComparison[];
  known_limitations: {
    short_drift_traces_lt_3_steps: LimitationSubsetSummary;
    resource_scoped_permission_cases: LimitationSubsetSummary;
    misinterpretation_unsupported: LimitationSubsetSummary;
    action_vocabulary_mismatch_al_trace_033: LimitationSubsetSummary;
  };
}

// Legacy interfaces preserved for backward compatibility
export interface DetectorV1Step {
  step_id: number;
  action_type: string;
  tool_called?: string | null;
  tool_input?: string | null;
  tool_output?: string | null;
  agent_reasoning?: string | null;
}

export interface DetectorV1Result {
  step_id: number | null;
  type: string;
  confidence: number | null;
  similarity_curve: number[] | null;
  flagged_steps: number[] | null;
}

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

export interface AuditApiRequest {
  user_instruction: string;
  trace: string[];
  deviation_step: number;
  failure_type: FailureType;
}

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
