/**
 * AgentLens — API Route Proxy to FastAPI ML Detector
 * Proxies requests to http://127.0.0.1:8000/api/detect
 */

import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export async function GET() {
  try {
    const backendRes = await fetch(`${BACKEND_BASE}/api/health`);
    const data = await backendRes.json();
    return NextResponse.json({
      status: "ok",
      service: "AgentLens Audit API Gateway",
      backend: data,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { status: "unavailable", message: `FastAPI backend unavailable at ${BACKEND_BASE}: ${msg}` },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Map body into DetectRequest shape
    const prompt = body.prompt || body.user_instruction || body.original_prompt || "";
    if (!prompt) {
      return NextResponse.json(
        { status: "error", message: "Missing required prompt or user_instruction" },
        { status: 400 }
      );
    }

    let steps = body.steps;
    if (!steps && Array.isArray(body.trace)) {
      steps = body.trace.map((item: unknown, idx: number) => {
        if (typeof item === "string") {
          try {
            const parsed = JSON.parse(item);
            if (typeof parsed === "object" && parsed !== null) {
              return {
                step_id: parsed.step_id ?? parsed.stepId ?? idx + 1,
                action_type: parsed.action_type ?? parsed.action ?? "action",
                tool_called: parsed.tool_called ?? parsed.toolName ?? null,
                tool_input: parsed.tool_input ?? parsed.toolInput ?? "",
                tool_output: parsed.tool_output ?? parsed.observation ?? "",
                agent_reasoning: parsed.agent_reasoning ?? parsed.reasoning ?? "",
              };
            }
          } catch {
            // plain string step
          }
          return {
            step_id: idx + 1,
            action_type: "action",
            tool_input: item,
            agent_reasoning: item,
          };
        }
        return item;
      });
    }

    const detectPayload = {
      prompt,
      original_prompt: prompt,
      allowed_actions: body.allowed_actions ?? body.allowedActions,
      forbidden_actions: body.forbidden_actions ?? body.forbiddenActions,
      steps: steps || [],
    };

    const backendRes = await fetch(`${BACKEND_BASE}/api/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(detectPayload),
    });

    const data = await backendRes.json();
    if (!backendRes.ok) {
      return NextResponse.json(data, { status: backendRes.status });
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { status: "error", message: `Error reaching detector backend: ${msg}` },
      { status: 502 }
    );
  }
}
