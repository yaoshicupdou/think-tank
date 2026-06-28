import os
import uuid
import shutil
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.core.config import settings
from app.models.document import Document
from app.schemas.document import DocumentResponse
from app.services.parser import Parser
from app.services.chunker import Chunker
from app.services.embedding import EmbeddingService

router = APIRouter(prefix="/documents", tags=["documents"])

@router.post("/upload", response_model=DocumentResponse)
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    ext = os.path.splitext(file.filename)[1]
    save_name = f"{uuid.uuid4().hex}{ext}"
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(settings.UPLOAD_DIR, save_name)

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    doc = Document(filename=file.filename, file_path=file_path, status="pending")
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

        for chunk_data in chunks_data:
            emb = embed_service.encode(chunk_data["content"])
            chunk = Chunk(
                document_id=doc_id,
                content=chunk_data["content"],
                page_num=chunk_data.get("page_num"),
                meta_info=str(chunk_data.get("meta")),
                embedding=emb.tolist()
            )
            db.add(chunk)

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


@router.get("/", response_model=List[DocumentResponse])
def list_documents(db: Session = Depends(get_db)):
    return db.query(Document).order_by(Document.created_at.desc()).all()


@router.delete("/{doc_id}")
def delete_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if os.path.exists(doc.file_path):
        os.remove(doc.file_path)
    db.delete(doc)
    db.commit()
    return {"message": "Deleted"}
