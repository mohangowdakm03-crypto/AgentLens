"use client";

import { useState } from "react";
import { ArrowDown, Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuditResult, TraceStep } from "@/lib/types";

interface CausalDiagnosisCardProps {
  result: AuditResult;
  failureType?: string;
  deviationStep?: number;
  flaggedStep?: TraceStep;
  onViewStep?: () => void;
}

/**
 * Causal Attribution Card (Zone 2 — Top)
 *
 * Displays:
 *  - Identified Failure Type as a tag pill
 *  - Deviation step indicator
 *  - Causal Explanation with trigger words highlighted as amber pills
 */
export function CausalDiagnosisCard({
  result,
  failureType,
  deviationStep,
  flaggedStep,
  onViewStep,
}: CausalDiagnosisCardProps) {
  const [explanationCopyState, setExplanationCopyState] = useState<"idle" | "success" | "error">("idle");
  const classification = getClassificationPresentation(failureType);
  const classificationConflict = classification.kind === "none" && deviationStep !== undefined;
  const deviationDetected = deviationStep !== undefined || classification.kind === "scope" || classification.kind === "drift";
  const auditSummary = classificationConflict
    ? "Conflicting audit fields"
    : deviationDetected
      ? "Deviation detected"
      : classification.kind === "none"
        ? "No Deviation"
        : classification.kind === "unknown" && failureType
          ? "Unclassified result"
          : "Detector classification unavailable";
  const summaryTone = classificationConflict || classification.kind === "unknown"
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : classification.kind === "scope" || deviationStep !== undefined
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : classification.kind === "drift"
        ? "border-blue-200 bg-blue-50 text-blue-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";

  const handleCopyExplanation = async () => {
    if (!result.causalExplanation || result.causalExplanation === "Unavailable") return;
    try {
      await navigator.clipboard.writeText(result.causalExplanation);
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = result.causalExplanation;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Clipboard copy was rejected");
      } catch {
        setExplanationCopyState("error");
        window.setTimeout(() => setExplanationCopyState("idle"), 3000);
        return;
      }
    }
    setExplanationCopyState("success");
    window.setTimeout(() => setExplanationCopyState("idle"), 1800);
  };

  /** Highlight trigger tokens within the explanation text. */
  function renderExplanationWithHighlights(text: string, triggers: string[]) {
    if (!triggers.length) return <span>{text}</span>;

    // Build a regex that matches any trigger token (case-insensitive)
    const escaped = triggers.map((t) =>
      t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );
    const regex = new RegExp(`(${escaped.join("|")})`, "gi");
    const parts = text.split(regex);

    return (
      <>
        {parts.map((part, i) => {
          const isHighlight = triggers.some(
            (t) => t.toLowerCase() === part.toLowerCase()
          );
          if (isHighlight) {
            return (
              <mark
                key={i}
                className="inline-flex items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-amber-800 font-semibold not-italic"
              >
                &lsquo;{part}&rsquo;
              </mark>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      {/* Section header */}
      <div className="border-b border-slate-100 px-4 py-3.5 sm:px-5">
        <h2 className="text-sm font-semibold text-slate-900">Causal diagnosis</h2>
        <p className="mt-0.5 text-xs text-slate-500">Attribution for the flagged execution path</p>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {/* Failure Type + Deviation Step */}
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
            summaryTone
          )}>
            {auditSummary}
          </span>
          {classification.label && classification.kind !== "none" && (
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
                classification.kind === "scope" && "border-rose-200 bg-rose-50 text-rose-700",
                classification.kind === "drift" && "border-blue-200 bg-blue-50 text-blue-700",
                classification.kind === "unknown" && "border-slate-200 bg-slate-50 text-slate-700"
              )}
            >
              {classification.label}
            </span>
          )}

          {deviationStep !== undefined && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                Deviation at{" "}
                <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono font-semibold text-slate-800">
                  Step {deviationStep}
                </span>
              </span>
              {onViewStep && <button type="button" onClick={onViewStep} className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"><ArrowDown className="h-3 w-3" />View step</button>}
            </div>
          )}
        </div>

        {classification.kind === "unknown" && failureType && <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          Unsupported V1 deviation classification “{failureType}”. Expected none, drift, or scope_creep; shown as unclassified.
        </p>}
        {classification.kind === "unknown" && !failureType && <p role="status" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
          The audit response did not include a V1 deviation classification. No classification is inferred from trace labels.
        </p>}
        {classificationConflict && <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          The V1 classification is “none”, but the trace also identifies deviation at Step {deviationStep}.
        </p>}

        {/* Causal Explanation */}
        <div className="rounded-lg border border-violet-100 bg-violet-50/40 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-violet-800">Causal attribution</h3>
            <button type="button" disabled={!result.causalExplanation || result.causalExplanation === "Unavailable"} onClick={handleCopyExplanation} className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium text-violet-700 transition hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-50">
              {explanationCopyState === "success" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {explanationCopyState === "success" ? "Copied" : explanationCopyState === "error" ? "Copy failed · retry" : "Copy explanation"}
            </button>
          </div>
          <p className="text-sm leading-relaxed text-slate-700">
            {result.causalExplanation ? renderExplanationWithHighlights(
              result.causalExplanation,
              result.triggerTokens
            ) : <span className="text-slate-400">No causal explanation was returned.</span>}
          </p>
        </div>

        {deviationStep !== undefined && (
          <div className="rounded-lg border border-slate-200 bg-white p-3.5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-slate-700">Trace evidence</h3>
              <span className="text-[11px] text-slate-400">Step {deviationStep}</span>
            </div>
            {flaggedStep ? (
              <>
                <p className="mb-1 text-[11px] text-slate-500">
                  {[flaggedStep.actionType, flaggedStep.toolName].filter(Boolean).join(" · ")}
                </p>
                <p className="line-clamp-3 break-words font-mono text-xs leading-5 text-slate-700">
                  {flaggedStep.rawText}
                </p>
              </>
            ) : (
              <p className="text-xs text-slate-400">Evidence for this step is unavailable in the loaded trace.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function getClassificationPresentation(value?: string) {
  const normalized = value?.trim().toLocaleLowerCase().replace(/[ -]+/g, "_");
  if (!normalized) return { label: "", kind: "unknown" as const };
  if (normalized === "none") return { label: "No Deviation", kind: "none" as const };
  if (normalized === "drift" || normalized === "semantic_drift") return { label: "Semantic Drift", kind: "drift" as const };
  if (normalized === "scope_creep") return { label: "Scope Creep", kind: "scope" as const };
  return { label: "Unclassified", kind: "unknown" as const };
}
