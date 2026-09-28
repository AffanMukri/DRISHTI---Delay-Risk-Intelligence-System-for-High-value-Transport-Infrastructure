"""Vercel ASGI entry point for the existing DRISHTI FastAPI application."""

from pathlib import Path
import os
import sys


BACKEND_ROOT = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Vercel has a strict uncompressed function-size ceiling. The serverless entry
# point loads the database-backed core API and leaves heavyweight offline ML,
# PDF/RAG, and report rendering to the full backend deployment.
os.environ.setdefault("SERVERLESS_CORE_RUNTIME", "true")

from app.main import app  # noqa: E402,F401
