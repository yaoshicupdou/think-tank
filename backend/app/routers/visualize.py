from collections import Counter
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_
from sklearn.manifold import TSNE
from scipy.cluster.hierarchy import linkage
from scipy.spatial.distance import squareform
import numpy as np
import re

from app.db.database import get_db
from app.models.user import User
from app.models.document import Document, Chunk
from app.routers.auth import get_current_user
from app.services.embedding import EmbeddingService

try:
    import jieba
    _has_jieba = True
except ImportError:
    _has_jieba = False

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

    n_components = min(2, vectors.shape[0] - 1) if vectors.shape[0] > 1 else 0
    if n_components >= 2:
        tsne = TSNE(n_components=2, perplexity=min(30, vectors.shape[0] - 1), random_state=42)
        coords = tsne.fit_transform(vectors)
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


def _tokenize(text: str) -> list[str]:
    if _has_jieba:
        words = jieba.cut(text)
        return [w.strip() for w in words if len(w.strip()) >= 2 and not w.strip().isspace()]
    # Fallback: extract Chinese bigrams
    chinese = re.findall(r'[\u4e00-\u9fff]{2,}', text)
    return chinese


@router.get("/analytics")
def get_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = _accessible_chunks(db, current_user)
    if not rows:
        return {"heatmap": None, "network": None, "dendrogram": None, "wordcloud": []}

    vectors = np.array([r[0].embedding for r in rows], dtype=np.float64)
    n = len(rows)

    # ── 1. Document-level heatmap ──
    doc_names = []
    doc_vecs = []  # centroid per doc
    doc_indices = {}  # filename -> list of chunk indices
    for i, (_, filename, _) in enumerate(rows):
        if filename not in doc_indices:
            doc_indices[filename] = []
            doc_names.append(filename)
        doc_indices[filename].append(i)

    for name in doc_names:
        indices = doc_indices[name]
        doc_vecs.append(vectors[indices].mean(axis=0))
    doc_vecs = np.array(doc_vecs)
    doc_sim = doc_vecs @ doc_vecs.T  # m×m similarity matrix

    heatmap = {
        "documents": doc_names,
        "matrix": [[round(float(doc_sim[i, j]), 4) for j in range(len(doc_names))]
                    for i in range(len(doc_names))],
    }

    # ── 2. Network graph (chunk-level edges) ──
    sim_matrix = vectors @ vectors.T  # n×n
    threshold = 0.88
    edges = []
    for i in range(n):
        for j in range(i + 1, n):
            s = float(sim_matrix[i, j])
            if s >= threshold:
                edges.append({"source": int(rows[i][0].id), "target": int(rows[j][0].id), "value": round(s, 4)})
    # Limit edges to avoid overwhelming the chart
    edges.sort(key=lambda e: e["value"], reverse=True)
    edges = edges[:200]

    # Node positions from t-SNE (reuse or recompute)
    n_comp = min(2, n - 1) if n > 1 else 0
    if n_comp >= 2:
        tsne = TSNE(n_components=2, perplexity=min(30, n - 1), random_state=42)
        coords = tsne.fit_transform(vectors)
    else:
        coords = np.zeros((n, 2))

    nodes = []
    for i, (chunk, filename, group_name) in enumerate(rows):
        nodes.append({
            "id": chunk.id,
            "x": round(float(coords[i, 0]), 4),
            "y": round(float(coords[i, 1]), 4),
            "filename": filename,
            "content_preview": chunk.content[:50].replace("\n", " "),
            "page_num": chunk.page_num,
        })

    network = {"nodes": nodes, "edges": edges}

    # ── 3. Dendrogram (hierarchical clustering on documents) ──
    if len(doc_names) >= 2:
        dist_vec = 1 - doc_sim
        np.fill_diagonal(dist_vec, 0)
        condensed = squareform(dist_vec, checks=False)
        Z = linkage(condensed, method="ward")
        # Convert to list of [child1, child2, distance, count] for each merge
        dendrogram = []
        next_id = len(doc_names)
        id_map = {i: i for i in range(len(doc_names))}
        for row in Z:
            c1, c2, dist, cnt = int(row[0]), int(row[1]), float(row[2]), int(row[3])
            # Build tree: leaf nodes (0..m-1) are documents, internal nodes (m..) are clusters
            dendrogram.append({
                "child1": id_map.get(c1, c1),
                "child2": id_map.get(c2, c2),
                "distance": round(dist, 4),
                "count": cnt,
                "nodeId": next_id,
            })
            id_map[next_id] = next_id
            next_id += 1
    else:
        dendrogram = None

    # ── 4. Word cloud ──
    all_text = " ".join(r[0].content for r in rows)
    words = _tokenize(all_text)
    freq = Counter(words)
    wordcloud = [{"name": w, "value": c} for w, c in freq.most_common(120)
                 if len(w) >= 2 and c >= 2]

    return {
        "heatmap": heatmap,
        "network": network,
        "dendrogram": dendrogram,
        "wordcloud": wordcloud,
    }
