"""
Quality Check Gateway for AgentLens Dataset Ingestion & Synthetic Generation.
Performs strict multi-stage deterministic validation on candidate traces to
ensure high signal-to-noise ratio for training the deviation detector.
"""

import re
import hashlib
from typing import Dict, Any, List, Optional, Set, Tuple
from pydantic import ValidationError

from models import (
    AgentTraceRecord,
    ValidationResult,
    VALID_ACTION_TYPES,
    VALID_DEVIATION_TYPES,
    VALID_DIFFICULTIES,
)


class QualityCheckGateway:
    """
    Quality gate that inspects candidate agent traces and enforces:
    1. Schema validation (Pydantic)
    2. Intent consistency (allowed vs forbidden actions)
    3. Step sequence & structural validity (IDs, lengths, non-empty)
    4. Ground truth logic & causal consistency (deviation index, first point of failure)
    5. Tool-to-action coherence
    6. Deduplication & diversity (lexical hashing & Jaccard similarity)
    7. Anti-looping / degenerate repetition prevention
    """

    def __init__(self, jaccard_threshold: float = 0.80):
        self.jaccard_threshold = jaccard_threshold
        self.seen_prompts: List[Set[str]] = []
        self.seen_prompt_hashes: Set[str] = set()
        self.seen_trace_ids: Set[str] = set()

        # Audit stats
        self.total_checked: int = 0
        self.total_passed: int = 0
        self.total_rejected: int = 0
        self.rejection_counts: Dict[str, int] = {}
        self.rejected_records: List[Dict[str, Any]] = []

    def register_existing_seed(self, record: AgentTraceRecord):
        """Register an existing verified seed (e.g. from the 15 seed file) into memory to avoid duplicates."""
        self.seen_trace_ids.add(record.trace_id)
        norm_tokens = self._tokenize(record.original_prompt)
        self.seen_prompts.append(norm_tokens)
        self.seen_prompt_hashes.add(self._hash_prompt(record.original_prompt))

    def validate(self, raw_data: Dict[str, Any]) -> Tuple[bool, ValidationResult, Optional[AgentTraceRecord]]:
        """
        Validate a candidate raw dictionary.
        Returns: (is_valid, validation_result, parsed_record_or_None)
        """
        self.total_checked += 1

        # Stage 1: Pydantic Schema Parsing
        try:
            record = AgentTraceRecord.model_validate(raw_data)
        except ValidationError as e:
            res = self._reject(
                code="SCHEMA_VALIDATION_ERROR",
                reason=f"Pydantic validation failed: {e.errors()[0]['msg']} at {e.errors()[0].get('loc')}",
                raw=raw_data
            )
            return False, res, None
        except Exception as e:
            res = self._reject(
                code="SCHEMA_PARSE_ERROR",
                reason=f"Failed to parse trace: {str(e)}",
                raw=raw_data
            )
            return False, res, None

        # Stage 2: Trace ID and Prompt Deduplication
        if record.trace_id in self.seen_trace_ids:
            res = self._reject(
                code="DUPLICATE_TRACE_ID",
                reason=f"Trace ID '{record.trace_id}' has already been registered.",
                raw=raw_data
            )
            return False, res, None

        prompt_hash = self._hash_prompt(record.original_prompt)
        if prompt_hash in self.seen_prompt_hashes:
            res = self._reject(
                code="EXACT_DUPLICATE_PROMPT",
                reason="Original prompt is an exact duplicate of an existing prompt.",
                raw=raw_data
            )
            return False, res, None

        norm_tokens = self._tokenize(record.original_prompt)
        if len(norm_tokens) < 3:
            res = self._reject(
                code="PROMPT_TOO_SHORT",
                reason=f"Prompt '{record.original_prompt}' is too short (< 3 distinct words).",
                raw=raw_data
            )
            return False, res, None

        # Check near-duplicate prompts against seen prompts
        for existing_tokens in self.seen_prompts:
            sim = self._jaccard_similarity(norm_tokens, existing_tokens)
            if sim >= self.jaccard_threshold:
                res = self._reject(
                    code="NEAR_DUPLICATE_PROMPT",
                    reason=f"Prompt is too lexically similar (Jaccard {sim:.2f} >= {self.jaccard_threshold}) to an existing prompt.",
                    raw=raw_data
                )
                return False, res, None

        # Stage 3: Intent Integrity (Allowed vs Forbidden Actions)
        allowed_set = set(record.intent.allowed_actions)
        forbidden_set = set(record.intent.forbidden_actions)

        if not allowed_set:
            res = self._reject(
                code="EMPTY_ALLOWED_ACTIONS",
                reason="intent.allowed_actions cannot be empty.",
                raw=raw_data
            )
            return False, res, None

        overlap = allowed_set.intersection(forbidden_set)
        if overlap:
            res = self._reject(
                code="INTENT_MUTUAL_EXCLUSION_VIOLATION",
                reason=f"Actions {overlap} appear in both allowed_actions and forbidden_actions.",
                raw=raw_data
            )
            return False, res, None

        # Stage 4: Step Sequence and Boundary Integrity
        steps = record.steps
        if len(steps) < 3:
            res = self._reject(
                code="TOO_FEW_STEPS",
                reason=f"Trace has only {len(steps)} steps; minimum required is 3.",
                raw=raw_data
            )
            return False, res, None

        if len(steps) > 10:
            res = self._reject(
                code="TOO_MANY_STEPS",
                reason=f"Trace has {len(steps)} steps; maximum allowed is 10.",
                raw=raw_data
            )
            return False, res, None

        # Verify sequential 1..N step numbering
        for idx, step in enumerate(steps):
            expected_id = idx + 1
            if step.step_id != expected_id:
                res = self._reject(
                    code="NON_SEQUENTIAL_STEP_IDS",
                    reason=f"Step at index {idx} has step_id={step.step_id}, expected {expected_id}.",
                    raw=raw_data
                )
                return False, res, None

            # Non-trivial text content
            if not step.tool_called or not step.tool_called.strip():
                res = self._reject(
                    code="EMPTY_TOOL_NAME",
                    reason=f"Step {step.step_id} has empty tool_called.",
                    raw=raw_data
                )
                return False, res, None

            if not step.tool_input or not step.tool_input.strip() or step.tool_input.strip().lower() in {"n/a", "none", "null", "todo"}:
                res = self._reject(
                    code="EMPTY_OR_PLACEHOLDER_TOOL_INPUT",
                    reason=f"Step {step.step_id} has empty or placeholder tool_input: '{step.tool_input}'.",
                    raw=raw_data
                )
                return False, res, None

            if not step.agent_reasoning or len(step.agent_reasoning.strip()) < 8:
                res = self._reject(
                    code="TRIVIAL_AGENT_REASONING",
                    reason=f"Step {step.step_id} agent_reasoning is too brief (< 8 chars): '{step.agent_reasoning}'.",
                    raw=raw_data
                )
                return False, res, None

            if not step.tool_output or not step.tool_output.strip() or step.tool_output.strip().lower() in {"n/a", "none", "todo"}:
                res = self._reject(
                    code="EMPTY_OR_PLACEHOLDER_TOOL_OUTPUT",
                    reason=f"Step {step.step_id} has empty or placeholder tool_output.",
                    raw=raw_data
                )
                return False, res, None

        # Stage 5: Degenerate Repetition / Looping Check
        # If 3 consecutive steps have identical tool and input, reject
        for i in range(len(steps) - 2):
            s1, s2, s3 = steps[i], steps[i + 1], steps[i + 2]
            if (s1.tool_called == s2.tool_called == s3.tool_called and
                    s1.tool_input.strip().lower() == s2.tool_input.strip().lower() == s3.tool_input.strip().lower()):
                res = self._reject(
                    code="DEGENERATE_LOOP_DETECTED",
                    reason=f"Steps {s1.step_id}, {s2.step_id}, and {s3.step_id} execute identical tool calls: {s1.tool_called}({s1.tool_input}).",
                    raw=raw_data
                )
                return False, res, None

        # Stage 6: Ground Truth Consistency Rules
        gt = record.ground_truth
        meta = record.seed_meta

        # Rule 6A: Scenario in metadata must match ground_truth.deviation_type
        if meta.scenario != gt.deviation_type:
            res = self._reject(
                code="METADATA_SCENARIO_MISMATCH",
                reason=f"seed_meta.scenario ('{meta.scenario}') does not match ground_truth.deviation_type ('{gt.deviation_type}').",
                raw=raw_data
            )
            return False, res, None

        # Rule 6B: Normal Execution (deviation_detected == False)
        if not gt.deviation_detected:
            if gt.deviation_type != "none":
                res = self._reject(
                    code="NORMAL_TRACE_TYPE_MISMATCH",
                    reason=f"deviation_detected is False, but deviation_type is '{gt.deviation_type}' instead of 'none'.",
                    raw=raw_data
                )
                return False, res, None

            if gt.flagged_step_id is not None:
                res = self._reject(
                    code="NORMAL_TRACE_FLAGGED_STEP_NOT_NULL",
                    reason=f"deviation_detected is False, but flagged_step_id is {gt.flagged_step_id} (must be null).",
                    raw=raw_data
                )
                return False, res, None

            if gt.explanation is not None:
                res = self._reject(
                    code="NORMAL_TRACE_EXPLANATION_NOT_NULL",
                    reason="deviation_detected is False, but explanation is not null.",
                    raw=raw_data
                )
                return False, res, None

            if gt.trigger_phrase is not None:
                res = self._reject(
                    code="NORMAL_TRACE_TRIGGER_PHRASE_NOT_NULL",
                    reason="deviation_detected is False, but trigger_phrase is not null.",
                    raw=raw_data
                )
                return False, res, None

            # Crucial ML negative check: NO step in a normal trace should execute a forbidden action!
            for step in steps:
                if step.action_type in forbidden_set:
                    res = self._reject(
                        code="NORMAL_TRACE_CONTAINS_FORBIDDEN_ACTION",
                        reason=f"Trace labeled as normal, but Step {step.step_id} executes forbidden action '{step.action_type}'.",
                        raw=raw_data
                    )
                    return False, res, None

        # Rule 6C: Deviation Execution (deviation_detected == True)
        else:
            if gt.deviation_type == "none":
                res = self._reject(
                    code="DEVIATION_TYPE_CANNOT_BE_NONE",
                    reason="deviation_detected is True, but deviation_type is 'none'.",
                    raw=raw_data
                )
                return False, res, None

            if gt.flagged_step_id is None:
                res = self._reject(
                    code="DEVIATION_FLAGGED_STEP_IS_NULL",
                    reason="deviation_detected is True, but flagged_step_id is null.",
                    raw=raw_data
                )
                return False, res, None

            if not (1 <= gt.flagged_step_id <= len(steps)):
                res = self._reject(
                    code="FLAGGED_STEP_OUT_OF_BOUNDS",
                    reason=f"flagged_step_id {gt.flagged_step_id} is out of bounds for trace with {len(steps)} steps.",
                    raw=raw_data
                )
                return False, res, None

            if not gt.explanation or len(gt.explanation.strip()) < 20:
                res = self._reject(
                    code="INSUFFICIENT_EXPLANATION",
                    reason="Causal explanation is missing or too brief (< 20 chars).",
                    raw=raw_data
                )
                return False, res, None

            # Sub-rule for Scope Creep:
            # 1. The flagged step must be the FIRST point where deviation starts.
            # Therefore, all steps strictly BEFORE flagged_step_id must NOT have forbidden actions!
            if gt.deviation_type == "scope_creep":
                flagged_step = steps[gt.flagged_step_id - 1]

                for step in steps[:gt.flagged_step_id - 1]:
                    if step.action_type in forbidden_set:
                        res = self._reject(
                            code="EARLIER_UNFLAGGED_FORBIDDEN_STEP",
                            reason=f"Step {step.step_id} executed forbidden action '{step.action_type}', but flagged_step_id was set to {gt.flagged_step_id}. The first forbidden step must be the flagged step.",
                            raw=raw_data
                        )
                        return False, res, None

                # Either the flagged step itself or a step after it must be forbidden action or unauthorized
                # If flagged step is in forbidden_set, that's a direct violation
                has_forbidden_at_or_after = any(s.action_type in forbidden_set for s in steps[gt.flagged_step_id - 1:])
                # Note: some scope creep actions use permitted generic tools (e.g. browser) to perform unauthorized orders/actions,
                # but if an explicit forbidden action exists in the trace, the flagged step should either be it or the prep for it.

            # Sub-rule for Drift:
            # An agent should typically not drift on step 1 (unless the entire prompt was ignored, which is misinterpretation).
            if gt.deviation_type == "drift" and gt.flagged_step_id == 1:
                res = self._reject(
                    code="DRIFT_ON_STEP_ONE",
                    reason="Drift flagged on Step 1. An agent requires at least 1 on-task step before drifting.",
                    raw=raw_data
                )
                return False, res, None

            # Sub-rule for Trigger Phrase verification:
            # If trigger_phrase is specified, check that it actually exists in the original prompt
            if gt.trigger_phrase:
                tp_clean = gt.trigger_phrase.strip().lower()
                prompt_clean = record.original_prompt.lower()
                if tp_clean not in prompt_clean:
                    # Allow minor punctuation differences
                    tp_words = set(re.findall(r"\w+", tp_clean))
                    prompt_words = set(re.findall(r"\w+", prompt_clean))
                    if not tp_words.issubset(prompt_words):
                        res = self._reject(
                            code="TRIGGER_PHRASE_NOT_IN_PROMPT",
                            reason=f"Trigger phrase '{gt.trigger_phrase}' does not appear in original prompt '{record.original_prompt}'.",
                            raw=raw_data
                        )
                        return False, res, None

        # Stage 7: Action & Tool Plausibility Check
        for step in steps:
            # Basic sanity check on known action verbs vs tools
            if step.action_type == "delete" and "search" in step.tool_called.lower():
                res = self._reject(
                    code="ILLOGICAL_TOOL_ACTION_MAPPING",
                    reason=f"Step {step.step_id} pairs action 'delete' with search tool '{step.tool_called}'.",
                    raw=raw_data
                )
                return False, res, None

        # Passed all checks!
        self.total_passed += 1
        self.seen_trace_ids.add(record.trace_id)
        self.seen_prompts.append(norm_tokens)
        self.seen_prompt_hashes.add(prompt_hash)

        return True, ValidationResult(is_valid=True), record

    def _reject(self, code: str, reason: str, raw: Dict[str, Any]) -> ValidationResult:
        """Helper to record and tally a rejection."""
        self.total_rejected += 1
        self.rejection_counts[code] = self.rejection_counts.get(code, 0) + 1
        trace_id = raw.get("trace_id", "unknown_id")
        self.rejected_records.append({
            "trace_id": trace_id,
            "rejection_code": code,
            "rejection_reason": reason,
            "raw_snippet": str(raw)[:300],
        })
        return ValidationResult(is_valid=False, rejection_code=code, rejection_reason=reason)

    def _tokenize(self, text: str) -> Set[str]:
        """Normalize and tokenize text for similarity comparison."""
        words = re.findall(r"\b[a-z0-9]+\b", text.lower())
        # Filter common stopwords to focus on content words
        stopwords = {
            "a", "an", "the", "in", "on", "at", "for", "to", "of", "and", "or",
            "is", "are", "was", "were", "my", "me", "i", "please", "can", "you",
            "check", "find", "list", "tell"
        }
        return {w for w in words if w not in stopwords and len(w) > 2}

    def _hash_prompt(self, text: str) -> str:
        """Compute SHA256 of lowercase normalized prompt."""
        norm = re.sub(r"\s+", " ", text.strip().lower())
        return hashlib.sha256(norm.encode("utf-8")).hexdigest()

    def _jaccard_similarity(self, s1: Set[str], s2: Set[str]) -> float:
        """Compute Jaccard similarity between two token sets."""
        if not s1 or not s2:
            return 0.0
        intersection = len(s1.intersection(s2))
        union = len(s1.union(s2))
        return intersection / union if union > 0 else 0.0

    def print_summary(self):
        """Print an audit summary report of the gateway checks."""
        pass_rate = (self.total_passed / self.total_checked * 100) if self.total_checked > 0 else 0.0
        print("\n" + "=" * 65)
        print("          QUALITY CHECK GATEWAY AUDIT SUMMARY")
        print("=" * 65)
        print(f" Total Traces Evaluated : {self.total_checked}")
        print(f" Passed Gateway         : {self.total_passed} ({pass_rate:.1f}%)")
        print(f" Rejected               : {self.total_rejected} ({100 - pass_rate:.1f}%)")
        print("-" * 65)
        if self.rejection_counts:
            print(" Rejection Breakdown by Code:")
            for code, count in sorted(self.rejection_counts.items(), key=lambda x: -x[1]):
                print(f"   • {code:<36} : {count:>4} rejection(s)")
        else:
            print(" No rejections recorded! All candidates satisfied quality criteria.")
        print("=" * 65 + "\n")
