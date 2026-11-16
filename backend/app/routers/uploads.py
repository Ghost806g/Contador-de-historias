import base64
import binascii
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.schemas import AvatarUploadRequest

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024


@router.post("/avatar")
async def upload_avatar(payload: AvatarUploadRequest) -> dict[str, str]:
    ext = Path(payload.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Formato inválido. Envie PNG, JPG, WEBP ou GIF.",
        )

    raw_b64 = payload.data_base64.strip()
    if "," in raw_b64 and raw_b64.startswith("data:"):
        raw_b64 = raw_b64.split(",", 1)[1]

    try:
        image_bytes = base64.b64decode(raw_b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Imagem base64 inválida.") from exc

    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Imagem excede o limite de 5 MB.")

    uploads_path = Path(settings.uploads_dir)
    uploads_path.mkdir(parents=True, exist_ok=True)
    file_name = f"{uuid4().hex}{ext}"
    (uploads_path / file_name).write_bytes(image_bytes)

    return {"url": f"/uploads/{file_name}"}

