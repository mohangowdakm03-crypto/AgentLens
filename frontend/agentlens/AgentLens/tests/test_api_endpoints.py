"""Integration tests for the AgentLens FastAPI backend."""
import os
import sys
import pytest

# Ensure project root, detector, and ml_core are in sys.path
test_dir = os.path.dirname(os.path.abspath(__file__))
detector_dir = os.path.dirname(test_dir)
project_root = os.path.dirname(detector_dir)
ml_core_dir = os.path.join(detector_dir, "ml_core")

for p in [project_root, detector_dir, ml_core_dir]:
    if p not in sys.path:
        sys.path.insert(0, p)

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

from detector.api.loader import repository
from detector.api.service import detector_service
from detector.api.main import (
    health_check,
    list_traces,
    get_trace_endpoint,
    detect_custom_trace,
    evaluate_dataset,
    get_performance_report,
)
from detector.api.models import DetectRequest
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
    # al_trace_006 is a 4-step semantic drift trace in the 300-record dataset
    t = get_trace_endpoint("al_trace_006")
    assert t.traceId == "al_trace_006"
    assert len(t.steps) == 4
    assert t.audit.isDeviated is True
    assert t.audit.deviationType == "drift"
    for s in t.steps:
        assert -1.0 <= s.similarityScore <= 1.0
    assert len(t.audit.flaggedStepIds) > 0


def test_scope_violation_trace():
    # al_trace_007 has forbidden actions outside read-only permissions
    t = get_trace_endpoint("al_trace_007")
    assert t.traceId == "al_trace_007"
    assert t.audit.isDeviated is True
    assert t.audit.deviationType == "scope_creep"
    assert len(t.detection.scope.violations) > 0


def test_on_task_normal_trace():
    # al_trace_001 is a 3-step compliant read-only trace
    t = get_trace_endpoint("al_trace_001")
    assert t.traceId == "al_trace_001"
    assert t.audit.isDeviated is False
    assert t.audit.deviationType is None
    assert len(t.detection.scope.violations) == 0


def test_ground_truth_separation():
    # Ground truth is exposed for inspector display, never leaked into prediction inputs
    t = get_trace_endpoint("al_trace_006")
    assert hasattr(t, "groundTruth")
    assert t.groundTruth.isDeviated is True
    assert t.groundTruth.deviationType == "drift"
    assert t.groundTruth.flaggedSteps == [3, 4]
    assert t.groundTruth.flaggedStepId == 3
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
    req = DetectRequest(prompt="", steps=[])
    with pytest.raises(HTTPException) as exc_info:
        detect_custom_trace(req)
    assert exc_info.value.status_code == 400


def test_evaluate_and_performance_endpoints_return_real_metrics():
    res = evaluate_dataset(refresh=False)
    assert res["available"] is True
    assert res["dataset_count"] == 300
    assert res["evaluated_count"] == 300
    assert res["skipped_count"] == 0
    assert res["confusion_matrix"]["labels"] == ["none", "drift", "scope_creep", "misinterpretation"]
    assert res["confusion_matrix"]["total"] == 300
    assert set(res["per_class"].keys()) == {"none", "drift", "scope_creep", "misinterpretation"}
    assert res["trace_level"]["total"] == 300
    assert res["step_level"]["total_steps"] == 798
    assert len(res["per_trace"]) == 300
    assert res["known_limitations"]["short_drift_traces_lt_3_steps"]["count"] == 16
    assert res["known_limitations"]["resource_scoped_permission_cases"]["count"] == 51
    assert res["known_limitations"]["misinterpretation_unsupported"]["count"] == 5
    assert res["known_limitations"]["action_vocabulary_mismatch_al_trace_033"]["count"] == 1

    perf = get_performance_report(refresh=False)
    assert perf["evaluated_count"] == 300
    assert perf["trace_level"] == res["trace_level"]
