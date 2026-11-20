"use client";

import { Search, X } from "lucide-react";
import { useCallback, useMemo } from "react";
import type { TraceStep } from "@/lib/types";
import { StepCard } from "./StepCard";

interface TraceTimelineProps {
  steps: TraceStep[];
  deviationStep?: number;
  deviationType?: string;
  flaggedSteps?: number[];
  onDeviationChange?: (stepNumber: number | undefined) => void;
  selectedStep?: number;
  onStepSelect: (stepNumber: number) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}

/**
 * Interactive Trace Timeline (Zone 1)
 *
 * Renders searchable, collapsible execution steps with status shown only when provided.
 * The deviation step is highlighted with a restrained rose treatment.
 * Users can click to override the deviation step for testing auto-detection.
 */
export function TraceTimeline({
  steps,
  deviationStep,
  deviationType,
  flaggedSteps = [],
  onDeviationChange,
  selectedStep,
  onStepSelect,
  searchQuery,
  onSearchQueryChange,
}: TraceTimelineProps) {
  const handleToggleDeviation = useCallback((stepNumber: number) => {
    if (!onDeviationChange) return;

    if (deviationStep === stepNumber) {
      // Clear deviation if clicking the same step
      onDeviationChange(undefined);
    } else {
      onDeviationChange(stepNumber);
    }
  }, [deviationStep, onDeviationChange]);

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const visibleSteps = useMemo(() => normalizedQuery
    ? steps.filter((step) => [
      step.stepNumber.toString(),
      step.actionType,
      step.toolName,
      step.toolInput,
      step.agentReasoning,
      step.observation,
      step.similarityScore?.toString(),
      step.isDeviation ? "deviation" : "normal",
      step.rawText,
      step.status,
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)))
    : steps, [normalizedQuery, steps]);

  if (!steps.length) {
    return <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No execution steps are available yet.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="relative flex items-center gap-2">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate-400" />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          aria-label="Search trace steps"
          placeholder="Search steps, tools, inputs…"
          className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white pl-9 pr-9 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
        {searchQuery && <button type="button" aria-label="Clear trace search" onClick={() => onSearchQueryChange("")} className="absolute right-2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-3.5 w-3.5" /></button>}
        <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{visibleSteps.length}/{steps.length}</span>
      </div>

      {visibleSteps.length ? <div className="relative space-y-2 pl-1">
        <div aria-hidden="true" className="absolute bottom-4 left-[1.125rem] top-4 w-px bg-slate-200" />
        {visibleSteps.map((step) => (
          <StepCard
            key={step.stepNumber}
            step={step}
            isDeviationStep={step.stepNumber === deviationStep}
            deviationType={deviationType}
            isScopeFlagged={flaggedSteps.includes(step.stepNumber)}
            isSelected={step.stepNumber === selectedStep}
            onSelect={onStepSelect}
            onToggleDeviation={handleToggleDeviation}
          />
        ))}
      </div> : <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
        No steps match “{searchQuery}”.
      </div>}
    </div>
  );
}
