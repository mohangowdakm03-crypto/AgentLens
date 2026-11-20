/**
 * AgentLens — Trace Parser Module (Phase 1)
 *
 * Ingests heterogeneous agent execution logs and converts them into a
 * strictly typed, normalized AgentTrace object.
 *
 * Supported formats:
 *   1. Structured JSON list of step strings (Section 5 request format)
 *   2. Structured JSON list of TraceStep objects
 *   3. ReAct text logs (Thought: / Action: / Action Input: / Observation:)
 */

import type { TraceStep, AgentTrace, ActionType, FailureType, GroundTruth } from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a simple session ID. */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Infer the ActionType from a raw step string. */
function inferActionType(raw: string): ActionType {
  const lower = raw.toLowerCase();
  if (lower.includes("error") || lower.includes("fail")) return "error";
  if (lower.includes("thought:")) return "thought";
  if (lower.includes("final answer") || lower.includes("final_response"))
    return "final_response";
  return "tool_call";
}

/** Extract tool name from common patterns like "read_file(main.py)" or "Action: read_file". */
function extractToolName(raw: string): string | undefined {
  // Pattern: tool_name(args)
  const fnMatch = raw.match(/(\w+)\s*\(/);
  if (fnMatch) return fnMatch[1];

  // Pattern: Action: tool_name
  const actionMatch = raw.match(/Action:\s*(\w+)/i);
  if (actionMatch) return actionMatch[1];

  return undefined;
}

/** Extract tool input from patterns like "tool(input)" or "Action Input: ..." */
function extractToolInput(raw: string): string | undefined {
  const parenMatch = raw.match(/\w+\s*\(([^)]*)\)/);
  if (parenMatch) return parenMatch[1];

  const inputMatch = raw.match(/Action Input:\s*(.+)/i);
  if (inputMatch) return inputMatch[1].trim();

  return undefined;
}

/** Extract observation from "-> result" or "Observation: result" patterns. */
function extractObservation(raw: string): string | undefined {
  const arrowMatch = raw.match(/->\s*(.+)/);
  if (arrowMatch) return arrowMatch[1].trim();

  const obsMatch = raw.match(/Observation:\s*(.+)/i);
  if (obsMatch) return obsMatch[1].trim();

  return undefined;
}

// ─── Format 1: Structured JSON string list ────────────────────────────────────
// Each string looks like: "Step N: tool_name(args) -> observation"

function parseStringStep(raw: string, index: number): TraceStep {
  // Remove "Step N:" prefix if present
  const explicitStepNumber = raw.match(/^Step\s*(\d+)\s*:/i);
  const cleaned = raw.replace(/^Step\s*\d+:\s*/i, "").trim();

  return {
    stepNumber: explicitStepNumber ? Number(explicitStepNumber[1]) : index + 1,
    actionType: inferActionType(cleaned),
    toolName: extractToolName(cleaned),
    toolInput: extractToolInput(cleaned),
    observation: extractObservation(raw),
    rawText: raw,
    isDeviation: false, // will be set later
  };
}

export function parseJsonStringList(
  steps: string[],
  userInstruction: string,
  deviationStep?: number,
  failureType?: FailureType
): AgentTrace {
  const parsedSteps: TraceStep[] = steps.map((s, i) => parseStringStep(s, i));

  // Flag the deviation step
  if (deviationStep !== undefined) {
    const devIdx = parsedSteps.findIndex((s) => s.stepNumber === deviationStep);
    if (devIdx !== -1) {
      parsedSteps[devIdx].isDeviation = true;
    }
  }

  return {
    sessionId: generateSessionId(),
    userInstruction,
    steps: parsedSteps,
    detectedDeviationStep: deviationStep,
    failureType,
  };
}

// ─── Format 2: Structured JSON TraceStep objects ──────────────────────────────

interface RawTraceStepJson {
  step_id?: number;
  step_number?: number;
  stepNumber?: number;
  action_type?: string;
  actionType?: string;
  tool_name?: string;
  toolName?: string;
  tool_called?: string;
  tool_input?: string;
  toolInput?: string;
  observation?: string;
  tool_output?: string;
  agent_reasoning?: string;
  raw_text?: string;
  rawText?: string;
  is_deviation?: boolean;
  isDeviation?: boolean;
  status?: string;
  execution_status?: string;
}

function normalizeStepObject(obj: RawTraceStepJson, index: number): TraceStep {
  const rawText =
    obj.raw_text || obj.rawText || JSON.stringify(obj);

  return {
    stepNumber: obj.step_number ?? obj.stepNumber ?? obj.step_id ?? index + 1,
    actionType: (obj.action_type ?? obj.actionType ?? inferActionType(rawText)) as ActionType,
    toolName: obj.tool_name ?? obj.toolName ?? obj.tool_called,
    toolInput: obj.tool_input ?? obj.toolInput,
    agentReasoning: obj.agent_reasoning,
    observation: obj.observation ?? obj.tool_output,
    rawText,
    isDeviation: obj.is_deviation ?? obj.isDeviation ?? false,
    status: obj.status ?? obj.execution_status ?? null,
  };
}

export function parseJsonObjectList(
  steps: RawTraceStepJson[],
  userInstruction: string,
  deviationStep?: number,
  failureType?: FailureType
): AgentTrace {
  const parsedSteps = steps.map((s, i) => normalizeStepObject(s, i));

  if (deviationStep !== undefined) {
    const devIdx = parsedSteps.findIndex((s) => s.stepNumber === deviationStep);
    if (devIdx !== -1) {
      parsedSteps[devIdx].isDeviation = true;
    }
  }

  return {
    sessionId: generateSessionId(),
    userInstruction,
    steps: parsedSteps,
    detectedDeviationStep: deviationStep,
    failureType,
  };
}

// ─── Format 3: ReAct text log ─────────────────────────────────────────────────
// Standard markers: Thought:, Action:, Action Input:, Observation:

interface ReActBlock {
  thought?: string;
  action?: string;
  actionInput?: string;
  observation?: string;
  rawLines: string[];
}

function parseReActBlocks(text: string): ReActBlock[] {
  const lines = text.split("\n");
  const blocks: ReActBlock[] = [];
  let current: ReActBlock | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("Thought:")) {
      // Start a new block on each Thought
      if (current) blocks.push(current);
      current = { rawLines: [trimmed] };
      current.thought = trimmed.replace(/^Thought:\s*/i, "").trim();
    } else if (trimmed.startsWith("Action:") && current) {
      current.action = trimmed.replace(/^Action:\s*/i, "").trim();
      current.rawLines.push(trimmed);
    } else if (trimmed.startsWith("Action Input:") && current) {
      current.actionInput = trimmed.replace(/^Action Input:\s*/i, "").trim();
      current.rawLines.push(trimmed);
    } else if (trimmed.startsWith("Observation:") && current) {
      current.observation = trimmed.replace(/^Observation:\s*/i, "").trim();
      current.rawLines.push(trimmed);
    } else if (trimmed.startsWith("Final Answer:")) {
      if (current) blocks.push(current);
      current = {
        rawLines: [trimmed],
        thought: trimmed.replace(/^Final Answer:\s*/i, "").trim(),
      };
    } else if (current) {
      // Continuation line — append to current block
      current.rawLines.push(trimmed);
    }
  }
  if (current) blocks.push(current);

  return blocks;
}

function reactBlockToStep(block: ReActBlock, index: number): TraceStep {
  const rawText = block.rawLines.join("\n");

  let actionType: ActionType = "thought";
  if (block.action) actionType = "tool_call";
  if (rawText.toLowerCase().includes("final answer")) actionType = "final_response";
  if (rawText.toLowerCase().includes("error")) actionType = "error";

  return {
    stepNumber: index + 1,
    actionType,
    toolName: block.action,
    toolInput: block.actionInput,
    agentReasoning: block.thought,
    observation: block.observation,
    rawText,
    isDeviation: false,
  };
}

export function parseReActLog(
  text: string,
  userInstruction: string,
  deviationStep?: number,
  failureType?: FailureType
): AgentTrace {
  const blocks = parseReActBlocks(text);
  const steps = blocks.map((b, i) => reactBlockToStep(b, i));

  if (deviationStep !== undefined) {
    const devIdx = steps.findIndex((s) => s.stepNumber === deviationStep);
    if (devIdx !== -1) {
      steps[devIdx].isDeviation = true;
    }
  }

  return {
    sessionId: generateSessionId(),
    userInstruction,
    steps,
    detectedDeviationStep: deviationStep,
    failureType,
  };
}

// ─── Unified Auto-Detect Parser ───────────────────────────────────────────────

/**
 * Auto-detect the format and parse accordingly.
 *
 * @param input — Either a JSON string, an array of strings, an array of objects,
 *                or a plain-text ReAct log.
 */
export function parseTrace(
  input: string | string[] | Record<string, unknown>[],
  userInstruction: string,
  deviationStep?: number,
  failureType?: FailureType
): AgentTrace {
  // If it's already an array
  if (Array.isArray(input)) {
    if (input.length === 0) {
      return {
        sessionId: generateSessionId(),
        userInstruction,
        steps: [],
        detectedDeviationStep: deviationStep,
        failureType,
      };
    }

    // Array of strings → Format 1
    if (typeof input[0] === "string") {
      return parseJsonStringList(
        input as string[],
        userInstruction,
        deviationStep,
        failureType
      );
    }

    // Array of objects → Format 2
    return parseJsonObjectList(
      input as RawTraceStepJson[],
      userInstruction,
      deviationStep,
      failureType
    );
  }

  // If it's a string, try to parse as JSON first
  if (typeof input === "string") {
    const trimmed = input.trim();

    // JSONL may contain either one trace per line or individual step objects.
    if (trimmed.includes("\n")) {
      const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (lines.length && lines.every((line) => line.startsWith("{") || line.startsWith("["))) {
        let records: unknown[];
        try {
          records = lines.map((line) => JSON.parse(line));
        } catch {
          records = [];
        }
        if (records.length) {
          if (records.length === 1) return parseTrace(JSON.stringify(records[0]), userInstruction, deviationStep, failureType);
          if (records.every((record) => record && typeof record === "object" && !Array.isArray(record) && ("step_id" in record || "step_number" in record || "stepNumber" in record))) {
            return parseTrace(records as Record<string, unknown>[], userInstruction, deviationStep, failureType);
          }
          if (records.every((record) => record && typeof record === "object" && ("steps" in record || "trace" in record))) {
            throw new Error("This JSONL contains multiple trace records. Upload one trace per file so no records are skipped.");
          }
        }
      }
    }

    // Try JSON parse
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);

        // If the parsed result is an array, recurse
        if (Array.isArray(parsed)) {
          return parseTrace(parsed, userInstruction, deviationStep, failureType);
        }

        // Dataset and backend envelopes carry trace metadata alongside steps.
        if (parsed.trace || parsed.steps) {
          const parsedTrace = parseTrace(
            parsed.trace ?? parsed.steps,
            parsed.user_instruction ?? parsed.original_prompt ?? parsed.userInstruction ?? userInstruction,
            parsed.deviation_step ?? parsed.deviationStep ?? deviationStep,
            parsed.failure_type ?? parsed.failureType ?? failureType
          );
          parsedTrace.traceInfo = {
            traceId: parsed.trace_id ?? parsed.session_id,
            allowedActions: parsed.intent?.allowed_verbs ?? parsed.intent?.allowed_actions,
            forbiddenActions: parsed.intent?.forbidden_verbs ?? parsed.intent?.forbidden_actions,
          };
          if (parsed.ground_truth && typeof parsed.ground_truth === "object") {
            const truth = parsed.ground_truth;
            parsedTrace.groundTruth = {
              deviationDetected: truth.deviation_detected,
              deviationType: truth.deviation_type,
              flaggedStepId: truth.flagged_step_id,
              triggerPhrase: truth.trigger_phrase,
              explanation: truth.explanation,
              labelSource: truth.label_source,
            } satisfies GroundTruth;
          }
          return parsedTrace;
        }
      } catch {
        // Not JSON, fall through to ReAct
      }
    }

    // Fallback: ReAct text log
    return parseReActLog(trimmed, userInstruction, deviationStep, failureType);
  }

  throw new Error(`Unsupported trace input type: ${typeof input}`);
}
