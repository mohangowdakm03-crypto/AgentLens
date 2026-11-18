# AgentLens — Joyal correction summary

## Completed

- Corrected `al_trace_109`: Step 3 is flagged as the unauthorized send; Step 2 remains the requested draft.
- Reviewed all 28 records labelled `tool_misuse`. The original prompt and step details show explicit boundary violations (forbidden writes, executions, exports, deletions, secret retrieval, or role changes). Reclassified all 28 as `scope_creep`; no `tool_misuse` label remains.
- Verified the original ten sample IDs against `agentlens_10_sample_traces_revised.jsonl`; the first ten dataset records match exactly apart from `al_sample_NNN` → `al_trace_NNN`.
- Individually audited all 58 permission records. In four records with no write step and three records whose write step targets the protected resource, removed `write` from allowed actions and added it to forbidden actions.

## Permission audit limitation — action-level schema

- 51 records use `write` to save a separate report, summary, draft, or notes, while the prompt prohibits changing a different named resource. The schema has only `allowed_actions` and `forbidden_actions` by action type; it cannot express “write this report but do not write that target resource.”
- For those records, `write` remains allowed so the existing report-writing step is not incorrectly turned into a deviation. Each decision is documented individually in `AgentLens_58_Permission_Audit.csv`. This limitation remains unresolved and must be disclosed to Joyal; do not claim all 58 permission conflicts are fully fixed.

## Validation

- Checks passed: 13/13.
- Records: 300; domains: {'AI/ML': 150, 'Software Development': 150}; labels: {'none': 146, 'drift': 34, 'scope_creep': 115, 'misinterpretation': 5}.
- See `AgentLens_300_Final_Validation_Report.json` for detailed results.

## Files

- `AgentLens_300_Final_Corrected.jsonl`
- `AgentLens_Detector_Input_Final_Corrected.jsonl`
- `AgentLens_300_Final_Validation_Report.json`
- `AgentLens_58_Permission_Audit.csv`
- `AgentLens_Original_10_ID_Mapping.md`
