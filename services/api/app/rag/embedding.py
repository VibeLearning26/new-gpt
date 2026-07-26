"""
VibeGPT - Document Embedding Service
"""

import logging

logger = logging.getLogger(__name__)

# The specific sentence-transformers model
MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384

class EmbeddingError(Exception):
    """Raised when there is an error during embedding generation."""
    pass


class EmbeddingService:
    """
    Singleton service for generating vector embeddings.
    Loads the model into memory only once.
    """
    _instance = None
    _model = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._load_model()
        return cls._instance

    def _load_model(self):
        try:
            logger.info(f"Loading embedding model {MODEL_NAME}...")
            # Importing sentence-transformers also imports PyTorch and can take
            # minutes on constrained Windows Docker hosts. Keep that work out
            # of API startup; it is needed only when embeddings are requested.
            from sentence_transformers import SentenceTransformer

            # Loads the model. Downloads it on the first run.
            self._model = SentenceTransformer(MODEL_NAME)
            logger.info(f"Model {MODEL_NAME} loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            raise EmbeddingError(f"Failed to load model {MODEL_NAME}") from e

    def embed_query(self, text: str) -> list[float]:
        """
        Embed a single search query.
        Returns L2-normalized vectors (sentence-transformers defaults or we can enforce it).
        """
        if not text or not text.strip():
            raise ValueError("Input text cannot be empty.")

        try:
            # We explicitly ask for a numpy array, then convert to python list
            embedding = self._model.encode(text, normalize_embeddings=True)
            return embedding.tolist()
        except Exception as e:
            logger.error(f"Error embedding query: {e}")
            raise EmbeddingError("Failed to generate query embedding.") from e

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """
        Embed a batch of document chunks.
        """
        if not texts:
            return []

        try:
            embeddings = self._model.encode(texts, normalize_embeddings=True)
            return [emb.tolist() for emb in embeddings]
        except Exception as e:
            logger.error(f"Error embedding batch: {e}")
            raise EmbeddingError("Failed to generate batch embeddings.") from e
