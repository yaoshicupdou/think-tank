from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Dict, Optional
from app.models.document import Chunk, Document
from app.models.user import User
from app.services.embedding import EmbeddingService
from app.core.config import settings

class Retriever:
    def __init__(self, db: Session, user: Optional[User] = None):
        self.db = db
        self.user = user
        self.embed_service = EmbeddingService.get_instance()

    def search(self, query: str, top_k: int = None) -> List[Dict]:
        if top_k is None:
            top_k = settings.TOP_K

        query_emb = self.embed_service.encode(query).tolist()

        q = self.db.query(
            Chunk,
            Chunk.embedding.cosine_distance(query_emb).label("distance")
        ).join(Document)

        if self.user and not self.user.is_admin:
            if self.user.group_name:
                q = q.filter(or_(Document.group_name == self.user.group_name, Document.group_name == None))
            else:
                q = q.filter(Document.group_name == None)

        results = q.order_by(
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
