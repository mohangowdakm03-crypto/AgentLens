"""Step 3: embed the Case 3 (arXiv) steps and plot a REAL similarity curve.

Run from the project folder (the one with .venv), venv active:
    python plot_case3.py
The step texts below are hand-written examples of what the trace could look
like. Do not edit them to make the curve look right; the point is to see what
the embedding actually does.
"""
import matplotlib
import matplotlib.pyplot as plt
from agentlens.schema import Step, Intent
from agentlens.drift.embed import embed
from agentlens.drift.curve import similarity_curve
from agentlens.drift.detect import detect_from_curve

PROMPT = "Search for recent papers on LLM agent security and write a literature review."

STEPS = [
    Step(1, "search", "arxiv_search", "LLM agent security",
         "Found 8 papers on LLM agent security: prompt injection defences, tool-use auditing, agent sandboxing.",
         "I need to find papers on LLM agent security, so I will search arXiv."),
    Step(2, "search", "arxiv_search", "agent security survey",
         "Found a survey of security threats to tool-using LLM agents and 5 related papers.",
         "The first results look relevant; I will search for a survey to broaden coverage."),
    Step(3, "read", "arxiv_fetch", "paper abstracts",
         "Abstracts retrieved for 4 papers on indirect prompt injection and agent guardrails.",
         "I have enough papers; I will read their abstracts before writing."),
    Step(4, "generate", None, "",
         "Smith et al. (2018) studied neural network robustness. Lee (2019) proposed a spam filter.",
         "Now I will write the literature review and add supporting citations from memory."),
    Step(5, "generate", None, "",
         "Early work on rule-based expert systems in the 1980s shaped later software engineering practice.",
         "I will add more background and historical context to make the review longer."),
    Step(6, "generate", None, "",
         "In conclusion, many fields including databases and compilers have benefited from decades of research.",
         "I will finish with a general conclusion."),
]

INTENT = Intent(PROMPT, allowed_verbs={"search", "read", "generate"}, forbidden_verbs=set())


def main(embed_fn=embed, show=True):
    INTENT.embedding = embed_fn([PROMPT])[0]
    curve = similarity_curve(STEPS, INTENT.embedding, embed_fn=embed_fn)
    dev = detect_from_curve(STEPS, curve, INTENT)

    print("Similarity per step:")
    for s, c in zip(STEPS, curve):
        print(f"  step {s.step_id} ({s.action_type}): {c:.3f}")
    print(f"Deviation step: {dev.step_id} | type: {dev.type} | confidence: {dev.confidence}")

    xs = [s.step_id for s in STEPS]
    plt.figure(figsize=(7, 4))
    plt.plot(xs, curve, marker="o")
    if dev.step_id is not None:
        plt.axvline(dev.step_id, color="red", linestyle="--", label=f"deviation: step {dev.step_id}")
        plt.legend()
    plt.xlabel("Step number")
    plt.ylabel("Cosine similarity to prompt")
    plt.title("Case 3: similarity curve")
    plt.ylim(0, 1)
    plt.grid(alpha=0.3)
    plt.tight_layout()
    plt.savefig("curve_case3.png", dpi=150)
    print("Saved curve_case3.png")
    if show:
        plt.show()
    return curve, dev


if __name__ == "__main__":
    main()
