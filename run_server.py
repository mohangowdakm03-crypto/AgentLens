"""Entrypoint script to start the AgentLens FastAPI backend."""
import os
import sys

# Ensure detector and ml_core are in PYTHONPATH
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
detector_dir = os.path.join(project_root, "detector")
ml_core_dir = os.path.join(detector_dir, "ml_core")

for d in [project_root, detector_dir, ml_core_dir]:
    if d not in sys.path:
        sys.path.insert(0, d)

# Set offline mode default so sentence-transformers uses cached models
if "HF_HUB_OFFLINE" not in os.environ:
    os.environ["HF_HUB_OFFLINE"] = "1"

import uvicorn

if __name__ == "__main__":
    uvicorn.run("detector.api.main:app", host="127.0.0.1", port=8000, reload=False)
