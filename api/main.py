"""AgentLens FastAPI Backend Integration Layer."""
import os
import sys
from pathlib import Path

# Ensure detector/ml_core is in sys.path regardless of current working directory
ml_core_path = str(Path(__file__).resolve().parent.parent / "ml_core")
if ml_core_path not in sys.path:
    sys.path.insert(0, ml_core_path)

from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.loader import repository, _normalize_trace_dict
from api.service import detector_service
from api.evaluate import evaluate_repository
from api.models import (
    TraceModel,
    TraceListItem,
    HealthResponse,
    DetectRequest,
)

# In-memory cache for the latest real batch evaluation report by split
_cached_evaluations: Dict[str, Dict[str, Any]] = {}

app = FastAPI(
    title="AgentLens Detector API",
    description="FastAPI backend connecting the AgentLens Inspector to the Python ML Core.",
    version="1.0.0",
)

# Configure CORS for Vite development server (port 5173 / any origin)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["Info"])
@app.get("/api", tags=["Info"])
def root():
    return {
        "service": "AgentLens Detector API",
        "status": "online",
        "version": "1.0.0",
        "ml_backend": "sentence-transformers + ruptures PELT",
        "endpoints": [
            "/api/health",
            "/api/traces",
            "/api/traces/{trace_id}",
            "/api/traces/{trace_id}/detect",
            "/api/detect",
            "/api/evaluate",
            "/api/performance",
        ],
    }


@app.get("/health", response_model=HealthResponse, tags=["Health"])
@app.get("/api/health", response_model=HealthResponse, tags=["Health"])
def health_check():
    traces = repository.list_traces()
    return HealthResponse(
        status="healthy",
        version="1.0.0",
        ml_core_available=True,
        trace_count=len(traces),
        cached_embeddings=True,
    )


@app.get("/api/traces", response_model=List[TraceListItem], tags=["Traces"])
def list_traces():
    """List all available traces for the Inspector selector dropdown."""
    raw_list = repository.list_traces()
    return [
        TraceListItem(
            traceId=item["traceId"],
            label=item["label"],
            stepCount=item.get("stepCount", 0),
            groundTruth=item.get("groundTruth"),
        )
        for item in raw_list
    ]


@app.get("/api/traces/{trace_id}", response_model=TraceModel, tags=["Traces"])
def get_trace_endpoint(trace_id: str):
    """Retrieve an individual trace with real ML detector evaluation."""
    loaded = repository.get_trace(trace_id)
    if not loaded:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trace with ID '{trace_id}' not found.",
        )
    try:
        result = detector_service.run_detection(loaded)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error evaluating trace: {str(e)}",
        )


@app.post("/api/traces/{trace_id}/detect", response_model=TraceModel, tags=["Detection"])
@app.get("/api/traces/{trace_id}/detect", response_model=TraceModel, tags=["Detection"])
def run_detect_on_trace(trace_id: str):
    """Run detector on a selected trace from the repository."""
    return get_trace_endpoint(trace_id)


@app.post("/api/detect", response_model=TraceModel, tags=["Detection"])
def detect_custom_trace(req: DetectRequest):
    """Run detector on arbitrary trace input payload."""
    raw_dict = req.model_dump(exclude_unset=True) if hasattr(req, "model_dump") else req.dict(exclude_unset=True)
    if not raw_dict.get("prompt") and not raw_dict.get("original_prompt"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trace must contain 'prompt' or 'original_prompt'.",
        )
    try:
        loaded = _normalize_trace_dict(raw_dict, default_idx=999)
        return detector_service.run_detection(loaded)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error running detector: {str(e)}",
        )


@app.get("/api/evaluate", tags=["Evaluation"])
def evaluate_dataset(refresh: bool = False, split: str = "test"):
    """Run batch evaluation on eligible traces in the requested split (default: 'test').

    Executes every eligible trace through detector_service.run_detection() with
    strict ground-truth isolation, then computes trace-level, per-class,
    4-class confusion matrix, step-level, error-list, and limitation metrics.
    """
    global _cached_evaluations
    cache_key = str(split)
    if not refresh and cache_key in _cached_evaluations:
        return _cached_evaluations[cache_key]
    try:
        result = evaluate_repository(repository, detector_service.run_detection, split=split)
        _cached_evaluations[cache_key] = result
        return result
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error running batch evaluation: {str(e)}",
        )


@app.get("/api/performance", tags=["Performance"])
def get_performance_report(refresh: bool = False, split: str = "test"):
    """Return real baseline batch evaluation report computed from the ML core.

    Uses the same real computation as GET /api/evaluate (default: 'test' split).
    """
    return evaluate_dataset(refresh=refresh, split=split)
