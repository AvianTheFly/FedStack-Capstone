import logging
from time import perf_counter
from typing import Annotated, Any

from fastapi import APIRouter, Body
from pydantic import BaseModel, ConfigDict, ValidationError

from app.core.errors import ApiError
from app.domain.comparison import compare_label
from app.domain.models import ApplicationData, ExtractedLabel, VerificationResult
from app.services.verification import elapsed_ms

logger = logging.getLogger(__name__)
router = APIRouter(tags=["verification"])


class CompareExtractedData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    brand_name: str | None
    class_type: str | None
    abv: str | None
    net_contents: str | None
    producer: str | None
    country_of_origin: str | None
    government_warning: str | None


class CompareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    application_data: ApplicationData
    extracted_data: CompareExtractedData


@router.post("/compare", response_model=VerificationResult)
async def compare_extracted_values(
    payload: Annotated[dict[str, Any] | None, Body()] = None,
) -> VerificationResult:
    start = perf_counter()
    if payload is None:
        raise ApiError(
            status_code=422,
            code="validation_error",
            message="Please provide application data and extracted data.",
            details={"fields": ["application_data", "extracted_data"]},
        )

    try:
        request = CompareRequest.model_validate(payload)
    except ValidationError as exc:
        raise ApiError(
            status_code=422,
            code="validation_error",
            message=(
                "Application data and extracted data are missing required fields "
                "or contain unsupported fields."
            ),
            details={"field_errors": _safe_model_errors(exc.errors())},
        ) from exc

    extracted_label = ExtractedLabel.model_validate(request.extracted_data.model_dump())
    result = compare_label(request.application_data, extracted_label)
    result.latency_ms = elapsed_ms(start)
    logger.info(
        "compare_request_completed latency_ms=%s overall_verdict=%s",
        result.latency_ms,
        result.overall_verdict,
        extra={
            "latency_ms": result.latency_ms,
            "overall_verdict": result.overall_verdict,
        },
    )
    return result


def _safe_model_errors(errors: list[dict[str, Any]]) -> list[dict[str, str]]:
    safe_errors: list[dict[str, str]] = []
    for error in errors:
        loc = error.get("loc", ())
        if not isinstance(loc, tuple | list):
            loc = ()
        safe_errors.append(
            {
                "field": ".".join(str(part) for part in loc) or "request",
                "message": str(error.get("msg", "Invalid value.")),
                "type": str(error.get("type", "validation_error")),
            }
        )
    return safe_errors
