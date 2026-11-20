# AgentLens 🔍
### Post-Hoc LLM Agent Trace Auditor with Counterfactual Prompt Correction

> *"Did the AI do what I asked? If not — here's why, and here's how to fix it."*

---

## 📌 Project Overview
**AgentLens** is a post-hoc audit tool designed to evaluate AI agent execution traces without requiring prior SDK integration or real-time instrumentation. When an agent experiences **Semantic Drift**, **Scope Creep**, or **Prompt Misinterpretation**, AgentLens pinpoints the exact deviation step, explains the root cause in plain English, and counterfactually repairs the original user prompt with a word-level diff.

### Key Outputs
1. **Deviation Map**: Identifies the exact step number where the agent first deviated from intent.
2. **Causal Attribution**: Explains which specific phrase or ambiguity in the prompt caused the failure cascade.
3. **Counterfactual Prompt Correction**: Rewrites the user prompt with minimal edits and a word-level diff.

---

## 🛠️ Locked Tech Stack
- **Embeddings**: `sentence-transformers/all-MiniLM-L6-v2`
- **Change-point Detection**: `ruptures` (PELT algorithm)
- **NLP / Verb Extraction**: `spaCy` (`en_core_web_sm`)
- **LLM**: `Mistral-7B` via Ollama (Fallback: Groq free API)
- **Agent Traces**: `LangChain`
- **Dashboard UI**: `Streamlit` + `Plotly`
- **Report Export**: `reportlab`
- **Evaluation**: `AgentBench` + `tau-bench`

---

## 📂 Repository Structure
```
detector/
├── api/
├── data/
│   ├── Agentlens_detector_input.jsonl
│   ├── AgentLens_300_Final_Corrected.jsonl
│   ├── AgentLens_300_Final_Validation_Report.json
│   ├── AgentLens_58_Permission_Audit.csv
│   ├── AgentLens_Joyal_Correction_Summary.md
│   └── AgentLens_Original_10_ID_Mapping.md
├── ml_core/
├── tests/
├── run_server.py
├── generate_dataset.py
└── README.md
```

---

## 🚀 Quickstart

### 1. Launch Interactive Dataset Curator
```bash
streamlit run dataset_curator.py
```

### 2. Generate More Data
```bash
export COHERE_API_KEY="your-api-key"
python generate_dataset.py
```
