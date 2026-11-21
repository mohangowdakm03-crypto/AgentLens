import { NextRequest, NextResponse } from "next/server";
import { parseTrace } from "@/lib/parser";
import type {
  DetectorV1Step,
  DetectorV1Result,
  DetectorV1Response,
} from "@/lib/types";

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
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "error", message: "Invalid JSON in request body" },
      { status: 400 }
    );
  }

  // 1. Validate required prompt / instruction
  const prompt = (
    body.user_instruction ||
    body.prompt ||
    body.original_prompt ||
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
  let rawTrace: any;
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
    if (typeof rawTrace[0] === "object" && rawTrace[0] !== null) {
      backendSteps = rawTrace.map((s: any, idx: number) => {
        const rawId = s.step_id ?? s.stepNumber ?? s.stepId ?? idx + 1;
        const stepIdNum =
          typeof rawId === "number" ? rawId : parseInt(String(rawId), 10);
        const action = s.action_type || s.actionType || s.action;
        const tool = s.tool_called || s.toolName || s.tool_name;
        return {
          step_id: Number.isFinite(stepIdNum) ? stepIdNum : idx + 1,
          action_type: normalizeActionType(action, tool),
          tool_called: tool || undefined,
          tool_input:
            typeof s.tool_input === "object"
              ? JSON.stringify(s.tool_input)
              : s.tool_input ?? s.toolInput ?? undefined,
          tool_output:
            typeof s.tool_output === "object"
              ? JSON.stringify(s.tool_output)
              : s.tool_output ?? s.toolOutput ?? s.observation ?? undefined,
          agent_reasoning:
            s.agent_reasoning ?? s.agentReasoning ?? s.reasoning ?? undefined,
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
      } catch (parseErr: any) {
        return NextResponse.json(
          {
            status: "error",
            message: `Failed to parse execution trace: ${parseErr.message}`,
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
    } catch (parseErr: any) {
      return NextResponse.json(
        {
          status: "error",
          message: `Failed to parse execution trace: ${parseErr.message}`,
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
  const allowedActions: string[] = Array.isArray(body.allowed_actions)
    ? body.allowed_actions
    : Array.isArray(body.allowedActions)
    ? body.allowedActions
    : Array.isArray(body.intent?.allowed_actions)
    ? body.intent.allowed_actions
    : Array.isArray(body.intent?.allowed_verbs)
    ? body.intent.allowed_verbs
    : [];

  const forbiddenActions: string[] = Array.isArray(body.forbidden_actions)
    ? body.forbidden_actions
    : Array.isArray(body.forbiddenActions)
    ? body.forbiddenActions
    : Array.isArray(body.intent?.forbidden_actions)
    ? body.intent.forbidden_actions
    : Array.isArray(body.intent?.forbidden_verbs)
    ? body.intent.forbidden_verbs
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
  } catch (fetchErr: any) {
    if (fetchErr.name === "AbortError") {
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

  let detectorOutput: any;
  try {
    detectorOutput = await backendRes.json();
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
    !detectorOutput.audit
  ) {
    return NextResponse.json(
      {
        status: "error",
        message: "Unexpected response structure received from ML detector backend",
      },
      { status: 502 }
    );
  }

  // 6. Map FastAPI TraceModel into frontend's expected structure
  const isDeviated = Boolean(detectorOutput.audit?.isDeviated);
  const deviationType = isDeviated
    ? detectorOutput.audit?.deviationType || "none"
    : "none";
  const confidence =
    typeof detectorOutput.audit?.confidence === "number"
      ? detectorOutput.audit.confidence
      : 0;

  const similarityCurve: number[] = detectorOutput.steps.map((s: any) =>
    typeof s.similarityScore === "number" && Number.isFinite(s.similarityScore)
      ? s.similarityScore
      : 0
  );

  const flaggedStepIds: number[] = Array.isArray(
    detectorOutput.audit?.flaggedStepIds
  )
    ? detectorOutput.audit.flaggedStepIds
        .map((id: any) => parseInt(id, 10))
        .filter((n: number) => Number.isFinite(n))
    : [];

  let primaryStepId: number | null = null;
  if (isDeviated) {
    if (detectorOutput.detection?.pelt?.breakpointStepId) {
      const parsed = parseInt(detectorOutput.detection.pelt.breakpointStepId, 10);
      if (Number.isFinite(parsed)) primaryStepId = parsed;
    }
    if (
      primaryStepId === null &&
      detectorOutput.detection?.scope?.violations?.length > 0
    ) {
      const parsed = parseInt(
        detectorOutput.detection.scope.violations[0].stepId,
        10
      );
      if (Number.isFinite(parsed)) primaryStepId = parsed;
    }
    if (primaryStepId === null && flaggedStepIds.length > 0) {
      primaryStepId = flaggedStepIds[0];
    }
  }

  const mappedSteps: DetectorV1Step[] = detectorOutput.steps.map(
    (s: any, idx: number) => {
      const parsedId = parseInt(s.stepId, 10);
      const originalStep = backendSteps[idx];
      return {
        step_id: Number.isFinite(parsedId) ? parsedId : idx + 1,
        action_type: s.action || originalStep?.action_type || "unknown",
        tool_called:
          originalStep?.tool_called || s.tool_called || s.action || null,
        tool_input: s.tool_input || originalStep?.tool_input || null,
        tool_output: s.tool_output || originalStep?.tool_output || null,
        agent_reasoning: s.reasoning || originalStep?.agent_reasoning || null,
      };
    }
  );

  const v1Result: DetectorV1Result = {
    step_id: primaryStepId,
    type: deviationType,
    confidence,
    similarity_curve: similarityCurve,
    flagged_steps: flaggedStepIds,
  };

  const explanation =
    detectorOutput.audit?.explanation ||
    (isDeviated
      ? `Deviation (${deviationType}) detected by ML core.`
      : "No deviation detected by ML core.");

  const responsePayload: DetectorV1Response & {
    status: string;
    causal_attribution: { explanation: string; trigger_tokens: string[] };
    prompt_repair: {
      corrected_prompt: string;
      diff: any[];
      justification: string;
    };
  } = {
    status: "success",
    trace_id: detectorOutput.traceId || `trace_${Date.now()}`,
    original_prompt: detectorOutput.prompt || prompt,
    steps: mappedSteps,
    intent: {
      allowed_actions:
        detectorOutput.detection?.scope?.allowedActions || allowedActions,
      forbidden_actions:
        detectorOutput.detection?.scope?.forbiddenActions || forbiddenActions,
    },
    similarity_analysis: {
      curve: similarityCurve,
      config: detectorOutput.detection?.detectorConfig || null,
    },
    drift_analysis:
      detectorOutput.detection?.pelt ||
      detectorOutput.detection?.fallback ||
      null,
    scope_analysis: detectorOutput.detection?.scope || null,
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
