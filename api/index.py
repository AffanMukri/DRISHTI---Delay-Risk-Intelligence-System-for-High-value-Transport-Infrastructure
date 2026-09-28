"""Vercel ASGI entry point for the compact DRISHTI API runtime."""

import os
from pathlib import Path
import sys


BACKEND_ROOT = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Keep the Vercel function below its 500 MB uncompressed bundle ceiling. Full
# local/container deployments do not set this flag and retain ML/RAG/reporting.
os.environ.setdefault("SERVERLESS_CORE_RUNTIME", "true")

from app.main import app  # noqa: E402,F401
