from unittest.mock import MagicMock, patch

import pytest

from app.rag.embedding import EmbeddingService


@pytest.fixture
def mock_sentence_transformer():
    with patch("sentence_transformers.SentenceTransformer") as mock_st:
        mock_instance = MagicMock()
        mock_st.return_value = mock_instance
        yield mock_instance

def test_embed_query_success(mock_sentence_transformer):
    # Setup mock
    import numpy as np
    mock_sentence_transformer.encode.return_value = np.array([0.1, 0.2, 0.3])

    # Ensure singleton is fresh for test
    EmbeddingService._instance = None
    service = EmbeddingService()

    result = service.embed_query("test query")

    assert result == [0.1, 0.2, 0.3]
    mock_sentence_transformer.encode.assert_called_once_with("test query", normalize_embeddings=True)

def test_embed_query_empty_input():
    EmbeddingService._instance = None
    # We mock the constructor to avoid downloading the real model if not needed,
    # though empty input check happens before model inference.
    with patch("sentence_transformers.SentenceTransformer"):
        service = EmbeddingService()
        with pytest.raises(ValueError, match="Input text cannot be empty"):
            service.embed_query("")

        with pytest.raises(ValueError, match="Input text cannot be empty"):
            service.embed_query("   ")

def test_embed_batch_success(mock_sentence_transformer):
    import numpy as np
    mock_sentence_transformer.encode.return_value = np.array([
        [0.1, 0.2],
        [0.3, 0.4]
    ])

    EmbeddingService._instance = None
    service = EmbeddingService()

    result = service.embed_batch(["text1", "text2"])

    assert result == [[0.1, 0.2], [0.3, 0.4]]
    mock_sentence_transformer.encode.assert_called_once_with(["text1", "text2"], normalize_embeddings=True)
