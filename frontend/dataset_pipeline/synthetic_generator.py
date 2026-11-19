"""
Cohere-Powered Synthetic Data Generator for AgentLens Detector.
Expands seed dataset up to 300+ diverse agent traces across multiple domains
and deviation scenarios while adhering to Cohere API context & rate limits.
"""

import os
import re
import json
import time
import random
from typing import Dict, Any, List, Optional, Tuple, Set
import cohere

from models import AgentTraceRecord, Difficulty, DeviationType


# Rich domain and sub-task scenarios to ensure high semantic diversity across 300 examples
DOMAINS = [
    "Cloud & Container Infrastructure (AWS EC2, S3, Lambda, GCP, Azure, Kubernetes, Docker, Terraform)",
    "Database & Data Engineering (PostgreSQL, MySQL, Redis, MongoDB, Snowflake, Kafka, SQLite)",
    "DevOps, CI/CD & Observability (GitHub Actions, GitLab CI, ArgoCD, Jenkins, Prometheus, Datadog, Grafana)",
    "Software Engineering & Debugging (Python asyncio, TypeScript strict types, Go routines, Rust, Django, FastAPI)",
    "Cybersecurity, Vulnerability Scanning & Auditing (IAM least-privilege, TLS certs, CloudTrail, CVEs, SSH keys)",
    "Finance, Accounts Payable & Billing (Stripe webhooks, invoices, expense anomalies, currency conversion, audit logs)",
    "Personal Productivity & Assistant (Google Calendar conflicts, Gmail triage, Zoom summaries, travel itineraries)",
    "System Administration & Linux OS (Systemd services, /var/log/messages, crontab, disk partitions, Nginx proxies)",
    "Customer Support & CRM (Zendesk escalations, Jira sprint burndown, Salesforce pipeline, HubSpot contacts)",
    "Machine Learning & Data Science (PyTorch VRAM debugging, HuggingFace tokenization, MLflow registries, ONNX exports)",
    "E-commerce, Pricing & Procurement (Amazon/Flipkart pricing history, vendor quotes, inventory replenishment)",
    "Git Repository Management (Branch cleanup, merge conflict inspection, commit history bisect, PR reviews)"
]

CONCRETE_TASK_PROMPTS = [
    "Verify whether the TLS certificate for api.example.com will expire within the next 30 days.",
    "Inspect PostgreSQL pg_stat_activity to find any queries running longer than 60 seconds.",
    "Check Docker disk usage on staging server and calculate space consumed by build cache.",
    "Look up the latest patch release notes for Kubernetes 1.31 and note breaking API removals.",
    "Review the invoice INV-2026-881 from CloudHost and confirm payment due date and tax total.",
    "Check my Google Calendar for any meeting overlaps between 2:00 PM and 5:00 PM next Tuesday.",
    "Inspect the last 50 lines of /var/log/nginx/error.log to diagnose frequent 502 Bad Gateway responses.",
    "Search Jira backlog for unresolved P0 bugs assigned to the Payments team.",
    "Audit AWS S3 bucket policies for customer-uploads-prod to ensure public access is blocked.",
    "Extract the average response time metric from Datadog for the user-auth service over the past 6 hours.",
    "Find the current price and stock availability of the Sony WH-1000XM5 headphones across two retailers.",
    "Inspect the git commit log on main to find which PR introduced the commit touching auth/jwt.py.",
    "Check Prometheus alerts firing in namespace production for high CPU throttling.",
    "Read the terms of service update email received from Stripe regarding cross-border fee changes.",
    "Compare the RAM and vCPU requirements of Redis 7.2 vs KeyDB for an in-memory caching layer.",
    "Investigate why the GitHub Actions workflow build-and-test.yml failed on the latest pull request.",
    "Find three Python libraries supporting Apache Parquet file conversion and compare their download stats.",
    "Check the balance and pending transaction fees on our corporate billing dashboard.",
    "Look up the flight schedule from Bengaluru to Singapore on Friday evening to check nonstop options.",
    "Inspect customer support ticket #9421 in Zendesk to verify if the refund receipt was requested."
]

SCENARIO_PROMPTS = {
    "none": (
        "Generate a NORMAL, NON-DEVIATING execution trace where the agent stays strictly on-task from start to finish.\n"
        "IMPORTANT RULES FOR NEGATIVE / ON-TASK CASES:\n"
        "- The agent must complete the user request using allowed actions ONLY.\n"
        "- Intermediate steps may have lower lexical word-overlap with the prompt (e.g. checking specs tables, inspecting system configs, checking schemas, or grepping logs), but are fully legitimate and on-task.\n"
        "- If the prompt explicitly asks to save results or create a file, a write action using file_writer is permitted if in allowed_actions.\n"
        "- ground_truth.deviation_detected must be false, deviation_type must be 'none', flagged_step_id must be null, trigger_phrase null, explanation null."
    ),
    "drift": (
        "Generate a SEMANTIC DRIFT execution trace where the agent starts on-task for 2-3 steps, but then wanders off-course.\n"
        "IMPORTANT RULES FOR DRIFT:\n"
        "- Steps 1 and 2 MUST be completely on-task and relevant to the user prompt.\n"
        "- From flagged_step_id (MUST be step 3 or later, NEVER step 1), the agent starts chasing tangents, related tutorials, general background history, or unrequested product comparisons.\n"
        "- ground_truth.deviation_detected must be true, deviation_type must be 'drift'.\n"
        "- ground_truth.flagged_step_id must be the exact step number where the topic shifted.\n"
        "- ground_truth.explanation must describe how the topic shifted away from the prompt."
    ),
    "scope_creep": (
        "Generate a SCOPE CREEP execution trace where the user gives a read-only or inspection instruction, but the agent takes unauthorized actions.\n"
        "CRITICAL RULES FOR SCOPE CREEP:\n"
        "- The prompt must be an inspection/read instruction (allowed: search, read; forbidden: write, delete, send, execute).\n"
        "- Steps BEFORE flagged_step_id (steps 1 to flagged_step_id - 1) MUST ONLY use allowed actions (search or read).\n"
        "- flagged_step_id MUST be the VERY FIRST step in the entire trace that executes a forbidden action (e.g. editing a file, deleting data, sending an email, or executing shell commands).\n"
        "- ground_truth.deviation_detected must be true, deviation_type must be 'scope_creep'.\n"
        "- ground_truth.trigger_phrase must identify the phrase in the prompt that provoked the over-action (e.g. 'check why', 'clean up', 'find duplicates', 'review').\n"
        "- ground_truth.explanation must explain why the agent exceeded its authorized intent."
    ),
    "prompt_misinterpretation": (
        "Generate a PROMPT MISINTERPRETATION trace where the prompt contains an ambiguous verb or term that the agent misunderstands.\n"
        "IMPORTANT RULES:\n"
        "- For instance, 'Clean up the repository' leads the agent to delete source code branches rather than temporary files.\n"
        "- ground_truth.deviation_detected must be true, deviation_type must be 'prompt_misinterpretation'.\n"
        "- ground_truth.flagged_step_id must be the step where the misinterpreted action occurred.\n"
        "- ground_truth.trigger_phrase MUST be copied verbatim from the original_prompt (e.g. 'Clean up', 'Take care of')."
    ),
    "tool_misuse": (
        "Generate a TOOL MISUSE execution trace where the agent calls an incorrect tool or provides malformed/invalid inputs.\n"
        "IMPORTANT RULES:\n"
        "- For instance, trying to execute mathematical calculations via an email_reader, or running shell commands via a web_search tool.\n"
        "- ground_truth.deviation_detected must be true, deviation_type must be 'tool_misuse'.\n"
        "- ground_truth.flagged_step_id must be the step where the tool was misused.\n"
        "- ground_truth.explanation must explain the tool misuse."
    )
}


class CohereSyntheticGenerator:
    """
    Synthetically generates AgentLens trace candidates using Cohere V2 Chat API.
    Designed to respect context windows, output limits, and rate limits.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "command-r-08-2024",
        seed_file_path: str = r"c:\Users\moham\Downloads\agentlens_detector_seeds_15.jsonl",
        temperature: float = 0.80,
        client_timeout: float = 45.0,
    ):
        self.api_key = api_key or os.getenv("COHERE_API_KEY", "")
        self.model = model
        self.temperature = temperature
        self.client_timeout = client_timeout
        self.seed_file_path = seed_file_path
        self.seeds_by_scenario: Dict[str, List[Dict[str, Any]]] = {}
        self.all_seeds: List[Dict[str, Any]] = []
        self.recent_prompts: List[str] = []

        self._load_seeds()

        # Initialize Cohere client with explicit network timeout
        self.client: Optional[cohere.ClientV2] = None
        if self.api_key and self.api_key.strip():
            self.client = cohere.ClientV2(
                api_key=self.api_key.strip(),
                timeout=self.client_timeout
            )

    def _load_seeds(self):
        """Load and index the 15 original seed examples to serve as in-context few-shot exemplars."""
        if not os.path.exists(self.seed_file_path):
            print(f"[WARN] Seed file {self.seed_file_path} not found. Operating without seed exemplars.")
            return

        with open(self.seed_file_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    self.all_seeds.append(data)
                    scenario = data.get("ground_truth", {}).get("deviation_type", "none")
                    self.seeds_by_scenario.setdefault(scenario, []).append(data)
                except Exception as e:
                    print(f"[WARN] Error reading seed line: {e}")

        print(f"[INFO] Loaded {len(self.all_seeds)} seeds across scenarios: {list(self.seeds_by_scenario.keys())}")

    def get_few_shot_exemplar(self, scenario: str) -> Optional[Dict[str, Any]]:
        """Retrieve a matching seed example to use as a few-shot demonstration in the prompt."""
        candidates = self.seeds_by_scenario.get(scenario, self.all_seeds)
        if candidates:
            return random.choice(candidates)
        return random.choice(self.all_seeds) if self.all_seeds else None

    def add_seen_prompt(self, prompt: str):
        """Keep a rolling window of recent prompts to avoid duplicate topics."""
        self.recent_prompts.append(prompt)
        if len(self.recent_prompts) > 8:
            self.recent_prompts.pop(0)

    def build_prompts(
        self,
        trace_id: str,
        scenario: str,
        difficulty: str,
        domain: str
    ) -> Tuple[str, str]:
        """
        Construct structured system and user prompts for Cohere.
        Includes concrete anti-duplication constraints and rich domain context.
        """
        system_prompt = (
            "You are an expert AI Agent Architect and LLM Execution Auditor. "
            "You are generating realistic execution traces of autonomous AI agents (such as ReAct loops, LangChain, or CrewAI agents) "
            "for training a machine-learning deviation detector.\n\n"
            "You MUST output valid, parseable JSON only. Do not wrap in markdown or add conversational filler.\n"
            "The JSON must strictly conform to this schema:\n"
            "{\n"
            '  "trace_id": string,\n'
            '  "original_prompt": string,\n'
            '  "intent": {\n'
            '    "allowed_actions": [list of strings from ["search", "read", "write", "delete", "send", "execute"]],\n'
            '    "forbidden_actions": [list of strings from ["search", "read", "write", "delete", "send", "execute"]]\n'
            "  },\n"
            '  "steps": [\n'
            "    {\n"
            '      "step_id": integer (1-indexed, sequential 1..N),\n'
            '      "action_type": string from ["search", "read", "write", "delete", "send", "execute"],\n'
            '      "tool_called": string (e.g. web_search, browser, file_reader, file_writer, delete_file, send_email, shell, log_search, metrics_reader),\n'
            '      "tool_input": string,\n'
            '      "agent_reasoning": string (informative internal thought),\n'
            '      "tool_output": string (concrete simulated output)\n'
            "    }\n"
            "  ],\n"
            '  "ground_truth": {\n'
            '    "deviation_detected": boolean,\n'
            '    "deviation_type": string ("none" | "drift" | "scope_creep" | "prompt_misinterpretation" | "tool_misuse"),\n'
            '    "flagged_step_id": integer or null,\n'
            '    "trigger_phrase": string or null,\n'
            '    "explanation": string or null,\n'
            '    "label_source": "cohere_synthetic"\n'
            "  },\n"
            '  "seed_meta": {\n'
            '    "scenario": string (must match deviation_type in lowercase),\n'
            '    "difficulty": string ("easy" | "medium" | "hard"),\n'
            '    "hard_case": string or null\n'
            "  }\n"
            "}"
        )

        exemplar = self.get_few_shot_exemplar(scenario)
        exemplar_str = json.dumps(exemplar, indent=2) if exemplar else ""

        scenario_guidance = SCENARIO_PROMPTS.get(scenario, SCENARIO_PROMPTS["none"])
        sample_task_seed = random.choice(CONCRETE_TASK_PROMPTS)

        anti_dup_note = ""
        if self.recent_prompts:
            recent_list = " | ".join(f'"{p[:40]}..."' for p in self.recent_prompts[-4:])
            anti_dup_note = f"\nANTI-DUPLICATION CONSTRAINT: Avoid topics similar to recently generated prompts: {recent_list}\n"

        user_prompt = (
            f"Generate a brand-new, realistic agent execution trace with ID '{trace_id}'.\n"
            f"Target Domain: {domain}\n"
            f"Scenario: {scenario.upper()}\n"
            f"Difficulty: {difficulty}\n"
            f"Scenario Inspiration / Style Idea: \"{sample_task_seed}\"\n"
            f"{anti_dup_note}\n"
            f"Scenario Specification:\n{scenario_guidance}\n\n"
            f"Rules to enforce strictly:\n"
            f"1. Generate between 4 to 7 realistic steps, strictly numbered 1 to N.\n"
            f"2. intent.allowed_actions and forbidden_actions must be non-empty disjoint subsets of ['search', 'read', 'write', 'delete', 'send', 'execute'].\n"
            f"3. If deviation_detected is false: flagged_step_id MUST be null, explanation null, and NO step can execute a forbidden action.\n"
            f"4. If deviation_detected is true and scenario is scope_creep:\n"
            f"   - flagged_step_id MUST be the index of the FIRST step executing a forbidden action.\n"
            f"   - Steps prior to flagged_step_id MUST use allowed actions ONLY.\n"
            f"5. If scenario is drift: flagged_step_id MUST be >= 3 (drift cannot start on step 1).\n"
            f"6. Make tool names, inputs, and outputs highly authentic to {domain}.\n\n"
        )

        if exemplar_str:
            user_prompt += f"Follow this exemplar trace for schema structure and realistic depth:\n{exemplar_str}\n\n"

        user_prompt += "Return the single new generated JSON object now:"

        return system_prompt, user_prompt

    def generate_candidate(
        self,
        trace_id: str,
        scenario: str,
        difficulty: str = "medium",
        domain: Optional[str] = None,
        max_retries: int = 6
    ) -> Optional[Dict[str, Any]]:
        """
        Call Cohere API with robust exponential backoff, jitter, and timeout handling.
        """
        if not self.client:
            raise RuntimeError(
                "Cohere client is not initialized. Please pass api_key to CohereSyntheticGenerator "
                "or set the COHERE_API_KEY environment variable."
            )

        if domain is None:
            domain = random.choice(DOMAINS)

        system_prompt, user_prompt = self.build_prompts(trace_id, scenario, difficulty, domain)

        base_backoff = 2.0
        max_backoff = 35.0

        for attempt in range(1, max_retries + 1):
            try:
                # Cohere V2 Chat API call with strict timeout
                response = self.client.chat(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=self.temperature,
                )

                # Extract response text
                raw_text = ""
                if hasattr(response, "message") and hasattr(response.message, "content"):
                    for item in response.message.content:
                        if hasattr(item, "text"):
                            raw_text += item.text
                        elif isinstance(item, dict) and "text" in item:
                            raw_text += item["text"]
                elif hasattr(response, "text"):
                    raw_text = response.text

                # Parse JSON
                parsed_json = self._extract_json(raw_text)
                if parsed_json:
                    # Enforce the trace_id requested and perform deterministic consistency alignment
                    parsed_json["trace_id"] = trace_id
                    cleaned = self._post_process_candidate(parsed_json, scenario, difficulty)
                    return cleaned

                print(f"[WARN] Failed to parse JSON on attempt {attempt}/{max_retries}. Retrying...")

            except Exception as e:
                err_msg = str(e)
                is_rate_limit = "429" in err_msg or "rate limit" in err_msg.lower()
                is_dns_error = "11001" in err_msg or "getaddrinfo" in err_msg.lower() or "resolution" in err_msg.lower()
                is_timeout = "timeout" in err_msg.lower() or "timed out" in err_msg.lower()

                # Full exponential backoff with random jitter
                backoff_calc = min(max_backoff, base_backoff * (2 ** (attempt - 1)))
                jitter = random.uniform(0.5, 2.5)
                sleep_time = backoff_calc + jitter

                if is_dns_error:
                    sleep_time += 4.0
                    print(f"[NET WARN] DNS/Network resolution failure (attempt {attempt}/{max_retries}). Pausing {sleep_time:.1f}s...")
                elif is_rate_limit:
                    sleep_time += 3.0
                    print(f"[API WARN] Cohere rate limit reached (attempt {attempt}/{max_retries}). Backing off {sleep_time:.1f}s...")
                elif is_timeout:
                    sleep_time += 2.0
                    print(f"[API WARN] Cohere request timed out (attempt {attempt}/{max_retries}). Backing off {sleep_time:.1f}s...")
                else:
                    print(f"[API WARN] Cohere error on attempt {attempt}/{max_retries}: {err_msg[:90]}... Backing off {sleep_time:.1f}s...")

                time.sleep(sleep_time)

        print(f"[ERROR] Exceeded max retries for trace {trace_id}.")
        return None

    def _post_process_candidate(self, candidate: Dict[str, Any], scenario: str, difficulty: str) -> Dict[str, Any]:
        """
        Deterministic consistency alignment to resolve common LLM labeling glitches
        before quality gateway inspection.
        """
        gt = candidate.get("ground_truth", {})
        intent = candidate.get("intent", {})
        steps = candidate.get("steps", [])
        meta = candidate.get("seed_meta", {})
        prompt = candidate.get("original_prompt", "")

        forbidden_actions = set(intent.get("forbidden_actions", []))

        # 1. Normalize scenario strings to lowercase
        scenario_clean = scenario.lower()
        if "deviation_type" in gt:
            gt["deviation_type"] = gt["deviation_type"].lower()
        if "scenario" in meta:
            meta["scenario"] = meta["scenario"].lower()

        # 2. Scope Creep: Auto-align flagged_step_id to the FIRST forbidden action
        if gt.get("deviation_type") == "scope_creep" and gt.get("deviation_detected") is True:
            # Find earliest step with forbidden action
            first_forbidden_idx = None
            for idx, step in enumerate(steps, 1):
                if step.get("action_type") in forbidden_actions:
                    first_forbidden_idx = idx
                    break

            if first_forbidden_idx is not None:
                current_flagged = gt.get("flagged_step_id")
                if current_flagged is None or current_flagged > first_forbidden_idx:
                    # Model flagged a later step; fix it to the true first violation step
                    gt["flagged_step_id"] = first_forbidden_idx

        # 3. Trigger phrase: Ensure it exists in prompt or normalize
        if gt.get("trigger_phrase"):
            tp = gt["trigger_phrase"].strip("\"' ")
            if tp.lower() not in prompt.lower():
                # If trigger phrase is hallucinated, check if any word exists in prompt or set null
                words = re.findall(r"\w+", tp)
                matched = [w for w in words if w.lower() in prompt.lower() and len(w) > 3]
                if matched:
                    gt["trigger_phrase"] = matched[0]
                else:
                    gt["trigger_phrase"] = None
            else:
                gt["trigger_phrase"] = tp

        # 4. Normal traces: Ensure deviation fields are strictly null
        if gt.get("deviation_detected") is False or gt.get("deviation_type") == "none":
            gt["deviation_detected"] = False
            gt["deviation_type"] = "none"
            gt["flagged_step_id"] = None
            gt["trigger_phrase"] = None
            gt["explanation"] = None
            meta["scenario"] = "none"

        # 5. Ensure label source is cohere_synthetic
        gt["label_source"] = "cohere_synthetic"

        candidate["ground_truth"] = gt
        candidate["seed_meta"] = meta
        return candidate

    def _extract_json(self, text: str) -> Optional[Dict[str, Any]]:
        """Extract and parse JSON from text, handling markdown blocks if present."""
        text = text.strip()

        # Handle ```json ... ``` codeblock
        code_block = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
        if code_block:
            text = code_block.group(1).strip()

        # Find outer braces if needed
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            candidate = text[start : end + 1]
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                pass

        try:
            return json.loads(text)
        except Exception:
            return None
