from sqlalchemy.orm import Session
from typing import List, Dict
from app.models.document import Chunk
from app.services.embedding import EmbeddingService
from app.core.config import settings

class Retriever:
    def __init__(self, db: Session):
        self.db = db
        self.embed_service = EmbeddingService.get_instance()

    def search(self, query: str, top_k: int = None) -> List[Dict]:
        if top_k is None:
            top_k = settings.TOP_K

        query_emb = self.embed_service.encode(query).tolist()

        results = self.db.query(
            Chunk,
            Chunk.embedding.cosine_distance(query_emb).label("distance")
        ).order_by(
            Chunk.embedding.cosine_distance(query_emb)
        ).limit(top_k * 2).all()

        filtered = []
        for chunk, distance in results:
            similarity = 1 - distance / 2
            if similarity >= settings.SIMILARITY_THRESHOLD:
                filtered.append({
                    "chunk": chunk,
                    "similarity": round(float(similarity), 4)
                })

        return filtered[:top_k]
