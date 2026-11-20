"use client";

import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentTrace, AuditResult } from "@/lib/types";

interface PromptRepairStudioProps {
  originalPrompt: string;
  result: AuditResult;
  trace: AgentTrace;
  isDemoResult: boolean;
}

export function PromptRepairStudio({ originalPrompt, result, trace, isDemoResult }: PromptRepairStudioProps) {
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">("idle");
  const [exportState, setExportState] = useState<"idle" | "success" | "error">("idle");

  const handleCopy = async () => {
    if (!result.correctedPrompt || result.correctedPrompt === "Unavailable") return;
    try {
      await navigator.clipboard.writeText(result.correctedPrompt);
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = result.correctedPrompt;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Clipboard copy was rejected");
      } catch {
        setCopyState("error");
        window.setTimeout(() => setCopyState("idle"), 3000);
        return;
      }
    }
    setCopyState("success");
    window.setTimeout(() => setCopyState("idle"), 1800);
  };

  const handleExport = () => {
    const report = {
      report_type: "AgentLens trace audit",
      result_source: isDemoResult ? "illustrative_demo" : "audit_api_response",
      trace: {
        trace_id: trace.traceInfo?.traceId ?? trace.sessionId,
        original_instruction: trace.userInstruction,
        steps: trace.steps,
        intent: trace.traceInfo ? {
          allowed_actions: trace.traceInfo.allowedActions ?? null,
          forbidden_actions: trace.traceInfo.forbiddenActions ?? null,
        } : null,
      },
      detector_analysis: result.detectorAnalysis ?? null,
      diagnosis_and_repair: {
        failure_type: trace.failureType ?? null,
        deviation_step: trace.detectedDeviationStep ?? null,
        causal_explanation: result.causalExplanation,
        trigger_tokens: result.triggerTokens,
        corrected_prompt: result.correctedPrompt,
        diff: result.diff,
        justification: result.justification,
      },
      ground_truth: trace.groundTruth ?? null,
    };
    try {
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      const safeId = (trace.traceInfo?.traceId ?? trace.sessionId).replace(/[^a-z0-9._-]/gi, "-");
      anchor.href = url;
      anchor.download = `agentlens-audit-${safeId}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportState("success");
      window.setTimeout(() => setExportState("idle"), 2200);
    } catch {
      setExportState("error");
      window.setTimeout(() => setExportState("idle"), 3000);
    }
  };

  const segments = buildDiff(originalPrompt, result);
  return <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3.5 sm:px-5">
      <div><h2 className="text-sm font-semibold text-slate-900">Prompt repair studio</h2><p className="mt-0.5 text-xs text-slate-500">Compare the instruction and review each proposed change.</p></div>
      {isDemoResult && <span className="rounded-full border border-violet-100 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700">Sample repair</span>}
    </div>
    <div className="space-y-5 p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <PromptBox label="Original prompt" text={originalPrompt} />
        <PromptBox label="Corrected prompt" text={result.correctedPrompt} corrected />
      </div>

      <div><div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-xs font-semibold text-slate-700">Word-level diff</h3><div className="flex gap-3 text-[11px] text-slate-500"><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-rose-300" />Removed</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-300" />Added</span></div></div>
        <div className="break-words rounded-lg border border-slate-200 bg-[#FAF9F6] p-3.5 font-mono text-[13px] leading-7 text-slate-700">
          {segments.map((segment, index) => segment.type === "removed" ? <del key={index} className="rounded bg-rose-100 px-1 py-0.5 text-rose-800 decoration-rose-500">{segment.text}</del> : segment.type === "added" ? <ins key={index} className="rounded bg-emerald-100 px-1 py-0.5 font-semibold text-emerald-800 no-underline">{segment.text}</ins> : <span key={index}>{segment.text}</span>)}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="border-b border-slate-100 bg-slate-50 px-3.5 py-2.5"><h3 className="text-xs font-semibold text-slate-700">Replacement rationale</h3></div>
        {result.diff.length ? <div className="divide-y divide-slate-100">{result.diff.map((change, index) => <div key={`${change.old}-${index}`} className="grid grid-cols-1 gap-2 px-3.5 py-3 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,1.6fr)] sm:gap-3">
          <div><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:hidden">Removed</span><code className="rounded bg-rose-50 px-1.5 py-1 text-xs text-rose-700">{change.old || "—"}</code></div>
          <div><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:hidden">Replacement</span><code className="rounded bg-emerald-50 px-1.5 py-1 text-xs text-emerald-700">{change.new || "—"}</code></div>
          <p className="text-xs leading-5 text-slate-600">{change.reason || "No rationale supplied."}</p>
        </div>)}</div> : <p className="px-3.5 py-3 text-xs text-slate-500">No phrase-level changes were supplied.</p>}
      </div>

      <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-3.5"><h3 className="text-xs font-semibold text-violet-800">Justification</h3><p className="mt-1.5 text-sm leading-6 text-slate-700">{result.justification || "Unavailable"}</p></div>

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <button onClick={handleCopy} disabled={!result.correctedPrompt || result.correctedPrompt === "Unavailable"} className={cn("inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50", copyState === "success" ? "bg-emerald-600 text-white" : copyState === "error" ? "bg-rose-600 text-white" : "bg-violet-600 text-white hover:bg-violet-700")}><span>{copyState === "success" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</span>{copyState === "success" ? "Copied" : copyState === "error" ? "Copy failed · retry" : "Copy corrected prompt"}</button>
        <button onClick={handleExport} className={cn("inline-flex items-center justify-center gap-2 rounded-md border px-3.5 py-2.5 text-xs font-semibold transition", exportState === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : exportState === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}>{exportState === "success" ? <Check className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}{exportState === "success" ? "Report exported" : exportState === "error" ? "Export failed · retry" : "Export audit report"}</button>
      </div>
    </div>
  </section>;
}

function PromptBox({ label, text, corrected = false }: { label: string; text: string; corrected?: boolean }) {
  return <div className={cn("min-w-0 rounded-lg border p-3.5", corrected ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-slate-50")}>
    <span className={cn("mb-2 block text-[11px] font-semibold uppercase tracking-wide", corrected ? "text-emerald-700" : "text-slate-500")}>{label}</span>
    <p className="break-words text-sm leading-6 text-slate-800">{text || "Unavailable"}</p>
  </div>;
}

function buildDiff(original: string, result: AuditResult) {
  const segments: { type: "same" | "removed" | "added"; text: string }[] = [];
  let remaining = original;
  for (const change of result.diff) {
    if (!change.old) continue;
    const index = remaining.toLocaleLowerCase().indexOf(change.old.toLocaleLowerCase());
    if (index < 0) continue;
    if (index) segments.push({ type: "same", text: remaining.slice(0, index) });
    segments.push({ type: "removed", text: remaining.slice(index, index + change.old.length) });
    if (change.new) segments.push({ type: "added", text: change.new });
    remaining = remaining.slice(index + change.old.length);
  }
  if (remaining) segments.push({ type: "same", text: remaining });
  return segments.length ? segments : [{ type: "same" as const, text: original || "Unavailable" }];
}
