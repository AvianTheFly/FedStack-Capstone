from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.batch import router as batch_router
from app.api.compare import router as compare_router
from app.api.health import router as health_router
from app.api.verify import router as verify_router
from app.core.config import get_settings
from app.core.error_handlers import api_error_handler, request_validation_error_handler
from app.core.errors import ApiError, ErrorEnvelope, ErrorPayload


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version=settings.app_version)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.backend_cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router)
    app.include_router(verify_router)
    app.include_router(batch_router)
    app.include_router(compare_router)
    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(RequestValidationError, request_validation_error_handler)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        _ = (request, exc)
        envelope = ErrorEnvelope(
            error=ErrorPayload(
                code="internal_error",
                message="Something went wrong. Please try again.",
                details={},
            )
        )
        return JSONResponse(status_code=500, content=envelope.model_dump())

    return app


app = create_app()
