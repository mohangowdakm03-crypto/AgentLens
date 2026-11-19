"""Unit and fixture tests for the AgentLens batch evaluation pipeline (api/evaluate.py)."""
import json
from pathlib import Path
import sys
from unittest.mock import MagicMock

import pytest

# Ensure detector/ and detector/ml_core/ are importable regardless of CWD
_TEST_DIR = Path(__file__).resolve().parent
_DETECTOR_DIR = _TEST_DIR.parent
_ML_CORE_DIR = _DETECTOR_DIR / "ml_core"

for _p in (str(_DETECTOR_DIR), str(_ML_CORE_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from api.evaluate import (
    EVALUATION_CLASSES,
    POSITIVE_CLASS_CONVENTION,
    compute_confusion_matrix,
    compute_known_limitations,
    compute_per_class_metrics,
    compute_step_level_metrics,
    compute_trace_level_metrics,
    evaluate_repository,
)
from api.loader import LoadedTrace, TraceRepository
from api.models import (
    AuditResultModel,
    DetectionModel,
    FallbackResultModel,
    GroundTruthModel,
    PeltResultModel,
    ScopeResultModel,
    ScopeViolationModel,
    StepModel,
    TraceModel,
)


def _write_jsonl(path: Path, records: list) -> None:
    path.write_text(
        "\n".join(json.dumps(r) for r in records) + "\n",
        encoding="utf-8",
    )


def _make_detector_record(trace_id: str, steps: list, allowed=None, forbidden=None) -> dict:
    return {
        "trace_id": trace_id,
        "original_prompt": f"Perform read-only inspection for {trace_id}.",
        "intent": {
            "allowed_actions": allowed if allowed is not None else ["read"],
            "forbidden_actions": forbidden if forbidden is not None else ["write", "delete"],
        },
        "steps": steps,
    }


def _make_gt_record(
    trace_id: str,
    steps: list,
    has_deviation: bool,
    deviation_type: str,
    flagged_steps: list,
    flagged_step_id,
    allowed=None,
    forbidden=None,
    sample_split="test",
) -> dict:
    rec = _make_detector_record(trace_id, steps, allowed=allowed, forbidden=forbidden)
    if sample_split is not None:
        rec["sample_split"] = sample_split
    rec["ground_truth"] = {
        "has_deviation": has_deviation,
        "deviation_detected": has_deviation,
        "deviation_type": deviation_type,
        "flagged_steps": flagged_steps,
        "flagged_step_id": flagged_step_id,
        "annotation_explanation": f"Annotated as {deviation_type}.",
        "explanation": None,
        "trigger_phrase": None,
        "label_source": "manual_rule_based",
        "sample_split": sample_split,
    }
    return rec


def _make_trace_model(
    loaded: LoadedTrace,
    is_deviated: bool,
    deviation_type,
    flagged_step_ids: list,
    confidence: float = 0.85,
) -> TraceModel:
    return TraceModel(
        traceId=loaded.trace_id,
        label=loaded.label,
        groundTruth=GroundTruthModel(isDeviated=False, deviationType=None, notes=""),
        prompt=loaded.prompt,
        steps=[
            StepModel(
                stepId=loaded.step_id_map.get(s.step_id, str(s.step_id)),
                action=s.action_type,
                similarityScore=0.5,
            )
            for s in loaded.steps
        ],
        detection=DetectionModel(
            pelt=PeltResultModel(),
            fallback=FallbackResultModel(),
            scope=ScopeResultModel(
                allowedActions=sorted(loaded.allowed_verbs),
                forbiddenActions=sorted(loaded.forbidden_verbs),
                violations=[
                    ScopeViolationModel(stepId=sid, action="write", reason="forbidden")
                    for sid in flagged_step_ids
                ]
                if deviation_type == "scope_creep"
                else [],
            ),
        ),
        audit=AuditResultModel(
            isDeviated=is_deviated,
            deviationType=deviation_type if is_deviated else None,
            flaggedStepIds=[str(x) for x in flagged_step_ids],
            confidence=confidence,
            explanation="test prediction",
        ),
    )


# ---------------------------------------------------------------------------
# 1. Metric calculations
# ---------------------------------------------------------------------------

class TestMetricCalculations:
    def test_trace_level_and_per_class_metrics_exact(self):
        # 6 traces:
        #   0: actual=none, pred=none (TN)
        #   1: actual=none, pred=scope_creep (FP)
        #   2: actual=drift, pred=drift (TP, exact)
        #   3: actual=drift, pred=none (FN)
        #   4: actual=scope_creep, pred=scope_creep (TP, exact)
        #   5: actual=misinterpretation, pred=scope_creep (TP binary, type mismatch)
        actual = ["none", "none", "drift", "drift", "scope_creep", "misinterpretation"]
        pred = ["none", "scope_creep", "drift", "none", "scope_creep", "scope_creep"]

        per_class = compute_per_class_metrics(actual, pred)
        trace = compute_trace_level_metrics(actual, pred, per_class)

        # Binary: TP=3 (indices 2,4,5), FP=1 (index 1), FN=1 (index 3), TN=1 (index 0)
        assert trace["total"] == 6
        assert trace["tp"] == 3
        assert trace["fp"] == 1
        assert trace["fn"] == 1
        assert trace["tn"] == 1
        assert trace["precision"] == pytest.approx(0.75, abs=1e-4)
        assert trace["recall"] == pytest.approx(0.75, abs=1e-4)
        assert trace["f1"] == pytest.approx(0.75, abs=1e-4)
        assert trace["accuracy"] == pytest.approx(4 / 6, abs=1e-4)
        # Exact class matches: indices 0, 2, 4 => 3 / 6 = 0.5
        assert trace["exact_class_accuracy"] == pytest.approx(0.5, abs=1e-4)

        # Per-class checks
        assert per_class["none"]["tp"] == 1
        assert per_class["none"]["fp"] == 1
        assert per_class["none"]["fn"] == 1
        assert per_class["none"]["tn"] == 3
        assert per_class["none"]["precision"] == pytest.approx(0.5, abs=1e-4)
        assert per_class["none"]["recall"] == pytest.approx(0.5, abs=1e-4)

        assert per_class["drift"]["tp"] == 1
        assert per_class["drift"]["fp"] == 0
        assert per_class["drift"]["fn"] == 1
        assert per_class["drift"]["precision"] == pytest.approx(1.0, abs=1e-4)
        assert per_class["drift"]["recall"] == pytest.approx(0.5, abs=1e-4)

        assert per_class["scope_creep"]["tp"] == 1
        assert per_class["scope_creep"]["fp"] == 2
        assert per_class["scope_creep"]["fn"] == 0
        assert per_class["scope_creep"]["precision"] == pytest.approx(1 / 3, abs=1e-4)
        assert per_class["scope_creep"]["recall"] == pytest.approx(1.0, abs=1e-4)

        assert per_class["misinterpretation"]["tp"] == 0
        assert per_class["misinterpretation"]["fp"] == 0
        assert per_class["misinterpretation"]["fn"] == 1
        assert per_class["misinterpretation"]["precision"] == 0.0
        assert per_class["misinterpretation"]["recall"] == 0.0
        assert per_class["misinterpretation"]["f1"] == 0.0


# ---------------------------------------------------------------------------
# 2. Multiclass confusion matrix
# ---------------------------------------------------------------------------

class TestConfusionMatrix:
    def test_four_class_confusion_matrix_structure_and_counts(self):
        actual = ["none", "none", "drift", "scope_creep", "misinterpretation", "drift"]
        pred = ["none", "drift", "drift", "scope_creep", "none", "scope_creep"]

        cm = compute_confusion_matrix(actual, pred)
        assert cm["labels"] == list(EVALUATION_CLASSES)
        assert cm["total"] == 6
        assert cm["matrix"]["none"] == {"none": 1, "drift": 1, "scope_creep": 0, "misinterpretation": 0}
        assert cm["matrix"]["drift"] == {"none": 0, "drift": 1, "scope_creep": 1, "misinterpretation": 0}
        assert cm["matrix"]["scope_creep"] == {"none": 0, "drift": 0, "scope_creep": 1, "misinterpretation": 0}
        assert cm["matrix"]["misinterpretation"] == {"none": 1, "drift": 0, "scope_creep": 0, "misinterpretation": 0}
        assert cm["rows"] == [
            [1, 1, 0, 0],
            [0, 1, 1, 0],
            [0, 0, 1, 0],
            [1, 0, 0, 0],
        ]
        assert sum(sum(r) for r in cm["rows"]) == 6

    def test_confusion_matrix_length_mismatch_raises(self):
        with pytest.raises(ValueError, match="Length mismatch"):
            compute_confusion_matrix(["none"], ["none", "drift"])


# ---------------------------------------------------------------------------
# 3. Step-level comparison
# ---------------------------------------------------------------------------

class TestStepLevelMetrics:
    def test_step_level_precision_recall_f1_and_original_ids(self):
        comparisons = [
            # Trace 1 (original string step IDs): GT={S-2, S-3}, Pred={S-2, S-4}
            # TP=1 (S-2), FP=1 (S-4), FN=1 (S-3), TN=1 (S-1)
            {
                "all_step_ids": ["S-1", "S-2", "S-3", "S-4"],
                "gt_flagged_step_ids": ["S-2", "S-3"],
                "pred_flagged_step_ids": ["S-2", "S-4"],
                "gt_flagged_step_id": "S-2",
                "pred_first_flagged_step_id": "S-2",
                "gt_is_deviated": True,
            },
            # Trace 2 (clean): GT={}, Pred={} -> TN=2, exact set match
            {
                "all_step_ids": ["1", "2"],
                "gt_flagged_step_ids": [],
                "pred_flagged_step_ids": [],
                "gt_flagged_step_id": None,
                "pred_first_flagged_step_id": None,
                "gt_is_deviated": False,
            },
            # Trace 3: GT={3}, Pred={} -> FN=1, TN=2
            {
                "all_step_ids": ["1", "2", "3"],
                "gt_flagged_step_ids": ["3"],
                "pred_flagged_step_ids": [],
                "gt_flagged_step_id": "3",
                "pred_first_flagged_step_id": None,
                "gt_is_deviated": True,
            },
        ]
        metrics = compute_step_level_metrics(comparisons)
        assert metrics["total_steps"] == 9
        assert metrics["tp"] == 1
        assert metrics["fp"] == 1
        assert metrics["fn"] == 2
        assert metrics["tn"] == 5
        assert metrics["precision"] == pytest.approx(0.5, abs=1e-4)
        assert metrics["recall"] == pytest.approx(1 / 3, abs=1e-4)
        assert metrics["f1"] == pytest.approx(0.4, abs=1e-4)
        # Only trace 2 had exact set match => 1 / 3
        assert metrics["exact_flagged_set_match_rate"] == pytest.approx(1 / 3, abs=1e-4)
        # Deviated traces = 2 (trace 1 matched first step S-2, trace 3 missed) => 0.5
        assert metrics["deviated_trace_count"] == 2
        assert metrics["first_step_exact_match_count"] == 1
        assert metrics["first_step_exact_match_rate"] == pytest.approx(0.5, abs=1e-4)


# ---------------------------------------------------------------------------
# 4. Empty dataset, all-normal predictions, all-deviation predictions
# ---------------------------------------------------------------------------

class TestBoundaryPredictions:
    def test_empty_dataset_handles_zero_divisions_cleanly(self, tmp_path):
        det_file = tmp_path / "empty_det.jsonl"
        gt_file = tmp_path / "empty_gt.jsonl"
        det_file.write_text("", encoding="utf-8")
        gt_file.write_text("", encoding="utf-8")

        repo = TraceRepository(detector_input_path=det_file, corrected_full_path=gt_file)
        result = evaluate_repository(repo, lambda t: _make_trace_model(t, False, None, []))

        assert result["dataset_count"] == 0
        assert result["evaluated_count"] == 0
        assert result["skipped_count"] == 0
        assert result["trace_level"]["precision"] == 0.0
        assert result["trace_level"]["recall"] == 0.0
        assert result["trace_level"]["f1"] == 0.0
        assert result["trace_level"]["accuracy"] == 0.0
        assert result["step_level"]["precision"] == 0.0
        assert result["step_level"]["recall"] == 0.0
        assert result["step_level"]["f1"] == 0.0
        assert result["confusion_matrix"]["rows"] == [[0, 0, 0, 0]] * 4
        assert result["false_positives"] == []
        assert result["false_negatives"] == []
        assert result["per_trace"] == []

    def test_all_normal_predictions(self, tmp_path):
        det_file = tmp_path / "det.jsonl"
        gt_file = tmp_path / "gt.jsonl"
        steps = [{"step_id": 1, "action_type": "read"}, {"step_id": 2, "action_type": "write"}]

        _write_jsonl(det_file, [
            _make_detector_record("t1", steps),
            _make_detector_record("t2", steps),
            _make_detector_record("t3", steps),
        ])
        _write_jsonl(gt_file, [
            _make_gt_record("t1", steps, False, "none", [], None),
            _make_gt_record("t2", steps, True, "scope_creep", [2], 2),
            _make_gt_record("t3", steps, True, "drift", [2], 2),
        ])

        repo = TraceRepository(detector_input_path=det_file, corrected_full_path=gt_file)
        result = evaluate_repository(repo, lambda t: _make_trace_model(t, False, None, []))

        tl = result["trace_level"]
        assert tl["tp"] == 0
        assert tl["fp"] == 0
        assert tl["fn"] == 2
        assert tl["tn"] == 1
        assert tl["precision"] == 0.0
        assert tl["recall"] == 0.0
        assert tl["f1"] == 0.0
        assert result["false_positives"] == []
        assert [r["trace_id"] for r in result["false_negatives"]] == ["t2", "t3"]
        assert result["per_class"]["none"]["recall"] == 1.0

    def test_all_deviation_predictions(self, tmp_path):
        det_file = tmp_path / "det.jsonl"
        gt_file = tmp_path / "gt.jsonl"
        steps = [{"step_id": 1, "action_type": "read"}, {"step_id": 2, "action_type": "write"}]

        _write_jsonl(det_file, [
            _make_detector_record("t1", steps),
            _make_detector_record("t2", steps),
            _make_detector_record("t3", steps),
        ])
        _write_jsonl(gt_file, [
            _make_gt_record("t1", steps, False, "none", [], None),
            _make_gt_record("t2", steps, True, "scope_creep", [2], 2),
            _make_gt_record("t3", steps, False, "none", [], None),
        ])

        repo = TraceRepository(detector_input_path=det_file, corrected_full_path=gt_file)
        result = evaluate_repository(
            repo, lambda t: _make_trace_model(t, True, "scope_creep", ["2"])
        )

        tl = result["trace_level"]
        assert tl["tp"] == 1
        assert tl["fp"] == 2
        assert tl["fn"] == 0
        assert tl["tn"] == 0
        assert tl["precision"] == pytest.approx(1 / 3, abs=1e-4)
        assert tl["recall"] == 1.0
        assert tl["f1"] == pytest.approx(0.5, abs=1e-4)
        assert [r["trace_id"] for r in result["false_positives"]] == ["t1", "t3"]
        assert result["false_negatives"] == []
        assert result["per_class"]["none"]["precision"] == 0.0
        assert result["per_class"]["none"]["recall"] == 0.0


# ---------------------------------------------------------------------------
# 5. Ground-truth isolation during batch execution
# ---------------------------------------------------------------------------

class TestGroundTruthIsolationInBatch:
    def test_detector_receives_stripped_trace_and_predictions_precede_gt_lookup(self, tmp_path):
        det_file = tmp_path / "det.jsonl"
        gt_file = tmp_path / "gt.jsonl"
        steps = [
            {"step_id": "step_A", "action_type": "read"},
            {"step_id": "step_B", "action_type": "write"},
        ]

        _write_jsonl(det_file, [_make_detector_record("al_iso_1", steps)])
        _write_jsonl(
            gt_file,
            [_make_gt_record("al_iso_1", steps, True, "scope_creep", ["step_B"], "step_B")],
        )

        repo = TraceRepository(detector_input_path=det_file, corrected_full_path=gt_file)
        call_order = []

        original_get_gt = repo.get_ground_truth

        def spy_get_gt(tid: str):
            call_order.append(("get_ground_truth", tid))
            return original_get_gt(tid)

        repo.get_ground_truth = spy_get_gt  # type: ignore[method-assign]

        def verifying_detector(loaded: LoadedTrace) -> TraceModel:
            call_order.append(("run_detection", loaded.trace_id))
            # Ground truth must be completely empty on the object passed to detector
            assert loaded.ground_truth == {}
            assert "scope_creep" not in loaded.label
            assert "ground_truth" not in loaded.raw_data
            intent = loaded.create_intent()
            assert not hasattr(intent, "ground_truth")
            assert not hasattr(intent, "has_deviation")
            return _make_trace_model(loaded, True, "scope_creep", ["step_B"])

        result = evaluate_repository(repo, verifying_detector)
        assert result["evaluated_count"] == 1
        # Eligibility check happens before detection, and scoring GT lookup happens AFTER detection
        detect_idx = call_order.index(("run_detection", "al_iso_1"))
        last_gt_idx = max(i for i, c in enumerate(call_order) if c[0] == "get_ground_truth")
        assert last_gt_idx > detect_idx
        assert result["per_trace"][0]["predicted_flagged_step_ids"] == ["step_B"]
        assert result["per_trace"][0]["ground_truth_flagged_step_ids"] == ["step_B"]


# ---------------------------------------------------------------------------
# 6. End-to-end batch fixture + known limitations + skipped trace handling
# ---------------------------------------------------------------------------

class TestBatchFixtureAndLimitations:
    def test_batch_fixture_metrics_skipped_and_limitations(self, tmp_path):
        det_file = tmp_path / "det.jsonl"
        gt_file = tmp_path / "gt.jsonl"
        audit_csv = tmp_path / "audit.csv"

        steps_2 = [
            {"step_id": 1, "action_type": "read"},
            {"step_id": 2, "action_type": "read"},
        ]
        steps_3 = [
            {"step_id": 1, "action_type": "read"},
            {"step_id": 2, "action_type": "read"},
            {"step_id": 3, "action_type": "write"},
        ]

        _write_jsonl(det_file, [
            _make_detector_record("al_trace_001", steps_3),                      # none
            _make_detector_record("al_trace_short_drift", steps_2),              # drift, <3 steps
            _make_detector_record("al_trace_100", steps_3),                      # resource-scope CSV case
            _make_detector_record("al_trace_misinterp", steps_3),                # misinterpretation
            _make_detector_record("al_trace_033", steps_2, forbidden=["read_secret"]),  # vocab mismatch
            _make_detector_record("al_trace_unmatched", steps_2),                # no GT -> skipped
            _make_detector_record("al_trace_boom", steps_2),                     # raises -> skipped
        ])
        _write_jsonl(gt_file, [
            _make_gt_record("al_trace_001", steps_3, False, "none", [], None),
            _make_gt_record("al_trace_short_drift", steps_2, True, "drift", [2], 2),
            _make_gt_record("al_trace_100", steps_3, True, "scope_creep", [3], 3),
            _make_gt_record("al_trace_misinterp", steps_3, True, "misinterpretation", [2], 2),
            _make_gt_record("al_trace_033", steps_2, True, "scope_creep", [2], 2, forbidden=["read_secret"]),
            _make_gt_record("al_trace_boom", steps_2, False, "none", [], None),
        ])
        audit_csv.write_text(
            "trace_id,status\nal_trace_100,unresolved_resource_scope_limit\n",
            encoding="utf-8",
        )

        repo = TraceRepository(detector_input_path=det_file, corrected_full_path=gt_file)

        def fake_detector(loaded: LoadedTrace) -> TraceModel:
            if loaded.trace_id == "al_trace_boom":
                raise RuntimeError("synthetic failure")
            if loaded.trace_id == "al_trace_100":
                return _make_trace_model(loaded, True, "scope_creep", ["3"])
            return _make_trace_model(loaded, False, None, [])

        res = evaluate_repository(repo, fake_detector, permission_audit_csv=audit_csv)

        assert res["available"] is True
        assert res["dataset_count"] == 7
        assert res["evaluated_count"] == 5
        assert res["skipped_count"] == 2
        skip_reasons = {s["trace_id"]: s["reason"] for s in res["skipped_traces"]}
        assert skip_reasons["al_trace_unmatched"] == "missing_ground_truth"
        assert "detection_error" in skip_reasons["al_trace_boom"]

        assert res["positive_class_convention"] == POSITIVE_CLASS_CONVENTION

        # Limitations checked separately
        lims = res["known_limitations"]
        assert lims["short_drift_traces_lt_3_steps"]["count"] == 1
        assert lims["short_drift_traces_lt_3_steps"]["trace_ids"] == ["al_trace_short_drift"]
        assert lims["short_drift_traces_lt_3_steps"]["binary_fn"] == 1

        assert lims["resource_scoped_permission_cases"]["count"] == 1
        assert lims["resource_scoped_permission_cases"]["trace_ids"] == ["al_trace_100"]
        assert lims["resource_scoped_permission_cases"]["binary_tp"] == 1

        assert lims["misinterpretation_unsupported"]["count"] == 1
        assert lims["misinterpretation_unsupported"]["trace_ids"] == ["al_trace_misinterp"]
        assert lims["misinterpretation_unsupported"]["binary_fn"] == 1

        assert lims["action_vocabulary_mismatch_al_trace_033"]["count"] == 1
        assert lims["action_vocabulary_mismatch_al_trace_033"]["trace_ids"] == ["al_trace_033"]
        assert lims["action_vocabulary_mismatch_al_trace_033"]["binary_fn"] == 1


# ---------------------------------------------------------------------------
# 7. Split filtering, exclusions, and report metadata
# ---------------------------------------------------------------------------

class TestSplitFilteringAndExclusions:
    def test_only_test_records_evaluated(self, tmp_path):
        det_file = tmp_path / "det.jsonl"
        gt_file = tmp_path / "gt.jsonl"
        steps = [{"step_id": 1, "action_type": "read"}]

        _write_jsonl(det_file, [
            _make_detector_record("t_train_1", steps),
            _make_detector_record("t_val_1", steps),
            _make_detector_record("t_review_1", steps),
            _make_detector_record("t_test_1", steps),
            _make_detector_record("t_test_2", steps),
        ])
        _write_jsonl(gt_file, [
            _make_gt_record("t_train_1", steps, False, "none", [], None, sample_split="train"),
            _make_gt_record("t_val_1", steps, False, "none", [], None, sample_split="validation"),
            _make_gt_record("t_review_1", steps, False, "none", [], None, sample_split="sample_review_only"),
            _make_gt_record("t_test_1", steps, False, "none", [], None, sample_split="test"),
            _make_gt_record("t_test_2", steps, True, "drift", [1], 1, sample_split="test"),
        ])

        repo = TraceRepository(detector_input_path=det_file, corrected_full_path=gt_file)
        res = evaluate_repository(repo, lambda t: _make_trace_model(t, False, None, []))

        assert res["dataset_count"] == 5
        assert res["evaluated_count"] == 2
        assert res["excluded_count"] == 3
        assert res["evaluation_split"] == "test"
        eval_ids = [r["trace_id"] for r in res["per_trace"]]
        assert eval_ids == ["t_test_1", "t_test_2"]
        assert res["split_class_distribution"] == {"none": 1, "drift": 1, "scope_creep": 0, "misinterpretation": 0}

    def test_training_and_validation_records_excluded(self, tmp_path):
        det_file = tmp_path / "det.jsonl"
        gt_file = tmp_path / "gt.jsonl"
        steps = [{"step_id": 1, "action_type": "read"}]

        _write_jsonl(det_file, [
            _make_detector_record("train_a", steps),
            _make_detector_record("val_b", steps),
            _make_detector_record("test_c", steps),
        ])
        _write_jsonl(gt_file, [
            _make_gt_record("train_a", steps, False, "none", [], None, sample_split="train"),
            _make_gt_record("val_b", steps, False, "none", [], None, sample_split="validation"),
            _make_gt_record("test_c", steps, False, "none", [], None, sample_split="test"),
        ])

        repo = TraceRepository(detector_input_path=det_file, corrected_full_path=gt_file)
        res = evaluate_repository(repo, lambda t: _make_trace_model(t, False, None, []))

        skip_map = {s["trace_id"]: s["reason"] for s in res["skipped_traces"]}
        assert skip_map["train_a"] == "excluded_split_train"
        assert skip_map["val_b"] == "excluded_split_validation"
        assert "test_c" not in skip_map

    def test_review_only_records_excluded_and_cannot_be_targeted(self, tmp_path):
        det_file = tmp_path / "det.jsonl"
        gt_file = tmp_path / "gt.jsonl"
        steps = [{"step_id": 1, "action_type": "read"}]

        _write_jsonl(det_file, [
            _make_detector_record("ro_1", steps),
            _make_detector_record("test_1", steps),
        ])
        _write_jsonl(gt_file, [
            _make_gt_record("ro_1", steps, False, "none", [], None, sample_split="sample_review_only"),
            _make_gt_record("test_1", steps, False, "none", [], None, sample_split="test"),
        ])

        repo = TraceRepository(detector_input_path=det_file, corrected_full_path=gt_file)
        res = evaluate_repository(repo, lambda t: _make_trace_model(t, False, None, []))

        skip_map = {s["trace_id"]: s["reason"] for s in res["skipped_traces"]}
        assert skip_map["ro_1"] == "review_only_excluded"

        with pytest.raises(ValueError, match="strictly excluded from evaluation"):
            evaluate_repository(repo, lambda t: _make_trace_model(t, False, None, []), split="sample_review_only")

    def test_review_only_records_excluded_even_if_split_metadata_says_test(self, tmp_path):
        det_file = tmp_path / "det.jsonl"
        gt_file = tmp_path / "gt.jsonl"
        steps = [{"step_id": 1, "action_type": "read"}]

        rec_ro_test = _make_detector_record("t_ro_test", steps)
        rec_ro_test["sample_review_only"] = True

        gt_ro_test = _make_gt_record("t_ro_test", steps, False, "none", [], None, sample_split="test")
        gt_ro_test["sample_review_only"] = True
        gt_ro_test["ground_truth"]["sample_review_only"] = True

        rec_normal_test = _make_detector_record("t_normal_test", steps)
        gt_normal_test = _make_gt_record("t_normal_test", steps, False, "none", [], None, sample_split="test")

        _write_jsonl(det_file, [rec_ro_test, rec_normal_test])
        _write_jsonl(gt_file, [gt_ro_test, gt_normal_test])

        repo = TraceRepository(detector_input_path=det_file, corrected_full_path=gt_file)
        assert repo.is_review_only("t_ro_test") is True
        assert repo.is_review_only("t_normal_test") is False

        res = evaluate_repository(repo, lambda t: _make_trace_model(t, False, None, []), split="test")

        assert res["evaluated_count"] == 1
        assert res["per_trace"][0]["trace_id"] == "t_normal_test"
        skip_map = {s["trace_id"]: s["reason"] for s in res["skipped_traces"]}
        assert skip_map["t_ro_test"] == "review_only_excluded"

    def test_missing_or_invalid_split_labels_handled_explicitly(self, tmp_path):
        det_file = tmp_path / "det.jsonl"
        gt_file = tmp_path / "gt.jsonl"
        steps = [{"step_id": 1, "action_type": "read"}]

        _write_jsonl(det_file, [
            _make_detector_record("t_missing", steps),
            _make_detector_record("t_invalid", steps),
            _make_detector_record("t_blank", steps),
            _make_detector_record("t_valid_test", steps),
        ])
        _write_jsonl(gt_file, [
            _make_gt_record("t_missing", steps, False, "none", [], None, sample_split=None),
            _make_gt_record("t_invalid", steps, False, "none", [], None, sample_split="unknown_split"),
            _make_gt_record("t_blank", steps, False, "none", [], None, sample_split="   "),
            _make_gt_record("t_valid_test", steps, False, "none", [], None, sample_split="test"),
        ])

        repo = TraceRepository(detector_input_path=det_file, corrected_full_path=gt_file)
        res = evaluate_repository(repo, lambda t: _make_trace_model(t, False, None, []))

        assert res["evaluated_count"] == 1
        assert res["per_trace"][0]["trace_id"] == "t_valid_test"
        skip_map = {s["trace_id"]: s["reason"] for s in res["skipped_traces"]}
        assert skip_map["t_missing"] == "missing_sample_split"
        assert skip_map["t_blank"] == "missing_sample_split"
        assert skip_map["t_invalid"] == "invalid_sample_split: unknown_split"

    def test_missing_test_split_raises_clear_error(self, tmp_path):
        det_file = tmp_path / "det.jsonl"
        gt_file = tmp_path / "gt.jsonl"
        steps = [{"step_id": 1, "action_type": "read"}]

        _write_jsonl(det_file, [
            _make_detector_record("train_1", steps),
            _make_detector_record("train_2", steps),
        ])
        _write_jsonl(gt_file, [
            _make_gt_record("train_1", steps, False, "none", [], None, sample_split="train"),
            _make_gt_record("train_2", steps, False, "none", [], None, sample_split="train"),
        ])

        repo = TraceRepository(detector_input_path=det_file, corrected_full_path=gt_file)
        with pytest.raises(ValueError, match="Evaluation split 'test' was not found"):
            evaluate_repository(repo, lambda t: _make_trace_model(t, False, None, []), split="test")

    def test_empty_eligible_test_split_produces_clear_error(self, tmp_path):
        det_file = tmp_path / "det.jsonl"
        gt_file = tmp_path / "gt.jsonl"
        steps = [{"step_id": 1, "action_type": "read"}]

        # Both records have test split, but both are marked sample_review_only
        rec1 = _make_detector_record("t_ro_1", steps)
        rec2 = _make_detector_record("t_ro_2", steps)
        gt1 = _make_gt_record("t_ro_1", steps, False, "none", [], None, sample_split="test")
        gt2 = _make_gt_record("t_ro_2", steps, False, "none", [], None, sample_split="test")
        gt1["sample_review_only"] = True
        gt2["sample_review_only"] = True

        _write_jsonl(det_file, [rec1, rec2])
        _write_jsonl(gt_file, [gt1, gt2])

        repo = TraceRepository(detector_input_path=det_file, corrected_full_path=gt_file)
        with pytest.raises(ValueError, match="No eligible records remain for evaluation in split 'test'"):
            evaluate_repository(repo, lambda t: _make_trace_model(t, False, None, []), split="test")

    def test_empty_dataset_handled_safely(self, tmp_path):
        det_file = tmp_path / "empty_det.jsonl"
        gt_file = tmp_path / "empty_gt.jsonl"
        det_file.write_text("", encoding="utf-8")
        gt_file.write_text("", encoding="utf-8")

        repo = TraceRepository(detector_input_path=det_file, corrected_full_path=gt_file)
        res = evaluate_repository(repo, lambda t: _make_trace_model(t, False, None, []), split="test")

        assert res["available"] is True
        assert res["dataset_count"] == 0
        assert res["evaluated_count"] == 0
        assert res["excluded_count"] == 0
        assert res["evaluation_split"] == "test"
        assert res["trace_level"]["f1"] == 0.0
        assert res["step_level"]["f1"] == 0.0
        assert res["per_trace"] == []

    def test_ground_truth_isolation_intact_during_test_split_evaluation(self, tmp_path):
        det_file = tmp_path / "det.jsonl"
        gt_file = tmp_path / "gt.jsonl"
        steps = [{"step_id": 1, "action_type": "read"}]

        rec_det = _make_detector_record("test_iso", steps)
        rec_det["sample_split"] = "test"
        rec_det["sample_review_only"] = "false"
        rec_det["review_only"] = 0
        rec_det["is_review_only"] = False

        _write_jsonl(det_file, [rec_det])
        _write_jsonl(gt_file, [
            _make_gt_record("test_iso", steps, True, "drift", [1], 1, sample_split="test"),
        ])

        repo = TraceRepository(detector_input_path=det_file, corrected_full_path=gt_file)

        inspected_traces = []

        def spy_detector(loaded: LoadedTrace) -> TraceModel:
            inspected_traces.append(loaded)
            # Detector must receive completely empty ground_truth and no ground-truth or split keys in raw_data
            assert loaded.ground_truth == {}
            assert "ground_truth" not in loaded.raw_data
            assert "sample_split" not in loaded.raw_data
            assert "sampleSplit" not in loaded.raw_data
            assert "sample_review_only" not in loaded.raw_data
            assert "sampleReviewOnly" not in loaded.raw_data
            assert "review_only" not in loaded.raw_data
            assert "reviewOnly" not in loaded.raw_data
            assert "is_review_only" not in loaded.raw_data
            assert "isReviewOnly" not in loaded.raw_data
            assert "has_deviation" not in loaded.raw_data
            assert "drift" not in loaded.label
            intent = loaded.create_intent()
            assert not hasattr(intent, "ground_truth")
            assert not hasattr(intent, "has_deviation")
            return _make_trace_model(loaded, True, "drift", ["1"])

        res = evaluate_repository(repo, spy_detector, split="test")
        assert len(inspected_traces) == 1
        assert res["evaluated_count"] == 1
        assert res["per_trace"][0]["predicted_type"] == "drift"
        assert res["per_trace"][0]["ground_truth_type"] == "drift"

    def test_review_only_boolean_string_and_numeric_variations_in_evaluation(self, tmp_path):
        det_file = tmp_path / "det.jsonl"
        gt_file = tmp_path / "gt.jsonl"
        steps = [{"step_id": 1, "action_type": "read"}]

        _write_jsonl(det_file, [
            _make_detector_record("t_ro_str_true", steps),
            _make_detector_record("t_ro_num_true", steps),
            _make_detector_record("t_ro_bool_true", steps),
            _make_detector_record("t_ro_str_false", steps),
            _make_detector_record("t_ro_num_false", steps),
            _make_detector_record("t_ro_bool_false", steps),
        ])
        _write_jsonl(gt_file, [
            # Excluded variations
            {"trace_id": "t_ro_str_true", "sample_split": "test", "sample_review_only": "  TRUE  ", "ground_truth": {"has_deviation": False}},
            {"trace_id": "t_ro_num_true", "sample_split": "test", "review_only": 1, "ground_truth": {"has_deviation": False}},
            {"trace_id": "t_ro_bool_true", "sample_split": "test", "is_review_only": True, "ground_truth": {"has_deviation": False}},
            # Evaluated variations
            {"trace_id": "t_ro_str_false", "sample_split": "test", "sample_review_only": "  FALSE  ", "ground_truth": {"has_deviation": False}},
            {"trace_id": "t_ro_num_false", "sample_split": "test", "review_only": 0, "ground_truth": {"has_deviation": False}},
            {"trace_id": "t_ro_bool_false", "sample_split": "test", "is_review_only": False, "ground_truth": {"has_deviation": False}},
        ])

        repo = TraceRepository(detector_input_path=det_file, corrected_full_path=gt_file)
        res = evaluate_repository(repo, lambda t: _make_trace_model(t, False, None, []), split="test")

        # 3 evaluated, 3 excluded
        assert res["evaluated_count"] == 3
        eval_ids = [r["trace_id"] for r in res["per_trace"]]
        assert eval_ids == ["t_ro_str_false", "t_ro_num_false", "t_ro_bool_false"]

        skip_map = {s["trace_id"]: s["reason"] for s in res["skipped_traces"]}
        assert skip_map["t_ro_str_true"] == "review_only_excluded"
        assert skip_map["t_ro_num_true"] == "review_only_excluded"
        assert skip_map["t_ro_bool_true"] == "review_only_excluded"

    def test_invalid_review_only_metadata_handled_explicitly_in_evaluation(self, tmp_path):
        det_file = tmp_path / "det.jsonl"
        gt_file = tmp_path / "gt.jsonl"
        steps = [{"step_id": 1, "action_type": "read"}]

        _write_jsonl(det_file, [
            _make_detector_record("t_inv_str", steps),
            _make_detector_record("t_inv_num", steps),
            _make_detector_record("t_valid", steps),
        ])
        _write_jsonl(gt_file, [
            {"trace_id": "t_inv_str", "sample_split": "test", "sample_review_only": "maybe_review", "ground_truth": {"has_deviation": False}},
            {"trace_id": "t_inv_num", "sample_split": "test", "review_only": 42, "ground_truth": {"has_deviation": False}},
            {"trace_id": "t_valid", "sample_split": "test", "sample_review_only": "false", "ground_truth": {"has_deviation": False}},
        ])

        repo = TraceRepository(detector_input_path=det_file, corrected_full_path=gt_file)
        res = evaluate_repository(repo, lambda t: _make_trace_model(t, False, None, []), split="test")

        assert res["evaluated_count"] == 1
        assert res["per_trace"][0]["trace_id"] == "t_valid"

        skip_map = {s["trace_id"]: s["reason"] for s in res["skipped_traces"]}
        assert "invalid_review_only_metadata" in skip_map["t_inv_str"]
        assert "maybe_review" in skip_map["t_inv_str"]
        assert "invalid_review_only_metadata" in skip_map["t_inv_num"]
        assert "42" in skip_map["t_inv_num"]
