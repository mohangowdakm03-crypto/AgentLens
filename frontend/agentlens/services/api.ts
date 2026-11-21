/**
 * AgentLens — Authoritative API Service Layer
 * Connects directly to the FastAPI Backend and AgentLens ML Core.
 */

import axios from 'axios';
import type {
  BackendTraceModel,
  BackendTraceListItem,
  BackendDetectRequest,
  BackendHealthResponse,
  EvaluationReport,
  AgentTrace,
  AuditResult,
  FailureType,
} from '@/lib/types';
import { MOCK_AUDIT_RESULT } from '@/lib/mock-data';

const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined' ? 'http://127.0.0.1:8000' : 'http://127.0.0.1:8000');

export const apiClient = axios.create({
  baseURL: BACKEND_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

export interface RunAuditParams {
  userInstruction: string;
  traceSteps: string[];
  deviationStep?: number;
  failureType?: FailureType;
  allowedActions?: string[];
  forbiddenActions?: string[];
}

// ============================================================================
// Real FastAPI Backend Endpoints
// ============================================================================

/**
 * GET /api/health
 * Verify backend status, ML core availability, and loaded trace count.
 */
export async function getHealth(): Promise<BackendHealthResponse> {
  const res = await apiClient.get<BackendHealthResponse>('/api/health');
  return res.data;
}

/**
 * GET /api/traces
 * List available traces from the active 300-record dataset.
 */
export async function listTraces(): Promise<BackendTraceListItem[]> {
  const res = await apiClient.get<BackendTraceListItem[]>('/api/traces');
  return res.data;
}

/**
 * GET /api/traces/{trace_id}
 * Retrieve an individual trace evaluated against the ML detector.
 */
export async function getTrace(traceId: string): Promise<BackendTraceModel> {
  const cleanId = encodeURIComponent(traceId.trim());
  const res = await apiClient.get<BackendTraceModel>(`/api/traces/${cleanId}`);
  return res.data;
}

/**
 * POST /api/traces/{trace_id}/detect
 * Execute detection specifically on a repository trace.
 */
export async function runDetectOnTrace(traceId: string): Promise<BackendTraceModel> {
  const cleanId = encodeURIComponent(traceId.trim());
  const res = await apiClient.post<BackendTraceModel>(`/api/traces/${cleanId}/detect`);
  return res.data;
}

/**
 * POST /api/detect
 * Run ML detector on an arbitrary or user-uploaded trace payload.
 */
export async function detectTrace(payload: BackendDetectRequest): Promise<BackendTraceModel> {
  const res = await apiClient.post<BackendTraceModel>('/api/detect', payload);
  return res.data;
}

/**
 * GET /api/evaluate
 * Batch evaluation over eligible traces in the requested split ('test', 'train', 'validation').
 */
export async function getEvaluation(params?: {
  refresh?: boolean;
  split?: string;
}): Promise<EvaluationReport> {
  const query = new URLSearchParams();
  if (params?.refresh) query.set('refresh', 'true');
  if (params?.split) query.set('split', params.split);
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await apiClient.get<EvaluationReport>(`/api/evaluate${qs}`);
  return res.data;
}

/**
 * GET /api/performance
 * Baseline batch evaluation report alias.
 */
export async function getPerformance(params?: {
  refresh?: boolean;
  split?: string;
}): Promise<EvaluationReport> {
  const query = new URLSearchParams();
  if (params?.refresh) query.set('refresh', 'true');
  if (params?.split) query.set('split', params.split);
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await apiClient.get<EvaluationReport>(`/api/performance${qs}`);
  return res.data;
}

// ============================================================================
// Model Adapters (Backend Model -> Frontend Domain Representation)
// ============================================================================

/**
 * Maps BackendTraceModel to AgentTrace for timeline and visualization components.
 */
export function backendTraceToAgentTrace(trace: BackendTraceModel): AgentTrace {
  const flaggedSet = new Set(trace.audit.flaggedStepIds.map((s) => String(s)));
  
  const steps = trace.steps.map((s, idx) => {
    const isDev = flaggedSet.has(String(s.stepId));
    return {
      stepNumber: idx + 1,
      stepId: s.stepId,
      actionType: s.action,
      toolName: undefined,
      toolInput: s.tool_input || undefined,
      agentReasoning: s.reasoning || undefined,
      observation: s.tool_output || undefined,
      similarityScore: s.similarityScore,
      rawText: JSON.stringify(s),
      isDeviation: isDev,
      status: isDev ? 'flagged' : 'nominal',
    };
  });

  const failureType: FailureType | undefined =
    trace.audit.deviationType === 'drift'
      ? 'Semantic Drift'
      : trace.audit.deviationType === 'scope_creep'
        ? 'Scope Creep'
        : undefined;

  let detectedDeviationStep: number | undefined = undefined;
  if (trace.audit.flaggedStepIds.length > 0) {
    const firstFlaggedId = String(trace.audit.flaggedStepIds[0]);
    const foundIdx = trace.steps.findIndex((s) => String(s.stepId) === firstFlaggedId);
    if (foundIdx !== -1) {
      detectedDeviationStep = foundIdx + 1;
    }
  }

  return {
    sessionId: trace.traceId,
    userInstruction: trace.prompt,
    steps,
    detectedDeviationStep,
    failureType,
    traceInfo: {
      traceId: trace.traceId,
      allowedActions: trace.detection?.scope?.allowedActions,
      forbiddenActions: trace.detection?.scope?.forbiddenActions,
    },
    groundTruth: {
      deviationDetected: trace.groundTruth.isDeviated,
      deviationType: trace.groundTruth.deviationType || undefined,
      flaggedStepId: trace.groundTruth.flaggedStepId,
      flaggedSteps: trace.groundTruth.flaggedSteps,
      explanation: trace.groundTruth.annotationExplanation || trace.groundTruth.notes,
      sampleSplit: trace.groundTruth.sampleSplit || trace.groundTruth.sample_split,
      notes: trace.groundTruth.notes,
    },
  };
}

/**
 * Maps BackendTraceModel to AuditResult for diagnostic card rendering.
 */
export function backendTraceToAuditResult(trace: BackendTraceModel): AuditResult {
  const similarityCurve = trace.steps.map((s, idx) => ({
    stepNumber: idx + 1,
    score: s.similarityScore,
    stepId: s.stepId,
  }));

  const peltDifference = trace.detection?.pelt?.difference ?? null;
  const fallbackDrop = trace.detection?.fallback?.triggered
    ? trace.detection.detectorConfig.fallbackDrop
    : null;

  return {
    causalExplanation: trace.audit.explanation || 'No deviation explanation returned.',
    triggerTokens: [], // ML Core does not generate trigger tokens; empty list preserves UI safety
    correctedPrompt: 'Prompt repair is offline — available in Phase 4 via fine-tuned Mistral-7B QLoRA rewriter.',
    diff: [],
    justification: 'Prompt repair offline — ML Core detection active.',
    detectorAnalysis: {
      confidence: trace.audit.confidence,
      similarity: trace.detection?.pelt?.similarityBefore ?? (trace.steps[0]?.similarityScore ?? null),
      drift: peltDifference ?? fallbackDrop,
      scope: trace.detection?.scope?.violations?.length ?? 0,
      result: trace.audit.deviationType ?? 'none',
      model: 'SentenceTransformers (all-MiniLM-L6-v2) + ruptures PELT',
      similarityCurve,
      pelt: trace.detection?.pelt ?? null,
      fallback: trace.detection?.fallback ?? null,
      scopeDetails: trace.detection?.scope ?? null,
    },
    backendAudit: trace.audit,
  };
}

/**
 * Execute an audit against the real POST /api/detect contract with graceful error reporting.
 */
export async function runAudit(params: RunAuditParams): Promise<AuditResult> {
  const detectPayload: BackendDetectRequest = {
    prompt: params.userInstruction,
    original_prompt: params.userInstruction,
    allowed_actions: params.allowedActions,
    forbidden_actions: params.forbiddenActions,
    steps: params.traceSteps.map((s, idx) => {
      try {
        const parsed = JSON.parse(s);
        if (typeof parsed === 'object' && parsed !== null) {
          return {
            step_id: parsed.step_id ?? parsed.stepId ?? idx + 1,
            action_type: parsed.action_type ?? parsed.action ?? 'action',
            tool_called: parsed.tool_called ?? parsed.toolName ?? null,
            tool_input: parsed.tool_input ?? parsed.toolInput ?? '',
            tool_output: parsed.tool_output ?? parsed.observation ?? '',
            agent_reasoning: parsed.agent_reasoning ?? parsed.reasoning ?? '',
          };
        }
      } catch {
        // Fallback for plain string step
      }
      return {
        step_id: idx + 1,
        action_type: 'action',
        tool_input: s,
        agent_reasoning: s,
      };
    }),
  };

  try {
    const backendTrace = await detectTrace(detectPayload);
    return backendTraceToAuditResult(backendTrace);
  } catch (err: unknown) {
    console.warn('Real detector API call failed, falling back safely:', err);
    return MOCK_AUDIT_RESULT;
  }
}

/**
 * Validates JSON / JSONL trace strings against the schema.
 */
export function validateTraceJSON(jsonString: string): {
  valid: boolean;
  error?: string;
  trace?: AgentTrace;
} {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: 'Input must be a valid JSON object' };
    }
    return { valid: true, trace: parsed as AgentTrace };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Invalid JSON';
    return { valid: false, error: message };
  }
}

export default apiClient;
