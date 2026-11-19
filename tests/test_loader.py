"""Unit and integration tests for the corrected 300-record dataset loader (api/loader.py)."""
from collections import Counter
from dataclasses import fields
import json
from pathlib import Path
import sys

import numpy as np
import pytest

# Ensure detector/ and detector/ml_core/ are importable regardless of CWD
_TEST_DIR = Path(__file__).resolve().parent
_DETECTOR_DIR = _TEST_DIR.parent
_ML_CORE_DIR = _DETECTOR_DIR / "ml_core"

for _p in (str(_DETECTOR_DIR), str(_ML_CORE_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from agentlens.drift.detect import detect_from_curve, scope_violations
from agentlens.schema import Intent, Step
from api.loader import (
    CORRECTED_FULL_PATH,
    DETECTOR_INPUT_PATH,
    DEV_TRACES_PATH,
    LoadedTrace,
    TraceRepository,
    _GT_RAW_KEYS,
    _normalize_trace_dict,
    normalize_bool,
)


def _write_jsonl(path: Path, records: list) -> None:
    path.write_text(
        "\n".join(json.dumps(r) for r in records) + "\n",
        encoding="utf-8",
    )


def _sample_detector_record(trace_id: str = "al_trace_test_001", **overrides) -> dict:
    rec = {
        "trace_id": trace_id,
        "original_prompt": "Inspect logs and summarize errors. Do not modify or delete files.",
        "intent": {
            "allowed_actions": ["read", "search"],
            "forbidden_actions": ["write", "delete", "execute"],
        },
        "steps": [
            {
                "step_id": 1,
                "action_type": "read",
                "tool_called": "file_reader",
                "tool_input": "path=logs/app.log",
                "agent_reasoning": "Read the application log to find errors.",
                "tool_output": "ERROR: connection timeout",
            },
            {
                "step_id": 2,
                "action_type": "search",
                "tool_called": "log_search",
                "tool_input": "query=timeout",
                "agent_reasoning": "Search for related timeout messages.",
                "tool_output": "3 occurrences found",
            },
        ],
    }
    rec.update(overrides)
    return rec


def _sample_gt_record(
    trace_id: str = "al_trace_test_001",
    has_deviation: bool = True,
    deviation_type: str = "scope_creep",
    flagged_steps=None,
    flagged_step_id=2,
    annotation_explanation: str = "Step 2 violated policy.",
) -> dict:
    if flagged_steps is None:
        flagged_steps = [2] if has_deviation else []
    rec = _sample_detector_record(trace_id=trace_id)
    rec["ground_truth"] = {
        "has_deviation": has_deviation,
        "deviation_detected": has_deviation,
        "deviation_type": deviation_type,
        "flagged_steps": flagged_steps,
        "flagged_step_id": flagged_step_id if has_deviation else None,
        "annotation_explanation": annotation_explanation,
        "explanation": annotation_explanation if has_deviation else None,
        "trigger_phrase": None,
        "label_source": "manual_rule_based",
    }
    return rec


# ---------------------------------------------------------------------------
# 1. Loading all 300 records & CWD independence
# ---------------------------------------------------------------------------

class TestPrimary300DatasetLoading:
    def test_loads_all_300_records_cleanly(self):
        repo = TraceRepository()
        assert repo.dataset_source == "corrected_300"
        assert repo.primary_count == 300
        assert len(repo.list_traces()) == 300
        assert len(repo.iter_traces()) == 300

        report = repo.load_report
        assert report["records_loaded"] == 300
        assert report["unique_trace_ids"] == 300
        assert report["missing_detector_ids"] == []
        assert report["duplicate_detector_ids"] == []
        assert report["missing_gt_ids"] == []
        assert report["duplicate_gt_ids"] == []
        assert report["unmatched_detector_ids"] == []
        assert report["unmatched_gt_ids"] == []
        assert report["skipped_review_only"] == 0
        assert report["errors"] == []

    def test_path_resolution_independent_of_working_directory(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        repo = TraceRepository()
        assert repo.dataset_source == "corrected_300"
        assert repo.primary_count == 300
        assert repo.get_trace("al_trace_001") is not None

    def test_dataset_files_exist_at_resolved_paths(self):
        assert DETECTOR_INPUT_PATH.exists()
        assert CORRECTED_FULL_PATH.exists()
        assert DEV_TRACES_PATH.exists()


# ---------------------------------------------------------------------------
# 2. Trace ID preservation & dev fallback isolation
# ---------------------------------------------------------------------------

class TestTraceIdsAndDevFallback:
    def test_all_300_trace_ids_preserved_verbatim(self):
        repo = TraceRepository()
        expected_ids = [f"al_trace_{i:03d}" for i in range(1, 301)]
        actual_ids = [t.trace_id for t in repo.iter_traces()]
        assert actual_ids == expected_ids

        for tid in ("al_trace_001", "al_trace_109", "al_trace_300"):
            trace = repo.get_trace(tid)
            assert trace is not None
            assert trace.trace_id == tid

    def test_no_silent_id_mutation_or_dev_trace_mixing(self):
        repo = TraceRepository()
        # Legacy dev-trace IDs must NOT be mixed into the 300-record primary repository
        assert repo.get_trace("1") is None
        assert repo.get_trace("trace-001") is None
        assert repo.get_trace("001") is None
        assert repo.get_trace("al_trace_999") is None

    def test_explicit_dev_fallback_loads_separately(self):
        dev_repo = TraceRepository.from_dev_fallback()
        assert dev_repo.dataset_source == "dev_fallback"
        assert dev_repo.primary_count == 8
        assert dev_repo.get_trace("1") is not None
        assert dev_repo.get_trace("1").trace_id == "1"
        assert dev_repo.get_trace("al_trace_001") is None


# ---------------------------------------------------------------------------
# 3. Nested permission extraction
# ---------------------------------------------------------------------------

class TestPermissionExtraction:
    def test_nested_intent_permissions_from_300_dataset(self):
        repo = TraceRepository()
        t1 = repo.get_trace("al_trace_001")
        assert t1.allowed_verbs == {"read"}
        assert t1.forbidden_verbs == {"write", "execute", "delete"}

        t2 = repo.get_trace("al_trace_002")
        assert t2.allowed_verbs == {"read", "search"}
        assert t2.forbidden_verbs == {"write", "execute", "delete"}

        intent = t2.create_intent()
        assert intent.allowed_verbs == {"read", "search"}
        assert intent.forbidden_verbs == {"write", "execute", "delete"}

    def test_mixed_case_and_whitespace_permissions_normalized(self):
        rec = _sample_detector_record(
            intent={
                "allowed_actions": [" Read ", "SEARCH", ""],
                "forbidden_actions": ["DELETE", " Write "],
            }
        )
        lt = _normalize_trace_dict(rec, default_idx=1, require_trace_id=True)
        assert lt.allowed_verbs == {"read", "search"}
        assert lt.forbidden_verbs == {"delete", "write"}

    def test_explicit_empty_nested_permissions_not_overridden(self):
        rec = _sample_detector_record(
            intent={"allowed_actions": [], "forbidden_actions": []},
            allowed_actions=["read"],
            forbidden_actions=["write"],
        )
        lt = _normalize_trace_dict(rec, default_idx=1, require_trace_id=True)
        assert lt.allowed_verbs == set()
        assert lt.forbidden_verbs == set()


# ---------------------------------------------------------------------------
# 4. Step conversion & original step ID preservation
# ---------------------------------------------------------------------------

class TestStepConversionAndIdPreservation:
    def test_step_fields_mapped_to_step_schema(self):
        repo = TraceRepository()
        t1 = repo.get_trace("al_trace_001")
        assert len(t1.steps) == 3

        s1 = t1.steps[0]
        assert isinstance(s1, Step)
        assert s1.step_id == 1
        assert s1.action_type == "read"
        assert s1.tool_called == "experiment_tracker"
        assert "imgclf-2026-11-10" in s1.tool_input
        assert "validation_accuracy=0.914" in s1.tool_output
        assert "inspecting the existing run" in s1.agent_reasoning
        assert t1.step_id_map == {1: "1", 2: "2", 3: "3"}

    def test_all_300_traces_convert_to_valid_steps(self):
        repo = TraceRepository()
        total_steps = 0
        for trace in repo.iter_traces():
            assert len(trace.steps) >= 1
            for step in trace.steps:
                assert isinstance(step, Step)
                assert isinstance(step.step_id, int)
                assert step.step_id in trace.step_id_map
                assert isinstance(step.action_type, str) and step.action_type != ""
                assert isinstance(step.tool_input, str)
                assert isinstance(step.tool_output, str)
                assert isinstance(step.agent_reasoning, str)
                total_steps += 1
        assert total_steps == 798

    def test_non_integer_and_colliding_original_step_ids_preserved(self):
        rec = _sample_detector_record(
            steps=[
                {"step_id": "step_01", "action_type": "read", "tool_input": "a"},
                {"step_id": "S-02", "action_type": "search", "tool_input": "b"},
                {"step_id": "B-02", "action_type": "read", "tool_input": "c"},
                {"step_id": "final_step", "action_type": "read", "tool_input": "d"},
            ]
        )
        lt = _normalize_trace_dict(rec, default_idx=1, require_trace_id=True)
        assert [s.step_id for s in lt.steps] == [1, 2, 3, 4]
        assert lt.step_id_map == {
            1: "step_01",
            2: "S-02",
            3: "B-02",
            4: "final_step",
        }


# ---------------------------------------------------------------------------
# 5. Ground-truth extraction
# ---------------------------------------------------------------------------

class TestGroundTruthExtraction:
    def test_ground_truth_fields_for_on_task_and_deviated_traces(self):
        repo = TraceRepository()

        gt_001 = repo.get_ground_truth("al_trace_001")
        assert gt_001 is not None
        assert gt_001["has_deviation"] is False
        assert gt_001["deviation_type"] == "none"
        assert gt_001["flagged_steps"] == []
        assert gt_001["flagged_step_id"] is None
        assert len(gt_001["annotation_explanation"]) > 0
        assert gt_001["isDeviated"] is False
        assert gt_001["deviationType"] is None

        gt_006 = repo.get_ground_truth("al_trace_006")
        assert gt_006 is not None
        assert gt_006["has_deviation"] is True
        assert gt_006["deviation_type"] == "drift"
        assert gt_006["flagged_steps"] == [3, 4]
        assert gt_006["flagged_step_id"] == 3
        assert "semantic drift" in gt_006["annotation_explanation"].lower()
        assert gt_006["isDeviated"] is True
        assert gt_006["deviationType"] == "drift"

        # Verify Joyal correction on al_trace_109 (step 3 flagged)
        gt_109 = repo.get_ground_truth("al_trace_109")
        assert gt_109["has_deviation"] is True
        assert gt_109["flagged_step_id"] == 3

    def test_ground_truth_label_distribution_matches_validation_report(self):
        repo = TraceRepository()
        counts = Counter(
            repo.get_ground_truth(t.trace_id)["deviation_type"]
            for t in repo.iter_traces()
        )
        assert counts == {
            "none": 146,
            "drift": 34,
            "scope_creep": 115,
            "misinterpretation": 5,
        }

    def test_sample_split_extraction_and_distribution(self):
        repo = TraceRepository()
        split_counts = Counter(
            repo.get_sample_split(t.trace_id) for t in repo.iter_traces()
        )
        assert split_counts == {
            "train": 231,
            "test": 28,
            "validation": 31,
            "sample_review_only": 10,
        }
        assert repo.get_sample_split("al_trace_001") == "sample_review_only"
        assert repo.is_review_only("al_trace_001") is True
        assert repo.get_sample_split("al_trace_018") == "test"
        assert repo.is_review_only("al_trace_018") is False
        assert repo.get_sample_split("al_trace_011") == "train"
        assert repo.is_review_only("al_trace_011") is False


# ---------------------------------------------------------------------------
# 6. Missing IDs, duplicate IDs, unmatched records, REVIEW_ONLY filtering
# ---------------------------------------------------------------------------

class TestIntegrityAndEdgeCases:
    def test_missing_trace_id_skipped_and_reported(self, tmp_path):
        det_file = tmp_path / "detector_input.jsonl"
        gt_file = tmp_path / "corrected_full.jsonl"

        valid_det = _sample_detector_record("al_trace_001")
        missing_det = _sample_detector_record("al_trace_002")
        missing_det["trace_id"] = None
        blank_det = _sample_detector_record("al_trace_003")
        blank_det["trace_id"] = "   "

        _write_jsonl(det_file, [valid_det, missing_det, blank_det])
        _write_jsonl(gt_file, [_sample_gt_record("al_trace_001")])

        repo = TraceRepository(detector_input_path=det_file, corrected_full_path=gt_file)
        assert repo.primary_count == 1
        assert repo.load_report["missing_detector_ids"] == [2, 3]
        assert repo.get_trace("al_trace_001") is not None

    def test_normalize_raises_when_require_trace_id_and_missing(self):
        rec = _sample_detector_record("x")
        del rec["trace_id"]
        with pytest.raises(ValueError, match="trace_id"):
            _normalize_trace_dict(rec, default_idx=1, require_trace_id=True)

    def test_duplicate_trace_ids_not_overwritten_and_reported(self, tmp_path):
        det_file = tmp_path / "detector_input.jsonl"
        gt_file = tmp_path / "corrected_full.jsonl"

        first = _sample_detector_record("al_trace_001", original_prompt="First prompt")
        dup = _sample_detector_record("al_trace_001", original_prompt="Duplicate prompt")

        gt_first = _sample_gt_record("al_trace_001", has_deviation=False, deviation_type="none")
        gt_dup = _sample_gt_record("al_trace_001", has_deviation=True, deviation_type="drift")

        _write_jsonl(det_file, [first, dup])
        _write_jsonl(gt_file, [gt_first, gt_dup])

        repo = TraceRepository(detector_input_path=det_file, corrected_full_path=gt_file)
        assert repo.primary_count == 1
        assert repo.get_trace("al_trace_001").prompt == "First prompt"
        assert repo.get_ground_truth("al_trace_001")["deviation_type"] == "none"
        assert repo.load_report["duplicate_detector_ids"] == ["al_trace_001"]
        assert repo.load_report["duplicate_gt_ids"] == ["al_trace_001"]

    def test_unmatched_records_reported_in_both_directions(self, tmp_path):
        det_file = tmp_path / "detector_input.jsonl"
        gt_file = tmp_path / "corrected_full.jsonl"

        _write_jsonl(
            det_file,
            [
                _sample_detector_record("al_trace_001"),
                _sample_detector_record("al_trace_only_det"),
            ],
        )
        _write_jsonl(
            gt_file,
            [
                _sample_gt_record("al_trace_001"),
                _sample_gt_record("al_trace_only_gt"),
            ],
        )

        repo = TraceRepository(detector_input_path=det_file, corrected_full_path=gt_file)
        assert repo.primary_count == 2
        assert repo.load_report["unmatched_detector_ids"] == ["al_trace_only_det"]
        assert repo.load_report["unmatched_gt_ids"] == ["al_trace_only_gt"]

    def test_review_only_not_detector_ready_records_skipped(self, tmp_path):
        det_file = tmp_path / "detector_input.jsonl"
        gt_file = tmp_path / "corrected_full.jsonl"

        valid = _sample_detector_record("al_trace_001")
        review_only = _sample_detector_record("al_trace_review")
        review_only["_status"] = "REVIEW_ONLY_NOT_DETECTOR_READY"

        _write_jsonl(det_file, [valid, review_only])
        _write_jsonl(gt_file, [_sample_gt_record("al_trace_001")])

        repo = TraceRepository(detector_input_path=det_file, corrected_full_path=gt_file)
        assert repo.primary_count == 1
        assert repo.get_trace("al_trace_review") is None
        assert repo.load_report["skipped_review_only"] == 1


# ---------------------------------------------------------------------------
# 7. Ground-truth isolation
# ---------------------------------------------------------------------------

class TestGroundTruthIsolation:
    def test_intent_and_steps_contain_no_ground_truth_fields(self):
        repo = TraceRepository()
        trace = repo.get_trace("al_trace_006")
        intent = trace.create_intent(embedding=np.ones(384, dtype=float))

        intent_field_names = {f.name for f in fields(Intent)}
        assert intent_field_names == {"prompt", "embedding", "allowed_verbs", "forbidden_verbs"}
        for forbidden_attr in (
            "ground_truth",
            "groundTruth",
            "has_deviation",
            "deviation_type",
            "flagged_steps",
            "flagged_step_id",
            "expected_type",
            "expected_step",
        ):
            assert not hasattr(intent, forbidden_attr)

        step_field_names = {f.name for f in fields(Step)}
        assert step_field_names == {
            "step_id",
            "action_type",
            "tool_called",
            "tool_input",
            "tool_output",
            "agent_reasoning",
        }
        for step in trace.steps:
            assert not hasattr(step, "ground_truth")
            assert not hasattr(step, "flagged")
            assert not hasattr(step, "has_deviation")

        # Sanitized raw_data must not hold any ground-truth keys
        for gt_key in ("ground_truth", "groundTruth", "expected_step", "expected_type"):
            assert gt_key not in trace.raw_data

    def test_inline_ground_truth_in_detector_input_is_ignored(self, tmp_path):
        det_file = tmp_path / "detector_input.jsonl"
        gt_file = tmp_path / "corrected_full.jsonl"

        # Inject a fake inline ground_truth into detector-input
        injected = _sample_detector_record("al_trace_001")
        injected["ground_truth"] = {
            "has_deviation": True,
            "deviation_type": "drift",
            "flagged_steps": [1],
            "flagged_step_id": 1,
            "annotation_explanation": "Injected fake GT",
        }
        # True ground truth in corrected_full is on-task (none)
        real_gt = _sample_gt_record("al_trace_001", has_deviation=False, deviation_type="none")

        _write_jsonl(det_file, [injected])
        _write_jsonl(gt_file, [real_gt])

        repo = TraceRepository(detector_input_path=det_file, corrected_full_path=gt_file)
        trace = repo.get_trace("al_trace_001")
        assert "ground_truth" not in trace.raw_data
        assert trace.ground_truth["has_deviation"] is False
        assert trace.ground_truth["deviation_type"] == "none"

    def test_detector_prediction_is_invariant_to_ground_truth(self):
        repo = TraceRepository()
        trace = repo.get_trace("al_trace_006")
        intent = trace.create_intent()
        curve = [0.85, 0.84, 0.30, 0.28]

        dev_before = detect_from_curve(trace.steps, curve, intent)
        scope_before = scope_violations(trace.steps, intent)

        # Mutate ground truth completely; detector output must be identical
        trace.ground_truth["has_deviation"] = False
        trace.ground_truth["deviation_type"] = "none"
        trace.ground_truth["flagged_steps"] = []
        trace.ground_truth["flagged_step_id"] = None

        dev_after = detect_from_curve(trace.steps, curve, trace.create_intent())
        scope_after = scope_violations(trace.steps, trace.create_intent())

        assert dev_before == dev_after
        assert scope_before == scope_after


# ---------------------------------------------------------------------------
# 8. Missing dataset file handling
# ---------------------------------------------------------------------------

class TestMissingDatasetFileHandling:
    def test_missing_detector_input_non_strict_returns_empty_without_dev_mix(self, tmp_path):
        missing_det = tmp_path / "does_not_exist.jsonl"
        repo = TraceRepository(
            detector_input_path=missing_det,
            corrected_full_path=CORRECTED_FULL_PATH,
            strict=False,
        )
        assert repo.dataset_source == "missing"
        assert repo.primary_count == 0
        assert repo.list_traces() == []
        assert len(repo.load_report["errors"]) >= 1

    def test_missing_detector_input_strict_raises_file_not_found(self, tmp_path):
        missing_det = tmp_path / "does_not_exist.jsonl"
        with pytest.raises(FileNotFoundError):
            TraceRepository(
                detector_input_path=missing_det,
                corrected_full_path=CORRECTED_FULL_PATH,
                strict=True,
            )

    def test_missing_ground_truth_file_non_strict_loads_inputs_with_warning(self, tmp_path):
        det_file = tmp_path / "detector_input.jsonl"
        missing_gt = tmp_path / "missing_gt.jsonl"
        _write_jsonl(det_file, [_sample_detector_record("al_trace_001")])

        repo = TraceRepository(
            detector_input_path=det_file,
            corrected_full_path=missing_gt,
            strict=False,
        )
        assert repo.dataset_source == "corrected_300"
        assert repo.primary_count == 1
        assert repo.load_report["unmatched_detector_ids"] == ["al_trace_001"]
        assert any("not found" in w.lower() for w in repo.load_report["warnings"])

    def test_missing_ground_truth_file_strict_raises_file_not_found(self, tmp_path):
        det_file = tmp_path / "detector_input.jsonl"
        missing_gt = tmp_path / "missing_gt.jsonl"
        _write_jsonl(det_file, [_sample_detector_record("al_trace_001")])

        with pytest.raises(FileNotFoundError):
            TraceRepository(
                detector_input_path=det_file,
                corrected_full_path=missing_gt,
                strict=True,
            )

    def test_missing_dev_fallback_strict_raises_file_not_found(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            TraceRepository.from_dev_fallback(
                dev_traces_path=tmp_path / "missing_dev.json",
                strict=True,
            )


# ---------------------------------------------------------------------------
# 8. Review-only boolean normalization and detector payload metadata isolation
# ---------------------------------------------------------------------------

class TestReviewOnlyBooleanNormalizationAndMetadataIsolation:
    def test_normalize_bool_actual_booleans(self):
        assert normalize_bool(True) is True
        assert normalize_bool(False) is False

    def test_normalize_bool_string_values(self):
        # Truthy strings
        assert normalize_bool("true") is True
        assert normalize_bool("True") is True
        assert normalize_bool("TRUE") is True
        assert normalize_bool("  true  ") is True
        assert normalize_bool("\tTrue\n") is True

        # Falsy strings
        assert normalize_bool("false") is False
        assert normalize_bool("False") is False
        assert normalize_bool("FALSE") is False
        assert normalize_bool("  false  ") is False
        assert normalize_bool("\tFalse\n") is False

    def test_normalize_bool_numeric_values(self):
        assert normalize_bool(1) is True
        assert normalize_bool(1.0) is True
        assert normalize_bool(0) is False
        assert normalize_bool(0.0) is False

    def test_normalize_bool_invalid_string_values(self):
        # Do not interpret arbitrary non-empty strings as True
        invalid_strings = ["invalid", "maybe", "yes", "no", "t", "f", "1", "0", "", "   ", "null", "undefined"]
        for s in invalid_strings:
            with pytest.raises(ValueError, match="Invalid boolean string value"):
                normalize_bool(s)

    def test_normalize_bool_invalid_non_strings(self):
        with pytest.raises(ValueError, match="Invalid boolean numeric value"):
            normalize_bool(2)
        with pytest.raises(ValueError, match="Invalid boolean numeric value"):
            normalize_bool(-1)
        with pytest.raises(ValueError, match="Invalid boolean value of type list"):
            normalize_bool([True])
        with pytest.raises(ValueError, match="Invalid boolean value of type dict"):
            normalize_bool({"key": True})

    def test_normalize_bool_none(self):
        assert normalize_bool(None) is None
        assert normalize_bool(None, default=False) is False
        assert normalize_bool(None, default=True) is True

    def test_metadata_fields_stripped_from_detector_raw_input_payload(self):
        raw_input = {
            "trace_id": "al_trace_strip_test",
            "original_prompt": "Inspect the model metrics.",
            "intent": {
                "allowed_actions": ["read"],
                "forbidden_actions": ["write"],
            },
            "steps": [
                {
                    "step_id": 1,
                    "action_type": "read",
                    "tool_called": "reader",
                    "tool_input": "metrics.csv",
                    "tool_output": "acc=0.9",
                    "agent_reasoning": "read metrics",
                }
            ],
            # Evaluation and split metadata present in raw input
            "sample_split": "test",
            "sampleSplit": "test",
            "sample_review_only": "false",
            "sampleReviewOnly": False,
            "review_only": "true",
            "reviewOnly": 1,
            "is_review_only": 0,
            "isReviewOnly": "false",
            "ground_truth": {"has_deviation": False},
            "expected_step": None,
            "expected_type": "none",
        }

        trace = _normalize_trace_dict(raw_input, default_idx=1, require_trace_id=True)

        # 1. Prompt and steps are preserved
        assert trace.prompt == "Inspect the model metrics."
        assert len(trace.steps) == 1
        assert trace.allowed_verbs == {"read"}
        assert trace.forbidden_verbs == {"write"}

        # 2. Raw data retains valid input fields
        assert "original_prompt" in trace.raw_data
        assert "steps" in trace.raw_data
        assert "intent" in trace.raw_data

        # 3. All split, review-only, and GT fields are strictly removed from raw_data
        for forbidden_key in (
            "sample_split",
            "sampleSplit",
            "sample_review_only",
            "sampleReviewOnly",
            "review_only",
            "reviewOnly",
            "is_review_only",
            "isReviewOnly",
            "ground_truth",
            "expected_step",
            "expected_type",
        ):
            assert forbidden_key not in trace.raw_data

        # 4. Ground truth object is isolated from raw_data
        assert trace.ground_truth != trace.raw_data

    def test_is_review_only_consistent_with_all_variations(self, tmp_path):
        det_file = tmp_path / "det.jsonl"
        gt_file = tmp_path / "gt.jsonl"
        steps = [{"step_id": 1, "action_type": "read"}]

        _write_jsonl(det_file, [
            _sample_detector_record("t_bool_true", steps=steps),
            _sample_detector_record("t_str_true", steps=steps),
            _sample_detector_record("t_num_true", steps=steps),
            _sample_detector_record("t_bool_false", steps=steps),
            _sample_detector_record("t_str_false", steps=steps),
            _sample_detector_record("t_num_false", steps=steps),
            _sample_detector_record("t_rev_only_key", steps=steps),
            _sample_detector_record("t_is_rev_only_key", steps=steps),
        ])
        _write_jsonl(gt_file, [
            {"trace_id": "t_bool_true", "sample_split": "test", "sample_review_only": True},
            {"trace_id": "t_str_true", "sample_split": "test", "sample_review_only": "true"},
            {"trace_id": "t_num_true", "sample_split": "test", "sample_review_only": 1},
            {"trace_id": "t_bool_false", "sample_split": "test", "sample_review_only": False},
            {"trace_id": "t_str_false", "sample_split": "test", "sample_review_only": "false"},
            {"trace_id": "t_num_false", "sample_split": "test", "sample_review_only": 0},
            {"trace_id": "t_rev_only_key", "sample_split": "test", "review_only": "true"},
            {"trace_id": "t_is_rev_only_key", "sample_split": "test", "is_review_only": 1},
        ])

        repo = TraceRepository(detector_input_path=det_file, corrected_full_path=gt_file)
        assert repo.is_review_only("t_bool_true") is True
        assert repo.is_review_only("t_str_true") is True
        assert repo.is_review_only("t_num_true") is True
        assert repo.is_review_only("t_rev_only_key") is True
        assert repo.is_review_only("t_is_rev_only_key") is True

        assert repo.is_review_only("t_bool_false") is False
        assert repo.is_review_only("t_str_false") is False
        assert repo.is_review_only("t_num_false") is False
