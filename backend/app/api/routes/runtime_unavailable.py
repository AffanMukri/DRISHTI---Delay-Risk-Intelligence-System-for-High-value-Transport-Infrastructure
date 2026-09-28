"""Explicit responses for features omitted from the compact Vercel runtime."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.auth.dependencies import get_current_profile
from app.auth.models import CurrentProfile
from app.errors import AppError


router = APIRouter(tags=["Runtime availability"])

FEATURE_LABELS = {
    "assistant": "Document RAG and Ask DRISHTI synthesis",
    "experiments": "ML experiment comparison",
    "model-monitoring": "ML model monitoring",
    "predictions": "ML prediction and what-if simulation",
    "reports": "PDF/XLSX report rendering",
}


def _feature_from_request(request: Request) -> str:
    return next(
        (segment for segment in request.url.path.split("/") if segment in FEATURE_LABELS),
        "predictions",
    )


def _raise_unavailable(request: Request) -> None:
    feature = _feature_from_request(request)
    label = FEATURE_LABELS[feature]
    raise AppError(
        f"{label} requires the full DRISHTI backend runtime and is not packaged in the compact Vercel function.",
        code="full_runtime_required",
        status_code=503,
        details={
            "feature": feature,
            "requestedPath": request.url.path,
            "deployment": "vercel-serverless-core",
            "retryable": False,
        },
    )


async def unavailable_feature_root(
    request: Request,
    _: Annotated[CurrentProfile, Depends(get_current_profile)],
) -> None:
    _raise_unavailable(request)


async def unavailable_feature_path(
    request: Request,
    _: Annotated[CurrentProfile, Depends(get_current_profile)],
    path: str,
) -> None:
    del path
    _raise_unavailable(request)


for feature_name in FEATURE_LABELS:
    router.add_api_route(
        f"/{feature_name}",
        unavailable_feature_root,
        methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        name=f"{feature_name.replace('-', '_')}_runtime_unavailable",
    )
    router.add_api_route(
        f"/{feature_name}/{{path:path}}",
        unavailable_feature_path,
        methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        name=f"{feature_name.replace('-', '_')}_path_runtime_unavailable",
    )
