from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_
from sklearn.decomposition import PCA
import numpy as np

from app.db.database import get_db
from app.models.user import User
from app.models.document import Document, Chunk
from app.routers.auth import get_current_user
from app.services.embedding import EmbeddingService

router = APIRouter(prefix="/viz", tags=["visualization"])


def _accessible_chunks(db: Session, user: User | None):
    q = db.query(Chunk, Document.filename, Document.group_name).join(
        Document, Chunk.document_id == Document.id
    )
    if user and not user.is_admin:
        if user.group_name:
            q = q.filter(
                or_(Document.group_name == user.group_name, Document.group_name == None)
            )
        else:
            q = q.filter(Document.group_name == None)
    return q.order_by(Chunk.id).all()


@router.get("/embeddings")
def get_embeddings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = _accessible_chunks(db, current_user)
    if not rows:
        return {"points": [], "documents": []}

    vectors = np.array([r[0].embedding for r in rows], dtype=np.float64)
    # Reduce from 1024 to min(2, n_samples-1) dimensions
    n_components = min(2, vectors.shape[0] - 1) if vectors.shape[0] > 1 else 0

    if n_components >= 2:
        pca = PCA(n_components=2)
        coords = pca.fit_transform(vectors)
    else:
        coords = np.zeros((vectors.shape[0], 2))

    # Build document lookup {filename: color_index}
    doc_names = sorted(set(r[1] for r in rows))
    doc_list = [{"filename": name, "count": 0} for name in doc_names]
    doc_idx = {name: i for i, name in enumerate(doc_names)}

    points = []
    for i, (chunk, filename, group_name) in enumerate(rows):
        di = doc_idx[filename]
        doc_list[di]["count"] += 1
        points.append({
            "id": chunk.id,
            "x": round(float(coords[i, 0]), 4),
            "y": round(float(coords[i, 1]), 4) if n_components >= 2 else 0,
            "content_preview": chunk.content[:80].replace("\n", " "),
            "page_num": chunk.page_num,
            "document_id": chunk.document_id,
            "filename": filename,
            "group_name": group_name,
        })

    return {"points": points, "documents": doc_list}


@router.post("/similarity")
def compute_similarity(
    query: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    text = query.get("query", "").strip()
    if not text:
        return {"results": []}

    embed_service = EmbeddingService.get_instance()
    query_vec = embed_service.encode(text)

    rows = _accessible_chunks(db, current_user)
    results = []
    for chunk, filename, _group_name in rows:
        chunk_vec = np.array(chunk.embedding, dtype=np.float64)
        # cosine similarity between normalized vectors = dot product
        sim = float(np.dot(query_vec, chunk_vec))
        results.append({
            "id": chunk.id,
            "content_preview": chunk.content[:100].replace("\n", " "),
            "content": chunk.content,
            "similarity": round(sim, 4),
            "document_id": chunk.document_id,
            "filename": filename,
            "page_num": chunk.page_num,
        })

    results.sort(key=lambda r: r["similarity"], reverse=True)
    return {"results": results[:20]}
