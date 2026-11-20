"use client";

import { memo, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TraceStep } from "@/lib/types";

interface StepCardProps {
  step: TraceStep;
  isDeviationStep: boolean;
  deviationType?: string;
  isScopeFlagged?: boolean;
  isSelected: boolean;
  onSelect: (stepNumber: number) => void;
  onToggleDeviation?: (stepNumber: number) => void;
}

export const StepCard = memo(function StepCard({ step, isDeviationStep, deviationType, isScopeFlagged = false, isSelected, onSelect, onToggleDeviation }: StepCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isDeviation = step.isDeviation || isDeviationStep || isScopeFlagged;
  const deviationTone = isScopeFlagged || deviationType === "scope_creep"
    ? "scope"
    : deviationType === "drift" ? "drift" : "other";
  const deviationLabel = isScopeFlagged ? "Scope violation" : deviationType === "drift" ? "Drift" : "Deviation";
  const status = step.status?.trim();
  const detailsId = `trace-step-details-${step.stepNumber}`;

  return (
    <article
      id={`trace-step-${step.stepNumber}`}
      className={cn(
        "relative min-w-0 rounded-lg border transition-colors",
        isDeviation
          ? deviationTone === "scope" ? "border-amber-300 bg-amber-50/60" : deviationTone === "drift" ? "border-blue-300 bg-blue-50/60" : "border-rose-300 bg-rose-50/60"
          : isSelected || expanded
            ? "border-violet-300 bg-violet-50/20 ring-1 ring-violet-100"
            : "border-slate-200 bg-white hover:border-slate-300"
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        aria-label={`Step ${step.stepNumber}: ${step.actionType}${step.toolName ? `, ${step.toolName}` : ""}`}
        onClick={() => {
          onSelect(step.stepNumber);
          setExpanded((value) => !value);
        }}
        className="flex w-full min-w-0 items-center gap-3 px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400 sm:px-3.5"
      >
        <span
          className={cn(
            "z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            isDeviation
              ? deviationTone === "scope" ? "bg-amber-600 text-white" : deviationTone === "drift" ? "bg-blue-600 text-white" : "bg-rose-600 text-white"
              : "border border-slate-200 bg-white text-slate-600"
          )}
        >
          {step.stepNumber}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="truncate font-mono text-xs font-semibold text-slate-800">
              {step.toolName ?? step.actionType}
            </span>
            {step.toolName && <span className="max-w-full truncate rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{step.actionType}</span>}
          </span>
          {step.toolInput && (
            <span className="mt-1 block truncate font-mono text-[11px] text-slate-500">
              {step.toolInput}
            </span>
          )}
          {step.observation && (
            <span className="mt-0.5 block truncate text-xs text-slate-500">
              {step.observation}
            </span>
          )}
          {step.similarityScore != null && Number.isFinite(step.similarityScore) && <span className="mt-1 inline-flex rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-blue-700">Similarity {step.similarityScore.toFixed(3)}</span>}
        </span>

        {status && (
          <span className="inline-flex max-w-28 shrink-0 items-center truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-600">
            {status}
          </span>
        )}
        {isDeviation ? (
          <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border bg-white px-2 py-1 text-[10px] font-semibold", deviationTone === "scope" ? "border-amber-200 text-amber-800" : deviationTone === "drift" ? "border-blue-200 text-blue-800" : "border-rose-200 text-rose-700")}>
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            {deviationLabel}
          </span>
        ) : !status ? (
          <span
            title="No execution status was provided"
            className="shrink-0 text-[10px] text-slate-400"
          >
            No status
          </span>
        ) : null}

        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div
          id={detailsId}
          className="space-y-3 border-t border-slate-200/80 px-3.5 py-3 sm:ml-[3.15rem] sm:mr-3.5 sm:px-0"
        >
          <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <Detail label="Action type" value={step.actionType} />
            <Detail label="Execution status" value={status || "Not provided"} muted={!status} />
            {step.toolName && <Detail label="Tool" value={step.toolName} />}
            {step.toolInput && <Detail label="Tool input" value={step.toolInput} />}
            {step.similarityScore != null && Number.isFinite(step.similarityScore) && <Detail label="Similarity score" value={step.similarityScore.toFixed(4)} />}
            {step.agentReasoning && <div className="sm:col-span-2"><Detail label="Agent reasoning" value={step.agentReasoning} /></div>}
            {step.observation && (
              <div className="sm:col-span-2">
                <Detail label="Tool output / observation" value={step.observation} />
              </div>
            )}
          </div>

          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Raw trace
            </span>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] leading-5 text-slate-700">
              {step.rawText}
            </pre>
          </div>

          {onToggleDeviation && (
            <button
              type="button"
              onClick={() => onToggleDeviation(step.stepNumber)}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-violet-300 hover:text-violet-700"
            >
              {isDeviation ? "Clear deviation flag" : "Mark as deviation"}
            </button>
          )}
        </div>
      )}
    </article>
  );
});

function Detail({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className={cn("mt-0.5 block break-words text-xs leading-5", muted ? "text-slate-400" : "text-slate-700")}>
        {value}
      </span>
    </div>
  );
}
