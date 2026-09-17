import logging
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

logger = logging.getLogger(__name__)

UPLOAD_ROOT = Path(__file__).resolve().parent.parent.parent / "uploads"
BARBER_UPLOAD_DIR = UPLOAD_ROOT / "barbers"
MAX_BARBER_PHOTO_BYTES = 5 * 1024 * 1024
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


def ensure_upload_dirs() -> None:
    BARBER_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _extension_for(file: UploadFile) -> str:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix in ALLOWED_EXTENSIONS:
        return suffix
    content_type = (file.content_type or "").lower()
    if content_type == "image/jpeg":
        return ".jpg"
    if content_type == "image/png":
        return ".png"
    if content_type == "image/webp":
        return ".webp"
    raise HTTPException(status.HTTP_400_BAD_REQUEST, "Formato no permitido. Usa JPG, PNG o WebP.")


def public_url_for_barber_photo(filename: str) -> str:
    return f"/uploads/barbers/{filename}"


def resolve_upload_path(image_url: str) -> Path | None:
    if not image_url.startswith("/uploads/barbers/"):
        return None
    filename = Path(image_url).name
    if not filename or filename != Path(filename).name:
        return None
    return BARBER_UPLOAD_DIR / filename


def delete_barber_photo_file(image_url: str) -> None:
    path = resolve_upload_path(image_url)
    if path is None or not path.exists():
        return
    try:
        path.unlink()
    except OSError:
        logger.exception("Failed to delete barber photo %s", path)


async def save_barber_photo(barber_id: int, file: UploadFile) -> str:
    if not file.filename:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No se recibió ningún archivo.")

    extension = _extension_for(file)
    if file.content_type and file.content_type.lower() not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Formato no permitido. Usa JPG, PNG o WebP.")

    content = await file.read()
    if not content:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El archivo está vacío.")
    if len(content) > MAX_BARBER_PHOTO_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La imagen no puede superar 5 MB.")

    ensure_upload_dirs()
    filename = f"barber_{barber_id}_{uuid.uuid4().hex}{extension}"
    destination = BARBER_UPLOAD_DIR / filename
    destination.write_bytes(content)
    return public_url_for_barber_photo(filename)
