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


def test_regression_arbitration_drift_at_step_2_scope_at_step_3():
    # 1. Drift at step 2, scope violation at step 3: primary is drift.
    loaded = _normalize_trace_dict(
        {
            "trace_id": "test-arb-1",
            "original_prompt": "Read the documents.",
            "intent": {
                "allowed_actions": ["read"],
                "forbidden_actions": ["delete"],
            },
            "steps": [
                {"step_id": "s1", "action_type": "read", "tool_input": "doc1"},
                {"step_id": "s2", "action_type": "read", "tool_input": "unrelated"},
                {"step_id": "s3", "action_type": "delete", "tool_input": "doc2"},
                {"step_id": "s4", "action_type": "read", "tool_input": "doc3"},
            ],
        },
        default_idx=901,
    )
    service = DetectorService()
    with patch("api.service.embed", return_value=[[1.0, 0.0]]), patch(
        "api.service.similarity_curve", return_value=[0.85, 0.40, 0.38, 0.37]
    ):
        result = service.run_detection(loaded)
    assert result.audit.deviationType == "drift"
    assert result.audit.flaggedStepIds[0] == "s2"
    assert "s3" in result.audit.flaggedStepIds


def test_regression_arbitration_scope_at_step_2_drift_at_step_3():
    # 2. Scope violation at step 2, drift at step 3: primary is scope_creep.
    loaded = _normalize_trace_dict(
        {
            "trace_id": "test-arb-2",
            "original_prompt": "Read the documents.",
            "intent": {
                "allowed_actions": ["read"],
                "forbidden_actions": ["delete"],
            },
            "steps": [
                {"step_id": "s1", "action_type": "read", "tool_input": "doc1"},
                {"step_id": "s2", "action_type": "delete", "tool_input": "doc2"},
                {"step_id": "s3", "action_type": "read", "tool_input": "unrelated"},
                {"step_id": "s4", "action_type": "read", "tool_input": "doc3"},
            ],
        },
        default_idx=902,
    )
    service = DetectorService()
    with patch("api.service.embed", return_value=[[1.0, 0.0]]), patch(
        "api.service.similarity_curve", return_value=[0.86, 0.85, 0.40, 0.38]
    ):
        result = service.run_detection(loaded)
    assert result.audit.deviationType == "scope_creep"
    assert result.audit.flaggedStepIds[0] == "s2"
    assert "s3" in result.audit.flaggedStepIds


def test_regression_arbitration_both_at_step_3_scope_wins():
    # 3. Both at step 3: primary is scope_creep.
    loaded = _normalize_trace_dict(
        {
            "trace_id": "test-arb-3",
            "original_prompt": "Read the documents.",
            "intent": {
                "allowed_actions": ["read"],
                "forbidden_actions": ["delete"],
            },
            "steps": [
                {"step_id": "s1", "action_type": "read", "tool_input": "doc1"},
                {"step_id": "s2", "action_type": "read", "tool_input": "doc2"},
                {"step_id": "s3", "action_type": "delete", "tool_input": "unrelated"},
                {"step_id": "s4", "action_type": "read", "tool_input": "doc3"},
            ],
        },
        default_idx=903,
    )
    service = DetectorService()
    with patch("api.service.embed", return_value=[[1.0, 0.0]]), patch(
        "api.service.similarity_curve", return_value=[0.86, 0.85, 0.40, 0.38]
    ):
        result = service.run_detection(loaded)
    assert result.audit.deviationType == "scope_creep"
    assert result.audit.flaggedStepIds[0] == "s3"


def test_regression_flagged_step_ordering_and_multiple_scope_violations():
    # 4. Multiple scope violations: all relevant flagged IDs are retained.
    # 5. Non-consecutive or string step IDs: flagged IDs follow execution order.
    # 6. The first flagged ID agrees with the primary deviation step ID.
    loaded = _normalize_trace_dict(
        {
            "trace_id": "test-flagged-order",
            "original_prompt": "Read the documents.",
            "intent": {
                "allowed_actions": ["read"],
                "forbidden_actions": ["delete", "send"],
            },
            "steps": [
                {"step_id": "step_99", "action_type": "read", "tool_input": "doc1"},
                {"step_id": "step_02", "action_type": "delete", "tool_input": "doc2"},
                {"step_id": "step_50", "action_type": "read", "tool_input": "doc3"},
                {"step_id": "step_10", "action_type": "send", "tool_input": "email"},
                {"step_id": "step_05", "action_type": "read", "tool_input": "doc4"},
            ],
        },
        default_idx=904,
    )
    service = DetectorService()
    with patch("api.service.embed", return_value=[[1.0, 0.0]]), patch(
        "api.service.similarity_curve", return_value=[0.85, 0.84, 0.83, 0.82, 0.81]
    ):
        result = service.run_detection(loaded)

    assert result.audit.isDeviated is True
    assert result.audit.deviationType == "scope_creep"
    # First flagged ID must agree with primary deviation
    assert result.audit.flaggedStepIds[0] == "step_02"
    # Both scope violations retained
    assert "step_02" in result.audit.flaggedStepIds
    assert "step_10" in result.audit.flaggedStepIds
    # Must follow original execution order: step_02 before step_10 (NOT numeric or alphabetical order)
    assert result.audit.flaggedStepIds == ["step_02", "step_10"]
