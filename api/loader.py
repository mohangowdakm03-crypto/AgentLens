"""Trace and dataset loader with robust field mapping and ground-truth isolation.

Primary dataset:
  - Detector inputs:  detector/data/Agentlens_detector_input.jsonl (300 records, no ground truth)
  - Ground truth:     detector/data/AgentLens_300_Final_Corrected.jsonl (300 records, full annotations)

Explicit dev fallback (never mixed into the 300-record dataset):
  - Dev traces:       detector/ml_core/traces/dev_traces.json (8 legacy dev records)

Ground-truth isolation guarantee:
  Ground truth is NEVER placed into Intent, Step, embeddings, similarity curves,
  drift detection, scope verification, or prediction decisions. It is stored
  separately and accessed only by the evaluation / display layer after prediction.
"""
import json
import logging
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

# ---------------------------------------------------------------------------
# Canonical paths resolved relative to this file (independent of CWD).
# ---------------------------------------------------------------------------
_THIS_DIR = Path(__file__).resolve().parent          # detector/api/
_DETECTOR_DIR = _THIS_DIR.parent                     # detector/
_DATA_DIR = _DETECTOR_DIR / "data"
_ML_CORE_DIR = _DETECTOR_DIR / "ml_core"

if str(_ML_CORE_DIR) not in sys.path:
    sys.path.insert(0, str(_ML_CORE_DIR))

from agentlens.schema import Step, Intent  # noqa: E402

logger = logging.getLogger(__name__)

# Candidate filenames for the detector-input dataset (handles casing differences across OSes)
_DETECTOR_INPUT_CANDIDATES = (
    "agentlens_detector_input.jsonl",
    "Agentlens_detector_input.jsonl",
    "AgentLens_Detector_Input_Final_Corrected.jsonl",
)


def _resolve_detector_input_path(data_dir: Path = _DATA_DIR) -> Path:
    """Resolve the detector-input JSONL path inside data_dir."""
    for name in _DETECTOR_INPUT_CANDIDATES:
        candidate = data_dir / name
        if candidate.exists():
            return candidate
    return data_dir / _DETECTOR_INPUT_CANDIDATES[0]


DETECTOR_INPUT_PATH = _resolve_detector_input_path(_DATA_DIR)
CORRECTED_FULL_PATH = _DATA_DIR / "AgentLens_300_Final_Corrected.jsonl"
DEV_TRACES_PATH = _ML_CORE_DIR / "traces" / "dev_traces.json"

_GT_RAW_KEYS = frozenset({
    "ground_truth",
    "groundTruth",
    "expected_step",
    "expected_type",
    "sample_split",
    "sampleSplit",
    "sample_review_only",
    "sampleReviewOnly",
    "review_only",
    "reviewOnly",
    "is_review_only",
    "isReviewOnly",
})


def normalize_bool(val: Any, default: Optional[bool] = None) -> Optional[bool]:
    """Normalize boolean metadata values for review-only flags.

    - Supports actual JSON booleans: True -> True, False -> False.
    - Supports string values 'true' and 'false' (case-insensitive, whitespace-trimmed):
        'true', 'True', ' TRUE ' -> True
        'false', 'False', ' FALSE ' -> False
    - Supports numeric 1 and 0:
        1, 1.0 -> True
        0, 0.0 -> False
    - Returns default (None by default) when val is None.
    - Does not interpret arbitrary non-empty strings as True.
    - Explicitly raises ValueError for invalid values (arbitrary strings, non-binary numbers, unsupported types).
    """
    if val is None:
        return default
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        if val == 1:
            return True
        if val == 0:
            return False
        raise ValueError(f"Invalid boolean numeric value: {val!r}. Expected 1 or 0.")
    if isinstance(val, str):
        cleaned = val.strip().lower()
        if cleaned == "true":
            return True
        if cleaned == "false":
            return False
        raise ValueError(
            f"Invalid boolean string value: {val!r}. Expected 'true' or 'false'."
        )
    raise ValueError(f"Invalid boolean value of type {type(val).__name__}: {val!r}")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_review_only_record(item: Dict[str, Any]) -> bool:
    """Return True if a record is explicitly marked REVIEW_ONLY_NOT_DETECTOR_READY."""
    for key in ("_status", "status"):
        val = item.get(key)
        if val is not None:
            upper = str(val).upper()
            if "REVIEW_ONLY_NOT_DETECTOR_READY" in upper or "NOT_DETECTOR_READY" in upper:
                return True
    return False


def _extract_raw_trace_id(item: Dict[str, Any]) -> Optional[str]:
    """Extract raw trace_id without mutating it. Returns None if missing or blank."""
    for key in ("trace_id", "id", "traceId"):
        if key in item and item[key] is not None:
            val = str(item[key]).strip()
            if val:
                return val
    return None


def _parse_step_id_int(val: Any, default_idx: int) -> int:
    """Extract integer step_id required by ML Step schema."""
    if isinstance(val, int) and not isinstance(val, bool):
        return val
    if isinstance(val, str):
        digits = re.findall(r"\d+", val)
        if digits:
            return int(digits[0])
    return default_idx


def _load_ground_truth_index(path: Path) -> Dict[str, Any]:
    """Load only the ground_truth subtree indexed by trace_id from the full corrected JSONL.

    Returns a dict with:
      - 'index': Dict[str, Dict[str, Any]] mapping trace_id -> raw ground_truth dict
      - 'missing_ids': List[int] (1-based line numbers missing trace_id)
      - 'duplicate_ids': List[str] (trace_ids appearing more than once)
      - 'skipped_review_only': int
      - 'parse_errors': List[str]
      - 'file_missing': bool
    """
    result: Dict[str, Any] = {
        "index": {},
        "missing_ids": [],
        "duplicate_ids": [],
        "skipped_review_only": 0,
        "parse_errors": [],
        "file_missing": False,
    }
    if not path.exists():
        result["file_missing"] = True
        return result

    index: Dict[str, Dict[str, Any]] = result["index"]
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for lineno, line in enumerate(fh, start=1):
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                except json.JSONDecodeError as exc:
                    msg = f"JSON parse error in {path.name} line {lineno}: {exc}"
                    logger.warning(msg)
                    result["parse_errors"].append(msg)
                    continue

                if not isinstance(item, dict):
                    msg = f"Non-object record in {path.name} line {lineno}"
                    logger.warning(msg)
                    result["parse_errors"].append(msg)
                    continue

                if _is_review_only_record(item):
                    result["skipped_review_only"] += 1
                    continue

                tid = _extract_raw_trace_id(item)
                if tid is None:
                    result["missing_ids"].append(lineno)
                    logger.warning("Missing trace_id in %s line %d", path.name, lineno)
                    continue

                if tid in index:
                    result["duplicate_ids"].append(tid)
                    logger.warning("Duplicate trace_id '%s' in %s line %d (keeping first)", tid, path.name, lineno)
                    continue

                gt_raw = item.get("ground_truth")
                gt_dict = dict(gt_raw) if isinstance(gt_raw, dict) else {}
                split_val = item.get("sample_split") or gt_dict.get("sample_split")
                if split_val is not None:
                    gt_dict["sample_split"] = str(split_val).strip()
                for ro_key in ("sample_review_only", "review_only", "is_review_only"):
                    val = item.get(ro_key) if ro_key in item else gt_dict.get(ro_key)
                    if val is not None:
                        try:
                            gt_dict[ro_key] = normalize_bool(val)
                        except ValueError:
                            gt_dict[ro_key] = val
                index[tid] = gt_dict
    except OSError as exc:
        msg = f"Cannot open {path}: {exc}"
        logger.warning(msg)
        result["parse_errors"].append(msg)

    return result


def _build_ground_truth(
    gt_raw: Optional[Dict[str, Any]],
    is_deviated: bool = False,
    dev_type: Optional[str] = None,
    expected_step: Any = None,
    sample_split: Optional[str] = None,
    sample_review_only: Optional[bool] = None,
) -> Dict[str, Any]:
    """Construct the normalized, isolated ground-truth dict stored separately from ML inputs.

    Exposes both the canonical dataset keys (has_deviation, deviation_type, flagged_steps,
    flagged_step_id, annotation_explanation, sample_split, sample_review_only) and the camelCase UI/API keys
    (isDeviated, deviationType, flaggedSteps, flaggedStepId, annotationExplanation, sampleSplit, sampleReviewOnly, notes).
    """
    if gt_raw:
        has_dev = bool(gt_raw.get("has_deviation", False))
        raw_dev_type = gt_raw.get("deviation_type")
        if raw_dev_type is None or str(raw_dev_type).strip() == "":
            canonical_type = "none" if not has_dev else "unknown"
        else:
            canonical_type = str(raw_dev_type).strip().lower().replace(" ", "_")

        api_dev_type = None if canonical_type == "none" else canonical_type
        flagged_steps = list(gt_raw.get("flagged_steps") or [])
        flagged_step_id = gt_raw.get("flagged_step_id")
        annotation_explanation = str(gt_raw.get("annotation_explanation") or "")
        split_val = gt_raw.get("sample_split") or sample_split
        split_str = str(split_val).strip() if split_val is not None and str(split_val).strip() else None

        is_ro = False
        if split_str == "sample_review_only":
            is_ro = True
        else:
            for ro_key in ("sample_review_only", "review_only", "is_review_only"):
                v = gt_raw.get(ro_key)
                if v is None and ro_key == "sample_review_only":
                    v = sample_review_only
                if v is not None:
                    try:
                        norm = normalize_bool(v)
                        if norm is True:
                            is_ro = True
                            break
                        elif norm is False:
                            is_ro = False
                            break
                    except ValueError:
                        is_ro = v
                        break

        notes = str(gt_raw.get("explanation") or annotation_explanation or "")
        if not notes:
            if has_dev:
                notes = f"Ground truth annotated: {api_dev_type} at step {flagged_step_id}."
            else:
                notes = "On-task execution — no deviation."

        return {
            # Canonical dataset keys
            "has_deviation": has_dev,
            "deviation_type": canonical_type,
            "flagged_steps": flagged_steps,
            "flagged_step_id": flagged_step_id,
            "annotation_explanation": annotation_explanation,
            "sample_split": split_str,
            "sample_review_only": is_ro,
            "review_only": gt_raw.get("review_only"),
            "is_review_only": gt_raw.get("is_review_only"),
            # API / Inspector camelCase keys
            "isDeviated": has_dev,
            "deviationType": api_dev_type,
            "flaggedSteps": flagged_steps,
            "flaggedStepId": flagged_step_id,
            "annotationExplanation": annotation_explanation,
            "sampleSplit": split_str,
            "sampleReviewOnly": is_ro,
            "notes": notes,
        }

    # Fallback for legacy dev traces or unmatched records
    if dev_type in (None, "none", "None", ""):
        canonical_type = "none"
        api_dev_type = None
        has_dev = False
    else:
        canonical_type = str(dev_type).strip().lower().replace(" ", "_")
        api_dev_type = canonical_type
        has_dev = bool(is_deviated)

    flagged_steps = [expected_step] if (has_dev and expected_step is not None) else []
    flagged_step_id = expected_step if has_dev else None
    split_str = str(sample_split).strip() if sample_split is not None and str(sample_split).strip() else None
    is_ro = False
    if split_str == "sample_review_only":
        is_ro = True
    elif sample_review_only is not None:
        try:
            norm = normalize_bool(sample_review_only)
            is_ro = bool(norm)
        except ValueError:
            is_ro = sample_review_only
    notes = (
        f"Ground truth annotated: {api_dev_type} at step {expected_step}."
        if has_dev
        else "On-task execution — no deviation."
    )
    return {
        "has_deviation": has_dev,
        "deviation_type": canonical_type,
        "flagged_steps": flagged_steps,
        "flagged_step_id": flagged_step_id,
        "annotation_explanation": "",
        "sample_split": split_str,
        "sample_review_only": is_ro,
        "review_only": None,
        "is_review_only": None,
        "isDeviated": has_dev,
        "deviationType": api_dev_type,
        "flaggedSteps": flagged_steps,
        "flaggedStepId": flagged_step_id,
        "annotationExplanation": "",
        "sampleSplit": split_str,
        "sampleReviewOnly": is_ro,
        "notes": notes,
    }


# ---------------------------------------------------------------------------
# LoadedTrace
# ---------------------------------------------------------------------------

class LoadedTrace:
    """Container holding parsed ML inputs and strictly isolated ground truth."""

    def __init__(
        self,
        trace_id: str,
        label: str,
        prompt: str,
        allowed_verbs: Set[str],
        forbidden_verbs: Set[str],
        steps: List[Step],
        step_id_map: Dict[int, str],
        ground_truth: Dict[str, Any],
        raw_data: Dict[str, Any],
    ):
        self.trace_id = str(trace_id)
        self.label = label
        self.prompt = prompt
        self.allowed_verbs = set(allowed_verbs)
        self.forbidden_verbs = set(forbidden_verbs)
        self.steps = steps
        # Maps integer Step.step_id -> original string representation
        self.step_id_map = dict(step_id_map)
        # Isolated ground truth — NEVER passed to Intent, Step, or detector functions
        self.ground_truth = ground_truth
        # Sanitized raw detector-input dict (stripped of any ground-truth keys)
        self.raw_data = raw_data

    def create_intent(self, embedding=None) -> Intent:
        """Create an Intent instance strictly without ground truth."""
        return Intent(
            prompt=self.prompt,
            embedding=embedding,
            allowed_verbs=set(self.allowed_verbs),
            forbidden_verbs=set(self.forbidden_verbs),
        )


# ---------------------------------------------------------------------------
# Normalizer (used by TraceRepository and ad-hoc /api/detect endpoint)
# ---------------------------------------------------------------------------

def _normalize_trace_dict(
    item: Dict[str, Any],
    default_idx: int,
    gt_index: Optional[Dict[str, Dict[str, Any]]] = None,
    *,
    require_trace_id: bool = False,
    allow_inline_ground_truth: bool = False,
) -> LoadedTrace:
    """Normalize a dataset record into a LoadedTrace.

    Parameters
    ----------
    item:
        Raw trace dictionary (from detector-input JSONL, dev traces, or /api/detect).
    default_idx:
        Fallback index used when ``require_trace_id`` is False and no trace_id is given.
    gt_index:
        Optional mapping ``trace_id -> ground_truth dict`` loaded separately from the
        full annotated dataset. Ground truth is read exclusively from here for the
        corrected 300-record dataset.
    require_trace_id:
        If True, raises ValueError when the record lacks a non-empty trace_id.
    allow_inline_ground_truth:
        If True (used only for legacy dev-trace fallback), allows reading legacy
        inline ground-truth fields (``expected_step``, ``expected_type``, ``label``
        dict, ``groundTruth``). Disabled by default for detector-input records.
    """
    # 1. Trace ID (preserved verbatim, never silently altered)
    trace_id_str = _extract_raw_trace_id(item)
    if trace_id_str is None:
        if require_trace_id:
            raise ValueError(f"Record at index {default_idx} is missing a valid 'trace_id'.")
        trace_id_str = f"trace-{default_idx:03d}"

    # 2. Prompt: original_prompt -> Intent.prompt (fallback: prompt)
    raw_prompt = item.get("original_prompt")
    if raw_prompt is None:
        raw_prompt = item.get("prompt")
    prompt = str(raw_prompt) if raw_prompt is not None else ""

    # 3. Permissions: nested intent.allowed_actions / intent.forbidden_actions first
    intent_obj = item.get("intent") if isinstance(item.get("intent"), dict) else {}

    if "allowed_actions" in intent_obj and intent_obj["allowed_actions"] is not None:
        raw_allowed = intent_obj["allowed_actions"]
    elif item.get("allowed_actions") is not None:
        raw_allowed = item["allowed_actions"]
    elif item.get("allowed_verbs") is not None:
        raw_allowed = item["allowed_verbs"]
    else:
        raw_allowed = []

    if "forbidden_actions" in intent_obj and intent_obj["forbidden_actions"] is not None:
        raw_forbidden = intent_obj["forbidden_actions"]
    elif item.get("forbidden_actions") is not None:
        raw_forbidden = item["forbidden_actions"]
    elif item.get("forbidden_verbs") is not None:
        raw_forbidden = item["forbidden_verbs"]
    else:
        raw_forbidden = []

    allowed_verbs: Set[str] = {
        str(a).strip().lower() for a in raw_allowed if a is not None and str(a).strip()
    }
    forbidden_verbs: Set[str] = {
        str(a).strip().lower() for a in raw_forbidden if a is not None and str(a).strip()
    }

    # 4. Steps mapping + integer-to-original step_id preservation
    raw_steps = item.get("steps") or []
    steps: List[Step] = []
    step_id_map: Dict[int, str] = {}

    for idx, s in enumerate(raw_steps, start=1):
        if not isinstance(s, dict):
            continue
        raw_step_id = next(
            (s[k] for k in ("step_id", "stepId", "step_number") if k in s and s[k] is not None),
            None,
        )
        if raw_step_id is not None:
            step_id_str_val = str(raw_step_id)
            step_id_int = _parse_step_id_int(raw_step_id, idx)
        else:
            step_id_str_val = str(idx)
            step_id_int = idx

        # Prevent silent collision if two distinct original IDs map to the same int
        if step_id_int in step_id_map:
            step_id_int = max(step_id_map) + 1

        step_id_map[step_id_int] = step_id_str_val

        raw_action = s.get("action_type")
        if raw_action is None:
            raw_action = s.get("action")
        action_type = str(raw_action).strip() if raw_action is not None else ""

        raw_tool_called = s.get("tool_called")
        tool_called = str(raw_tool_called) if raw_tool_called is not None else None
        tool_input = str(s.get("tool_input") if s.get("tool_input") is not None else "")
        tool_output = str(s.get("tool_output") if s.get("tool_output") is not None else "")

        raw_reasoning = s.get("agent_reasoning")
        if raw_reasoning is None:
            raw_reasoning = s.get("reasoning")
        agent_reasoning = str(raw_reasoning) if raw_reasoning is not None else ""

        steps.append(
            Step(
                step_id=step_id_int,
                action_type=action_type,
                tool_called=tool_called,
                tool_input=tool_input,
                tool_output=tool_output,
                agent_reasoning=agent_reasoning,
            )
        )

    # 5. Ground Truth (STRICTLY ISOLATED from Intent and Step)
    gt_raw: Optional[Dict[str, Any]] = None
    if gt_index is not None:
        gt_raw = gt_index.get(trace_id_str)

    item_split = item.get("sample_split")
    item_ro = item.get("sample_review_only") or item.get("review_only") or item.get("is_review_only")
    if gt_raw is not None:
        ground_truth = _build_ground_truth(gt_raw, sample_split=item_split, sample_review_only=item_ro)
    elif allow_inline_ground_truth:
        label_obj = item.get("label") if isinstance(item.get("label"), dict) else {}
        gt_obj = item.get("groundTruth") if isinstance(item.get("groundTruth"), dict) else {}
        inline_gt = item.get("ground_truth") if isinstance(item.get("ground_truth"), dict) else None

        if inline_gt is not None:
            ground_truth = _build_ground_truth(inline_gt, sample_split=item_split, sample_review_only=item_ro)
        else:
            expected_step = next(
                (
                    v
                    for v in (
                        item.get("expected_step"),
                        label_obj.get("deviation_step"),
                        gt_obj.get("deviationStep"),
                    )
                    if v is not None
                ),
                None,
            )
            expected_type = next(
                (
                    v
                    for v in (
                        item.get("expected_type"),
                        label_obj.get("deviation_type"),
                        label_obj.get("_proposed_deviation_type"),
                        label_obj.get("_original_failure_type"),
                        gt_obj.get("deviationType"),
                    )
                    if v is not None
                ),
                None,
            )
            if expected_type in ("none", "None", "", None) and expected_step is None:
                is_deviated = False
                dev_type = None
            else:
                is_deviated = True
                dev_type = str(expected_type).lower().replace(" ", "_") if expected_type else "unknown"
            ground_truth = _build_ground_truth(None, is_deviated, dev_type, expected_step, sample_split=item_split, sample_review_only=item_ro)
    else:
        # Detector-input record with no matching ground truth in gt_index
        ground_truth = _build_ground_truth(None, is_deviated=False, dev_type=None, expected_step=None, sample_split=item_split, sample_review_only=item_ro)

    # 6. Sanitize raw_data so ground-truth fields are never retained on raw detector payload
    sanitized_raw = {k: v for k, v in item.items() if k not in _GT_RAW_KEYS}
    if isinstance(sanitized_raw.get("label"), dict):
        sanitized_raw.pop("label", None)

    # 7. UI selector label (does not affect detection)
    ui_label = item.get("label") if isinstance(item.get("label"), str) else None
    if not ui_label:
        gt_type = ground_truth.get("deviationType")
        dev_tag = f"[{gt_type}]" if gt_type else "[on-task]"
        ui_label = (
            f"Trace {trace_id_str}: {dev_tag} {prompt[:45]}..."
            if prompt
            else f"Trace {trace_id_str}"
        )

    return LoadedTrace(
        trace_id=trace_id_str,
        label=ui_label,
        prompt=prompt,
        allowed_verbs=allowed_verbs,
        forbidden_verbs=forbidden_verbs,
        steps=steps,
        step_id_map=step_id_map,
        ground_truth=ground_truth,
        raw_data=sanitized_raw,
    )


# ---------------------------------------------------------------------------
# TraceRepository
# ---------------------------------------------------------------------------

class TraceRepository:
    """In-memory trace repository for AgentLens datasets.

    By default, loads the corrected 300-record dataset:
      - Detector inputs from ``Agentlens_detector_input.jsonl``
      - Ground-truth annotations separately from ``AgentLens_300_Final_Corrected.jsonl``
        matched strictly by ``trace_id``.

    The legacy 8-trace dev dataset is NOT mixed into the 300-record dataset.
    It can be loaded explicitly by passing ``use_dev_fallback=True`` or calling
    ``TraceRepository.from_dev_fallback()``.
    """

    def __init__(
        self,
        detector_input_path: Optional[Path] = None,
        corrected_full_path: Optional[Path] = None,
        dev_traces_path: Optional[Path] = None,
        *,
        use_dev_fallback: bool = False,
        strict: bool = False,
    ):
        self._detector_input_path = Path(detector_input_path) if detector_input_path is not None else DETECTOR_INPUT_PATH
        self._corrected_full_path = Path(corrected_full_path) if corrected_full_path is not None else CORRECTED_FULL_PATH
        self._dev_traces_path = Path(dev_traces_path) if dev_traces_path is not None else DEV_TRACES_PATH
        self._use_dev_fallback = use_dev_fallback
        self._strict = strict

        self._traces: Dict[str, LoadedTrace] = {}
        # Separate ground-truth table keyed by trace_id for explicit evaluation-layer access
        self._ground_truth: Dict[str, Dict[str, Any]] = {}
        self._dataset_source: str = "none"
        self.load_report: Dict[str, Any] = {
            "source": "none",
            "records_loaded": 0,
            "unique_trace_ids": 0,
            "skipped_review_only": 0,
            "missing_detector_ids": [],
            "duplicate_detector_ids": [],
            "missing_gt_ids": [],
            "duplicate_gt_ids": [],
            "unmatched_detector_ids": [],
            "unmatched_gt_ids": [],
            "errors": [],
            "warnings": [],
        }
        self._load_all()

    @classmethod
    def from_dev_fallback(
        cls,
        dev_traces_path: Optional[Path] = None,
        *,
        strict: bool = False,
    ) -> "TraceRepository":
        """Explicitly construct a repository backed by the legacy dev traces."""
        return cls(
            dev_traces_path=dev_traces_path,
            use_dev_fallback=True,
            strict=strict,
        )

    # ------------------------------------------------------------------
    # Internal loaders
    # ------------------------------------------------------------------

    def _load_primary(self) -> bool:
        """Load detector inputs and separately match ground truth by trace_id."""
        if not self._detector_input_path.exists():
            msg = f"Detector-input dataset file not found: {self._detector_input_path}"
            logger.error(msg)
            self.load_report["errors"].append(msg)
            self._dataset_source = "missing"
            self.load_report["source"] = "missing"
            if self._strict:
                raise FileNotFoundError(msg)
            return False

        # 1. Load ground truth separately from the full corrected dataset
        gt_load = _load_ground_truth_index(self._corrected_full_path)
        gt_index: Dict[str, Dict[str, Any]] = gt_load["index"]
        self.load_report["missing_gt_ids"] = gt_load["missing_ids"]
        self.load_report["duplicate_gt_ids"] = gt_load["duplicate_ids"]
        self.load_report["errors"].extend(gt_load["parse_errors"])

        if gt_load["file_missing"]:
            msg = f"Full corrected ground-truth dataset file not found: {self._corrected_full_path}"
            logger.warning(msg)
            self.load_report["warnings"].append(msg)
            if self._strict:
                raise FileNotFoundError(msg)

        # 2. Load detector inputs strictly from the detector-input JSONL
        loaded = 0
        try:
            with open(self._detector_input_path, "r", encoding="utf-8") as fh:
                for lineno, line in enumerate(fh, start=1):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        item = json.loads(line)
                    except json.JSONDecodeError as exc:
                        msg = f"JSON parse error in {self._detector_input_path.name} line {lineno}: {exc}"
                        logger.warning(msg)
                        self.load_report["errors"].append(msg)
                        continue

                    if not isinstance(item, dict):
                        msg = f"Non-object record in {self._detector_input_path.name} line {lineno}"
                        logger.warning(msg)
                        self.load_report["errors"].append(msg)
                        continue

                    if _is_review_only_record(item):
                        self.load_report["skipped_review_only"] += 1
                        continue

                    tid = _extract_raw_trace_id(item)
                    if tid is None:
                        self.load_report["missing_detector_ids"].append(lineno)
                        logger.warning("Missing trace_id in %s line %d (skipped)", self._detector_input_path.name, lineno)
                        continue

                    if tid in self._traces:
                        self.load_report["duplicate_detector_ids"].append(tid)
                        logger.warning(
                            "Duplicate trace_id '%s' in %s line %d (keeping first)",
                            tid,
                            self._detector_input_path.name,
                            lineno,
                        )
                        continue

                    lt = _normalize_trace_dict(
                        item,
                        lineno,
                        gt_index=gt_index,
                        require_trace_id=True,
                        allow_inline_ground_truth=False,
                    )
                    self._traces[lt.trace_id] = lt
                    self._ground_truth[lt.trace_id] = dict(lt.ground_truth)
                    loaded += 1

        except OSError as exc:
            msg = f"Cannot open {self._detector_input_path}: {exc}"
            logger.error(msg)
            self.load_report["errors"].append(msg)
            self._dataset_source = "missing"
            self.load_report["source"] = "missing"
            if self._strict:
                raise
            return False

        # 3. Compute unmatched IDs between detector inputs and ground truth
        det_ids = set(self._traces.keys())
        gt_ids = set(gt_index.keys())
        self.load_report["unmatched_detector_ids"] = sorted(det_ids - gt_ids)
        self.load_report["unmatched_gt_ids"] = sorted(gt_ids - det_ids)

        if self.load_report["unmatched_detector_ids"]:
            self.load_report["warnings"].append(
                f"{len(self.load_report['unmatched_detector_ids'])} detector-input record(s) have no matching ground truth."
            )
        if self.load_report["unmatched_gt_ids"]:
            self.load_report["warnings"].append(
                f"{len(self.load_report['unmatched_gt_ids'])} ground-truth record(s) have no matching detector input."
            )

        self._dataset_source = "corrected_300"
        self.load_report["source"] = "corrected_300"
        self.load_report["records_loaded"] = loaded
        self.load_report["unique_trace_ids"] = len(self._traces)
        return loaded > 0

    def _load_dev_fallback(self) -> bool:
        """Load legacy dev traces when explicitly requested."""
        if not self._dev_traces_path.exists():
            msg = f"Dev fallback dataset file not found: {self._dev_traces_path}"
            logger.error(msg)
            self.load_report["errors"].append(msg)
            self._dataset_source = "missing"
            self.load_report["source"] = "missing"
            if self._strict:
                raise FileNotFoundError(msg)
            return False

        loaded = 0
        try:
            with open(self._dev_traces_path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            for idx, item in enumerate(data, start=1):
                if not isinstance(item, dict) or _is_review_only_record(item):
                    continue
                tid = _extract_raw_trace_id(item)
                if tid is None:
                    self.load_report["missing_detector_ids"].append(idx)
                    continue
                if tid in self._traces:
                    self.load_report["duplicate_detector_ids"].append(tid)
                    continue
                lt = _normalize_trace_dict(
                    item,
                    idx,
                    gt_index=None,
                    require_trace_id=True,
                    allow_inline_ground_truth=True,
                )
                self._traces[lt.trace_id] = lt
                self._ground_truth[lt.trace_id] = dict(lt.ground_truth)
                loaded += 1
        except (OSError, json.JSONDecodeError) as exc:
            msg = f"Error loading dev fallback traces from {self._dev_traces_path}: {exc}"
            logger.error(msg)
            self.load_report["errors"].append(msg)
            self._dataset_source = "missing"
            self.load_report["source"] = "missing"
            if self._strict:
                raise
            return False

        self._dataset_source = "dev_fallback"
        self.load_report["source"] = "dev_fallback"
        self.load_report["records_loaded"] = loaded
        self.load_report["unique_trace_ids"] = len(self._traces)
        return loaded > 0

    def _load_all(self) -> None:
        if self._use_dev_fallback:
            self._load_dev_fallback()
        else:
            self._load_primary()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def list_traces(self) -> List[Dict[str, Any]]:
        """Return unique traces from the active dataset."""
        out: List[Dict[str, Any]] = []
        for t in self._traces.values():
            gt = self._ground_truth.get(t.trace_id, t.ground_truth)
            out.append({
                "traceId": t.trace_id,
                "label": t.label,
                "stepCount": len(t.steps),
                "groundTruth": {
                    "isDeviated": gt.get("isDeviated", False),
                    "deviationType": gt.get("deviationType"),
                    "flaggedSteps": gt.get("flaggedSteps", []),
                    "flaggedStepId": gt.get("flaggedStepId"),
                    "annotationExplanation": gt.get("annotationExplanation", ""),
                    "sampleSplit": gt.get("sampleSplit") or gt.get("sample_split"),
                    "sampleReviewOnly": bool(gt.get("sampleReviewOnly") or gt.get("sample_review_only")),
                    "notes": gt.get("notes", ""),
                },
            })
        return out

    def get_trace(self, trace_id: str) -> Optional[LoadedTrace]:
        """Look up a trace by its exact trace_id without mutating IDs."""
        tid = str(trace_id).strip()
        return self._traces.get(tid)

    def get_ground_truth(self, trace_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve isolated ground-truth metadata for a trace (evaluation layer only)."""
        tid = str(trace_id).strip()
        gt = self._ground_truth.get(tid)
        return dict(gt) if gt is not None else None

    def get_sample_split(self, trace_id: str) -> Optional[str]:
        """Retrieve the dataset split label (e.g. 'test', 'train', 'validation') for a trace."""
        gt = self.get_ground_truth(trace_id)
        if gt:
            return gt.get("sample_split") or gt.get("sampleSplit")
        return None

    def is_review_only(self, trace_id: str) -> bool:
        """Return True if trace is marked review-only via split or review flag."""
        gt = self.get_ground_truth(trace_id)
        if gt:
            if gt.get("sample_split") == "sample_review_only" or gt.get("sampleSplit") == "sample_review_only":
                return True
            for k in ("sample_review_only", "sampleReviewOnly", "review_only", "is_review_only"):
                v = gt.get(k)
                if v is not None:
                    norm = normalize_bool(v)
                    if norm is True:
                        return True
                    if norm is False:
                        return False
        return False

    def iter_traces(self) -> List[LoadedTrace]:
        """Return all loaded LoadedTrace objects in load order."""
        return list(self._traces.values())

    @property
    def dataset_source(self) -> str:
        """Active dataset source: 'corrected_300', 'dev_fallback', or 'missing'."""
        return self._dataset_source

    @property
    def primary_count(self) -> int:
        """Number of unique records loaded in this repository."""
        return len(self._traces)


# ---------------------------------------------------------------------------
# Global singleton (loads primary 300-record dataset)
# ---------------------------------------------------------------------------
repository = TraceRepository()
