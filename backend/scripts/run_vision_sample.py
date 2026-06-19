import argparse
import asyncio
import os
from pathlib import Path

from app.core.config import get_settings
from app.services.image_preprocess import ImagePreprocessError, preprocess_image
from app.services.vision import DEFAULT_OPENAI_VISION_MODEL, OpenAIVisionService, VisionServiceError


def main() -> int:
    parser = argparse.ArgumentParser(description="Run OpenAI vision extraction on one label image.")
    parser.add_argument("image_path", type=Path)
    parser.add_argument("--content-type", default=None)
    parser.add_argument("--model", default=None)
    args = parser.parse_args()

    settings = get_settings()
    api_key = os.environ.get("OPENAI_API_KEY") or settings.openai_api_key
    if not api_key:
        print("OPENAI_API_KEY is not set; real vision sample run skipped.")
        return 2

    if not args.image_path.exists():
        print("Sample image does not exist.")
        return 2

    content_type = args.content_type or _guess_content_type(args.image_path)
    try:
        image = preprocess_image(
            args.image_path.read_bytes(),
            content_type,
            filename=args.image_path.name,
            max_upload_mb=settings.max_upload_mb,
        )
        service = OpenAIVisionService(
            api_key=api_key,
            model=args.model or settings.vision_model or DEFAULT_OPENAI_VISION_MODEL,
        )
        extracted = asyncio.run(service.extract_label(image))
    except ImagePreprocessError as exc:
        print(f"Image preprocessing failed: {exc.category}: {exc.message}")
        return 1
    except VisionServiceError as exc:
        print(f"Vision extraction failed: {exc.category}: {exc.message}")
        return 1

    print(extracted.model_dump_json(indent=2))
    return 0


def _guess_content_type(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".png":
        return "image/png"
    if suffix == ".webp":
        return "image/webp"
    return "application/octet-stream"


if __name__ == "__main__":
    raise SystemExit(main())
