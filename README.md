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
AgentLens/
├── data/
│   ├── dataset1_causal_attribution.jsonl    # Causal attribution seeds
│   ├── dataset1_causal_cohere.jsonl         # 88 causal attribution examples
│   ├── dataset2_prompt_rewriter.jsonl       # Prompt rewriter seeds
│   └── dataset2_rewriter_cohere.jsonl       # 90 prompt rewriter examples (with word diff)
├── dataset_curator.py                       # Interactive Streamlit data curator & analyzer
├── generate_dataset.py                      # Synthetic training data generation script
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
