from traces.loader import load_traces
from agentlens.drift.detect import detect_deviation

import matplotlib.pyplot as plt


traces = load_traces()

for trace, intent, steps in traces:
    result = detect_deviation(steps, intent)

    print(f"\nTrace {trace['id']}")
    print(f"Expected: {trace['expected_step']} / {trace['expected_type']}")
    print(f"Detected: {result.step_id} / {result.type}")
    print(f"Curve: {[round(x, 3) for x in result.similarity_curve]}")

    # Plot similarity curve
    x = [step.step_id for step in steps]
    y = result.similarity_curve

    plt.figure()
    plt.plot(x, y, marker="o")
    plt.xticks(x)
    plt.ylim(0, 1)
    plt.xlabel("Step")
    plt.ylabel("Cosine similarity")
    plt.title(f"Trace {trace['id']} - Similarity Curve")
    plt.grid(True)

    plt.show()