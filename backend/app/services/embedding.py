import numpy as np
from typing import List
from app.core.config import settings

class EmbeddingService:
    _instance = None
    _model = None

    def __init__(self):
        from sentence_transformers import SentenceTransformer
        self._model = SentenceTransformer(
            "BAAI/bge-m3",
            cache_folder=settings.EMBEDDING_MODEL_PATH,
            device="cpu"
        )

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def encode(self, text: str) -> np.ndarray:
        return self._model.encode(
            text,
            normalize_embeddings=True,
            show_progress_bar=False
        )

    def encode_batch(self, texts: List[str]) -> np.ndarray:
        return self._model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False,
            batch_size=8
        )
