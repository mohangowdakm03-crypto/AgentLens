import json
import time
import os
import cohere

# Get API key from environment variable, or paste it here directly
COHERE_API_KEY = os.environ.get("COHERE_API_KEY", "your-cohere-api-key-here")

# Initialize Cohere Client
co = cohere.Client(COHERE_API_KEY)

# ── FAILURE SCENARIOS ──────────────────────────────────────────────────────────
SCENARIOS = [
    # (user_instruction, failure_type, what_went_wrong)
    ("Find recent research papers on transformer architecture and summarise them",
     "Semantic Drift",
     "Agent searched Wikipedia for transformer architecture history instead of recent papers"),
    
    ("Fix the bug in my authentication code",
     "Scope Creep",
     "Agent fixed the auth bug but also refactored the entire user model and deleted unused methods"),
    
    ("Summarise this document",
     "Scope Creep",
     "Agent summarised the document and also sent it as an email to addresses found in the document"),
    
    ("Search for iPhone 15 reviews and tell me the pros and cons",
     "Semantic Drift",
     "Agent searched for iPhone history and technical specifications instead of user reviews"),
    
    ("Write a Python function to sort a list of dictionaries by a key",
     "Scope Creep",
     "Agent wrote the function, then rewrote three other functions in the file and added unit tests"),
    
    ("Get the weather in Mysuru",
     "Prompt Misinterpretation",
     "Agent retrieved historical climate data for Mysuru instead of today's forecast"),
    
    ("Find competitors of our product and list their pricing",
     "Semantic Drift",
     "Agent listed competitors but then started analysing their entire business models and market positioning"),
    
    ("Translate this paragraph to Hindi",
     "Scope Creep",
     "Agent translated the paragraph, then translated the entire page and formatted it as a new document"),
    
    ("Check if the user exists in the database",
     "Scope Creep",
     "Agent checked user existence, then ran additional queries on user activity and generated a full profile report"),
    
    ("Search for hotels in Bangalore",
     "Semantic Drift",
     "Agent searched for hotel reviews and history of hospitality in Bangalore instead of current availability"),
    
    ("Read the CSV file and tell me how many rows have missing values",
     "Prompt Misinterpretation",
     "Agent read the file but counted rows where ALL columns were missing instead of rows with ANY missing value"),
    
    ("Find the latest version of the React library",
     "Semantic Drift",
     "Agent retrieved the full React changelog and version history instead of just reporting the latest version"),
    
    ("Delete the temporary files from the project",
     "Scope Creep",
     "Agent deleted temp files but also deleted cache files, log files, and old build artifacts not specified"),
    
    ("Generate a short bio for our team page about John Smith",
     "Prompt Misinterpretation",
     "Agent generated a formal academic-style long biography instead of a short conversational team page bio"),
    
    ("Search for Python tutorials for beginners",
     "Semantic Drift",
     "Agent searched for Python language specification and advanced Python features instead of beginner tutorials"),
]

def generate_dataset1_example(scenario):
    """Generate one causal attribution training example."""
    instruction, failure_type, what_went_wrong = scenario
    
    prompt = f"""You are creating training data for an AI agent auditor.

Given this failed agent scenario, create a realistic training example.

User instruction: "{instruction}"
Failure type: {failure_type}
What went wrong: {what_went_wrong}

Generate:
1. A realistic 4-6 step agent execution trace (as Step N: tool(args) → result)
2. The deviation step number
3. A 2-3 sentence causal explanation of WHY the instruction caused this failure — identify the specific ambiguous word or phrase

Return strictly as JSON with keys: "trace", "deviation_step", "causal_explanation"

Rules for the causal explanation:
- Must identify the EXACT word or phrase that caused the misinterpretation
- Must explain the causal chain: ambiguous word → agent's interpretation → wrong action
- Must be plain English, not technical jargon
- 2-3 sentences maximum"""

    response = co.chat(
        model="command-r-plus-08-2024",
        message=prompt,
        temperature=0.7,
        response_format={"type": "json_object"}
    )
    
    result = json.loads(response.text)
    
    # Format into training example
    training_example = {
        "instruction": "You are an expert AI agent auditor. Given a user instruction, a failed agent execution trace, and the deviation step, explain in 2-3 plain English sentences why the agent deviated and which specific word or phrase in the original instruction caused the misinterpretation.",
        "input": f"User instruction: '{instruction}'\n\nAgent trace:\n{result.get('trace', '')}\n\nDeviation detected at: Step {result.get('deviation_step', '')}\nFailure type: {failure_type}",
        "output": result.get('causal_explanation', '')
    }
    
    return training_example


def generate_dataset2_example(scenario):
    """Generate one prompt rewriting training example."""
    instruction, failure_type, what_went_wrong = scenario
    
    prompt = f"""You are creating training data for a prompt rewriting AI.

Given this failed instruction, generate a training example for correcting it.

Original instruction: "{instruction}"
Failure type: {failure_type}  
What went wrong: {what_went_wrong}

Generate:
1. A causal explanation (2-3 sentences identifying the ambiguous phrase)
2. A corrected prompt (minimal edits, preserve original intent)
3. A word diff as list of objects with "old", "new", "reason" keys
4. One overall justification sentence

Rules:
- Corrected prompt must be minimal — change as few words as possible
- Each diff entry must explain WHY the change prevents the failure
- Do not change the core task — only fix the ambiguity
- new phrases must be specific and unambiguous

Return strictly as JSON with keys: "causal_explanation", "corrected_prompt", "diff" (list of objects with old, new, reason), "justification" """

    response = co.chat(
        model="command-r-plus-08-2024",
        message=prompt,
        temperature=0.7,
        response_format={"type": "json_object"}
    )
    
    result = json.loads(response.text)
    
    training_example = {
        "instruction": "You are an expert prompt engineer. Given a failed user instruction, a causal explanation of why it failed, and the observed failure, generate: (1) a corrected version of the original prompt with minimal edits, (2) a word-level diff as a list of (old_phrase, new_phrase, reason) tuples, (3) a one-sentence justification. Return as JSON only.",
        "input": f"Original instruction: '{instruction}'\n\nCausal explanation: {result.get('causal_explanation', '')}\n\nObserved failure: {what_went_wrong}",
        "output": json.dumps({
            "corrected_prompt": result.get('corrected_prompt', ''),
            "diff": result.get('diff', []),
            "justification": result.get('justification', '')
        })
    }
    
    return training_example


# ── MAIN GENERATION LOOP ──────────────────────────────────────────────────────
if __name__ == "__main__":
    dataset1 = []  # causal attribution
    dataset2 = []  # prompt rewriting

    print("Generating Dataset 1 (Causal Attribution)...")
    for i, scenario in enumerate(SCENARIOS):
        # Generate 6 variations per scenario = ~90 examples
        for variant in range(6):
            try:
                example = generate_dataset1_example(scenario)
                dataset1.append(example)
                print(f"  D1 [{i*6 + variant + 1}/90]: {scenario[0][:40]}...")
                time.sleep(3.5)  # rate limiting for free tier (20 requests per minute)
            except Exception as e:
                print(f"  Error: {e}")

    print(f"\nDataset 1 complete: {len(dataset1)} examples")

    print("\nGenerating Dataset 2 (Prompt Rewriter)...")
    for i, scenario in enumerate(SCENARIOS):
        for variant in range(6):
            try:
                example = generate_dataset2_example(scenario)
                dataset2.append(example)
                print(f"  D2 [{i*6 + variant + 1}/90]: {scenario[0][:40]}...")
                time.sleep(3.5)
            except Exception as e:
                print(f"  Error: {e}")

    print(f"\nDataset 2 complete: {len(dataset2)} examples")

    # ── SAVE ──────────────────────────────────────────────────────────────────────
    import os
    os.makedirs('data', exist_ok=True)
    
    # Save into the data folder to match existing structure
    with open('data/dataset1_causal_cohere.jsonl', 'w') as f:
        for ex in dataset1:
            f.write(json.dumps(ex) + '\n')

    with open('data/dataset2_rewriter_cohere.jsonl', 'w') as f:
        for ex in dataset2:
            f.write(json.dumps(ex) + '\n')

    print("\nSaved: data/dataset1_causal_cohere.jsonl and data/dataset2_rewriter_cohere.jsonl")
    print(f"Total examples: {len(dataset1) + len(dataset2)}")