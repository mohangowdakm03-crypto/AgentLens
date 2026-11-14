import numpy as np
from agentlens.schema import Step, Intent
from agentlens.drift.embed import cosine
from agentlens.drift.detect import find_drift_step, detect_from_curve


def make_steps(actions):
    return [Step(i + 1, a) for i, a in enumerate(actions)]


def test_cosine():
    assert abs(cosine([1, 0], [1, 0]) - 1) < 1e-9
    assert abs(cosine([1, 0], [0, 1])) < 1e-9


def test_pelt_finds_known_drop():
    curve = [0.82, 0.80, 0.81, 0.42, 0.40, 0.41]       # drop at index 3 = step 4
    idx, _ = find_drift_step(curve)
    assert idx == 3


def test_no_drift_on_flat_curve():
    assert find_drift_step([0.80, 0.79, 0.81, 0.80, 0.82])[0] is None


def test_fallback_on_short_trace():
    idx, _ = find_drift_step([0.8, 0.8, 0.3])
    assert idx == 2


def test_scope_creep_detected_even_if_similarity_high():
    steps = make_steps(["read", "write", "write", "modify_config"])
    intent = Intent("add discount", allowed_verbs={"read", "write"}, forbidden_verbs=set())
    dev = detect_from_curve(steps, [0.8, 0.8, 0.79, 0.78], intent)
    assert dev.step_id == 4 and dev.type == "scope_creep"


def test_case3_drift():
    steps = make_steps(["search", "search", "search", "generate", "generate", "generate"])
    intent = Intent("search papers", allowed_verbs={"search", "generate"})
    dev = detect_from_curve(steps, [0.82, 0.8, 0.79, 0.41, 0.4, 0.42], intent)
    assert dev.step_id == 4 and dev.type == "drift"
