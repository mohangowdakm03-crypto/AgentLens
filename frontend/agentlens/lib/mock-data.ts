/**
 * AgentLens — Mock Data Provider (Section 5 of the spec)
 *
 * Contains the exact sample payload from the spec so the UI can be
 * tested and demonstrated immediately before the live model is connected.
 */

import type { AgentTrace, AuditResult, AuditApiResponse } from "./types";

// ─── Mock Trace (from Section 5 request body) ────────────────────────────────

export const MOCK_TRACE: AgentTrace = {
  sessionId: "demo_session_001",
  userInstruction: "Clean up my code",
  steps: [
    {
      stepNumber: 1,
      actionType: "tool_call",
      toolName: "read_file",
      toolInput: "main.py",
      observation: "file read successfully (240 lines)",
      rawText: "Step 1: read_file(main.py) -> file read successfully",
      isDeviation: false,
    },
    {
      stepNumber: 2,
      actionType: "tool_call",
      toolName: "format_code",
      toolInput: "main.py",
      observation: "applied PEP8 formatting",
      rawText: "Step 2: format_code(main.py) -> applied PEP8 formatting",
      isDeviation: false,
    },
    {
      stepNumber: 3,
      actionType: "tool_call",
      toolName: "delete_comments",
      toolInput: "main.py",
      observation: "removed all inline comments",
      rawText: "Step 3: delete_comments(main.py) -> removed all inline comments",
      isDeviation: true,
    },
    {
      stepNumber: 4,
      actionType: "tool_call",
      toolName: "remove_unused_imports",
      toolInput: "main.py",
      observation: "deleted 3 imports",
      rawText: "Step 4: remove_unused_imports(main.py) -> deleted 3 imports",
      isDeviation: false,
    },
  ],
  detectedDeviationStep: 3,
  failureType: "Scope Creep",
};

// ─── Mock Audit Result (from Section 5 response body) ────────────────────────

export const MOCK_AUDIT_RESULT: AuditResult = {
  causalExplanation:
    "The phrase 'clean up' in the instruction led the agent to interpret the task as a comprehensive cleaning process. This triggered the agent to take additional steps beyond the user's intent, including the removal of comments and unused imports.",
  triggerTokens: ["clean up"],
  correctedPrompt: "Format my code",
  diff: [
    {
      old: "Clean up",
      new: "Format",
      reason: "Replace with a more specific action to avoid ambiguity.",
    },
  ],
  justification:
    "The word 'format' clarifies the desired action, ensuring the agent focuses on formatting the code without unnecessary changes.",
};

// ─── Mock API Response (raw shape from the endpoint) ─────────────────────────

export const MOCK_API_RESPONSE: AuditApiResponse = {
  status: "success",
  causal_attribution: {
    explanation: MOCK_AUDIT_RESULT.causalExplanation,
    trigger_tokens: MOCK_AUDIT_RESULT.triggerTokens,
  },
  prompt_repair: {
    corrected_prompt: MOCK_AUDIT_RESULT.correctedPrompt,
    diff: MOCK_AUDIT_RESULT.diff,
    justification: MOCK_AUDIT_RESULT.justification,
  },
};

/** Transform the raw API response into the typed AuditResult. */
export function apiResponseToAuditResult(res: AuditApiResponse): AuditResult {
  return {
    causalExplanation: res.causal_attribution.explanation,
    triggerTokens: res.causal_attribution.trigger_tokens,
    correctedPrompt: res.prompt_repair.corrected_prompt,
    diff: res.prompt_repair.diff,
    justification: res.prompt_repair.justification,
  };
}
