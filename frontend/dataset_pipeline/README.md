# AgentLens Detector: Synthetic Dataset Expansion & Quality Check Gateway

This module expands the initial 15 seed examples from `agentlens_detector_seeds_15.jsonl` up to **300+ validated, high-quality execution traces** to train the machine learning deviation detector.

---

## 📁 Pipeline Architecture

```
dataset_pipeline/
├── models.py                     # Strict Pydantic v2 schemas for AgentTrace, Steps, Intent & GroundTruth
├── quality_gateway.py            # 7-stage deterministic Quality Check Gateway & rejection logger
├── synthetic_generator.py        # Cohere V2 Client generator with few-shot exemplar injection & rate-limit handling
├── run_pipeline.py               # Orchestrator CLI (supports both Live Cohere API and Mock testing)
├── test_quality_gateway.py       # Unit tests verifying seed pass-rate & flaw rejection
├── agentlens_detector_300.jsonl  # Verified expanded dataset (output)
└── rejected_traces.jsonl         # Diagnostic log of all rejected traces with error codes
```

---

## ⚡ Key Considerations: Cohere Type & Context Limits

1. **Context Window vs Output Token Limits**:
   - Cohere models (`command-r-plus-08-2024`, `command-r-08-2024`, `command-r-plus`) have a large context window (128k tokens), but output generation is capped (typically 4,096 tokens).
   - Generating 10 or 20 traces in a single prompt causes token truncation mid-JSON, structural collapse, or repetitive hallucinations.
   - **Our Solution:** The pipeline generates **1 trace per API call** using structured JSON mode (`response_format={"type": "json_object"}`). Each trace is ~400–700 tokens, well within the output limit, ensuring maximal reasoning depth and zero JSON syntax truncation.

2. **Rate Limit & Exponential Backoff**:
   - On free/trial tiers, Cohere enforces RPM/TPM limits (HTTP 429).
   - `synthetic_generator.py` implements exponential backoff with jitter, automatically backing off and retrying up to 5 times.

3. **In-Context Few-Shot Grounding**:
   - For every generation call, the generator selects a matching seed example from the 15 original seeds and passes it as a few-shot demonstration. This grounds Cohere in the exact vocabulary, tool names, and step granularity.

---

## 🛡️ The 7-Stage Quality Check Gateway

Every candidate trace must pass through the deterministic `QualityCheckGateway` before it is written to the training dataset. If any check fails, the candidate is rejected, logged with an error code, and a replacement is requested.

| Stage | Check | Description | Rejection Code |
| :--- | :--- | :--- | :--- |
| **1** | **Schema Validation** | Strict Pydantic parsing against `AgentTraceRecord`. | `SCHEMA_VALIDATION_ERROR` |
| **2** | **Deduplication** | Rejects identical prompt hashes (SHA-256) or prompts with Jaccard word similarity $\ge 0.80$. | `EXACT_DUPLICATE_PROMPT`, `NEAR_DUPLICATE_PROMPT` |
| **3** | **Intent Consistency** | `allowed_actions` and `forbidden_actions` must be disjoint non-empty subsets of `[search, read, write, delete, send, execute]`. | `INTENT_MUTUAL_EXCLUSION_VIOLATION`, `EMPTY_ALLOWED_ACTIONS` |
| **4** | **Step Integrity** | Must have 3–10 steps sequentially numbered $1 \dots N$. Rejects placeholder text (`"N/A"`, `"TODO"`). | `STEP_SEQUENCE_INVALID`, `TOO_FEW_STEPS`, `TRIVIAL_AGENT_REASONING` |
| **5** | **Anti-Looping** | Rejects degenerately looping traces where the agent calls the same tool with identical inputs 3 times in a row. | `DEGENERATE_LOOP_DETECTED` |
| **6** | **Ground Truth Consistency** | • If `deviation_detected = False`: `deviation_type` must be `"none"`, flags/explanation must be `null`, and **no step may execute a forbidden action**.<br>• If `deviation_detected = True`: `flagged_step_id` must point to the **first** deviation step.<br>• For `scope_creep`: steps prior to `flagged_step_id` must NOT contain forbidden actions.<br>• For `drift`: deviation cannot start on step 1.<br>• `trigger_phrase` must physically appear in `original_prompt`. | `NORMAL_TRACE_CONTAINS_FORBIDDEN_ACTION`, `EARLIER_UNFLAGGED_FORBIDDEN_STEP`, `DRIFT_ON_STEP_ONE`, `TRIGGER_PHRASE_NOT_IN_PROMPT` |
| **7** | **Tool Realism** | Validates logical coherence between action types and tool names (e.g. action `delete` cannot use tool `web_search`). | `ILLOGICAL_TOOL_ACTION_MAPPING` |

---

## 🚀 How to Run

### Option 1: Live Cohere API Generation (Target: 300 Examples)

Set your Cohere API key and run the pipeline:

```bash
# Set your Cohere API key
set COHERE_API_KEY=your_actual_cohere_api_key_here

# Run pipeline up to 300 examples
python dataset_pipeline/run_pipeline.py --target-count 300
```

Or pass the key directly as a CLI argument:

```bash
python dataset_pipeline/run_pipeline.py --api-key "your_cohere_key" --target-count 300 --model "command-r-plus-08-2024"
```

### Option 2: Mock Mode (Offline Testing / Verification)

To test the pipeline and Quality Gateway without spending API credits:

```bash
python dataset_pipeline/run_pipeline.py --mock-mode --target-count 30
```

### Option 3: Run Quality Gateway Unit Tests

```bash
python dataset_pipeline/test_quality_gateway.py
```
Outputs:
```
[PASS] All 15 original seeds passed the Quality Gateway!
[PASS] All flaw injection scenarios were accurately rejected!
```

---

## 📊 Diversity Distribution Across 300 Examples

The pipeline balances generation across 12 realistic enterprise domains:
- Software Engineering & Code Debugging
- DevOps, Docker & Kubernetes
- Data Analysis & SQL / Pandas
- Cloud Infrastructure (AWS / GCP / Azure)
- Cybersecurity & Log Auditing
- Personal Assistant, Calendar & Email
- Finance, Invoices & Receipt Processing
- System Administration & Cron Jobs
- Academic & Research Papers
- Customer Support & CRM (Jira/Zendesk)
- E-commerce & Price Tracking
- Git Repository Management

### Scenario Balance:
- **`none` (Normal execution / Hard negatives):** ~35% (105 examples) — including complex legitimate multi-source verification and allowed write steps.
- **`drift` (Semantic drift):** ~35% (105 examples) — subtle shifts in topic into rabbit holes or tutorials.
- **`scope_creep` (Unauthorized actions):** ~22% (66 examples) — unauthorized file edits, deletions, shell commands, or email sends.
- **`prompt_misinterpretation`:** ~4% (12 examples) — ambiguous instructions triggering unintended destruction.
- **`tool_misuse`:** ~4% (12 examples) — calling the wrong tool or invalid inputs.
