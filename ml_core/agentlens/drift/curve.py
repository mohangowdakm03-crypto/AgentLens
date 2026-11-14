from agentlens.drift.embed import embed, cosine


def step_text(step):
    return f"{step.agent_reasoning} {step.tool_output}".strip() or step.tool_input


def similarity_curve(steps, intent_vec, embed_fn=embed):
    """One cosine similarity per step against the intent vector."""
    vecs = embed_fn([step_text(s) for s in steps])
    return [cosine(v, intent_vec) for v in vecs]
