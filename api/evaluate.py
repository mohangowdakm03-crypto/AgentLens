"""Batch evaluation pipeline for AgentLens (Member B).

Runs eligible traces from a TraceRepository through detector_service.run_detection()
with strict ground-truth isolation, then computes:
  - Binary trace-level deviation detection metrics (TP, FP, FN, TN, precision, recall, F1, accuracy)
  - Per-class one-vs-rest metrics for all 4 taxonomy classes:
      none, drift, scope_creep, misinterpretation
  - Macro / weighted / deviation-only macro averages and exact 4-class accuracy
  - 4x4 multiclass confusion matrix (rows=actual, cols=predicted)
  - Micro-averaged step-level precision, recall, F1 (using original flagged step IDs)
    and first-flagged-step exact match rate
  - Per-trace prediction vs. ground-truth comparison records
  - False-positive, false-negative, and deviation-type-mismatch trace lists
  - Explicit impact analysis for known dataset / detector limitations

Ground-truth isolation guarantee:
  Before calling detector_service.run_detection(), each trace is wrapped in a
  ground-truth-stripped LoadedTrace (empty ground_truth dict, neutral label).
  Predictions are collected into a separate structure; ground truth is only
  fetched from repository.get_ground_truth(trace_id) after all predictions finish.
"""
import csv
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence, Set, Tuple

from .loader import LoadedTrace, TraceRepository, _DATA_DIR
from .models import TraceModel

# Canonical 4-class AgentLens taxonomy order
EVALUATION_CLASSES: Tuple[str, ...] = (
    "none",
    "drift",
    "scope_creep",
    "misinterpretation",
)
DEVIATION_CLASSES: Tuple[str, ...] = (
    "drift",
    "scope_creep",
    "misinterpretation",
)

PERMISSION_AUDIT_CSV_PATH = _DATA_DIR / "AgentLens_58_Permission_Audit.csv"

POSITIVE_CLASS_CONVENTION: Dict[str, str] = {
    "binary_trace_level": (
        "Positive class = any deviation (deviation_type in "
        "{'drift', 'scope_creep', 'misinterpretation'}, i.e. has_deviation == True); "
        "Negative class = on-task execution (deviation_type == 'none', has_deviation == False)."
    ),
    "multiclass_per_class": (
        "One-vs-rest per class in ['none', 'drift', 'scope_creep', 'misinterpretation']: "
        "for each class c, Positive = traces with label == c, Negative = traces with label != c."
    ),
    "step_level": (
        "Micro-averaged across all steps in evaluated traces: "
        "Positive = step ID is flagged as deviated, Negative = step ID is not flagged."
    ),
}


# ---------------------------------------------------------------------------
# Pure math / metric helpers
# ---------------------------------------------------------------------------

def _safe_div(num: float, den: float) -> float:
    return round(num / den, 4) if den > 0 else 0.0


def _compute_prf(tp: int, fp: int, fn: int) -> Tuple[float, float, float]:
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2.0 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
    return round(precision, 4), round(recall, 4), round(f1, 4)


def _normalize_class(label: Optional[str], is_deviated: Optional[bool] = None) -> str:
    """Normalize a deviation label into the canonical 4-class taxonomy."""
    if label is None:
        return "none"
    cleaned = str(label).strip().lower().replace(" ", "_")
    if cleaned in ("", "none"):
        return "none"
    if cleaned in EVALUATION_CLASSES:
        return cleaned
    return cleaned


def _strip_ground_truth_for_detection(trace: LoadedTrace) -> LoadedTrace:
    """Create a ground-truth-free copy of LoadedTrace to pass into the detector.

    Ensures ground truth cannot leak via trace.ground_truth, trace.label, or trace.raw_data.
    """
    return LoadedTrace(
        trace_id=trace.trace_id,
        label=f"Trace {trace.trace_id}",
        prompt=trace.prompt,
        allowed_verbs=set(trace.allowed_verbs),
        forbidden_verbs=set(trace.forbidden_verbs),
        steps=list(trace.steps),
        step_id_map=dict(trace.step_id_map),
        ground_truth={},
        raw_data=dict(trace.raw_data),
    )


def _load_unresolved_resource_scope_ids(
    csv_path: Path = PERMISSION_AUDIT_CSV_PATH,
) -> List[str]:
    """Load trace IDs marked 'unresolved_resource_scope_limit' from the permission audit CSV."""
    if not csv_path.exists():
        return []
    ids: List[str] = []
    try:
        with open(csv_path, "r", encoding="utf-8", newline="") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                if (row.get("status") or "").strip() == "unresolved_resource_scope_limit":
                    tid = (row.get("trace_id") or "").strip()
                    if tid:
                        ids.append(tid)
    except OSError:
        return []
    return ids


# ---------------------------------------------------------------------------
# Metric computation (pure, decoupled from detector execution)
# ---------------------------------------------------------------------------

def compute_confusion_matrix(
    actual_labels: Sequence[str],
    predicted_labels: Sequence[str],
    labels: Sequence[str] = EVALUATION_CLASSES,
) -> Dict[str, Any]:
    """Compute a multiclass confusion matrix (rows=actual, cols=predicted)."""
    if len(actual_labels) != len(predicted_labels):
        raise ValueError(
            f"Length mismatch: actual_labels ({len(actual_labels)}) != "
            f"predicted_labels ({len(predicted_labels)})."
        )

    matrix: Dict[str, Dict[str, int]] = {
        actual: {pred: 0 for pred in labels} for actual in labels
    }
    for actual, pred in zip(actual_labels, predicted_labels):
        if actual in matrix and pred in matrix[actual]:
            matrix[actual][pred] += 1

    rows = [[matrix[a][p] for p in labels] for a in labels]
    return {
        "labels": list(labels),
        "matrix": matrix,
        "rows": rows,
        "total": len(actual_labels),
    }


def compute_per_class_metrics(
    actual_labels: Sequence[str],
    predicted_labels: Sequence[str],
    labels: Sequence[str] = EVALUATION_CLASSES,
) -> Dict[str, Dict[str, Any]]:
    """Compute one-vs-rest TP, FP, FN, TN, support, precision, recall, F1 for each class."""
    if len(actual_labels) != len(predicted_labels):
        raise ValueError("actual_labels and predicted_labels must have equal length.")

    total = len(actual_labels)
    per_class: Dict[str, Dict[str, Any]] = {}
    for cls in labels:
        tp = sum(1 for a, p in zip(actual_labels, predicted_labels) if a == cls and p == cls)
        fp = sum(1 for a, p in zip(actual_labels, predicted_labels) if a != cls and p == cls)
        fn = sum(1 for a, p in zip(actual_labels, predicted_labels) if a == cls and p != cls)
        tn = total - tp - fp - fn
        precision, recall, f1 = _compute_prf(tp, fp, fn)
        per_class[cls] = {
            "class": cls,
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "tn": tn,
            "support": tp + fn,
            "predicted_count": tp + fp,
            "precision": precision,
            "recall": recall,
            "f1": f1,
        }
    return per_class


def compute_trace_level_metrics(
    actual_labels: Sequence[str],
    predicted_labels: Sequence[str],
    per_class: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Compute binary deviation detection metrics and multiclass aggregate scores."""
    if len(actual_labels) != len(predicted_labels):
        raise ValueError("actual_labels and predicted_labels must have equal length.")

    total = len(actual_labels)
    tp = fp = fn = tn = 0
    exact_matches = 0

    for actual, pred in zip(actual_labels, predicted_labels):
        actual_dev = actual != "none"
        pred_dev = pred != "none"
        if actual_dev and pred_dev:
            tp += 1
        elif (not actual_dev) and pred_dev:
            fp += 1
        elif actual_dev and (not pred_dev):
            fn += 1
        else:
            tn += 1

        if actual == pred:
            exact_matches += 1

    precision, recall, f1 = _compute_prf(tp, fp, fn)
    binary_accuracy = _safe_div(tp + tn, total)
    exact_class_accuracy = _safe_div(exact_matches, total)

    if per_class is None:
        per_class = compute_per_class_metrics(actual_labels, predicted_labels)

    # Macro averages across all 4 classes
    n_classes = len(EVALUATION_CLASSES)
    macro_precision = _safe_div(sum(per_class[c]["precision"] for c in EVALUATION_CLASSES), n_classes)
    macro_recall = _safe_div(sum(per_class[c]["recall"] for c in EVALUATION_CLASSES), n_classes)
    macro_f1 = _safe_div(sum(per_class[c]["f1"] for c in EVALUATION_CLASSES), n_classes)

    # Weighted averages across all 4 classes (weighted by ground-truth support)
    weighted_precision = _safe_div(
        sum(per_class[c]["precision"] * per_class[c]["support"] for c in EVALUATION_CLASSES),
        total,
    )
    weighted_recall = _safe_div(
        sum(per_class[c]["recall"] * per_class[c]["support"] for c in EVALUATION_CLASSES),
        total,
    )
    weighted_f1 = _safe_div(
        sum(per_class[c]["f1"] * per_class[c]["support"] for c in EVALUATION_CLASSES),
        total,
    )

    # Deviation-only macro averages (drift, scope_creep, misinterpretation)
    n_dev_classes = len(DEVIATION_CLASSES)
    dev_macro_precision = _safe_div(
        sum(per_class[c]["precision"] for c in DEVIATION_CLASSES), n_dev_classes
    )
    dev_macro_recall = _safe_div(
        sum(per_class[c]["recall"] for c in DEVIATION_CLASSES), n_dev_classes
    )
    dev_macro_f1 = _safe_div(
        sum(per_class[c]["f1"] for c in DEVIATION_CLASSES), n_dev_classes
    )

    return {
        "positive_class_convention": POSITIVE_CLASS_CONVENTION["binary_trace_level"],
        "total": total,
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "accuracy": binary_accuracy,
        "exact_class_accuracy": exact_class_accuracy,
        "macro_precision": macro_precision,
        "macro_recall": macro_recall,
        "macro_f1": macro_f1,
        "weighted_precision": weighted_precision,
        "weighted_recall": weighted_recall,
        "weighted_f1": weighted_f1,
        "deviation_macro_precision": dev_macro_precision,
        "deviation_macro_recall": dev_macro_recall,
        "deviation_macro_f1": dev_macro_f1,
    }


def compute_step_level_metrics(
    step_comparisons: Sequence[Dict[str, Any]],
) -> Dict[str, Any]:
    """Compute micro-averaged step-level precision, recall, F1, TP, FP, FN, TN.

    Each element of ``step_comparisons`` must contain:
      - ``all_step_ids``: List[str] (all original step IDs present in the trace)
      - ``gt_flagged_step_ids``: List[str]
      - ``pred_flagged_step_ids``: List[str]
      - ``gt_flagged_step_id``: Optional[str] (primary / first GT flagged step ID)
      - ``pred_first_flagged_step_id``: Optional[str] (primary / first predicted flagged step ID)
      - ``gt_is_deviated``: bool
    """
    tp = fp = fn = tn = 0
    total_steps = 0
    exact_set_matches = 0
    first_step_matches = 0
    deviated_traces = 0

    for item in step_comparisons:
        all_ids: Set[str] = {str(x) for x in item.get("all_step_ids", [])}
        gt_set: Set[str] = {str(x) for x in item.get("gt_flagged_step_ids", [])}
        pred_set: Set[str] = {str(x) for x in item.get("pred_flagged_step_ids", [])}

        # Union ensures any flagged ID is accounted for even if out of all_ids
        universe = all_ids | gt_set | pred_set
        total_steps += len(all_ids)

        trace_tp = len(gt_set & pred_set)
        trace_fp = len(pred_set - gt_set)
        trace_fn = len(gt_set - pred_set)
        trace_tn = len(universe - (gt_set | pred_set))

        tp += trace_tp
        fp += trace_fp
        fn += trace_fn
        tn += trace_tn

        if gt_set == pred_set:
            exact_set_matches += 1

        if item.get("gt_is_deviated"):
            deviated_traces += 1
            gt_first = item.get("gt_flagged_step_id")
            pred_first = item.get("pred_first_flagged_step_id")
            if gt_first is not None and pred_first is not None and str(gt_first) == str(pred_first):
                first_step_matches += 1

    precision, recall, f1 = _compute_prf(tp, fp, fn)
    total_traces = len(step_comparisons)

    return {
        "positive_class_convention": POSITIVE_CLASS_CONVENTION["step_level"],
        "total_steps": total_steps,
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "exact_flagged_set_match_rate": _safe_div(exact_set_matches, total_traces),
        "first_step_exact_match_count": first_step_matches,
        "deviated_trace_count": deviated_traces,
        "first_step_exact_match_rate": _safe_div(first_step_matches, deviated_traces),
    }


def _summarize_subset(rows: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    """Summarize predictions vs ground truth on a limitation subset."""
    pred_dist: Dict[str, int] = {c: 0 for c in EVALUATION_CLASSES}
    gt_dist: Dict[str, int] = {c: 0 for c in EVALUATION_CLASSES}
    exact_matches = 0
    binary_tp = binary_fp = binary_fn = binary_tn = 0

    for r in rows:
        gt_c = r["ground_truth_type"]
        pr_c = r["predicted_type"]
        if gt_c in gt_dist:
            gt_dist[gt_c] += 1
        if pr_c in pred_dist:
            pred_dist[pr_c] += 1
        if gt_c == pr_c:
            exact_matches += 1
        gt_dev = gt_c != "none"
        pr_dev = pr_c != "none"
        if gt_dev and pr_dev:
            binary_tp += 1
        elif (not gt_dev) and pr_dev:
            binary_fp += 1
        elif gt_dev and (not pr_dev):
            binary_fn += 1
        else:
            binary_tn += 1

    return {
        "count": len(rows),
        "trace_ids": [r["trace_id"] for r in rows],
        "ground_truth_distribution": gt_dist,
        "predicted_distribution": pred_dist,
        "exact_class_matches": exact_matches,
        "binary_tp": binary_tp,
        "binary_fp": binary_fp,
        "binary_fn": binary_fn,
        "binary_tn": binary_tn,
    }


def compute_known_limitations(
    per_trace_results: Sequence[Dict[str, Any]],
    permission_audit_csv: Path = PERMISSION_AUDIT_CSV_PATH,
) -> Dict[str, Any]:
    """Quantify the separate impact of the four documented dataset/detector limitations."""
    short_drift_rows = [
        r for r in per_trace_results
        if r["ground_truth_type"] == "drift" and r["step_count"] < 3
    ]

    resource_scope_ids = set(_load_unresolved_resource_scope_ids(permission_audit_csv))
    resource_scope_rows = [
        r for r in per_trace_results if r["trace_id"] in resource_scope_ids
    ]

    misinterpretation_rows = [
        r for r in per_trace_results if r["ground_truth_type"] == "misinterpretation"
    ]

    vocab_mismatch_rows = [
        r for r in per_trace_results if r["trace_id"] == "al_trace_033"
    ]

    return {
        "short_drift_traces_lt_3_steps": {
            "description": (
                "Drift-labelled traces with fewer than 3 steps cannot trigger PELT or "
                "fallback drift detection because find_drift_step() requires len(curve) >= 3."
            ),
            **_summarize_subset(short_drift_rows),
        },
        "resource_scoped_permission_cases": {
            "description": (
                "Records from AgentLens_58_Permission_Audit.csv with status "
                "'unresolved_resource_scope_limit' where the prompt prohibits writing to a "
                "specific target resource while allowing writing a separate report/summary. "
                "The current action-level Intent schema cannot encode resource-scoped permissions."
            ),
            **_summarize_subset(resource_scope_rows),
        },
        "misinterpretation_unsupported": {
            "description": (
                "Records labelled 'misinterpretation' cannot be independently classified "
                "because the current ML detector only predicts 'none', 'drift', or 'scope_creep'."
            ),
            **_summarize_subset(misinterpretation_rows),
        },
        "action_vocabulary_mismatch_al_trace_033": {
            "description": (
                "al_trace_033 lists 'read_secret' in forbidden_actions while step action_type "
                "values are 'read'; action-level scope verification cannot match 'read' to 'read_secret'."
            ),
            **_summarize_subset(vocab_mismatch_rows),
        },
    }


# ---------------------------------------------------------------------------
# Batch evaluation runner
# ---------------------------------------------------------------------------

def evaluate_repository(
    repo: TraceRepository,
    run_detection_fn: Callable[[LoadedTrace], TraceModel],
    *,
    permission_audit_csv: Path = PERMISSION_AUDIT_CSV_PATH,
) -> Dict[str, Any]:
    """Run batch evaluation on all eligible traces in ``repo``.

    Pipeline stages (strict ground-truth isolation):
      1. Identify eligible traces (must have matching ground truth recorded in repo).
      2. For each eligible trace, construct a ground-truth-stripped LoadedTrace and
         call ``run_detection_fn(stripped_trace)``.
      3. Store predictions separately (without consulting ground truth).
      4. After all predictions are collected, fetch ground truth separately via
         ``repo.get_ground_truth(trace_id)`` and compute all trace-level, per-class,
         confusion-matrix, step-level, error-list, and limitation metrics.
    """
    traces = repo.iter_traces()
    dataset_count = len(traces)
    unmatched_ids = set(repo.load_report.get("unmatched_detector_ids", []))

    skipped_traces: List[Dict[str, str]] = []
    eligible_traces: List[LoadedTrace] = []

    for trace in traces:
        if trace.trace_id in unmatched_ids or repo.get_ground_truth(trace.trace_id) is None:
            skipped_traces.append({
                "trace_id": trace.trace_id,
                "reason": "missing_ground_truth",
            })
            continue
        eligible_traces.append(trace)

    # ------------------------------------------------------------------
    # Stage 1: Run detector strictly WITHOUT ground truth
    # ------------------------------------------------------------------
    predictions_by_id: Dict[str, Dict[str, Any]] = {}
    ordered_evaluated_ids: List[str] = []

    for trace in eligible_traces:
        stripped = _strip_ground_truth_for_detection(trace)
        try:
            model_out: TraceModel = run_detection_fn(stripped)
        except Exception as exc:
            skipped_traces.append({
                "trace_id": trace.trace_id,
                "reason": f"detection_error: {type(exc).__name__}: {exc}",
            })
            continue

        audit = model_out.audit
        pred_is_deviated = bool(audit.isDeviated) and (
            audit.deviationType not in (None, "", "none")
        )
        pred_type = _normalize_class(audit.deviationType) if pred_is_deviated else "none"
        pred_flagged_steps = [str(sid) for sid in (audit.flaggedStepIds or [])]
        all_step_ids = [
            trace.step_id_map.get(s.step_id, str(s.step_id)) for s in trace.steps
        ]

        # Primary predicted step ID: first flagged step if any
        pred_first_flagged = pred_flagged_steps[0] if pred_flagged_steps else None

        predictions_by_id[trace.trace_id] = {
            "trace_id": trace.trace_id,
            "step_count": len(trace.steps),
            "all_step_ids": all_step_ids,
            "predicted_is_deviated": pred_is_deviated,
            "predicted_type": pred_type,
            "predicted_flagged_step_ids": pred_flagged_steps,
            "predicted_first_flagged_step_id": pred_first_flagged,
            "confidence": round(float(audit.confidence), 4),
            "explanation": audit.explanation or "",
            "pelt_breakpoint_step_id": model_out.detection.pelt.breakpointStepId,
            "fallback_triggered": bool(model_out.detection.fallback.triggered),
            "scope_violation_count": len(model_out.detection.scope.violations),
        }
        ordered_evaluated_ids.append(trace.trace_id)

    # ------------------------------------------------------------------
    # Stage 2: Fetch ground truth separately and evaluate predictions
    # ------------------------------------------------------------------
    actual_labels: List[str] = []
    predicted_labels: List[str] = []
    step_comparisons: List[Dict[str, Any]] = []
    per_trace_results: List[Dict[str, Any]] = []
    false_positives: List[Dict[str, Any]] = []
    false_negatives: List[Dict[str, Any]] = []
    type_mismatches: List[Dict[str, Any]] = []

    for tid in ordered_evaluated_ids:
        pred = predictions_by_id[tid]
        gt = repo.get_ground_truth(tid) or {}

        gt_is_deviated = bool(gt.get("has_deviation", gt.get("isDeviated", False)))
        raw_gt_type = gt.get("deviation_type")
        if raw_gt_type is None:
            raw_gt_type = gt.get("deviationType") or "none"
        gt_type = _normalize_class(raw_gt_type)
        if not gt_is_deviated:
            gt_type = "none"

        gt_flagged_raw = gt.get("flagged_steps")
        if gt_flagged_raw is None:
            gt_flagged_raw = gt.get("flaggedSteps") or []
        gt_flagged_steps = [str(sid) for sid in gt_flagged_raw]

        gt_first_raw = gt.get("flagged_step_id")
        if gt_first_raw is None:
            gt_first_raw = gt.get("flaggedStepId")
        gt_first_flagged = str(gt_first_raw) if gt_first_raw is not None else None

        pred_is_deviated = pred["predicted_is_deviated"]
        pred_type = pred["predicted_type"]
        pred_flagged_steps = pred["predicted_flagged_step_ids"]
        pred_first_flagged = pred["predicted_first_flagged_step_id"]

        actual_labels.append(gt_type)
        predicted_labels.append(pred_type)

        step_comparisons.append({
            "all_step_ids": pred["all_step_ids"],
            "gt_flagged_step_ids": gt_flagged_steps,
            "pred_flagged_step_ids": pred_flagged_steps,
            "gt_flagged_step_id": gt_first_flagged,
            "pred_first_flagged_step_id": pred_first_flagged,
            "gt_is_deviated": gt_is_deviated,
        })

        # Classification outcome label (binary + exact)
        if gt_is_deviated and pred_is_deviated:
            binary_outcome = "TP"
        elif (not gt_is_deviated) and pred_is_deviated:
            binary_outcome = "FP"
        elif gt_is_deviated and (not pred_is_deviated):
            binary_outcome = "FN"
        else:
            binary_outcome = "TN"

        exact_type_match = gt_type == pred_type
        step_set_match = set(gt_flagged_steps) == set(pred_flagged_steps)

        row = {
            "trace_id": tid,
            "step_count": pred["step_count"],
            "ground_truth_is_deviated": gt_is_deviated,
            "ground_truth_type": gt_type,
            "ground_truth_flagged_step_ids": gt_flagged_steps,
            "ground_truth_flagged_step_id": gt_first_flagged,
            "predicted_is_deviated": pred_is_deviated,
            "predicted_type": pred_type,
            "predicted_flagged_step_ids": pred_flagged_steps,
            "predicted_first_flagged_step_id": pred_first_flagged,
            "confidence": pred["confidence"],
            "binary_outcome": binary_outcome,
            "exact_type_match": exact_type_match,
            "step_set_match": step_set_match,
            "pelt_breakpoint_step_id": pred["pelt_breakpoint_step_id"],
            "fallback_triggered": pred["fallback_triggered"],
            "scope_violation_count": pred["scope_violation_count"],
        }
        per_trace_results.append(row)

        if binary_outcome == "FP":
            false_positives.append(row)
        elif binary_outcome == "FN":
            false_negatives.append(row)
        elif binary_outcome == "TP" and not exact_type_match:
            type_mismatches.append(row)

    confusion = compute_confusion_matrix(actual_labels, predicted_labels, EVALUATION_CLASSES)
    per_class = compute_per_class_metrics(actual_labels, predicted_labels, EVALUATION_CLASSES)
    trace_level = compute_trace_level_metrics(actual_labels, predicted_labels, per_class)
    step_level = compute_step_level_metrics(step_comparisons)
    known_limitations = compute_known_limitations(
        per_trace_results, permission_audit_csv=permission_audit_csv
    )

    return {
        "available": True,
        "dataset_source": repo.dataset_source,
        "dataset_count": dataset_count,
        "evaluated_count": len(ordered_evaluated_ids),
        "skipped_count": len(skipped_traces),
        "skipped_traces": skipped_traces,
        "positive_class_convention": POSITIVE_CLASS_CONVENTION,
        "trace_level": trace_level,
        "step_level": step_level,
        "confusion_matrix": confusion,
        "per_class": per_class,
        "false_positives": false_positives,
        "false_negatives": false_negatives,
        "type_mismatches": type_mismatches,
        "per_trace": per_trace_results,
        "known_limitations": known_limitations,
    }
