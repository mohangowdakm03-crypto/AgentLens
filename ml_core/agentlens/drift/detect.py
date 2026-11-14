"""Drift (PELT) + scope verifier -> Deviation."""
import numpy as np
from agentlens.schema import Deviation

PEN = 0.05         # PELT penalty: tune on labelled traces (Week 3-4)
MIN_DROP = 0.15    # min mean drop to count as drift
FALLBACK_DROP = 0.20  # min single-step drop for the fallback


def find_drift_step(curve, pen=PEN, min_drop=MIN_DROP, fallback_drop=FALLBACK_DROP):
    """Return (index, drop) of first sustained drop, or (None, 0). Index is 0-based.

    Edge cases:
    - Curves shorter than 3 points: returns (None, 0.0) — insufficient data for PELT
      or reliable fallback.
    - All-zero or flat curves: no drop detected; returns (None, 0.0).
    - Single-element diff (2-point curve): handled by n < 3 guard above.
    """
    import ruptures as rpt
    n = len(curve)
    if n < 3:
        return None, 0.0
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
            return b, float(before - after)
    # Fallback: biggest single-step drop (short traces often defeat PELT).
    # np.diff always produces at least 2 elements here (n >= 3 → n-1 >= 2).
    drops = np.diff(curve)
    i = int(np.argmin(drops))
    if -drops[i] >= fallback_drop and np.mean(curve[i + 1:]) < curve[i]:
        return i + 1, float(-drops[i])
    return None, 0.0


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


def detect_from_curve(steps, curve, intent):
    """Classify deviation given a pre-computed similarity curve.

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
    idx, drop = find_drift_step(curve)
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
