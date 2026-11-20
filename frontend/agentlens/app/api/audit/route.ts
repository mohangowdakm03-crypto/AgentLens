/**
 * AgentLens — Mock Audit API Endpoint
 *
 * POST /api/audit
 *
 * Uses the exact sample payload from Section 5 of the spec.
 * Replace with real Mistral-7B QLoRA endpoint in Phase 4.
 */

import { NextRequest, NextResponse } from "next/server";
import { MOCK_API_RESPONSE } from "@/lib/mock-data";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "AgentLens Audit API",
    contract: "Detector Output Contract V1",
    model: "Mistral-7B QLoRA (Local Mock/Gateway)",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.user_instruction || !body.trace || !body.deviation_step) {
      return NextResponse.json(
        { status: "error", message: "Missing required fields: user_instruction, trace, deviation_step" },
        { status: 400 }
      );
    }

    // Simulate network latency (500-1200ms) for realistic UX
    await new Promise((resolve) =>
      setTimeout(resolve, 500 + Math.random() * 700)
    );

    // Return the mock response from the spec
    return NextResponse.json(MOCK_API_RESPONSE);
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: "Invalid request body" },
      { status: 400 }
    );
  }
}
