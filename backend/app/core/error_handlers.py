from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.errors import ApiError, error_envelope


async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    _ = request
    return JSONResponse(
        status_code=exc.status_code,
        content=error_envelope(exc.code, exc.message, exc.details),
    )


async def request_validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    _ = request
    return JSONResponse(
        status_code=422,
        content=error_envelope(
            "validation_error",
            "Please provide a label image and application data.",
            {"field_errors": _safe_validation_errors(exc.errors())},
        ),
    )


def _safe_validation_errors(errors: list[dict[str, Any]]) -> list[dict[str, str]]:
    safe_errors: list[dict[str, str]] = []
    for error in errors:
        loc = error.get("loc", ())
        if not isinstance(loc, tuple | list):
            loc = ()
        field = ".".join(str(part) for part in loc if part not in {"body", "form"})
        safe_errors.append(
            {
                "field": field or "request",
                "message": str(error.get("msg", "Invalid value.")),
                "type": str(error.get("type", "validation_error")),
            }
        )
    return safe_errors
