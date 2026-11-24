"""
AgentLens LLM Service Layer (Steps 4 & 5).
Connects the ML detector's output to the fine-tuned Mistral-7B model
(agentlens:latest via Ollama or Groq fallback) for:
  - Step 4: Causal Attribution (why the deviation occurred + trigger tokens)
  - Step 5: Counterfactual Prompt Rewriting (corrected prompt + word diff + justification)
"""

import os
import re
import json
import logging
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional, Tuple, Sequence

logger = logging.getLogger(__name__)

OLLAMA_API_URL = os.environ.get("OLLAMA_API_URL", "http://localhost:11434/api/generate")
AGENTLENS_MODEL = os.environ.get("AGENTLENS_MODEL", "agentlens:latest")
OLLAMA_TIMEOUT = int(os.environ.get("OLLAMA_TIMEOUT", "60"))


def format_step_repr(step: Any, idx: int) -> str:
    """Format a step into the representation expected by the fine-tuned model."""
    step_num = getattr(step, "step_id", None) or getattr(step, "stepId", None) or (idx + 1)
    action = getattr(step, "action_type", None) or getattr(step, "action", "") or "action"
    tool = getattr(step, "tool_called", None) or getattr(step, "toolName", None) or action
    tool_in = getattr(step, "tool_input", None) or getattr(step, "toolInput", "") or ""
    tool_out = getattr(step, "tool_output", None) or getattr(step, "toolOutput", "") or getattr(step, "observation", "") or ""
    
    # Clean and truncate if excessively long
    tool_in_clean = str(tool_in)[:100].strip()
    tool_out_clean = str(tool_out)[:120].strip()
    
    if tool_in_clean and tool_out_clean:
        return f"Step {step_num}: {tool}({tool_in_clean}) -> {tool_out_clean}"
    elif tool_in_clean:
        return f"Step {step_num}: {tool}({tool_in_clean})"
    elif tool_out_clean:
        return f"Step {step_num}: {tool} -> {tool_out_clean}"
    else:
        return f"Step {step_num}: {tool}()"


def query_ollama(prompt: str, model: str = AGENTLENS_MODEL, temperature: float = 0.2) -> Optional[str]:
    """Query local Ollama instance with timeout and fallback."""
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": temperature,
            "stop": ["</s>", "[/INST]"]
        }
    }
    
    req = urllib.request.Request(
        OLLAMA_API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=OLLAMA_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("response", "").strip()
    except Exception as e:
        logger.warning(f"Ollama query failed ({model}): {e}")
        return None


def extract_trigger_tokens(explanation: str, original_prompt: str) -> List[str]:
    """Extract ambiguous trigger words or phrases identified in the causal explanation."""
    triggers = []
    
    # 1. Look for quoted phrases in explanation: 'phrase' or "phrase"
    quoted = re.findall(r"['\"]([^'\"]{2,40})['\"]", explanation)
    for q in quoted:
        q_clean = q.strip().strip(".,")
        # Ensure it actually appears in the original prompt (case-insensitive)
        if q_clean and q_clean.lower() in original_prompt.lower() and q_clean.lower() not in [t.lower() for t in triggers]:
            triggers.append(q_clean)
            
    # 2. If no exact match found, search for common ambiguous words in the prompt
    if not triggers:
        prompt_words = re.findall(r"\b[A-Za-z0-9_-]{3,}\b", original_prompt)
        for w in prompt_words:
            if w.lower() in explanation.lower() and w.lower() not in ["the", "and", "for", "with", "this", "that"]:
                triggers.append(w)
                if len(triggers) >= 3:
                    break
                    
    return triggers[:5]


def parse_repair_json(raw_text: str) -> Dict[str, Any]:
    """Robustly extract and normalize prompt repair JSON from model output."""
    cleaned = raw_text.strip()
    
    # Strip markdown fences if present
    if "```json" in cleaned:
        cleaned = cleaned.split("```json")[-1].split("```")[0].strip()
    elif "```" in cleaned:
        cleaned = cleaned.split("```")[1].split("```")[0].strip()
        
    # Attempt direct JSON parse
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            # Normalize diff structure
            raw_diff = data.get("diff", [])
            normalized_diff = []
            if isinstance(raw_diff, list):
                for item in raw_diff:
                    if isinstance(item, dict):
                        normalized_diff.append({
                            "old": str(item.get("old", "")),
                            "new": str(item.get("new", "")),
                            "reason": str(item.get("reason", ""))
                        })
                    elif isinstance(item, (list, tuple)) and len(item) >= 3:
                        normalized_diff.append({
                            "old": str(item[0]),
                            "new": str(item[1]),
                            "reason": str(item[2])
                        })
            return {
                "corrected_prompt": str(data.get("corrected_prompt", "")),
                "diff": normalized_diff,
                "justification": str(data.get("justification", ""))
            }
    except Exception:
        pass
        
    # Fallback regex extraction if raw JSON parse failed
    prompt_match = re.search(r'"corrected_prompt":\s*"([^"]+)"', cleaned)
    just_match = re.search(r'"justification":\s*"([^"]+)"', cleaned)
    
    return {
        "corrected_prompt": prompt_match.group(1) if prompt_match else cleaned,
        "diff": [],
        "justification": just_match.group(1) if just_match else "Refined prompt constraints to prevent unintended agent actions."
    }


def generate_causal_attribution(
    user_instruction: str,
    steps: Sequence[Any],
    deviation_step: Any,
    failure_type: str,
) -> Tuple[str, List[str]]:
    """
    Step 4: Generate causal explanation using the fine-tuned Mistral model.
    """
    formatted_steps = [format_step_repr(s, i) for i, s in enumerate(steps)]
    steps_json = json.dumps(formatted_steps, indent=None)
    
    prompt = (
        f"<s>[INST] You are an expert AI agent auditor. Given a user instruction, a failed agent "
        f"execution trace, and the deviation step, explain in 2-3 plain English sentences why the agent "
        f"deviated and which specific word or phrase in the original instruction caused the misinterpretation.\n\n"
        f"User instruction: '{user_instruction}'\n\n"
        f"Agent trace:\n{steps_json}\n\n"
        f"Deviation detected at: Step {deviation_step}\n"
        f"Failure type: {failure_type} [/INST]"
    )
    
    response = query_ollama(prompt)
    
    if response:
        triggers = extract_trigger_tokens(response, user_instruction)
        return response, triggers
        
    # Graceful fallback if Ollama is unreachable
    fallback_exp = (
        f"The instruction '{user_instruction}' lacked explicit boundary constraints, "
        f"leading the agent to encounter {failure_type.lower()} at Step {deviation_step}. "
        f"Without unambiguous limits, the agent interpreted the task too broadly."
    )
    fallback_triggers = extract_trigger_tokens(fallback_exp, user_instruction)
    return fallback_exp, fallback_triggers


def generate_prompt_repair(
    original_instruction: str,
    causal_explanation: str,
    observed_failure: str,
) -> Dict[str, Any]:
    """
    Step 5: Generate counterfactual prompt correction and word diff using fine-tuned model.
    """
    prompt = (
        f"<s>[INST] You are an expert prompt engineer. Given a failed user instruction, a causal "
        f"explanation of why it failed, and the observed failure, generate: (1) a corrected version of the "
        f"original prompt with minimal edits, (2) a word-level diff as a list of (old_phrase, new_phrase, reason) tuples, "
        f"(3) a one-sentence justification. Return as JSON only.\n\n"
        f"Original instruction: '{original_instruction}'\n\n"
        f"Causal explanation: {causal_explanation}\n\n"
        f"Observed failure: {observed_failure} [/INST]"
    )
    
    response = query_ollama(prompt)
    if response:
        parsed = parse_repair_json(response)
        if parsed["corrected_prompt"]:
            return parsed
            
    # Graceful fallback if Ollama is unreachable
    return {
        "corrected_prompt": f"{original_instruction.rstrip('.')}. Only perform explicitly requested actions within the target scope.",
        "diff": [
            {
                "old": original_instruction,
                "new": f"{original_instruction.rstrip('.')}. Only perform explicitly requested actions within the target scope.",
                "reason": "Add explicit execution boundary and scope exclusion constraint."
            }
        ],
        "justification": "Adding strict scope constraints prevents the agent from deviating into unauthorized actions."
    }
