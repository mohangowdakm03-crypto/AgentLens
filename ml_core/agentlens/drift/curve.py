from agentlens.drift.embed import embed, cosine


def step_text(step):
    parts = []
    for val in (
        getattr(step, "agent_reasoning", None),
        getattr(step, "tool_input", None),
        getattr(step, "tool_output", None),
    ):
        if val:
            s = str(val).strip()
            if s:
                parts.append(s)
    return " ".join(parts)


def similarity_curve(steps, intent_vec, embed_fn=embed):
    """One cosine similarity per step against the intent vector.

    Returns an empty list when ``steps`` is empty, so callers that handle
    zero-length curves gracefully do not need a special branch here.
    """
    if not steps:
        return []
    vecs = embed_fn([step_text(s) for s in steps])
    return [cosine(v, intent_vec) for v in vecs]
