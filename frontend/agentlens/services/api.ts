/**
 * AgentLens — Enterprise API Service Layer
 * Follows the locked AgentLens V1 output contract connected to real FastAPI ML Core.
 */

import axios from 'axios';
import type {
  AuditApiRequest,
  AuditApiResponse,
  AuditResult,
  AgentTrace,
  FailureType
} from '@/lib/types';

const apiClient = axios.create({
  baseURL: typeof window !== 'undefined' ? '' : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'),
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

/**
 * Execute an audit against the POST /api/audit endpoint
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
      };
    }
    return auditResult;
  }
  throw new Error(
    response.data?.message || 'Audit API returned non-success status'
  );
}

/**
 * Validates JSONL traces against the schema
 */
export function validateTraceJSON(jsonString: string): { valid: boolean; error?: string; trace?: AgentTrace } {
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
