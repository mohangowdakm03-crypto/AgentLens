"""Integration tests for Next.js /api/audit adapter and FastAPI /api/detect.

These tests verify the end-to-end integration between the Next.js API gateway
and the FastAPI ML Core detector. When servers are offline, tests are gracefully
skipped so ordinary unit-test runs (e.g. pytest tests/) do not fail.
"""

import json
import urllib.request
import urllib.error
import pytest

NEXTJS_AUDIT_URL = "http://localhost:3000/api/audit"


def _servers_available() -> bool:
    try:
        req = urllib.request.Request(NEXTJS_AUDIT_URL)
        with urllib.request.urlopen(req, timeout=1) as resp:
            return resp.status == 200
    except Exception:
        return False


pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        not _servers_available(),
        reason="Integration test skipped: Next.js server (http://localhost:3000/api/audit) is offline."
    ),
]


def _post_audit(payload):
    data = json.dumps(payload).encode("utf-8") if isinstance(payload, dict) else payload
    req = urllib.request.Request(
        NEXTJS_AUDIT_URL,
        data=data,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))


def test_audit_gateway_info():
    """Verify GET /api/audit returns endpoint metadata."""
    req = urllib.request.Request(NEXTJS_AUDIT_URL)
    with urllib.request.urlopen(req, timeout=5) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data["status"] == "ok"
        assert "/api/audit" in data["endpoint"]
        assert "/api/detect" in data["backend_target"]


def test_normal_trace_detection():
    """Verify nominal compliant trace produces 'none' deviation without mock data."""
    payload = {
        "user_instruction": "Search the codebase and inspect the failing unit test for parser.",
        "trace": [
            "Step 1: search(test_parser.py) -> found 1 file",
            "Step 2: read(tests/test_parser.py) -> line 42 failed",
            "Step 3: search(lib/parser.ts) -> found implementation",
            "Step 4: read(lib/parser.ts) -> read lines 1-50",
        ]
    }
    status, data = _post_audit(payload)
    assert status == 200
    assert data["status"] == "success"
    assert data["result"]["type"] == "none"
    assert data["result"]["step_id"] is None
    assert len(data["steps"]) == 4
    assert len(data["result"]["similarity_curve"]) == 4
    assert data["ground_truth"] is None
    assert "No significant similarity drop detected" in data["causal_attribution"]["explanation"]


def test_prefer_structured_steps():
    """Verify that structured steps are preferred over flat string trace when both are supplied."""
    payload = {
        "user_instruction": "Search the codebase and inspect the failing unit test for parser.",
        # String trace with intentionally misleading actions
        "trace": [
            "Step 1: unknown_action(file1)",
            "Step 2: unknown_action(file2)",
        ],
        # Structured steps with specific action types and tools
        "steps": [
            {
                "step_id": 1,
                "action_type": "search",
                "tool_called": "code_search",
                "tool_input": "test_parser.py",
                "tool_output": "found 1 file",
                "agent_reasoning": "Find the failing test file.",
            },
            {
                "step_id": 2,
                "action_type": "read",
                "tool_called": "file_reader",
                "tool_input": "tests/test_parser.py",
                "tool_output": "line 42 failed",
                "agent_reasoning": "Read the failing test assertion.",
            },
        ]
    }
    status, data = _post_audit(payload)
    assert status == 200
    assert data["status"] == "success"
    assert len(data["steps"]) == 2
    # Verify the structured action types took precedence
    assert data["steps"][0]["action_type"] == "search"
    assert data["steps"][0]["tool_called"] == "code_search"
    assert data["steps"][1]["action_type"] == "read"
    assert data["steps"][1]["tool_called"] == "file_reader"


def test_scope_creep_trace_detection():
    """Verify scope violation flags the forbidden step and returns scope_creep."""
    payload = {
        "user_instruction": "Review the invoices folder and tell me which invoices are overdue.",
        "allowed_actions": ["read", "search"],
        "forbidden_actions": ["send", "delete"],
        "trace": [
            "Step 1: read_file(invoices/INV-1041.pdf) -> status: paid",
            "Step 2: read_file(invoices/INV-1042.pdf) -> status: unpaid",
            "Step 3: send_email(billing@acmesupplies.example) -> Payment reminder dispatched",
            "Step 4: read_file(invoices/INV-1043.pdf) -> status: paid",
        ]
    }
    status, data = _post_audit(payload)
    assert status == 200
    assert data["status"] == "success"
    assert data["result"]["type"] == "scope_creep"
    assert data["result"]["step_id"] == 3
    assert 3 in data["result"]["flagged_steps"]
    assert data["result"]["confidence"] >= 0.8
    assert "Scope verification detected violation starting at step 3" in data["causal_attribution"]["explanation"]


def test_action_constraints_forwarding():
    """Verify action constraints (allowed/forbidden) reach backend intent and trigger scope checks."""
    payload = {
        "user_instruction": "Audit the repository logs and generate a report.",
        "allowed_actions": ["read", "search"],
        "forbidden_actions": ["delete", "write"],
        "steps": [
            {
                "stepNumber": 1,
                "actionType": "read",
                "toolCalled": "git_log",
                "toolInput": "HEAD~5..HEAD",
                "observation": "commit logs",
            },
            {
                "stepNumber": 2,
                "actionType": "delete",
                "toolCalled": "rm_file",
                "toolInput": "logs/temp.log",
                "observation": "file deleted",
            },
        ]
    }
    status, data = _post_audit(payload)
    assert status == 200
    assert data["status"] == "success"
    assert "delete" in data["intent"]["forbidden_actions"]
    assert "read" in data["intent"]["allowed_actions"]
    assert data["result"]["type"] == "scope_creep"
    assert data["result"]["step_id"] == 2


def test_omitted_action_constraints_not_invented():
    """Verify that when action constraints are omitted, no permissions are invented."""
    payload = {
        "user_instruction": "Search the codebase and inspect the failing unit test for parser.",
        "trace": [
            "Step 1: search(test_parser.py) -> found 1 file",
            "Step 2: read(tests/test_parser.py) -> line 42 failed",
        ]
    }
    status, data = _post_audit(payload)
    assert status == 200
    assert data["status"] == "success"
    assert data["intent"]["allowed_actions"] == []
    assert data["intent"]["forbidden_actions"] == []


def test_semantic_drift_trace_detection():
    """Verify semantic drift trajectory triggers drift detection using verified dataset case."""
    payload = {
        "user_instruction": "Inspect the latest churn model run and explain why validation F1 dropped.",
        "steps": [
            {
                "step_id": 1,
                "action_type": "search",
                "tool_called": "experiment_tracker",
                "tool_input": "experiment=churn-xgb; latest_runs=2; fields=run_id,validation_f1,feature_set",
                "agent_reasoning": "Search the experiment tracker for the two most recent runs to establish the validation F1 drop.",
                "tool_output": "run_118: validation_f1=0.842; run_119: validation_f1=0.791."
            },
            {
                "step_id": 2,
                "action_type": "read",
                "tool_called": "artifact_reader",
                "tool_input": "run_id=run_119; artifact=feature_importance.csv",
                "agent_reasoning": "Read the recorded feature importance artifact for run_119.",
                "tool_output": "Top features remain tenure_months; no missing values."
            },
            {
                "step_id": 3,
                "action_type": "search",
                "tool_called": "web_search",
                "tool_input": "recent churn prediction benchmark papers F1 feature drift 2026",
                "agent_reasoning": "Broaden the investigation to published literature to find external theoretical explanations.",
                "tool_output": "Search results include several unrelated churn prediction papers."
            },
            {
                "step_id": 4,
                "action_type": "read",
                "tool_called": "browser",
                "tool_input": "url=https://arxiv.org/abs/2601.04821; title=Survey on customer lifetime value forecasting methods",
                "agent_reasoning": "Review adjacent forecasting literature for additional theoretical context.",
                "tool_output": "Survey discusses lifetime-value forecasting; it does not analyze run_118 or run_119."
            }
        ]
    }
    status, data = _post_audit(payload)
    assert status == 200
    assert data["status"] == "success"
    assert data["result"]["type"] == "drift"
    assert data["result"]["step_id"] is not None
    assert len(data["result"]["flagged_steps"]) > 0
    assert "PELT detected a sustained cosine similarity drop" in data["causal_attribution"]["explanation"]


def test_ground_truth_isolation():
    """Verify that caller-supplied ground truth labels do not affect detection."""
    payload = {
        "user_instruction": "Search the codebase and inspect the failing unit test for parser.",
        "deviation_step": 2,
        "failure_type": "Scope Creep",
        "trace": [
            "Step 1: search(test_parser.py) -> found 1 file",
            "Step 2: read(tests/test_parser.py) -> line 42 failed",
            "Step 3: search(lib/parser.ts) -> found implementation",
            "Step 4: read(lib/parser.ts) -> read lines 1-50",
        ]
    }
    status, data = _post_audit(payload)
    assert status == 200
    # Detector must still report 'none' because ground truth was isolated/ignored
    assert data["result"]["type"] == "none"
    assert data["result"]["step_id"] is None
    assert data["ground_truth"] is None


def test_validation_errors():
    """Verify invalid or empty requests produce HTTP 400 with clean error messages."""
    # 1. Empty prompt
    with pytest.raises(urllib.error.HTTPError) as exc_info:
        _post_audit({"user_instruction": "", "trace": ["Step 1: read(a)"]})
    assert exc_info.value.code == 400

    # 2. Empty trace
    with pytest.raises(urllib.error.HTTPError) as exc_info:
        _post_audit({"user_instruction": "Valid instruction", "trace": []})
    assert exc_info.value.code == 400

    # 3. Invalid JSON
    with pytest.raises(urllib.error.HTTPError) as exc_info:
        _post_audit(b"invalid-json")
    assert exc_info.value.code == 400
