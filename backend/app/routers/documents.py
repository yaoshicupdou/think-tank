import os
import uuid
import shutil
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, BackgroundTasks, HTTPException, Form
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.core.config import settings
from app.models.document import Document
from app.models.user import User
from app.schemas.document import DocumentResponse
from app.routers.auth import get_current_user
from app.services.parser import Parser
from app.services.chunker import Chunker
from app.services.embedding import EmbeddingService

router = APIRouter(prefix="/documents", tags=["documents"])

@router.post("/upload", response_model=DocumentResponse)
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    group_name: str = Form(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.can_upload:
        raise HTTPException(status_code=403, detail="无上传权限")

    ext = os.path.splitext(file.filename)[1]
    save_name = f"{uuid.uuid4().hex}{ext}"
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(settings.UPLOAD_DIR, save_name)

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    gn = group_name.strip() if group_name.strip() else None
    doc = Document(
        filename=file.filename,
        file_path=file_path,
        status="pending",
        owner_id=current_user.id,
        group_name=gn,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    background_tasks.add_task(process_document_task, file_path, doc.id)

    return doc


def process_document_task(file_path: str, doc_id: int):
    from app.db.database import SessionLocal
    from app.models.document import Chunk

    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            return

        doc.status = "processing"
        db.commit()

        parser = Parser()
        paragraphs = parser.parse(file_path)

        chunker = Chunker(
            chunk_size=settings.CHUNK_SIZE,
            overlap=settings.CHUNK_OVERLAP
        )
        chunks_data = chunker.chunk(paragraphs)

        embed_service = EmbeddingService.get_instance()

        # 批量向量化：先收集所有文本，一次 batch encode
        contents = [c["content"] for c in chunks_data]
        batch_size = 32
        all_embeddings = []

        for i in range(0, len(contents), batch_size):
            batch = contents[i:i + batch_size]
            embs = embed_service.encode_batch(batch)
            all_embeddings.extend(embs)

        # 写入数据库
        for idx, chunk_data in enumerate(chunks_data):
            chunk = Chunk(
                document_id=doc_id,
                content=chunk_data["content"],
                page_num=chunk_data.get("page_num"),
                meta_info=str(chunk_data.get("meta")),
                embedding=all_embeddings[idx].tolist()
            )
            db.add(chunk)
            # 每 500 条提交一次，避免 session 膨胀
            if (idx + 1) % 500 == 0:
                db.commit()

        doc.status = "completed"
        db.commit()
    except Exception:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if doc:
            doc.status = "failed"
            db.commit()
        raise
    finally:
        db.close()


def _accessible_docs(db: Session, user: User):
    q = db.query(Document)
    if not user.is_admin:
        if user.group_name:
            from sqlalchemy import or_
            q = q.filter(or_(Document.group_name == user.group_name, Document.group_name == None))
        else:
            q = q.filter(Document.group_name == None)
    return q


@router.get("/", response_model=List[DocumentResponse])
def list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _accessible_docs(db, current_user).order_by(Document.created_at.desc()).all()


@router.post("/{doc_id}/reprocess")
def reprocess_document(
    doc_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = _accessible_docs(db, current_user).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=400, detail="File not found on disk")
    from app.models.document import Chunk
    db.query(Chunk).filter(Chunk.document_id == doc_id).delete()
    doc.status = "pending"
    db.commit()
    background_tasks.add_task(process_document_task, doc.file_path, doc.id)
    return {"message": "Reprocessing started"}


@router.delete("/{doc_id}")
def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = _accessible_docs(db, current_user).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if os.path.exists(doc.file_path):
        os.remove(doc.file_path)
    db.delete(doc)
    db.commit()
    return {"message": "Deleted"}
