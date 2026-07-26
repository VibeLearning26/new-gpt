"""Model input-capability discovery and safe multimodal payload helpers."""

from __future__ import annotations

import base64
import binascii
from dataclasses import dataclass
from typing import Any, Literal

from app.core.config import get_settings
from app.core.exceptions import ValidationError

InputModality = Literal["text", "image", "document", "audio", "video"]
KNOWN_MODALITIES: tuple[InputModality, ...] = (
    "text",
    "image",
    "document",
    "audio",
    "video",
)

MIME_MODALITY: dict[str, InputModality] = {
    "image/jpeg": "image",
    "image/png": "image",
    "image/webp": "image",
    "image/gif": "image",
    "application/pdf": "document",
    "text/plain": "document",
    "audio/mpeg": "audio",
    "audio/mp4": "audio",
    "audio/wav": "audio",
    "audio/x-wav": "audio",
    "audio/webm": "audio",
    "video/mp4": "video",
    "video/webm": "video",
    "video/quicktime": "video",
}

MAX_ATTACHMENTS = 4
MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
MAX_TOTAL_ATTACHMENT_BYTES = 16 * 1024 * 1024


@dataclass(frozen=True)
class ValidatedAttachment:
    filename: str
    mime_type: str
    modality: InputModality
    data_url: str
    base64_data: str


def _normalise_modalities(values: Any) -> list[InputModality]:
    if isinstance(values, str):
        values = [values]
    if not isinstance(values, (list, tuple, set)):
        return []
    found: list[InputModality] = []
    aliases = {"images": "image", "pdf": "document", "files": "document"}
    for raw in values:
        value = aliases.get(str(raw).lower().strip(), str(raw).lower().strip())
        if value in KNOWN_MODALITIES and value not in found:
            found.append(value)  # type: ignore[arg-type]
    return found


def configured_model_modalities() -> dict[str, list[InputModality]]:
    """Parse ``model=image|audio;other=document`` server-side overrides."""
    result: dict[str, list[InputModality]] = {}
    raw = get_settings().ROUTER_MODEL_INPUT_MODALITIES
    for entry in raw.split(";"):
        model_id, separator, values = entry.strip().partition("=")
        if not separator or not model_id.strip():
            continue
        result[model_id.strip()] = _normalise_modalities(values.split("|"))
    return result


def model_input_modalities(model: dict[str, Any]) -> list[InputModality]:
    """Return conservative capabilities from metadata plus admin overrides."""
    model_id = str(model.get("id", ""))
    discovered: list[InputModality] = []
    modalities = model.get("modalities")
    candidates = [
        model.get("input_modalities"),
        model.get("input"),
        modalities.get("input") if isinstance(modalities, dict) else modalities,
        (model.get("capabilities") or {}).get("input_modalities")
        if isinstance(model.get("capabilities"), dict)
        else None,
        (model.get("architecture") or {}).get("input_modalities")
        if isinstance(model.get("architecture"), dict)
        else None,
    ]
    for candidate in candidates:
        for modality in _normalise_modalities(candidate):
            if modality not in discovered:
                discovered.append(modality)

    override = configured_model_modalities().get(model_id)
    enabled = override if override is not None else discovered
    return ["text", *[item for item in enabled if item != "text"]]


def _decode_data_url(data_url: str, declared_mime: str) -> tuple[str, bytes]:
    prefix, separator, encoded = data_url.partition(",")
    if not separator or not prefix.startswith("data:") or ";base64" not in prefix:
        raise ValidationError("Attachments must use a base64 data URL")
    embedded_mime = prefix[5:].split(";", 1)[0].lower()
    if embedded_mime != declared_mime:
        raise ValidationError("Attachment MIME type does not match its data")
    try:
        decoded = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValidationError("Attachment contains invalid base64 data") from exc
    return encoded, decoded


def validate_attachments(
    attachments: list[Any],
    model_id: str,
    model_metadata: dict[str, Any],
) -> list[ValidatedAttachment]:
    if len(attachments) > MAX_ATTACHMENTS:
        raise ValidationError(f"A maximum of {MAX_ATTACHMENTS} attachments is allowed")

    supported = set(model_input_modalities(model_metadata))
    validated: list[ValidatedAttachment] = []
    total_bytes = 0
    for item in attachments:
        mime_type = item.mime_type.lower().strip()
        modality = MIME_MODALITY.get(mime_type)
        if modality is None:
            raise ValidationError(f"Unsupported attachment type: {mime_type}")
        if modality not in supported:
            raise ValidationError(
                f"Model '{model_id}' does not support {modality} input"
            )
        encoded, decoded = _decode_data_url(item.data_url, mime_type)
        if not decoded:
            raise ValidationError("Empty attachments are not allowed")
        if len(decoded) > MAX_ATTACHMENT_BYTES:
            raise ValidationError("Each attachment must be 8 MB or smaller")
        total_bytes += len(decoded)
        if total_bytes > MAX_TOTAL_ATTACHMENT_BYTES:
            raise ValidationError("Attachments must total 16 MB or less")
        validated.append(
            ValidatedAttachment(
                filename=item.filename,
                mime_type=mime_type,
                modality=modality,
                data_url=item.data_url,
                base64_data=encoded,
            )
        )
    return validated


def openai_content_parts(
    prompt: str, attachments: list[ValidatedAttachment] | None
) -> str | list[dict[str, Any]]:
    """Build OpenAI-compatible content blocks for current and future media."""
    if not attachments:
        return prompt
    parts: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for item in attachments:
        if item.modality == "image":
            parts.append({"type": "image_url", "image_url": {"url": item.data_url}})
        elif item.modality == "audio":
            audio_format = item.mime_type.split("/", 1)[1].replace("x-", "")
            parts.append(
                {
                    "type": "input_audio",
                    "input_audio": {"data": item.base64_data, "format": audio_format},
                }
            )
        elif item.modality == "video":
            parts.append({"type": "video_url", "video_url": {"url": item.data_url}})
        else:
            parts.append(
                {
                    "type": "file",
                    "file": {"filename": item.filename, "file_data": item.data_url},
                }
            )
    return parts
