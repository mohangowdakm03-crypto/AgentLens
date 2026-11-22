"""Integration tests for the AgentLens FastAPI backend."""

import os
import sys
import pytest
from unittest.mock import patch

# Ensure project root and ml_core are in sys.path
test_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(test_dir)
ml_core_dir = os.path.join(project_root, "ml_core")

for path in [project_root, ml_core_dir]:
    if path not in sys.path:
        sys.path.insert(0, path)

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

# Imports for the current AgentLens repository structure
from api.loader import repository, _normalize_trace_dict
from api.service import detector_service, DetectorService
from api.main import (
    health_check,
    list_traces,
    get_trace_endpoint,
    detect_custom_trace,
    evaluate_dataset,
    get_performance_report,
)
from api.models import DetectRequest
from fastapi import HTTPException


def test_health_endpoint():
    res = health_check()

    assert res.status == "healthy"
    assert res.ml_core_available is True
    assert res.trace_count == 300


def test_list_traces_endpoint():
    traces = list_traces()

    assert len(traces) == 300

    trace_ids = [t.traceId for t in traces]

    assert "al_trace_001" in trace_ids
    assert "al_trace_300" in trace_ids


def test_drift_trace_detection():
    # al_trace_006 is a semantic drift trace
    trace = get_trace_endpoint("al_trace_006")

    assert trace.traceId == "al_trace_006"
    assert len(trace.steps) == 4
    assert trace.audit.isDeviated is True
    assert trace.audit.deviationType == "drift"

    for step in trace.steps:
        assert -1.0 <= step.similarityScore <= 1.0

    assert len(trace.audit.flaggedStepIds) > 0


def test_scope_violation_trace():
    # al_trace_007 contains forbidden actions
    trace = get_trace_endpoint("al_trace_007")

    assert trace.traceId == "al_trace_007"
    assert trace.audit.isDeviated is True
    assert len(trace.detection.scope.violations) > 0


def test_api_reports_two_point_core_fallback_consistently():
    """API diagnostics must use the ML Core's two-point fallback result."""

    loaded = _normalize_trace_dict(
        {
            "trace_id": "two-point-fallback",
            "original_prompt": "Read the supplied document.",
            "intent": {
                "allowed_actions": ["read", "search"],
                "forbidden_actions": [],
            },
            "steps": [
                {
                    "step_id": 1,
                    "action_type": "read",
                    "tool_input": "supplied document",
                },
                {
                    "step_id": 2,
                    "action_type": "search",
                    "tool_input": "unrelated topic",
                },
            ],
        },
        default_idx=999,
    )

    service = DetectorService()

    with patch(
        "api.service.embed",
        return_value=[[1.0, 0.0]],
    ), patch(
        "api.service.similarity_curve",
        return_value=[0.9, 0.3],
    ):
        result = service.run_detection(loaded)

    assert result.audit.deviationType == "drift"
    assert result.audit.flaggedStepIds == ["2"]
    assert result.detection.pelt.breakpointIndex is None
    assert result.detection.fallback.triggered is True
    assert "step 2" in result.detection.fallback.reason
    assert "Fallback triggered" in result.audit.explanation


def test_on_task_normal_trace():
    # al_trace_001 is a compliant read-only trace
    trace = get_trace_endpoint("al_trace_001")

    assert trace.traceId == "al_trace_001"
    assert trace.audit.isDeviated is False
    assert trace.audit.deviationType is None
    assert len(trace.detection.scope.violations) == 0


def test_ground_truth_separation():
    # Ground truth is separate from detector predictions
    trace = get_trace_endpoint("al_trace_006")

    assert hasattr(trace, "groundTruth")
    assert trace.groundTruth.isDeviated is True
    assert trace.groundTruth.deviationType == "drift"
    assert trace.groundTruth.flaggedSteps == [3, 4]
    assert trace.groundTruth.flaggedStepId == 3

    loaded = repository.get_trace("al_trace_006")
    intent = loaded.create_intent()

    assert not hasattr(intent, "expected_type")
    assert not hasattr(intent, "ground_truth")
    assert not hasattr(intent, "has_deviation")


def test_invalid_trace_404():
    with pytest.raises(HTTPException) as exc_info:
        get_trace_endpoint("non-existent-trace-99999")

    assert exc_info.value.status_code == 404


def test_detect_custom_trace_empty_prompt_400():
    request = DetectRequest(prompt="", steps=[])

    with pytest.raises(HTTPException) as exc_info:
        detect_custom_trace(request)

    assert exc_info.value.status_code == 400


def test_evaluate_and_performance_endpoints_return_real_metrics():
    # Default evaluation uses the test split
    result = evaluate_dataset(refresh=True)

    assert result["available"] is True
    assert result["evaluation_split"] == "test"
    assert result["dataset_count"] == 300
    assert result["evaluated_count"] == 28
    assert result["skipped_count"] == 272
    assert result["excluded_count"] == 272

    assert result["split_class_distribution"] == {
        "none": 14,
        "drift": 3,
        "scope_creep": 11,
        "misinterpretation": 0,
    }

    assert result["confusion_matrix"]["labels"] == [
        "none",
        "drift",
        "scope_creep",
        "misinterpretation",
    ]

    assert result["confusion_matrix"]["total"] == 28

    assert set(result["per_class"].keys()) == {
        "none",
        "drift",
        "scope_creep",
        "misinterpretation",
    }

    assert result["trace_level"]["total"] == 28
    assert len(result["per_trace"]) == 28

    assert result["known_limitations"][
        "short_drift_traces_lt_3_steps"
    ]["count"] == 2

    assert result["known_limitations"][
        "resource_scoped_permission_cases"
    ]["count"] == 4

    assert result["known_limitations"][
        "misinterpretation_unsupported"
    ]["count"] == 0

    assert result["known_limitations"][
        "action_vocabulary_mismatch_al_trace_033"
    ]["count"] == 0

    # Performance endpoint must use the same evaluation results
    performance = get_performance_report(refresh=False)

    assert performance["evaluated_count"] == 28
    assert performance["evaluation_split"] == "test"
    assert performance["trace_level"] == result["trace_level"]

    # Review-only records must not enter evaluation
    with pytest.raises(HTTPException) as exc_info:
        evaluate_dataset(
            refresh=True,
            split="sample_review_only",
        )

    assert exc_info.value.status_code == 400

    # Invalid split must be rejected
    with pytest.raises(HTTPException) as exc_info:
        evaluate_dataset(
            refresh=True,
            split="non_existent_split",
        )

    assert exc_info.value.status_code == 400