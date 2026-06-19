from time import perf_counter

from app.core.config import Settings
from app.domain.comparison import compare_label
from app.domain.models import ApplicationData, VerificationResult
from app.services.image_preprocess import preprocess_image
from app.services.vision import VisionService


async def verify_label_image(
    *,
    application: ApplicationData,
    image_bytes: bytes,
    content_type: str,
    filename: str | None,
    vision_service: VisionService,
    settings: Settings,
) -> VerificationResult:
    start = perf_counter()
    preprocessed = preprocess_image(
        image_bytes,
        content_type,
        filename=filename,
        max_upload_mb=settings.max_upload_mb,
    )
    extracted = await vision_service.extract_label(preprocessed)
    result = compare_label(application, extracted)
    result.latency_ms = _elapsed_ms(start)
    return result


def elapsed_ms(start: float) -> int:
    return _elapsed_ms(start)


def _elapsed_ms(start: float) -> int:
    return max(0, round((perf_counter() - start) * 1000))
