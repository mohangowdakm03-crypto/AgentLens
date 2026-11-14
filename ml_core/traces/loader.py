import json
from pathlib import Path

from agentlens.schema import Step, Intent
from agentlens.drift.embed import embed


def load_traces(path="traces/dev_traces.json"):
    path = Path(path)

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    traces = []

    for trace in data:
        intent = Intent(
            prompt=trace["prompt"],
            embedding=embed([trace["prompt"]])[0],
            allowed_verbs=set(trace["allowed_verbs"]),
            forbidden_verbs=set(trace["forbidden_verbs"]),
        )

        steps = [
            Step(
                step_id=s["step_id"],
                action_type=s["action_type"],
                tool_input=s["tool_input"],
                tool_output=s["tool_output"],
                agent_reasoning=s["agent_reasoning"],
            )
            for s in trace["steps"]
        ]

        traces.append((trace, intent, steps))

    return traces