"""
Unit tests for the AgentLens drift detection pipeline.

External model loading (MiniLM / sentence-transformers) is mocked wherever
tests do not need real embeddings.  All tests are deterministic.
"""
import numpy as np
import pytest
from unittest.mock import patch, MagicMock

from agentlens.schema import Step, Intent
from agentlens.drift.embed import cosine
from agentlens.drift.detect import analyze_drift_curve, find_drift_step, detect_from_curve, detect_deviation
from agentlens.drift.curve import similarity_curve, step_text


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_steps(actions):
    return [Step(i + 1, a) for i, a in enumerate(actions)]


def _fake_embed(texts):
    """Deterministic fake embedder: returns unit vectors in R^2 based on hash."""
    rng = np.random.default_rng(42)
    n = len(texts)
    if n == 0:
        return np.zeros((0, 2))
    vecs = rng.standard_normal((n, 2))
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1.0, norms)
    return vecs / norms


# ===========================================================================
# ORIGINAL TESTS (must remain passing)
# ===========================================================================

class TestOriginalSuite:
    def test_cosine(self):
        assert abs(cosine([1, 0], [1, 0]) - 1) < 1e-9
        assert abs(cosine([1, 0], [0, 1])) < 1e-9

    def test_pelt_finds_known_drop(self):
        curve = [0.82, 0.80, 0.81, 0.42, 0.40, 0.41]       # drop at index 3 = step 4
        idx, _ = find_drift_step(curve)
        assert idx == 3

    def test_pelt_analysis_reports_method_and_segment_means(self):
        analysis = analyze_drift_curve([0.82, 0.80, 0.81, 0.42, 0.40, 0.41])
        assert analysis.method == "pelt"
        assert analysis.index == 3
        assert analysis.similarity_before > analysis.similarity_after

    def test_no_drift_on_flat_curve(self):
        assert find_drift_step([0.80, 0.79, 0.81, 0.80, 0.82])[0] is None

    def test_fallback_on_short_trace(self):
        idx, _ = find_drift_step([0.8, 0.8, 0.3])
        assert idx == 2

    def test_scope_creep_detected_even_if_similarity_high(self):
        steps = make_steps(["read", "write", "write", "modify_config"])
        intent = Intent("add discount", allowed_verbs={"read", "write"}, forbidden_verbs=set())
        dev = detect_from_curve(steps, [0.8, 0.8, 0.79, 0.78], intent)
        assert dev.step_id == 4 and dev.type == "scope_creep"

    def test_case3_drift(self):
        steps = make_steps(["search", "search", "search", "generate", "generate", "generate"])
        intent = Intent("search papers", allowed_verbs={"search", "generate"})
        dev = detect_from_curve(steps, [0.82, 0.8, 0.79, 0.41, 0.4, 0.42], intent)
        assert dev.step_id == 4 and dev.type == "drift"


# ===========================================================================
# TASK A — Case sensitivity
# ===========================================================================

class TestCaseSensitivity:
    """allowed_verbs and forbidden_verbs must work regardless of casing."""

    def test_allowed_verbs_uppercase_in_intent(self):
        """Action 'read' should match Intent(allowed_verbs={'READ'})."""
        steps = make_steps(["read", "write"])
        intent = Intent("task", allowed_verbs={"READ", "WRITE"}, forbidden_verbs=set())
        dev = detect_from_curve(steps, [0.8, 0.79], intent)
        # Neither step should trigger scope_creep
        assert dev.type == "none"
        assert dev.flagged_steps == []

    def test_forbidden_verbs_uppercase_in_intent(self):
        """Action 'delete' should match Intent(forbidden_verbs={'DELETE'})."""
        steps = make_steps(["read", "delete"])
        intent = Intent("task", allowed_verbs=set(), forbidden_verbs={"DELETE"})
        dev = detect_from_curve(steps, [0.8, 0.79], intent)
        assert 2 in dev.flagged_steps

    def test_mixed_case_allowed_verbs(self):
        """Mixed case in both action and allowed set."""
        steps = make_steps(["Read", "WRITE", "search"])
        intent = Intent("task", allowed_verbs={"read", "Write"}, forbidden_verbs=set())
        dev = detect_from_curve(steps, [0.8, 0.79, 0.4], intent)
        # 'search' is not in allowed_verbs → flagged
        assert 3 in dev.flagged_steps
        # 'Read' and 'WRITE' normalise to matches → not flagged
        assert 1 not in dev.flagged_steps
        assert 2 not in dev.flagged_steps

    def test_mixed_case_forbidden_verbs(self):
        """Forbidden verb matching is case-insensitive."""
        steps = make_steps(["Email", "read"])
        intent = Intent("task", allowed_verbs=set(), forbidden_verbs={"email"})
        dev = detect_from_curve(steps, [0.8, 0.79], intent)
        assert 1 in dev.flagged_steps
        assert 2 not in dev.flagged_steps

    def test_original_scope_creep_still_works_after_normalisation(self):
        """Existing lowercase test must still pass with the normalisation change."""
        steps = make_steps(["read", "write", "write", "modify_config"])
        intent = Intent("add discount", allowed_verbs={"read", "write"}, forbidden_verbs=set())
        dev = detect_from_curve(steps, [0.8, 0.8, 0.79, 0.78], intent)
        assert dev.step_id == 4 and dev.type == "scope_creep"


# ===========================================================================
# TASK B — Missing embedding validation
# ===========================================================================

class TestMissingEmbedding:
    """detect_deviation must raise ValueError when intent.embedding is None."""

    def test_raises_on_none_embedding(self):
        steps = make_steps(["read"])
        intent = Intent("do something")           # embedding defaults to None
        with pytest.raises(ValueError, match="intent.embedding is None"):
            detect_deviation(steps, intent)

    def test_error_message_is_descriptive(self):
        """The error message must guide the caller toward the fix."""
        steps = make_steps(["read"])
        intent = Intent("do something")
        with pytest.raises(ValueError) as exc_info:
            detect_deviation(steps, intent)
        msg = str(exc_info.value)
        assert "embed" in msg.lower()

    def test_no_error_when_embedding_provided(self):
        """detect_deviation must NOT raise when embedding is present."""
        steps = make_steps(["read"])
        intent_vec = np.array([1.0, 0.0])
        intent = Intent("do something", embedding=intent_vec)
        # similarity_curve uses embed_fn default which is captured at import time.
        # Patch get_model so the real embed() uses a fake model that never downloads MiniLM.
        fake_model = MagicMock()
        fake_model.encode.side_effect = lambda texts, **kw: _fake_embed(texts)
        with patch("agentlens.drift.embed.get_model", return_value=fake_model):
            dev = detect_deviation(steps, intent)
        assert dev is not None


# ===========================================================================
# TASK C — PELT error handling
# ===========================================================================

class TestPeltErrorHandling:
    """Unexpected exceptions from PELT must not be silently swallowed."""

    def test_pelt_bad_segmentation_falls_back(self):
        """BadSegmentationParameters triggers fallback, not propagation."""
        import ruptures as rpt
        curve = [0.9, 0.9, 0.3]
        with patch("ruptures.Pelt") as mock_pelt_cls:
            instance = MagicMock()
            instance.fit.return_value = instance
            instance.predict.side_effect = rpt.exceptions.BadSegmentationParameters
            mock_pelt_cls.return_value = instance
            idx, drop = find_drift_step(curve)
        # Fallback should detect the big single-step drop at index 2
        assert idx == 2

    def test_pelt_value_error_falls_back(self):
        """ValueError from PELT (e.g. all-identical signal) triggers fallback."""
        curve = [0.9, 0.9, 0.3]
        with patch("ruptures.Pelt") as mock_pelt_cls:
            instance = MagicMock()
            instance.fit.return_value = instance
            instance.predict.side_effect = ValueError("bad input")
            mock_pelt_cls.return_value = instance
            idx, drop = find_drift_step(curve)
        assert idx == 2

    def test_pelt_unexpected_error_propagates(self):
        """A programming error (e.g. NameError) must NOT be silently swallowed."""
        curve = [0.9, 0.9, 0.3]
        with patch("ruptures.Pelt") as mock_pelt_cls:
            instance = MagicMock()
            instance.fit.return_value = instance
            instance.predict.side_effect = RuntimeError("unexpected internal error")
            mock_pelt_cls.return_value = instance
            with pytest.raises(RuntimeError):
                find_drift_step(curve)

    def test_fallback_still_operates_after_pelt_failure(self):
        """When PELT fails, the fallback drop detector must still run."""
        import ruptures as rpt
        curve = [0.85, 0.80, 0.82, 0.30, 0.31]
        with patch("ruptures.Pelt") as mock_pelt_cls:
            instance = MagicMock()
            instance.fit.return_value = instance
            instance.predict.side_effect = rpt.exceptions.BadSegmentationParameters
            mock_pelt_cls.return_value = instance
            idx, drop = find_drift_step(curve)
        # Fallback: drop of ~0.52 at index 3
        assert idx == 3
        assert drop > FALLBACK_DROP_THRESHOLD


FALLBACK_DROP_THRESHOLD = 0.20   # mirrors FALLBACK_DROP constant


# ===========================================================================
# TASK D — Edge cases
# ===========================================================================

class TestEdgeCases:

    # --- Empty steps ---

    def test_empty_steps_returns_no_deviation(self):
        """An empty step list must produce Deviation(None, 'none', ...)."""
        intent = Intent("task", allowed_verbs={"read"})
        dev = detect_from_curve([], [], intent)
        assert dev.step_id is None
        assert dev.type == "none"
        assert dev.similarity_curve == []
        assert dev.flagged_steps == []

    def test_similarity_curve_empty_steps(self):
        """similarity_curve with no steps must return an empty list."""
        intent_vec = np.array([1.0, 0.0])
        result = similarity_curve([], intent_vec, embed_fn=_fake_embed)
        assert result == []

    def test_detect_deviation_empty_steps_without_embedding(self):
        """detect_deviation with empty steps returns none-deviation even without embedding."""
        intent = Intent("task")
        dev = detect_deviation([], intent)
        assert dev.step_id is None
        assert dev.type == "none"
        assert dev.confidence == 0.0
        assert dev.similarity_curve == []
        assert dev.flagged_steps == []

    def test_detect_deviation_empty_steps_with_embedding(self):
        """detect_deviation with empty steps returns none-deviation gracefully."""
        intent_vec = np.array([1.0, 0.0])
        intent = Intent("task", embedding=intent_vec)
        dev = detect_deviation([], intent)
        assert dev.step_id is None
        assert dev.type == "none"
        assert dev.confidence == 0.0
        assert dev.similarity_curve == []
        assert dev.flagged_steps == []

    # --- Single step ---

    def test_single_step_no_drift(self):
        """find_drift_step on a 1-element curve must return (None, 0) safely."""
        idx, drop = find_drift_step([0.5])
        assert idx is None
        assert drop == 0.0

    def test_single_step_detect_from_curve_no_crash(self):
        """detect_from_curve with one step must not raise."""
        steps = make_steps(["read"])
        intent = Intent("task", allowed_verbs={"read"})
        dev = detect_from_curve(steps, [0.7], intent)
        assert dev is not None

    def test_single_step_scope_violation(self):
        """Single step that is forbidden must still be flagged."""
        steps = make_steps(["delete"])
        intent = Intent("task", allowed_verbs=set(), forbidden_verbs={"delete"})
        dev = detect_from_curve(steps, [0.7], intent)
        assert dev.type == "scope_creep"
        assert dev.step_id == 1

    # --- Curve shorter than 3 points ---

    def test_two_point_curve_uses_fallback_detection(self):
        """A two-point curve can identify a sufficiently large adjacent drop."""
        idx, drop = find_drift_step([0.9, 0.3])
        assert idx == 1
        assert drop == pytest.approx(0.6)

    def test_two_point_curve_below_fallback_threshold_has_no_drift(self):
        idx, drop = find_drift_step([0.9, 0.71])
        assert idx is None
        assert drop == 0.0

    def test_one_point_curve_returns_no_drift(self):
        assert find_drift_step([0.5])[0] is None

    def test_zero_point_curve_returns_no_drift(self):
        assert find_drift_step([])[0] is None

    # --- All-zero similarity curve ---

    def test_all_zero_curve_no_drift(self):
        """An all-zero curve has no drop; detector must return 'none'."""
        steps = make_steps(["read", "read", "read", "read"])
        intent = Intent("task", allowed_verbs={"read"})
        dev = detect_from_curve(steps, [0.0, 0.0, 0.0, 0.0], intent)
        assert dev.step_id is None
        assert dev.type == "none"

    def test_all_zero_find_drift_step(self):
        idx, drop = find_drift_step([0.0, 0.0, 0.0, 0.0, 0.0])
        assert idx is None
        assert drop == 0.0

    def test_cosine_zero_vector_returns_zero(self):
        """cosine() must not raise for a zero vector; it must return 0.0."""
        result = cosine([0.0, 0.0], [1.0, 0.0])
        assert result == 0.0

    # --- Curve / step length mismatch ---

    def test_length_mismatch_raises(self):
        """detect_from_curve must raise ValueError for mismatched lengths."""
        steps = make_steps(["read", "write", "search"])
        intent = Intent("task")
        with pytest.raises(ValueError, match="curve length"):
            detect_from_curve(steps, [0.8, 0.7], intent)   # 2 values, 3 steps

    def test_length_mismatch_too_many_values(self):
        steps = make_steps(["read"])
        intent = Intent("task")
        with pytest.raises(ValueError, match="curve length"):
            detect_from_curve(steps, [0.8, 0.7, 0.6], intent)  # 3 values, 1 step

    def test_equal_lengths_no_error(self):
        steps = make_steps(["read", "write"])
        intent = Intent("task", allowed_verbs={"read", "write"})
        dev = detect_from_curve(steps, [0.8, 0.79], intent)
        assert dev is not None


# ===========================================================================
# TASK E — Additional drift and scope coverage
# ===========================================================================

class TestDriftAndScopeCoverage:

    def test_drift_before_scope_creep_wins(self):
        """When both drift and scope_creep are present, the earlier step wins."""
        steps = make_steps(["read", "read", "read", "search", "hack"])
        # drift at step 4 (index 3), scope_creep at step 4 too but hack at step 5
        intent = Intent("task", allowed_verbs={"read", "search"}, forbidden_verbs={"hack"})
        # curve drops at index 3
        dev = detect_from_curve(steps, [0.85, 0.82, 0.83, 0.35, 0.33], intent)
        # Both detected → confidence boosted (0.9) and earliest step chosen
        assert dev.type in ("drift", "scope_creep")
        assert dev.confidence == 0.9

    def test_scope_creep_forbidden_verb(self):
        """A step with a forbidden verb is flagged as scope_creep."""
        steps = make_steps(["read", "read", "email"])
        intent = Intent("task", allowed_verbs=set(), forbidden_verbs={"email"})
        dev = detect_from_curve(steps, [0.8, 0.8, 0.79], intent)
        assert dev.type == "scope_creep"
        assert 3 in dev.flagged_steps

    def test_no_deviation_on_clean_trace(self):
        """Clean trace with no violations or drops returns none."""
        steps = make_steps(["read", "read", "search", "search"])
        intent = Intent("task", allowed_verbs={"read", "search"})
        dev = detect_from_curve(steps, [0.85, 0.83, 0.84, 0.82], intent)
        assert dev.step_id is None
        assert dev.type == "none"

    def test_deviation_includes_full_curve(self):
        """The returned Deviation must carry the full similarity_curve."""
        steps = make_steps(["read", "read", "read", "hack"])
        curve = [0.85, 0.83, 0.82, 0.3]
        intent = Intent("task", allowed_verbs={"read"}, forbidden_verbs=set())
        dev = detect_from_curve(steps, curve, intent)
        assert dev.similarity_curve == curve

    def test_drift_confidence_capped_at_095(self):
        """Drift confidence must not exceed 0.95."""
        steps = make_steps(["s"] * 6)
        curve = [0.9, 0.88, 0.87, 0.1, 0.09, 0.08]   # drop of ~0.78
        intent = Intent("task", allowed_verbs={"s"})
        dev = detect_from_curve(steps, curve, intent)
        assert dev.confidence <= 0.95

    def test_similarity_curve_with_mock_embed(self):
        """similarity_curve wires step text through embed_fn correctly."""
        steps = make_steps(["read"])
        intent_vec = np.array([1.0, 0.0])
        result = similarity_curve(steps, intent_vec, embed_fn=_fake_embed)
        assert len(result) == 1
        assert -1.0 <= result[0] <= 1.0

    def test_step_text_includes_reasoning_input_and_output(self):
        s = Step(1, "read", tool_input="inp", tool_output="out", agent_reasoning="reasoning")
        assert step_text(s) == "reasoning inp out"

    def test_step_text_falls_back_to_tool_input(self):
        s = Step(1, "read", tool_input="inp", tool_output="", agent_reasoning="")
        assert step_text(s) == "inp"

    def test_step_text_ignores_missing_empty_and_whitespace_fields(self):
        s = Step(1, "read", tool_input="  input  ", tool_output=" \t ", agent_reasoning=None)
        assert step_text(s) == "input"


class TestArbitrationAndOrdering:
    """Regression tests for same-step arbitration and candidate ordering."""

    def test_drift_earlier_than_scope_creep(self):
        # 1. Drift at step 2, scope violation at step 3: primary is drift.
        steps = make_steps(["read", "read", "delete", "read"])
        intent = Intent("task", allowed_verbs={"read"}, forbidden_verbs={"delete"})
        # Large drop from step 1 (0.85) to step 2 (0.40) -> drift at step 2 (index 1)
        curve = [0.85, 0.40, 0.38, 0.37]
        dev = detect_from_curve(steps, curve, intent)
        assert dev.type == "drift"
        assert dev.step_id == 2

    def test_scope_creep_earlier_than_drift(self):
        # 2. Scope violation at step 2, drift at step 3: primary is scope_creep.
        steps = make_steps(["read", "delete", "read", "read"])
        intent = Intent("task", allowed_verbs={"read"}, forbidden_verbs={"delete"})
        # Flat curve at step 1-2, drop from step 2 (0.85) to step 3 (0.40) -> drift at step 3 (index 2)
        curve = [0.86, 0.85, 0.40, 0.38]
        dev = detect_from_curve(steps, curve, intent)
        assert dev.type == "scope_creep"
        assert dev.step_id == 2

    def test_both_drift_and_scope_creep_at_same_step_arbitration(self):
        # 3. Both at step 3: primary is scope_creep.
        steps = make_steps(["read", "read", "delete", "read"])
        intent = Intent("task", allowed_verbs={"read"}, forbidden_verbs={"delete"})
        # Flat curve at step 1-2, drop from step 2 (0.85) to step 3 (0.40) -> drift at step 3 (index 2)
        # Scope violation at step 3 ("delete")
        curve = [0.86, 0.85, 0.40, 0.38]
        dev = detect_from_curve(steps, curve, intent)
        assert dev.type == "scope_creep"
        assert dev.step_id == 3
        # Confidence calculation boosted when both are present
        assert dev.confidence == 0.9

    def test_non_consecutive_or_string_step_ids_detect_from_curve(self):
        # Steps with non-consecutive or string step IDs
        steps = [
            Step("step_alpha", "read"),
            Step("step_gamma", "read"),
            Step("step_beta", "delete"),
        ]
        intent = Intent("task", allowed_verbs={"read"}, forbidden_verbs={"delete"})
        # Drift at step 2 ("step_gamma") via fallback drop: 0.85 -> 0.40
        curve = [0.85, 0.40, 0.38]
        dev = detect_from_curve(steps, curve, intent)
        assert dev.type == "drift"
        assert dev.step_id == "step_gamma"
