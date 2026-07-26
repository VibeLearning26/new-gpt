from types import SimpleNamespace

import pytest

from app.core.exceptions import ValidationError
from app.rag import modalities
from app.schemas.question import ChatAttachment


def test_provider_metadata_modalities_are_normalised(monkeypatch):
    monkeypatch.setattr(
        modalities,
        "get_settings",
        lambda: SimpleNamespace(ROUTER_MODEL_INPUT_MODALITIES=""),
    )
    model = {
        "id": "future-model",
        "architecture": {"input_modalities": ["text", "images", "audio"]},
    }

    assert modalities.model_input_modalities(model) == ["text", "image", "audio"]


def test_configured_override_enables_verified_image_input(monkeypatch):
    monkeypatch.setattr(
        modalities,
        "get_settings",
        lambda: SimpleNamespace(
            ROUTER_MODEL_INPUT_MODALITIES="mimo-v2.5-free=image"
        ),
    )

    assert modalities.model_input_modalities({"id": "mimo-v2.5-free"}) == [
        "text",
        "image",
    ]


def test_attachment_rejected_for_text_only_model(monkeypatch):
    monkeypatch.setattr(
        modalities,
        "get_settings",
        lambda: SimpleNamespace(ROUTER_MODEL_INPUT_MODALITIES=""),
    )
    attachment = ChatAttachment(
        filename="diagram.png",
        mime_type="image/png",
        data_url="data:image/png;base64,aGVsbG8=",
    )

    with pytest.raises(ValidationError, match="does not support image"):
        modalities.validate_attachments(
            [attachment], "text-model", {"id": "text-model"}
        )
