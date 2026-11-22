"""Drift (PELT) + scope verifier -> Deviation."""
from dataclasses import dataclass
from typing import Optional

import numpy as np
from agentlens.schema import Deviation

PEN = 0.05         # PELT penalty: tune on labelled traces (Week 3-4)
MIN_DROP = 0.15    # min mean drop to count as drift
FALLBACK_DROP = 0.20  # min single-step drop for the fallback


@dataclass(frozen=True)
class DriftAnalysis:
    """Canonical drift decision and diagnostics for a similarity curve.

    ``index`` is zero-based.  ``method`` is one of ``pelt``, ``fallback``, or
    ``none``; the optional similarity values are the segment means for PELT
    and the adjacent values for the fallback.
    """

    index: Optional[int]
    drop: float
    method: str
    similarity_before: Optional[float] = None
    similarity_after: Optional[float] = None


def analyze_drift_curve(curve, pen=PEN, min_drop=MIN_DROP, fallback_drop=FALLBACK_DROP):
    """Return the canonical drift decision plus the diagnostics behind it.

    Edge cases:
    - Curves with fewer than 2 points: returns (None, 0.0) — insufficient data
      for detection or single-step fallback.
    - Curves with at least 3 points: evaluated with PELT change-point detection first.
    - Curves with at least 2 points: eligible for the single-step fallback.
    - All-zero or flat curves: no drop detected; returns (None, 0.0).
    """
    n = len(curve)
    if n < 2:
        return DriftAnalysis(None, 0.0, "none")

    if n >= 3:
        import ruptures as rpt
        sig = np.asarray(curve, float).reshape(-1, 1)
        try:
            bkps = rpt.Pelt(model="l2", min_size=1, jump=1).fit(sig).predict(pen=pen)
        except (ValueError, rpt.exceptions.BadSegmentationParameters) as exc:
            # PELT cannot operate on this input (e.g. all-identical values, bad pen).
            # Fall through to the single-step fallback below.
            bkps = [n]
        for b in bkps:
            if b >= n:
                continue
            before, after = np.mean(curve[:b]), np.mean(curve[b:])
            if before - after >= min_drop:       # dropped and did not recover
                return DriftAnalysis(
                    b, float(before - after), "pelt", float(before), float(after)
                )

    # Fallback: biggest single-step drop (operates on curves with n >= 2).
    drops = np.diff(curve)
    i = int(np.argmin(drops))
    if -drops[i] >= fallback_drop and np.mean(curve[i + 1:]) < curve[i]:
        return DriftAnalysis(
            i + 1, float(-drops[i]), "fallback", float(curve[i]), float(curve[i + 1])
        )
    return DriftAnalysis(None, 0.0, "none")


def find_drift_step(curve, pen=PEN, min_drop=MIN_DROP, fallback_drop=FALLBACK_DROP):
    """Return ``(index, drop)`` from :func:`analyze_drift_curve`.

    This compatibility wrapper retains the original ML-core contract for
    callers that only require the detected step and magnitude.
    """
    result = analyze_drift_curve(curve, pen, min_drop, fallback_drop)
    return result.index, result.drop


def scope_violations(steps, intent):
    """step_ids whose action is forbidden, or not in a non-empty allowed set.

    Comparisons are case-insensitive: action_type is lowercased and the
    allowed/forbidden verb sets are normalised to lowercase on each call so
    that callers may supply mixed-case permission sets without silent mismatches.
    """
    # Normalise permission sets to lowercase so comparisons are case-insensitive
    # regardless of how the caller constructed the Intent.
    allowed_lower = {v.lower() for v in intent.allowed_verbs}
    forbidden_lower = {v.lower() for v in intent.forbidden_verbs}

    out = []
    for s in steps:
        a = (s.action_type or "").lower()
        if a in forbidden_lower or (allowed_lower and a not in allowed_lower):
            out.append(s.step_id)
    return out


def detect_from_curve(steps, curve, intent, drift_analysis=None):
    """Classify deviation given a pre-computed similarity curve.

    ``drift_analysis`` may be supplied by a caller that also needs diagnostics;
    this guarantees its reported breakpoint is the same decision used for
    classification.

    Raises:
        ValueError: if len(curve) != len(steps), making the curve uninterpretable.

    Edge cases:
    - Empty steps/curve: returns Deviation(None, "none", ...).
    - Single step: find_drift_step returns (None, 0); scope check still runs.
    """
    if len(curve) != len(steps):
        raise ValueError(
            f"curve length ({len(curve)}) must equal number of steps ({len(steps)})"
        )

    flagged = scope_violations(steps, intent)
    analysis = drift_analysis if drift_analysis is not None else analyze_drift_curve(curve)
    idx, drop = analysis.index, analysis.drop
    drift_step = steps[idx].step_id if idx is not None else None

    candidates = [(s, t) for s, t in ((drift_step, "drift"),
                  (flagged[0] if flagged else None, "scope_creep")) if s is not None]
    if not candidates:
        return Deviation(None, "none", 0.0, list(curve), flagged)
    step_id, typ = min(candidates, key=lambda c: c[0])
    conf = 0.9 if (drift_step is not None and flagged) else min(0.95, 0.5 + drop) if typ == "drift" else 0.8
    return Deviation(step_id, typ, round(conf, 2), list(curve), flagged)


def detect_deviation(steps, intent):
    """Contract function: (steps, intent) -> Deviation.

    Raises:
        ValueError: if intent.embedding is None and steps is non-empty — the
            caller must supply an embedding before invoking the detector.
            Silently generating one here would hide missing data and couple
            this module to the model.

    Edge cases:
    - Empty step list: returns Deviation(None, "none", 0.0, [], []) even if
      intent.embedding is None.
    """
    if not steps:
        return Deviation(None, "none", 0.0, [], [])

    if intent.embedding is None:
        raise ValueError(
            "intent.embedding is None — embed the intent prompt before calling "
            "detect_deviation(). Use agentlens.drift.embed.embed() to generate it."
        )
    from agentlens.drift.curve import similarity_curve
    curve = similarity_curve(steps, intent.embedding)
    return detect_from_curve(steps, curve, intent)
