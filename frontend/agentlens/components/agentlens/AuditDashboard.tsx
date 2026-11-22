"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, Download, FileJson2, LoaderCircle, Trash2, Upload, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AgentTrace,
  AuditResult,
  BackendTraceModel,
  BackendDetectRequest,
} from "@/lib/types";
import { MOCK_TRACE, MOCK_AUDIT_RESULT } from "@/lib/mock-data";
import { parseTrace } from "@/lib/parser";
import {
  detectTrace,
  getTrace,
  backendTraceToAgentTrace,
  backendTraceToAuditResult,
} from "@/services/api";
import { InstructionViewer } from "./InstructionViewer";
import { TraceTimeline } from "./TraceTimeline";
import { CausalDiagnosisCard } from "./CausalDiagnosisCard";
import { PromptRepairStudio } from "./PromptRepairStudio";

const EMPTY_TRACE: AgentTrace = {
  sessionId: "",
  userInstruction: "",
  steps: [],
};

const SAMPLE_TRACES = [
  { id: "al_trace_001", label: "al_trace_001 (Nominal / Clean)" },
  { id: "al_trace_006", label: "al_trace_006 (Semantic Drift)" },
  { id: "al_trace_007", label: "al_trace_007 (Scope Creep)" },
];

export function AuditDashboard() {
  const [trace, setTrace] = useState<AgentTrace>(EMPTY_TRACE);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [backendResponse, setBackendResponse] = useState<BackendTraceModel | null>(null);
  const [isDemoResult, setIsDemoResult] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [fileProgress, setFileProgress] = useState<number | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number } | null>(null);
  const [rawInput, setRawInput] = useState("");
  const [userInstruction, setUserInstruction] = useState("");
  const [traceSearchQuery, setTraceSearchQuery] = useState("");
  const [selectedStep, setSelectedStep] = useState<number | undefined>();
  const [notice, setNotice] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null);
  const auditRequestId = useRef(0);
  const fileReadId = useRef(0);

  const invalidateAudit = useCallback(() => {
    auditRequestId.current += 1;
    setIsAuditing(false);
  }, []);

  const updateTrace = useCallback((input: string, sourceName?: string) => {
    if (!sourceName) {
      fileReadId.current += 1;
      setIsParsing(false);
    }
    if (!input.trim()) {
      setNotice({ type: "error", text: "Add a trace log or choose a file before parsing." });
      return;
    }
    try {
      const parsed = parseTrace(input, userInstruction);
      if (!parsed.steps.length) throw new Error("No execution steps were found in this log.");
      invalidateAudit();
      setTrace(parsed);
      setUserInstruction(parsed.userInstruction || userInstruction);
      setAuditResult(null);
      setBackendResponse(null);
      setIsDemoResult(false);
      setTraceSearchQuery("");
      setSelectedStep(undefined);
      const traceCountInfo = parsed.multiTraces && parsed.multiTraces.length > 1
        ? `Loaded trace 1 of ${parsed.multiTraces.length} from multi-record JSONL (${parsed.traceInfo?.traceId ? `ID: ${parsed.traceInfo.traceId}, ` : ""}${parsed.steps.length} steps). All record boundaries preserved.`
        : `Parsed ${parsed.steps.length} execution steps${sourceName ? ` from ${sourceName}` : ""}. Ground truth remains separate from detector output.`;
      setNotice({
        type: "success",
        text: traceCountInfo,
      });
    } catch (error) {
      invalidateAudit();
      setTrace({ ...EMPTY_TRACE, userInstruction });
      setAuditResult(null);
      setBackendResponse(null);
      setIsDemoResult(false);
      setTraceSearchQuery("");
      setSelectedStep(undefined);
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "This file could not be parsed as JSON, JSONL, or a ReAct log.",
      });
    }
  }, [invalidateAudit, userInstruction]);

  const readTraceFile = useCallback((file: File) => {
    const readId = ++fileReadId.current;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["json", "jsonl", "txt", "log", "md"].includes(extension)) {
      setIsParsing(false);
      setFileProgress(null);
      setNotice({ type: "error", text: "Unsupported file type. Choose a JSON, JSONL, TXT, LOG, or MD trace." });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setIsParsing(false);
      setFileProgress(null);
      setNotice({ type: "error", text: `${file.name} exceeds the 10 MB file size limit. Please choose a smaller trace file.` });
      return;
    }
    setUploadedFile({ name: file.name, size: file.size });
    invalidateAudit();
    setTrace({ ...EMPTY_TRACE, userInstruction });
    setAuditResult(null);
    setBackendResponse(null);
    setIsDemoResult(false);
    setIsParsing(true);
    setFileProgress(0);
    setNotice({ type: "info", text: `Reading ${file.name}…` });
    const reader = new FileReader();
    reader.onload = () => {
      if (readId !== fileReadId.current) return;
      const content = String(reader.result ?? "");
      setRawInput(content);
      setFileProgress(100);
      if (!content.trim()) {
        setNotice({ type: "error", text: `${file.name} is empty. Choose a trace file with at least one execution step.` });
      } else {
        updateTrace(content, file.name);
      }
      setIsParsing(false);
      setFileProgress(null);
    };
    reader.onprogress = (event) => {
      if (readId !== fileReadId.current || !event.lengthComputable) return;
      setFileProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    reader.onerror = () => {
      if (readId !== fileReadId.current) return;
      setNotice({ type: "error", text: `${file.name} could not be read. Try selecting the file again.` });
      setIsParsing(false);
      setFileProgress(null);
    };
    reader.onabort = () => {
      if (readId !== fileReadId.current) return;
      setNotice({ type: "error", text: `Reading ${file.name} was canceled.` });
      setIsParsing(false);
      setFileProgress(null);
    };
    reader.readAsText(file);
  }, [invalidateAudit, updateTrace, userInstruction]);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) readTraceFile(file);
    event.target.value = "";
  }, [readTraceFile]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDraggingFile(false);
    const file = event.dataTransfer.files?.[0];
    if (file) readTraceFile(file);
  }, [readTraceFile]);

  /**
   * Run real detector on current trace via POST /api/detect.
   */
  const handleRunAudit = useCallback(async () => {
    const requestId = ++auditRequestId.current;
    setIsAuditing(true);
    setAuditResult(null);
    setBackendResponse(null);
    setNotice(null);

    const payload: BackendDetectRequest = {
      prompt: trace.userInstruction,
      original_prompt: trace.userInstruction,
      allowed_actions: trace.traceInfo?.allowedActions,
      forbidden_actions: trace.traceInfo?.forbiddenActions,
      steps: trace.steps.map((step, idx) => ({
        step_id: step.stepId ?? idx + 1,
        action_type: step.actionType,
        tool_called: step.toolName ?? null,
        tool_input: step.toolInput ?? "",
        tool_output: step.observation ?? "",
        agent_reasoning: step.agentReasoning ?? "",
      })),
    };

    try {
      const response = await detectTrace(payload);
      if (requestId !== auditRequestId.current) return;

      setBackendResponse(response);
      const adaptedTrace = backendTraceToAgentTrace(response);
      const adaptedResult = backendTraceToAuditResult(response);
      setAuditResult(adaptedResult);
      setTrace((prev) => ({
        ...prev,
        ...adaptedTrace,
      }));
      setIsDemoResult(false);
      setNotice({
        type: "success",
        text: `FastAPI detector evaluated ${response.steps.length} steps: ${
          response.audit.isDeviated
            ? `Deviation detected (${response.audit.deviationType})`
            : "Nominal / On-task"
        }.`,
      });
    } catch (error: unknown) {
      if (requestId !== auditRequestId.current) return;
      setAuditResult(null);
      setBackendResponse(null);
      setIsDemoResult(false);
      const message = error instanceof Error ? error.message : "Could not reach FastAPI detector backend.";
      setNotice({
        type: "error",
        text: `Audit failed: ${message}. Ensure backend is running on http://127.0.0.1:8000.`,
      });
    } finally {
      if (requestId === auditRequestId.current) setIsAuditing(false);
    }
  }, [trace]);

  /**
   * Load an authentic trace from the active dataset via GET /api/traces/{trace_id}
   */
  const handleLoadRepositoryTrace = useCallback(async (traceId: string) => {
    fileReadId.current += 1;
    invalidateAudit();
    setIsParsing(false);
    setFileProgress(null);
    setNotice({ type: "info", text: `Fetching trace ${traceId} from backend repository…` });

    try {
      const loaded = await getTrace(traceId);
      setBackendResponse(loaded);
      const adaptedTrace = backendTraceToAgentTrace(loaded);
      const adaptedAudit = backendTraceToAuditResult(loaded);
      setTrace(adaptedTrace);
      setUserInstruction(loaded.prompt);
      setAuditResult(adaptedAudit);
      setIsDemoResult(false);
      setRawInput("");
      setUploadedFile(null);
      setTraceSearchQuery("");
      setSelectedStep(undefined);
      setNotice({
        type: "success",
        text: `Loaded ${traceId} from repository (${loaded.steps.length} steps). Evaluated with SentenceTransformers + PELT.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setNotice({ type: "error", text: `Failed to load trace ${traceId}: ${msg}` });
    }
  }, [invalidateAudit]);

  const handleLoadDemo = useCallback(() => {
    fileReadId.current += 1;
    invalidateAudit();
    setIsParsing(false);
    setFileProgress(null);
    setTrace(MOCK_TRACE);
    setAuditResult(MOCK_AUDIT_RESULT);
    setBackendResponse(null);
    setIsDemoResult(true);
    setUserInstruction(MOCK_TRACE.userInstruction);
    setRawInput("");
    setUploadedFile(null);
    setTraceSearchQuery("");
    setSelectedStep(undefined);
    setNotice({
      type: "info",
      text: "Demo trace and illustrative repair loaded. These are sample values, not detector predictions.",
    });
  }, [invalidateAudit]);

  const handleDeviationChange = useCallback((stepNumber: number | undefined) => {
    invalidateAudit();
    setTrace((previous) => ({
      ...previous,
      detectedDeviationStep: stepNumber,
      steps: previous.steps.map((step) => ({ ...step, isDeviation: step.stepNumber === stepNumber })),
    }));
    setSelectedStep(stepNumber);
    setAuditResult(null);
    setBackendResponse(null);
    setIsDemoResult(false);
  }, [invalidateAudit]);

  const handleViewFlaggedStep = useCallback((stepNumber: number) => {
    setSelectedStep(stepNumber);
    setTraceSearchQuery("");
    window.requestAnimationFrame(() => {
      const stepElement = document.getElementById(`trace-step-${stepNumber}`);
      const stepButton = stepElement?.querySelector<HTMLButtonElement>("button");
      if (stepButton?.getAttribute("aria-expanded") === "false") stepButton.click();
      stepButton?.focus({ preventScroll: true });
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      stepElement?.scrollIntoView({ behavior, block: "center" });
    });
  }, []);

  const handleStepSelect = useCallback((stepNumber: number) => {
    setSelectedStep(stepNumber);
  }, []);

  const handleClearTrace = useCallback(() => {
    fileReadId.current += 1;
    invalidateAudit();
    setTrace(EMPTY_TRACE);
    setUserInstruction("");
    setRawInput("");
    setUploadedFile(null);
    setTraceSearchQuery("");
    setSelectedStep(undefined);
    setAuditResult(null);
    setBackendResponse(null);
    setIsDemoResult(false);
    setIsParsing(false);
    setFileProgress(null);
    setNotice({ type: "info", text: "Trace cleared. Import or paste a trace to start a new audit." });
  }, [invalidateAudit]);

  const displayedSteps = trace.steps;
  const displayedDeviationStep = trace.detectedDeviationStep;

  const panelClass = "rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]";

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Workspace / Trace audit</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Agent trace review</h1>
          <p className="mt-1 text-sm text-slate-500">Inspect execution, understand deviations, and refine the instruction.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className={cn("h-2 w-2 rounded-full", trace.steps.length ? "bg-emerald-500" : "bg-slate-300")} />
          {displayedSteps.length} steps <span className="text-slate-300">·</span> {(backendResponse?.traceId ?? trace.traceInfo?.traceId ?? trace.sessionId) || "No trace loaded"}
        </div>
      </div>

      {notice && (
        <div
          role={notice.type === "error" ? "alert" : "status"}
          aria-live={notice.type === "error" ? "assertive" : "polite"}
          className={cn(
            "mb-5 flex items-start gap-2 rounded-lg border px-3.5 py-3 text-sm",
            notice.type === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : notice.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-slate-200 bg-slate-50 text-slate-700"
          )}
        >
          {notice.type === "error" ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-current opacity-70" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Dataset quick-selector bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-[#FAF9F6] p-2.5 text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-slate-700">
          <Database className="h-3.5 w-3.5 text-violet-600" />
          Quick load repository trace:
        </span>
        {SAMPLE_TRACES.map((st) => (
          <button
            key={st.id}
            type="button"
            onClick={() => handleLoadRepositoryTrace(st.id)}
            disabled={isAuditing || isParsing}
            className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-50"
          >
            {st.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,0.93fr)_minmax(0,1.07fr)] 2xl:gap-6">
        <section className="min-w-0 space-y-5" aria-label="Trace input and timeline">
          <div className={cn(panelClass, "p-4 sm:p-5")}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <label htmlFor="instruction" className="text-sm font-semibold text-slate-900">User instruction</label>
              <span className="text-xs text-slate-400">Source prompt</span>
            </div>
            <input
              id="instruction"
              type="text"
              value={userInstruction}
              onChange={(event) => {
                invalidateAudit();
                setUserInstruction(event.target.value);
                setTrace((current) => ({ ...current, userInstruction: event.target.value }));
                setAuditResult(null);
                setBackendResponse(null);
                setIsDemoResult(false);
              }}
              className="w-full rounded-lg border border-slate-200 bg-[#FAF9F6] px-3.5 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              placeholder="Enter the instruction that guided this agent run"
            />
            <div className="mt-4"><InstructionViewer instruction={trace.userInstruction} /></div>
          </div>

          <div className={cn(panelClass, "p-4 sm:p-5")}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Execution timeline</h2>
                <p className="mt-0.5 text-xs text-slate-500">Select a step to inspect its payload, observation, and cosine similarity.</p>
              </div>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{trace.steps.length} steps</span>
            </div>
            <TraceTimeline
              steps={displayedSteps}
              deviationStep={displayedDeviationStep}
              deviationType={backendResponse?.audit.deviationType ?? (trace.failureType ? String(trace.failureType) : undefined)}
              flaggedSteps={backendResponse?.audit.flaggedStepIds.map((s, i) => i + 1) ?? []}
              selectedStep={selectedStep}
              onStepSelect={handleStepSelect}
              onDeviationChange={backendResponse ? undefined : handleDeviationChange}
              searchQuery={traceSearchQuery}
              onSearchQueryChange={setTraceSearchQuery}
            />
          </div>

          <div className={cn(panelClass, "p-4 sm:p-5")}>
            <div className="mb-3 flex items-center gap-2">
              <FileJson2 className="h-4 w-4 text-violet-600" />
              <h2 className="text-sm font-semibold text-slate-900">Import trace</h2>
            </div>
            <label
              onDragOver={(event) => { event.preventDefault(); setIsDraggingFile(true); }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={handleDrop}
              className={cn(
                "group flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-4 py-3.5 transition",
                isDraggingFile
                  ? "border-violet-500 bg-violet-50"
                  : "border-slate-300 bg-[#FAF9F6] hover:border-violet-400 hover:bg-violet-50/40"
              )}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 group-hover:text-violet-700"><Upload className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-800">{uploadedFile ? "Replace trace file" : "Choose or drop a trace file"}</span><span className="block text-xs text-slate-500">JSON, JSONL, TXT, LOG, or MD · ReAct logs supported</span></span>
              <input type="file" accept=".json,.jsonl,.txt,.log,.md,application/json,text/plain" className="sr-only" onChange={handleFileUpload} />
              <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600">Browse</span>
            </label>
            {uploadedFile && (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{uploadedFile.name}</span>
                <span className="shrink-0 text-slate-400">{formatFileSize(uploadedFile.size)}</span>
                <button type="button" onClick={handleClearTrace} className="inline-flex min-h-8 items-center gap-1 rounded px-2 text-slate-600 hover:bg-white hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400" aria-label="Clear imported trace"><Trash2 aria-hidden="true" className="h-3.5 w-3.5" /><span>Clear</span></button>
              </div>
            )}
            {!uploadedFile && trace.steps.length > 0 && (
              <button type="button" onClick={handleClearTrace} className="mt-2 inline-flex min-h-8 items-center gap-1 rounded px-2 text-xs text-slate-500 hover:bg-slate-100 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"><Trash2 aria-hidden="true" className="h-3.5 w-3.5" />Clear trace</button>
            )}
            {isParsing && (
              <div className="mt-2" role="status" aria-live="polite">
                <p className="flex items-center gap-2 text-xs text-violet-700"><LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />Reading and parsing trace{fileProgress == null ? "…" : ` · ${fileProgress}%`}</p>
                {fileProgress != null && (
                  <div role="progressbar" aria-label="Trace file read progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={fileProgress} className="mt-1.5 h-1 overflow-hidden rounded bg-violet-100"><div className="h-full bg-violet-600 transition-[width] motion-reduce:transition-none" style={{ width: `${fileProgress}%` }} /></div>
                )}
              </div>
            )}
            <label htmlFor="raw-trace" className="mb-1.5 mt-4 block text-xs font-medium text-slate-600">Or paste execution logs</label>
            <textarea
              id="raw-trace"
              value={rawInput}
              onChange={(event) => {
                fileReadId.current += 1;
                invalidateAudit();
                setIsParsing(false);
                setFileProgress(null);
                setRawInput(event.target.value);
                setUploadedFile(null);
                setTrace({ ...EMPTY_TRACE, userInstruction });
                setAuditResult(null);
                setBackendResponse(null);
                setIsDemoResult(false);
                setTraceSearchQuery("");
                setSelectedStep(undefined);
              }}
              rows={5}
              className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs leading-5 text-slate-700 outline-none placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              placeholder={'Paste JSON / JSONL or ReAct logs…\nThought: ...\nAction: search\nAction Input: ...\nObservation: ...'}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => updateTrace(rawInput)} disabled={!rawInput.trim() || isParsing || isAuditing} className="rounded-md border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45">Parse log</button>
              <button onClick={handleRunAudit} disabled={isAuditing || isParsing || !trace.steps.length} className="inline-flex items-center justify-center gap-2 rounded-md bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-55">
                {(isAuditing || isParsing) && <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />}
                {isAuditing ? "Running ML detector…" : isParsing ? "Parsing trace…" : "Run audit (POST /api/detect)"}
              </button>
              <button onClick={handleLoadDemo} disabled={isParsing} className="rounded-md px-3.5 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50">Load demo</button>
            </div>
          </div>
        </section>

        <section className="min-w-0 space-y-5" aria-label="Audit findings and prompt repair">
          {backendResponse ? (
            <BackendTraceResponsePanel response={backendResponse} onViewStep={handleViewFlaggedStep} />
          ) : auditResult ? (
            <>
              {isDemoResult && <p className="rounded-md border border-violet-100 bg-violet-50 px-3 py-2 text-xs text-violet-800">Illustrative demo result · not a detector prediction</p>}
              {!isDemoResult && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Current audit endpoint response · sample data, not a detector prediction</p>}
              <CausalDiagnosisCard
                result={auditResult}
                failureType={isDemoResult ? trace.failureType : undefined}
                deviationStep={isDemoResult ? trace.detectedDeviationStep : undefined}
                flaggedStep={isDemoResult ? trace.steps.find((step) => step.stepNumber === trace.detectedDeviationStep) : undefined}
                onViewStep={() => {
                  if (isDemoResult && trace.detectedDeviationStep !== undefined) handleViewFlaggedStep(trace.detectedDeviationStep);
                }}
              />
              <DetectorAnalysisCard result={auditResult} deviationStep={isDemoResult ? trace.detectedDeviationStep : undefined} />
              <PromptRepairStudio originalPrompt={trace.userInstruction} result={auditResult} trace={trace} isDemoResult={isDemoResult} />
            </>
          ) : !trace.steps.length ? (
            <div className={cn(panelClass, "flex min-h-64 flex-col items-center justify-center p-6 text-center")}>
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><FileJson2 className="h-5 w-5" /></span>
              <h2 className="mt-3 text-sm font-semibold text-slate-900">No trace loaded</h2>
              <p className="mt-1 max-w-sm text-sm leading-5 text-slate-500">Upload or paste an execution trace or load a trace from the repository to run ML detection.</p>
            </div>
          ) : (
            <div className={cn(panelClass, "p-5")}>
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-slate-900">Audit results</h2>
                <p className="mt-1 text-xs text-slate-500">Run an audit to invoke POST /api/detect and view real PELT and scope diagnostics.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {["Similarity (MiniLM)", "Drift (PELT)", "Scope violations", "Audit outcome"].map((label) => (
                  <div key={label} className="rounded-lg border border-slate-200 bg-[#FAF9F6] px-3 py-3">
                    <span className="block text-xs text-slate-500">{label}</span>
                    <span className="mt-1 block text-sm font-semibold text-slate-400">Unavailable</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-slate-500">Missing detector values stay unavailable; this view never estimates or fabricates values.</p>
            </div>
          )}
          {!backendResponse && trace.steps.length > 0 && <GroundTruthCard trace={trace} />}
        </section>
      </div>
    </div>
  );
}

/**
 * Renders the authoritative BackendTraceModel returned by FastAPI.
 */
function BackendTraceResponsePanel({
  response,
  onViewStep,
}: {
  response: BackendTraceModel;
  onViewStep: (stepNumber: number) => void;
}) {
  const [exportState, setExportState] = useState<"idle" | "success" | "error">("idle");
  const audit = response.audit;
  const isNoDeviation = !audit.isDeviated;
  const typeLabel = audit.deviationType === "drift"
    ? "Semantic drift"
    : audit.deviationType === "scope_creep"
      ? "Scope creep"
      : isNoDeviation
        ? "No deviation (Compliant)"
        : String(audit.deviationType);

  const points = response.steps.map((s, idx) => ({
    stepNumber: idx + 1,
    score: s.similarityScore,
    stepId: s.stepId,
  }));

  // Resolve flagged step number
  let primaryStepNumber: number | undefined = undefined;
  if (audit.flaggedStepIds.length > 0) {
    const foundIdx = response.steps.findIndex((s) => String(s.stepId) === String(audit.flaggedStepIds[0]));
    if (foundIdx !== -1) primaryStepNumber = foundIdx + 1;
  }

  const handleExport = () => {
    try {
      const url = URL.createObjectURL(new Blob([JSON.stringify(response, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      const safeId = response.traceId.replace(/[^a-z0-9._-]/gi, "-") || "trace";
      anchor.href = url;
      anchor.download = `agentlens-audit-${safeId}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportState("success");
    } catch {
      setExportState("error");
    }
    window.setTimeout(() => setExportState("idle"), 2500);
  };

  return (
    <div className="space-y-5">
      {/* Top Envelope Card */}
      <section className="rounded-xl border border-emerald-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Real ML Detector Output</h2>
            <p className="mt-0.5 text-xs text-slate-500">SentenceTransformer MiniLM embeddings & ruptures PELT changepoint detection</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
              Evaluated by ML Core
            </span>
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              {exportState === "success" ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Download className="h-3.5 w-3.5" />}
              {exportState === "success" ? "Exported" : exportState === "error" ? "Export failed" : "Export JSON"}
            </button>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Trace ID</dt>
            <dd className="mt-1 break-all font-mono text-xs text-slate-700">{response.traceId}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Steps Evaluated</dt>
            <dd className="mt-1 text-xs text-slate-700">{response.steps.length} steps</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Prompt / Intent</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{response.prompt || "No prompt"}</dd>
          </div>
        </dl>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ResponseMetric label="Audit status" value={isNoDeviation ? "Compliant" : "Deviation detected"} />
          <ResponseMetric label="Deviation type" value={typeLabel} />
          <ResponseMetric label="Confidence" value={`${(audit.confidence * 100).toFixed(1)}%`} />
          <ResponseMetric label="Primary step" value={primaryStepNumber ? `Step ${primaryStepNumber} (${audit.flaggedStepIds[0]})` : "None"} />
        </div>

        {/* Natural Language Explanation from detector */}
        <div className="mt-4 rounded-lg bg-slate-50 p-3.5 border border-slate-200/80">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Detector Explanation</span>
          <p className="mt-1 text-xs leading-5 text-slate-800">{audit.explanation}</p>
        </div>

        {primaryStepNumber !== undefined && (
          <button
            type="button"
            onClick={() => onViewStep(primaryStepNumber!)}
            className="mt-3 inline-flex min-h-9 items-center rounded-md border border-violet-200 bg-white px-3 text-xs font-semibold text-violet-700 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            Jump to flagged step {primaryStepNumber}
          </button>
        )}
      </section>

      {/* Similarity Curve Section */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-5">
        <h2 className="text-sm font-semibold text-slate-900">Cosine Similarity Curve</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Per-step cosine similarity against intent embedding (SentenceTransformers all-MiniLM-L6-v2).
        </p>
        {points.length > 0 ? (
          <SimilarityCurve points={points} deviationStep={primaryStepNumber} />
        ) : (
          <p className="mt-3 text-xs text-slate-400">No steps to plot.</p>
        )}
      </section>

      {/* Diagnostic Details: PELT, Fallback, Scope */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-5">
        <h2 className="text-sm font-semibold text-slate-900">Detector Diagnostics</h2>
        <p className="mt-0.5 text-xs text-slate-500">Internal metrics from ruptures PELT changepoint and scope verification engines.</p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* PELT Diagnostic Box */}
          <div className="rounded-lg border border-slate-200 bg-[#FAF9F6] p-3.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">PELT Changepoint</h3>
            <div className="mt-2 space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Breakpoint step ID:</span>
                <span className="font-mono font-medium text-slate-800">{response.detection.pelt.breakpointStepId ?? "None"}</span>
              </div>
              <div className="flex justify-between">
                <span>Similarity before:</span>
                <span className="font-mono font-medium text-slate-800">
                  {response.detection.pelt.similarityBefore != null ? response.detection.pelt.similarityBefore.toFixed(4) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Similarity after:</span>
                <span className="font-mono font-medium text-slate-800">
                  {response.detection.pelt.similarityAfter != null ? response.detection.pelt.similarityAfter.toFixed(4) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Mean drop:</span>
                <span className="font-mono font-medium text-slate-800">
                  {response.detection.pelt.difference != null ? response.detection.pelt.difference.toFixed(4) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Threshold used (minDrop):</span>
                <span className="font-mono font-medium text-slate-800">{response.detection.pelt.thresholdUsed}</span>
              </div>
            </div>
          </div>

          {/* Fallback Single-Step Box */}
          <div className="rounded-lg border border-slate-200 bg-[#FAF9F6] p-3.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Single-Step Drop Fallback</h3>
            <div className="mt-2 space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Triggered:</span>
                <span className={cn("font-medium", response.detection.fallback.triggered ? "text-amber-700 font-semibold" : "text-slate-800")}>
                  {response.detection.fallback.triggered ? "Yes" : "No"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Threshold (fallbackDrop):</span>
                <span className="font-mono font-medium text-slate-800">{response.detection.detectorConfig.fallbackDrop}</span>
              </div>
              {response.detection.fallback.reason && (
                <p className="mt-2 text-[11px] leading-4 text-slate-600 border-t border-slate-200/80 pt-1.5">
                  {response.detection.fallback.reason}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Scope Verification Violations */}
        <div className="mt-4 rounded-lg border border-slate-200 bg-[#FAF9F6] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Scope Verification Analysis</h3>
            <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
              {response.detection.scope.violations.length} violation(s)
            </span>
          </div>

          <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs text-slate-600">
            <div>
              <span className="font-medium text-slate-700">Allowed actions: </span>
              <span>{response.detection.scope.allowedActions.length ? response.detection.scope.allowedActions.join(", ") : "None specified"}</span>
            </div>
            <div>
              <span className="font-medium text-slate-700">Forbidden actions: </span>
              <span>{response.detection.scope.forbiddenActions.length ? response.detection.scope.forbiddenActions.join(", ") : "None specified"}</span>
            </div>
          </div>

          {response.detection.scope.violations.length > 0 && (
            <div className="mt-3 space-y-2">
              <span className="block text-[11px] font-medium text-rose-700">Identified Scope Violations:</span>
              {response.detection.scope.violations.map((v, i) => {
                const stepIdx = response.steps.findIndex((s) => String(s.stepId) === String(v.stepId));
                const stepNumber = stepIdx !== -1 ? stepIdx + 1 : undefined;
                return (
                  <div
                    key={i}
                    role={stepNumber !== undefined ? "button" : undefined}
                    tabIndex={stepNumber !== undefined ? 0 : undefined}
                    onClick={stepNumber !== undefined ? () => onViewStep(stepNumber) : undefined}
                    onKeyDown={stepNumber !== undefined ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onViewStep(stepNumber); } } : undefined}
                    className={cn(
                      "rounded border border-rose-200 bg-rose-50/70 p-2 text-xs text-rose-900",
                      stepNumber !== undefined && "cursor-pointer hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                    )}
                    aria-label={stepNumber !== undefined ? `Jump to step ${v.stepId}` : undefined}
                  >
                    <span className="font-semibold">Step {v.stepId}</span> (action: <code className="font-mono font-bold">{v.action}</code>): {v.reason}
                    {stepNumber !== undefined && (
                      <span className="ml-2 text-[10px] font-semibold text-rose-600 underline underline-offset-2">↑ Jump to step</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Prompt Repair Status Banner */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-900">Prompt Repair Studio</h2>
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
          <p className="font-medium text-slate-700">Phase 4 LLM Rewriter (Mistral-7B QLoRA) is offline.</p>
          <p className="mt-0.5">
            The active ML Core provides drift change-point detection and scope policy verification. Prompt rewriting and token-level diff generation remain reserved for Phase 4 fine-tuning integration.
          </p>
        </div>
      </section>

      {/* Ground Truth Card */}
      {response.groundTruth && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-label="Ground truth evaluation label">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Ground Truth (Dataset Annotation)</h2>
              <p className="mt-0.5 text-xs text-slate-500">Separated strictly from ML detector inputs and predictions.</p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500">
              Split: {response.groundTruth.sampleSplit ?? response.groundTruth.sample_split ?? "Unspecified"}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <GroundTruthValue label="Deviation" value={response.groundTruth.isDeviated ? "Yes" : "No"} />
            <GroundTruthValue label="Annotated type" value={response.groundTruth.deviationType ?? "None (Nominal)"} />
            <GroundTruthValue label="Flagged step ID" value={response.groundTruth.flaggedStepId != null ? String(response.groundTruth.flaggedStepId) : "None"} />
            <GroundTruthValue label="All flagged steps" value={response.groundTruth.flaggedSteps?.length ? response.groundTruth.flaggedSteps.join(", ") : "None"} />
            <GroundTruthValue label="Allowed actions" value={response.detection.scope.allowedActions.join(", ") || "None"} />
            <GroundTruthValue label="Forbidden actions" value={response.detection.scope.forbiddenActions.join(", ") || "None"} />
          </div>
          {response.groundTruth.notes && (
            <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">{response.groundTruth.notes}</p>
          )}
        </section>
      )}
    </div>
  );
}

function ResponseMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-100 bg-[#FAF9F6] px-3 py-2.5">
      <span className="block text-[11px] text-slate-500">{label}</span>
      <span className="mt-1 block break-words text-sm font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function DetectorAnalysisCard({ result, deviationStep }: { result: AuditResult; deviationStep?: number }) {
  const analysis = result.detectorAnalysis;
  const metrics = [
    ["Similarity", analysis?.similarity != null ? Number(analysis.similarity).toFixed(4) : "Unavailable"],
    ["Drift drop", analysis?.drift != null ? Number(analysis.drift).toFixed(4) : "Unavailable"],
    ["Scope violations", analysis?.scope != null ? String(analysis.scope) : "Unavailable"],
    ["Final result", analysis?.result ?? "none"],
    ...(analysis?.confidence != null ? [["Confidence", `${(analysis.confidence * 100).toFixed(1)}%`] as const] : []),
  ] as const;

  return (
    <section className="rounded-xl border border-slate-200/90 bg-white p-4 sm:p-5" aria-label="Detector analysis">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Detector Analysis</h2>
          <p className="mt-0.5 text-xs text-slate-500">Values returned by the ML Core</p>
        </div>
        <span className="text-[11px] text-slate-400">{analysis?.model ?? "Model unavailable"}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-lg border border-slate-100 bg-[#FAF9F6] px-3 py-2.5">
            <span className="block text-[11px] text-slate-500">{label}</span>
            <span className="mt-1 block break-words text-sm font-semibold text-slate-800">{value}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 border-t border-slate-100 pt-3">
        <h3 className="text-xs font-semibold text-slate-700">Per-step similarity</h3>
        {analysis?.similarityCurve?.length ? (
          <SimilarityCurve points={analysis.similarityCurve} deviationStep={deviationStep} />
        ) : (
          <p className="mt-1 text-xs text-slate-400">No per-step similarity scores were provided.</p>
        )}
      </div>
    </section>
  );
}

function SimilarityCurve({
  points,
  deviationStep,
}: {
  points: { stepNumber: number; score: number; stepId?: string }[];
  deviationStep?: number;
}) {
  const width = 440;
  const height = 150;
  const pad = { top: 14, right: 14, bottom: 30, left: 38 };
  const orderedPoints = [...points].sort((left, right) => left.stepNumber - right.stepNumber);
  const scores = orderedPoints.map((point) => point.score);
  const minimumStep = orderedPoints[0]?.stepNumber ?? 1;
  const maximumStep = orderedPoints[orderedPoints.length - 1]?.stepNumber ?? 1;
  const stepRange = maximumStep - minimumStep || 1;
  const minimum = scores.length ? Math.min(...scores) : 0;
  const maximum = scores.length ? Math.max(...scores) : 1;
  const range = maximum - minimum || 1;
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const plotted = orderedPoints.map((point) => ({
    ...point,
    x: pad.left + (maximumStep === minimumStep ? plotWidth / 2 : ((point.stepNumber - minimumStep) * plotWidth) / stepRange),
    y: pad.top + ((maximum - point.score) * plotHeight) / range,
  }));
  const line = plotted.map((point) => `${point.x},${point.y}`).join(" ");
  const format = (value: number) => Number(value.toPrecision(4)).toString();
  const labelEvery = Math.max(1, Math.ceil(plotted.length / 12));

  return (
    <div className="mt-2 w-full overflow-hidden rounded-md border border-slate-100 bg-white p-2">
      <svg className="block h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Similarity score by trace step">
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={height - pad.bottom} stroke="#cbd5e1" strokeWidth="1" />
        <line x1={pad.left} y1={height - pad.bottom} x2={width - pad.right} y2={height - pad.bottom} stroke="#cbd5e1" strokeWidth="1" />
        <text x={pad.left - 6} y={pad.top + 4} textAnchor="end" className="fill-slate-400 text-[9px]">{format(maximum)}</text>
        <text x={pad.left - 6} y={height - pad.bottom} textAnchor="end" className="fill-slate-400 text-[9px]">{format(minimum)}</text>
        {points.length > 1 && <polyline points={line} fill="none" stroke="#6d5dfb" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {plotted.map((point, index) => (
          <g key={`${point.stepNumber}-${point.score}`}>
            {point.stepNumber === deviationStep && <circle cx={point.x} cy={point.y} r="7" fill="#fff" stroke="#e11d48" strokeWidth="2" />}
            <circle cx={point.x} cy={point.y} r="3.5" fill={point.stepNumber === deviationStep ? "#e11d48" : "#4776e6"}>
              <title>{`Step ${point.stepNumber}${point.stepId ? ` (${point.stepId})` : ""} · similarity ${point.score.toFixed(4)}`}</title>
            </circle>
            {(index % labelEvery === 0 || index === plotted.length - 1 || point.stepNumber === deviationStep) && (
              <text x={point.x} y={height - 10} textAnchor="middle" className="fill-slate-500 text-[9px]">
                {point.stepNumber}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="flex items-center justify-between px-1 text-[10px] text-slate-400">
        <span>Cosine similarity</span>
        <span>Step order</span>
      </div>
    </div>
  );
}

function GroundTruthCard({ trace }: { trace: AgentTrace }) {
  const truth = trace.groundTruth;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-label="Ground truth evaluation label">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Ground truth</h2>
          <p className="mt-0.5 text-xs text-slate-500">Evaluation label, displayed separately from detector predictions.</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500">
          Split: {truth?.sampleSplit ?? "None"}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <GroundTruthValue label="Deviation" value={truth?.deviationDetected === undefined ? "Unavailable" : truth.deviationDetected ? "Yes" : "No"} />
        <GroundTruthValue label="Type" value={truth?.deviationType ?? "Unavailable"} />
        <GroundTruthValue label="Flagged step" value={truth?.flaggedStepId == null ? "Unavailable" : `Step ${truth.flaggedStepId}`} />
        <GroundTruthValue label="Trigger phrase" value={truth?.triggerPhrase ?? "Unavailable"} />
        <GroundTruthValue label="Allowed actions" value={trace.traceInfo?.allowedActions?.join(", ") || "Unavailable"} />
        <GroundTruthValue label="Forbidden actions" value={trace.traceInfo?.forbiddenActions?.join(", ") || "Unavailable"} />
      </div>
      {truth?.explanation && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">{truth.explanation}</p>}
    </section>
  );
}

function GroundTruthValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[11px] font-medium text-slate-500">{label}</span>
      <span className="mt-0.5 block break-words text-xs font-medium text-slate-800">{value}</span>
    </div>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}
