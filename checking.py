import json
import os

INPUT_FILE  = 'data/dataset1_causal_cohere.jsonl' if os.path.exists('data/dataset1_causal_cohere.jsonl') else 'dataset1_causal_cohere.jsonl'
OUTPUT_FILE = 'dataset1_clean.jsonl'

with open(INPUT_FILE) as f:
    examples = [json.loads(line) for line in f if line.strip()]

kept, rejected = [], []

for i, ex in enumerate(examples):
    print(f"\n{'─'*60}")
    print(f"Example {i+1}/{len(examples)}")
    print(f"\nINPUT:\n{ex['input']}")
    print(f"\nOUTPUT:\n{ex['output']}")
    print(f"\n{'─'*60}")
    print("k = keep  |  d = delete  |  (press Enter to keep)")
    choice = input(">> ").strip().lower()
    if choice == 'd':
        rejected.append(i+1)
    else:
        kept.append(ex)

with open(OUTPUT_FILE, 'w') as f:
    for ex in kept:
        f.write(json.dumps(ex, ensure_ascii=False) + '\n')

print(f"\nDone. Kept: {len(kept)}  |  Deleted: {len(rejected)}")
print(f"Rejected example numbers: {rejected}")
print(f"Saved to: {OUTPUT_FILE}")
