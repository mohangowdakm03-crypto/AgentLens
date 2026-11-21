"""ML detection service wrapping the AgentLens ML core."""
import os
import sys
from pathlib import Path

# Ensure detector/ml_core is in sys.path regardless of current working directory
ml_core_path = str(Path(__file__).resolve().parent.parent / "ml_core")
if ml_core_path not in sys.path:
    sys.path.insert(0, ml_core_path)

# Set offline mode default so sentence-transformers uses cached models
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

import numpy as np
from typing import Dict, Any, List, Optional

from agentlens.schema import Step, Intent, Deviation
from agentlens.drift.embed import embed, get_model
from agentlens.drift.curve import similarity_curve
from agentlens.drift.detect import (
    detect_deviation,
    scope_violations,
    analyze_drift_curve,
    detect_from_curve,
    PEN,
    MIN_DROP,
    FALLBACK_DROP,
)
from detector.api.loader import LoadedTrace
from detector.api.models import (
    TraceModel,
    StepModel,
    DetectionModel,
    DetectorConfigModel,
    PeltResultModel,
    FallbackResultModel,
    ScopeResultModel,
    ScopeViolationModel,
    AuditResultModel,
    GroundTruthModel,
)


class DetectorService:
    def __init__(self):
        self._ensure_model_loaded()

    def _ensure_model_loaded(self):
        """Warm up embedding model."""
        try:
            get_model()
        except Exception as e:
            print(f"Warning: could not initialize SentenceTransformer: {e}")

    def run_detection(self, loaded_trace: LoadedTrace) -> TraceModel:
        """Run ML detector on a LoadedTrace and return complete TraceModel."""
        steps = loaded_trace.steps
        n = len(steps)

        # 1. Generate Intent Embedding if prompt exists
        if loaded_trace.prompt:
            intent_vec = embed([loaded_trace.prompt])[0]
        else:
            intent_vec = np.zeros(384)

        intent = loaded_trace.create_intent(embedding=intent_vec)

        # 2. Compute similarity curve using ML core
        if steps:
            curve = similarity_curve(steps, intent.embedding)
        else:
            curve = []

        # 3. Use the ML core's canonical analysis for API diagnostics.  Do not
        # duplicate PELT/fallback logic here: that previously made two-step
        # fallback detections disagree with the API response.
        drift_analysis = analyze_drift_curve(curve)
        pelt_idx = drift_analysis.index if drift_analysis.method == "pelt" else None
        pelt_drop = drift_analysis.drop if pelt_idx is not None else None
        sim_before = drift_analysis.similarity_before if pelt_idx is not None else None
        sim_after = drift_analysis.similarity_after if pelt_idx is not None else None
        fallback_triggered = drift_analysis.method == "fallback"
        fallback_idx = drift_analysis.index if fallback_triggered else None
        fallback_drop_val = drift_analysis.drop if fallback_triggered else 0.0
        fallback_reason: Optional[str] = None
        if fallback_triggered and fallback_idx is not None:
            step_name = loaded_trace.step_id_map.get(
                steps[fallback_idx].step_id, str(steps[fallback_idx].step_id)
            )
            fallback_reason = (
                f"No PELT changepoint met threshold {MIN_DROP}. Fallback triggered: "
                f"single-step similarity drop of {fallback_drop_val:.3f} at step {step_name} "
                f"exceeds FALLBACK_DROP ({FALLBACK_DROP})."
            )

        # 5. Scope violations (Action Types only)
        raw_violation_ids = scope_violations(steps, intent) if steps else []
        scope_violation_models: List[ScopeViolationModel] = []
        for s in steps:
            if s.step_id in raw_violation_ids:
                step_label = loaded_trace.step_id_map.get(s.step_id, str(s.step_id))
                act = s.action_type or "unknown"
                if act.lower() in {v.lower() for v in intent.forbidden_verbs}:
                    reason = f"Action type '{act}' is in the forbidden actions set for this task."
                else:
                    reason = f"Action type '{act}' is not in the allowed actions set ({sorted(list(intent.allowed_verbs))})."
                scope_violation_models.append(
                    ScopeViolationModel(
                        stepId=step_label,
                        action=act,
                        reason=reason,
                    )
                )

        # 5. Contract function: detect_deviation / detect_from_curve
        deviation = (
            detect_from_curve(steps, curve, intent, drift_analysis=drift_analysis)
            if steps else Deviation(None, "none", 0.0, [], [])
        )

        # 6. Build flagged step IDs
        flagged_step_ids: List[str] = []
        # Add scope violations
        for v in raw_violation_ids:
            s_label = loaded_trace.step_id_map.get(v, str(v))
            if s_label not in flagged_step_ids:
                flagged_step_ids.append(s_label)

        # If drift detected, flag drift step and downstream steps
        drift_step_idx = drift_analysis.index
        if drift_step_idx is not None and drift_step_idx < n:
            for k in range(drift_step_idx, n):
                s_label = loaded_trace.step_id_map.get(steps[k].step_id, str(steps[k].step_id))
                if s_label not in flagged_step_ids:
                    flagged_step_ids.append(s_label)

        # 7. Generate natural language explanation
        is_deviated = deviation.step_id is not None and deviation.type != "none"
        dev_type = deviation.type if is_deviated else None

        if dev_type == "scope_creep":
            violating_step = loaded_trace.step_id_map.get(deviation.step_id, str(deviation.step_id))
            explanation = (
                f"Scope verification detected violation starting at step {violating_step}: "
                f"agent executed action(s) outside allowed permissions ({sorted(list(intent.allowed_verbs))}). "
                f"Flagged {len(flagged_step_ids)} step(s)."
            )
        elif dev_type == "drift":
            drift_step_name = loaded_trace.step_id_map.get(deviation.step_id, str(deviation.step_id))
            if pelt_idx is not None:
                explanation = (
                    f"PELT detected a sustained cosine similarity drop of {pelt_drop:.3f} "
                    f"(threshold {MIN_DROP}) starting at step {drift_step_name}. "
                    f"Semantic similarity shifted from {sim_before:.2f} down to {sim_after:.2f}."
                )
            else:
                explanation = (
                    f"PELT found no changepoint. Fallback triggered: single-step similarity drop "
                    f"of {fallback_drop_val:.3f} at step {drift_step_name} exceeds FALLBACK_DROP ({FALLBACK_DROP})."
                )
        else:
            if n == 0:
                explanation = "Empty trace — no steps executed."
            else:
                min_sim = min(curve) if curve else 1.0
                explanation = (
                    f"No significant similarity drop detected across all {n} step(s) "
                    f"(min similarity {min_sim:.2f}, threshold {MIN_DROP}). "
                    f"No forbidden action types used. Trace classified as on-task."
                )

        # 8. Build StepModel list
        step_models: List[StepModel] = []
        for idx, s in enumerate(steps):
            score = float(curve[idx]) if idx < len(curve) else 0.0
            step_models.append(
                StepModel(
                    stepId=loaded_trace.step_id_map.get(s.step_id, str(s.step_id)),
                    action=s.action_type or "unknown",
                    reasoning=s.agent_reasoning or "",
                    tool_input=s.tool_input or "",
                    tool_output=s.tool_output or "",
                    similarityScore=round(score, 4),
                )
            )

        # 9. Assemble full DetectionModel
        breakpoint_step_label = (
            loaded_trace.step_id_map.get(steps[pelt_idx].step_id, str(steps[pelt_idx].step_id))
            if pelt_idx is not None and pelt_idx < n
            else None
        )

        pelt_model = PeltResultModel(
            breakpointIndex=pelt_idx,
            breakpointStepId=breakpoint_step_label,
            similarityBefore=round(sim_before, 4) if sim_before is not None else None,
            similarityAfter=round(sim_after, 4) if sim_after is not None else None,
            difference=round(pelt_drop, 4) if pelt_drop is not None else None,
            thresholdUsed=MIN_DROP,
        )

        fallback_model = FallbackResultModel(
            triggered=fallback_triggered,
            reason=fallback_reason,
        )

        scope_model = ScopeResultModel(
            allowedActions=sorted(list(intent.allowed_verbs)),
            forbiddenActions=sorted(list(intent.forbidden_verbs)),
            violations=scope_violation_models,
        )

        detection_model = DetectionModel(
            detectorConfig=DetectorConfigModel(
                peltPenalty=PEN,
                minDrop=MIN_DROP,
                fallbackDrop=FALLBACK_DROP,
            ),
            pelt=pelt_model,
            fallback=fallback_model,
            scope=scope_model,
        )

        audit_model = AuditResultModel(
            isDeviated=is_deviated,
            deviationType=dev_type,
            flaggedStepIds=flagged_step_ids,
            confidence=deviation.confidence,
            explanation=explanation,
        )

        gt_data = loaded_trace.ground_truth
        ground_truth_model = GroundTruthModel(
            isDeviated=gt_data.get("isDeviated", False),
            deviationType=gt_data.get("deviationType"),
            flaggedSteps=gt_data.get("flaggedSteps", []),
            flaggedStepId=gt_data.get("flaggedStepId"),
            annotationExplanation=gt_data.get("annotationExplanation", ""),
            sampleSplit=gt_data.get("sampleSplit") or gt_data.get("sample_split"),
            sample_split=gt_data.get("sample_split") or gt_data.get("sampleSplit"),
            notes=gt_data.get("notes", ""),
        )

        return TraceModel(
            dataNote="REAL ML DETECTOR OUTPUT — Computed via SentenceTransformer MiniLM embeddings & PELT changepoint detection.",
            traceId=loaded_trace.trace_id,
            label=loaded_trace.label,
            groundTruth=ground_truth_model,
            prompt=loaded_trace.prompt,
            steps=step_models,
            detection=detection_model,
            audit=audit_model,
        )


detector_service = DetectorService()
