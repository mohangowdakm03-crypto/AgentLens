"""Unit and integration tests for AgentLens fine-tuned LLM service (Steps 4 & 5)."""

import pytest
from unittest.mock import patch
from api.loader import repository
from api.service import detector_service
from api.llm import extract_trigger_tokens, parse_repair_json, format_step_repr


def test_trigger_token_extraction():
    explanation = "The phrase 'clean up' in the user prompt caused the agent to delete comments and refactor code."
    prompt = "Clean up my code"
    triggers = extract_trigger_tokens(explanation, prompt)
    assert "clean up" in triggers or "Clean up" in triggers


def test_parse_repair_json_clean():
    sample_json = '''{
        "corrected_prompt": "Format my code",
        "diff": [{"old": "Clean up", "new": "Format", "reason": "Specific action"}],
        "justification": "Prevents destructive comment deletion."
    }'''
    res = parse_repair_json(sample_json)
    assert res["corrected_prompt"] == "Format my code"
    assert len(res["diff"]) == 1
    assert res["diff"][0]["old"] == "Clean up"
    assert "destructive" in res["justification"]


def test_parse_repair_json_markdown_wrapped():
    wrapped = '''```json
    {
        "corrected_prompt": "Search arXiv for papers",
        "diff": [{"old": "recent papers", "new": "arXiv papers from 2024-2026", "reason": "Date boundary"}],
        "justification": "Grounds search."
    }
    ```'''
    res = parse_repair_json(wrapped)
    assert res["corrected_prompt"] == "Search arXiv for papers"
    assert len(res["diff"]) == 1


def test_llm_integration_with_nominal_trace():
    # al_trace_001 is a nominal compliant trace
    loaded = repository.get_trace("al_trace_001")
    res = detector_service.run_detection(loaded, run_llm=True)
    assert res.audit.isDeviated is False
    assert res.causalAttribution is not None
    assert "No deviation detected" in res.causalAttribution.explanation
    assert res.promptRepair is not None
    assert res.promptRepair.correctedPrompt == loaded.prompt
    assert len(res.promptRepair.diff) == 0


def test_llm_integration_with_drift_trace_mocked():
    loaded = repository.get_trace("al_trace_006")
    with patch("api.service.generate_causal_attribution") as mock_causal, \
         patch("api.service.generate_prompt_repair") as mock_repair:
        mock_causal.return_value = ("Ambiguous word 'info' caused historical drift.", ["info"])
        mock_repair.return_value = {
            "corrected_prompt": "Get today's weather forecast for Mysuru",
            "diff": [{"old": "info", "new": "today's forecast", "reason": "Time boundary"}],
            "justification": "Prevents historical retrieval."
        }
        res = detector_service.run_detection(loaded, run_llm=True)

    assert res.audit.isDeviated is True
    assert res.causalAttribution is not None
    assert res.causalAttribution.explanation == "Ambiguous word 'info' caused historical drift."
    assert res.causalAttribution.triggerTokens == ["info"]
    assert res.promptRepair is not None
    assert res.promptRepair.correctedPrompt == "Get today's weather forecast for Mysuru"
    assert len(res.promptRepair.diff) == 1
    assert res.promptRepair.diff[0].old == "info"
