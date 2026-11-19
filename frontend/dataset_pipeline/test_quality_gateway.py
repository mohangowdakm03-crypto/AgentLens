"""
Unit tests for QualityCheckGateway.
Verifies that:
1. All 15 original seed examples pass 100%.
2. Deliberately corrupted/flawed examples are strictly rejected with expected codes.
"""

import json
import pytest
from quality_gateway import QualityCheckGateway
from models import AgentTraceRecord


def load_seeds(path: str):
    records = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                records.append(json.loads(line))
    return records


def test_original_15_seeds_pass():
    seeds_path = r"c:\Users\moham\Downloads\agentlens_detector_seeds_15.jsonl"
    seeds = load_seeds(seeds_path)
    assert len(seeds) == 15, f"Expected 15 seeds, found {len(seeds)}"

    gateway = QualityCheckGateway()

    for idx, raw in enumerate(seeds):
        is_valid, res, record = gateway.validate(raw)
        assert is_valid, f"Seed {raw.get('trace_id')} failed validation: {res.rejection_code} - {res.rejection_reason}"
        assert record is not None

    assert gateway.total_passed == 15
    assert gateway.total_rejected == 0
    print("[PASS] All 15 original seeds passed the Quality Gateway!")


def test_rejections_on_flawed_traces():
    seeds_path = r"c:\Users\moham\Downloads\agentlens_detector_seeds_15.jsonl"
    seeds = load_seeds(seeds_path)
    base_seed = seeds[0]  # Normal trace seed_001

    # 1. Test Duplicate ID
    gw = QualityCheckGateway()
    gw.validate(base_seed)
    is_valid, res, _ = gw.validate(base_seed)
    assert not is_valid
    assert res.rejection_code == "DUPLICATE_TRACE_ID"

    # 2. Test Normal Trace with Forbidden Action
    bad_normal = json.loads(json.dumps(base_seed))
    bad_normal["trace_id"] = "bad_normal_01"
    bad_normal["original_prompt"] = "Something totally distinct about checking files."
    # Add a forbidden write step into a normal trace!
    bad_normal["steps"][2]["action_type"] = "delete"
    is_valid, res, _ = gw.validate(bad_normal)
    assert not is_valid
    assert res.rejection_code == "NORMAL_TRACE_CONTAINS_FORBIDDEN_ACTION"

    # 3. Test Non-Sequential Step IDs
    bad_steps = json.loads(json.dumps(base_seed))
    bad_steps["trace_id"] = "bad_steps_01"
    bad_steps["original_prompt"] = "Completely different query for testing step sequences."
    bad_steps["steps"][2]["step_id"] = 99  # Skip sequence!
    is_valid, res, _ = gw.validate(bad_steps)
    assert not is_valid
    assert res.rejection_code == "NON_SEQUENTIAL_STEP_IDS"

    # 4. Test Flagged Step Out of Bounds
    bad_flag = json.loads(json.dumps(seeds[2]))  # scope_creep seed_003
    bad_flag["trace_id"] = "bad_flag_01"
    bad_flag["original_prompt"] = "Audit customer payment records for discrepancies."
    bad_flag["ground_truth"]["flagged_step_id"] = 42  # Out of bounds!
    is_valid, res, _ = gw.validate(bad_flag)
    assert not is_valid
    assert res.rejection_code == "FLAGGED_STEP_OUT_OF_BOUNDS"

    # 5. Test Scope Creep with Earlier Forbidden Step Unflagged
    bad_scope = json.loads(json.dumps(seeds[2]))  # scope_creep seed_003
    bad_scope["trace_id"] = "bad_scope_01"
    bad_scope["original_prompt"] = "Check inventory count and verify against warehouse records."
    # Inject a forbidden step at step 2, but keep flagged_step_id at step 5
    bad_scope["steps"][1]["action_type"] = "delete"
    is_valid, res, _ = gw.validate(bad_scope)
    assert not is_valid
    assert res.rejection_code == "EARLIER_UNFLAGGED_FORBIDDEN_STEP"

    # 6. Test Missing Trigger Phrase
    bad_tp = json.loads(json.dumps(seeds[2]))
    bad_tp["trace_id"] = "bad_tp_01"
    bad_tp["original_prompt"] = "Review the ledger files and list pending items."
    bad_tp["ground_truth"]["trigger_phrase"] = "totally absent phrase"
    is_valid, res, _ = gw.validate(bad_tp)
    assert not is_valid
    assert res.rejection_code == "TRIGGER_PHRASE_NOT_IN_PROMPT"

    print("[PASS] All flaw injection scenarios were accurately rejected!")


if __name__ == "__main__":
    test_original_15_seeds_pass()
    test_rejections_on_flawed_traces()
