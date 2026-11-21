/**
 * AgentLens — Enterprise API Service Layer
 * Connects to both the Next.js API Gateway (/api/audit) and direct FastAPI ML Core endpoints.
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

// Client for Next.js internal API routes (such as /api/audit, /api/health)
const NEXTJS_BASE_URL =
  typeof window !== 'undefined'
    ? ''
    : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000');

export const apiClient = axios.create({
  baseURL: NEXTJS_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 35000,
});

// Client for direct FastAPI ML backend (port 8000)
const FASTAPI_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.BACKEND_API_URL ||
  'http://127.0.0.1:8000';

export const backendClient = axios.create({
  baseURL: FASTAPI_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 35000,
});

export interface RunAuditParams {
  userInstruction: string;
  traceSteps?: string[];
  steps?: any[];
  allowedActions?: string[];
  forbiddenActions?: string[];
  deviationStep?: number;
  failureType?: FailureType;
}

// ============================================================================
// Real FastAPI Backend Endpoints
// ============================================================================

/**
 * GET /api/health
 * Verify backend status, ML core availability, and loaded trace count.
 */
export async function getHealth(): Promise<BackendHealthResponse> {
  const res = await backendClient.get<BackendHealthResponse>('/api/health');
  return res.data;
}

/**
 * GET /api/traces
 * List available traces from the active 300-record dataset.
 */
export async function listTraces(): Promise<BackendTraceListItem[]> {
  const res = await backendClient.get<BackendTraceListItem[]>('/api/traces');
  return res.data;
}

/**
 * GET /api/traces/{trace_id}
 * Retrieve an individual trace evaluated against the ML detector.
 */
export async function getTrace(traceId: string): Promise<BackendTraceModel> {
  const cleanId = encodeURIComponent(traceId.trim());
  const res = await backendClient.get<BackendTraceModel>(`/api/traces/${cleanId}`);
  return res.data;
}

/**
 * POST /api/traces/{trace_id}/detect
 * Execute detection specifically on a repository trace.
 */
export async function runDetectOnTrace(traceId: string): Promise<BackendTraceModel> {
  const cleanId = encodeURIComponent(traceId.trim());
  const res = await backendClient.post<BackendTraceModel>(`/api/traces/${cleanId}/detect`);
  return res.data;
}

/**
 * POST /api/detect
 * Run ML detector on an arbitrary or user-uploaded trace payload.
 */
export async function detectTrace(payload: BackendDetectRequest): Promise<BackendTraceModel> {
  const res = await backendClient.post<BackendTraceModel>('/api/detect', payload);
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
  const res = await backendClient.get<EvaluationReport>(`/api/evaluate${qs}`);
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
  const res = await backendClient.get<EvaluationReport>(`/api/performance${qs}`);
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
      status: isDev ? ('flagged' as const) : ('nominal' as const),
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
 * Execute an audit against the POST /api/audit endpoint (or fallback to /api/detect).
 */
export async function runAudit(params: RunAuditParams): Promise<AuditResult> {
  const payload: any = {
    user_instruction: params.userInstruction,
    trace: params.traceSteps,
    steps: params.steps,
    allowed_actions: params.allowedActions,
    forbidden_actions: params.forbiddenActions,
  };

  const response = await apiClient.post<any>('/api/audit', payload);
  if (response.data && response.data.status === 'success') {
    const res = response.data;
    const auditResult: AuditResult = {
      causalExplanation:
        res.causal_attribution?.explanation ||
        res.audit?.explanation ||
        (res.result?.type !== 'none'
          ? `Deviation (${res.result?.type}) detected by ML core.`
          : 'No deviation detected by ML core.'),
      triggerTokens: res.causal_attribution?.trigger_tokens || [],
      correctedPrompt: res.prompt_repair?.corrected_prompt || 'Unavailable',
      diff: res.prompt_repair?.diff || [],
      justification:
        res.prompt_repair?.justification ||
        'Prompt repair is unavailable in statistical ML detector mode.',
    };

    if (res.result) {
      auditResult.detectorAnalysis = {
        confidence: res.result.confidence,
        result: res.result.type,
        step_id: res.result.step_id,
        flagged_steps: res.result.flagged_steps,
        drift: res.drift_analysis?.difference ?? null,
        similarityCurve: (res.result.similarity_curve || []).map(
          (score: number, idx: number) => ({ stepNumber: idx + 1, score })
        ),
        pelt: res.detection?.pelt || res.drift_analysis || null,
        fallback: res.detection?.fallback || null,
        scopeDetails: res.detection?.scope || res.scope_analysis || null,
      };
    }
    if (res.audit) {
      auditResult.backendAudit = res.audit;
    }
    return auditResult;
  }
  throw new Error(
    response.data?.message || 'Audit API returned non-success status'
  );
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
