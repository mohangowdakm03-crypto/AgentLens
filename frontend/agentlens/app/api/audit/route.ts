import { NextRequest, NextResponse } from "next/server";
import { parseTrace } from "@/lib/parser";
import type {
  DetectorV1Step,
  DetectorV1Result,
  DetectorV1Response,
} from "@/lib/types";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringifyValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return undefined;
  return JSON.stringify(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

const BACKEND_URL =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

function normalizeActionType(actionType?: string, toolName?: string): string {
  const act = (actionType || "").trim().toLowerCase();
  if (["search", "read", "write", "delete", "send", "execute"].includes(act)) {
    return act;
  }
  if (toolName) {
    const tool = toolName.trim().toLowerCase();
    if (tool.includes("read") || tool.startsWith("get") || tool.startsWith("fetch") || tool.startsWith("load")) return "read";
    if (tool.includes("search") || tool.includes("find") || tool.includes("query")) return "search";
    if (tool.includes("send") || tool.includes("email") || tool.includes("post") || tool.includes("dispatch")) return "send";
    if (tool.includes("delete") || tool.includes("remove") || tool.includes("drop")) return "delete";
    if (tool.includes("write") || tool.includes("save") || tool.includes("format") || tool.includes("create")) return "write";
    if (tool.includes("exec") || tool.includes("run") || tool.includes("eval")) return "execute";
    return tool;
  }
  return act || "tool_call";
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "AgentLens Audit API Gateway",
    endpoint: "/api/audit",
    backend_target: `${BACKEND_URL}/api/detect`,
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  let body: JsonRecord;
  try {
    const parsed = await request.json() as unknown;
    if (!isRecord(parsed)) {
      return NextResponse.json(
        { status: "error", message: "Request body must be a JSON object" },
        { status: 400 }
      );
    }
    body = parsed;
  } catch {
    return NextResponse.json(
      { status: "error", message: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  // 1. Validate required prompt / instruction
  const prompt = (
    asString(body.user_instruction) ||
    asString(body.prompt) ||
    asString(body.original_prompt) ||
    ""
  ).trim();

  if (!prompt) {
    return NextResponse.json(
      {
        status: "error",
        message:
          "Missing required prompt: 'user_instruction' or 'prompt' must be a non-empty string",
      },
      { status: 400 }
    );
  }

  // 2. Validate trace / execution steps
  // Prefer structured steps when available and non-empty; fallback to string trace
  let rawTrace: unknown;
  if (Array.isArray(body.steps) && body.steps.length > 0) {
    rawTrace = body.steps;
  } else if (
    Array.isArray(body.traceSteps) &&
    body.traceSteps.length > 0 &&
    typeof body.traceSteps[0] === "object" &&
    body.traceSteps[0] !== null
  ) {
    rawTrace = body.traceSteps;
  } else {
    rawTrace = body.trace ?? body.traceSteps ?? body.steps;
  }

  if (!rawTrace || (Array.isArray(rawTrace) && rawTrace.length === 0)) {
    return NextResponse.json(
      {
        status: "error",
        message:
          "Missing required execution trace: 'trace' or 'steps' must contain at least one step",
      },
      { status: 400 }
    );
  }

  // 3. Normalize steps into backend format
  let backendSteps: Array<{
    step_id: number;
    action_type: string;
    tool_called?: string;
    tool_input?: string;
    tool_output?: string;
    agent_reasoning?: string;
  }> = [];

  if (Array.isArray(rawTrace) && rawTrace.length > 0) {
    if (rawTrace.every(isRecord)) {
      backendSteps = rawTrace.map((s, idx) => {
        const rawId = s.step_id ?? s.stepNumber ?? s.stepId ?? idx + 1;
        const stepIdNum =
          typeof rawId === "number" ? rawId : parseInt(String(rawId), 10);
        const action = asString(s.action_type) || asString(s.actionType) || asString(s.action);
        const tool = asString(s.tool_called) || asString(s.toolName) || asString(s.tool_name);
        return {
          step_id: Number.isFinite(stepIdNum) ? stepIdNum : idx + 1,
          action_type: normalizeActionType(action, tool),
          tool_called: tool || undefined,
          tool_input: stringifyValue(s.tool_input ?? s.toolInput),
          tool_output: stringifyValue(s.tool_output ?? s.toolOutput ?? s.observation),
          agent_reasoning:
            asString(s.agent_reasoning) || asString(s.agentReasoning) || asString(s.reasoning),
        };
      });
    } else {
      try {
        const parsed = parseTrace(rawTrace, prompt);
        backendSteps = parsed.steps.map((s, idx) => ({
          step_id: s.stepNumber || idx + 1,
          action_type: normalizeActionType(s.actionType, s.toolName),
          tool_called: s.toolName || undefined,
          tool_input: s.toolInput || undefined,
          tool_output: s.observation || undefined,
          agent_reasoning: s.agentReasoning || undefined,
        }));
      } catch (parseErr: unknown) {
        return NextResponse.json(
          {
            status: "error",
            message: `Failed to parse execution trace: ${errorMessage(parseErr)}`,
          },
          { status: 400 }
        );
      }
    }
  } else if (typeof rawTrace === "string") {
    try {
      const parsed = parseTrace(rawTrace, prompt);
      backendSteps = parsed.steps.map((s, idx) => ({
        step_id: s.stepNumber || idx + 1,
        action_type: normalizeActionType(s.actionType, s.toolName),
        tool_called: s.toolName || undefined,
        tool_input: s.toolInput || undefined,
        tool_output: s.observation || undefined,
        agent_reasoning: s.agentReasoning || undefined,
      }));
    } catch (parseErr: unknown) {
      return NextResponse.json(
        {
          status: "error",
          message: `Failed to parse execution trace: ${errorMessage(parseErr)}`,
        },
        { status: 400 }
      );
    }
  }

  if (backendSteps.length === 0) {
    return NextResponse.json(
      {
        status: "error",
        message: "Execution trace must contain at least one step",
      },
      { status: 400 }
    );
  }

  // 4. Extract permissions / intent constraints (ground truth strictly excluded)
  const intent = isRecord(body.intent) ? body.intent : {};
  const allowedActions: string[] = Array.isArray(body.allowed_actions)
    ? asStringArray(body.allowed_actions)
    : Array.isArray(body.allowedActions)
    ? asStringArray(body.allowedActions)
    : Array.isArray(intent.allowed_actions)
    ? asStringArray(intent.allowed_actions)
    : Array.isArray(intent.allowed_verbs)
    ? asStringArray(intent.allowed_verbs)
    : [];

  const forbiddenActions: string[] = Array.isArray(body.forbidden_actions)
    ? asStringArray(body.forbidden_actions)
    : Array.isArray(body.forbiddenActions)
    ? asStringArray(body.forbiddenActions)
    : Array.isArray(intent.forbidden_actions)
    ? asStringArray(intent.forbidden_actions)
    : Array.isArray(intent.forbidden_verbs)
    ? asStringArray(intent.forbidden_verbs)
    : [];

  // Ground-truth labels (deviation_step, failure_type, etc.) are strictly excluded
  const backendPayload = {
    prompt,
    allowed_actions: allowedActions,
    forbidden_actions: forbiddenActions,
    steps: backendSteps,
  };

  // 5. Invoke FastAPI /api/detect
  let backendRes: Response;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    backendRes = await fetch(`${BACKEND_URL}/api/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(backendPayload),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);
  } catch (fetchErr: unknown) {
    if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
      return NextResponse.json(
        {
          status: "error",
          message: "ML detector request timed out after 30 seconds",
        },
        { status: 504 }
      );
    }
    return NextResponse.json(
      {
        status: "error",
        message: `ML detector backend is unreachable at ${BACKEND_URL}. Ensure the FastAPI server is running.`,
      },
      { status: 503 }
    );
  }

  if (!backendRes.ok) {
    let errorDetail = "ML detector returned an error";
    try {
      const errJson = await backendRes.json();
      errorDetail =
        errJson.detail || errJson.message || JSON.stringify(errJson);
    } catch {
      errorDetail = await backendRes.text();
    }
    return NextResponse.json(
      { status: "error", message: `ML detector error: ${errorDetail}` },
      {
        status:
          backendRes.status >= 400 && backendRes.status < 600
            ? backendRes.status
            : 502,
      }
    );
  }

  let detectorOutput: JsonRecord;
  try {
    const parsed = await backendRes.json() as unknown;
    if (!isRecord(parsed)) throw new Error("Response is not a JSON object");
    detectorOutput = parsed;
  } catch {
    return NextResponse.json(
      {
        status: "error",
        message: "Invalid JSON response from ML detector backend",
      },
      { status: 502 }
    );
  }

  if (
    !detectorOutput ||
    typeof detectorOutput !== "object" ||
    !Array.isArray(detectorOutput.steps) ||
    !isRecord(detectorOutput.audit) ||
    detectorOutput.steps.some((step) => !isRecord(step))
  ) {
    return NextResponse.json(
      {
        status: "error",
        message: "Unexpected response structure received from ML detector backend",
      },
      { status: 502 }
    );
  }

  const detectorSteps = detectorOutput.steps.filter(isRecord);
  const detectorAudit = detectorOutput.audit as JsonRecord;
  const detectorDetection = isRecord(detectorOutput.detection) ? detectorOutput.detection : {};

  // 6. Map FastAPI TraceModel into frontend's expected structure
  const isDeviated = detectorAudit.isDeviated === true;
  const deviationType = isDeviated
    ? asString(detectorAudit.deviationType) || "none"
    : "none";
  const confidence =
    typeof detectorAudit.confidence === "number"
      ? detectorAudit.confidence
      : 0;

  const similarityCurve: number[] = detectorSteps.map((s) =>
    typeof s.similarityScore === "number" && Number.isFinite(s.similarityScore)
      ? s.similarityScore
      : 0
  );

  const flaggedStepIds: number[] = Array.isArray(detectorAudit.flaggedStepIds)
    ? detectorAudit.flaggedStepIds
        .map((id) => parseInt(String(id), 10))
        .filter((n: number) => Number.isFinite(n))
    : [];

  let primaryStepId: number | null = null;
  if (isDeviated) {
    const pelt = isRecord(detectorDetection.pelt) ? detectorDetection.pelt : {};
    const scope = isRecord(detectorDetection.scope) ? detectorDetection.scope : {};
    if (asString(pelt.breakpointStepId)) {
      const parsed = parseInt(asString(pelt.breakpointStepId) || "", 10);
      if (Number.isFinite(parsed)) primaryStepId = parsed;
    }
    if (
      primaryStepId === null &&
      Array.isArray(scope.violations) &&
      scope.violations.length > 0
    ) {
      const firstViolation = isRecord(scope.violations[0]) ? scope.violations[0] : {};
      const parsed = parseInt(asString(firstViolation.stepId) || "", 10);
      if (Number.isFinite(parsed)) primaryStepId = parsed;
    }
    if (primaryStepId === null && flaggedStepIds.length > 0) {
      primaryStepId = flaggedStepIds[0];
    }
  }

  const mappedSteps: DetectorV1Step[] = detectorSteps.map((s, idx) => {
      const parsedId = parseInt(asString(s.stepId) || "", 10);
      const originalStep = backendSteps[idx];
      return {
        step_id: Number.isFinite(parsedId) ? parsedId : idx + 1,
        action_type: asString(s.action) || originalStep?.action_type || "unknown",
        tool_called:
          originalStep?.tool_called || asString(s.tool_called) || asString(s.action) || null,
        tool_input: asString(s.tool_input) || originalStep?.tool_input || null,
        tool_output: asString(s.tool_output) || originalStep?.tool_output || null,
        agent_reasoning: asString(s.reasoning) || originalStep?.agent_reasoning || null,
      };
    });

  const v1Result: DetectorV1Result = {
    step_id: primaryStepId,
    type: deviationType,
    confidence,
    similarity_curve: similarityCurve,
    flagged_steps: flaggedStepIds,
  };

  const explanation =
    asString(detectorAudit.explanation) ||
    (isDeviated
      ? `Deviation (${deviationType}) detected by ML core.`
      : "No deviation detected by ML core.");

  const responsePayload: DetectorV1Response & {
    status: string;
    causal_attribution: { explanation: string; trigger_tokens: string[] };
    prompt_repair: {
      corrected_prompt: string;
      diff: Array<{ old: string; new: string; reason: string }>;
      justification: string;
    };
    detection?: unknown;
    audit?: unknown;
  } = {
    status: "success",
    trace_id: asString(detectorOutput.traceId) || `trace_${Date.now()}`,
    original_prompt: asString(detectorOutput.prompt) || prompt,
    steps: mappedSteps,
    intent: {
      allowed_actions:
      isRecord(detectorDetection.scope) && Array.isArray(detectorDetection.scope.allowedActions)
        ? asStringArray(detectorDetection.scope.allowedActions)
        : allowedActions,
      forbidden_actions:
        isRecord(detectorDetection.scope) && Array.isArray(detectorDetection.scope.forbiddenActions)
          ? asStringArray(detectorDetection.scope.forbiddenActions)
          : forbiddenActions,
    },
    similarity_analysis: {
      curve: similarityCurve,
      config: detectorDetection.detectorConfig || null,
    },
    drift_analysis: detectorDetection.pelt || detectorDetection.fallback || null,
    scope_analysis: detectorDetection.scope || null,
    detection: detectorOutput.detection || null,
    audit: detectorOutput.audit || null,
    result: v1Result,
    ground_truth: null, // Isolated from detector output

    // Statistical explanations preserved; generative features honestly marked unavailable
    causal_attribution: {
      explanation,
      trigger_tokens: [],
    },
    prompt_repair: {
      corrected_prompt: "Unavailable",
      diff: [],
      justification:
        "Prompt repair is not provided by the statistical ML detector.",
    },
  };

  return NextResponse.json(responsePayload);
}
