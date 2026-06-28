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

        # 去重：同一文档只取最相关的一个，但保证最少 top_k 个结果
        seen_docs = set()
        final = []
        for item in filtered:
            doc_id = item["chunk"].document_id
            if doc_id not in seen_docs or len(final) < top_k:
                final.append(item)
                seen_docs.add(doc_id)
            if len(final) >= top_k:
                break

        return final
