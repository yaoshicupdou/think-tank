import json
import re
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from fastapi.responses import StreamingResponse
from app.db.database import get_db
from app.schemas.document import ChatRequest
from app.services.retriever import Retriever
from app.services.llm import LLMService
from app.models.document import Chunk
from app.models.user import User
from app.routers.auth import get_current_user

import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("chat")

router = APIRouter(prefix="/chat", tags=["chat"])

DATE_QUERY_KEYWORDS = ["到期", "时间", "日期", "期间", "什么时候", "何时", "起止", "失效", "有效"]

def _extract_date_chunks(db: Session, doc_ids: set, exclude_ids: set, limit: int = 5) -> list:
    """从指定文档中提取包含日期模式的 chunk，作为嵌入检索的补充"""
    date_pattern = re.compile(
        r'\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?(?:\s*\d{1,2}[：:]\d{1,2}(?:[：:]\d{1,2})?)?'
    )
    extra = []
    q = db.query(Chunk).filter(Chunk.document_id.in_(doc_ids))
    if exclude_ids:
        q = q.filter(~Chunk.id.in_(exclude_ids))
    chunks = q.all()
    for c in chunks:
        matches = date_pattern.findall(c.content)
        if matches:
            extra.append({"chunk": c, "dates": matches})
            if len(extra) >= limit:
                break
    return extra

@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    retriever = Retriever(db, user=current_user)
    results = retriever.search(request.query)

    # 调试日志
    logger.info(f"查询: {request.query}")
    for i, r in enumerate(results):
        logger.info(f"  chunk[{i}] doc={r['chunk'].document.filename} sim={r['similarity']:.4f} content={r['chunk'].content[:200]}")

    # 混合检索：如果查询涉及日期，从已命中文档中补充日期 chunk
    is_date_query = any(kw in request.query for kw in DATE_QUERY_KEYWORDS)
    extra_chunks = []
    if is_date_query:
        doc_ids = {r["chunk"].document_id for r in results}
        existing_ids = {r["chunk"].id for r in results}
        extra_chunks = _extract_date_chunks(db, doc_ids, existing_ids)
        logger.info(f"  混合检索: 补充 {len(extra_chunks)} 个日期 chunk")

    # 在生成器外查完结果，关闭 db 会话后不再访问数据库
    sources = []
    context_chunks = []
    for r in results:
        sources.append({
            "document_id": r["chunk"].document_id,
            "filename": r["chunk"].document.filename,
            "content": r["chunk"].content,
            "similarity": r["similarity"]
        })
        context_chunks.append(f"[{r['chunk'].document.filename}]\n{r['chunk'].content}")

    for ec in extra_chunks:
        sources.append({
            "document_id": ec["chunk"].document_id,
            "filename": ec["chunk"].document.filename,
            "content": ec["chunk"].content,
            "similarity": 0,
            "extra": True
        })
        context_chunks.append(f"[{ec['chunk'].document.filename} 补充日期片段]\n{ec['chunk'].content}")

    system_prompt = (
        "你是一个企业知识库助手，只能基于以下参考资料回答用户问题。"
        "如果资料中没有答案，请明确说明'根据现有资料无法回答'。"
        "\n\n严格规则（必须遵守）："
        "\n1. 禁止使用外部常识或行业惯例进行推断"
        "\n2. 保险单据中日期常以无标签格式散落在各片段，请仔细扫描所有片段中的日期信息"
        "\n3. 保险期间的起止日期往往成对出现（如'自...起至...止'），或表现为两个相距约一年的日期"
        "\n4. 常见模式：片段中出现两个精确到时分秒的日期，分别对应起保时间和到期时间"
        "\n5. 不得使用'通常'、'一般'、'按惯例'等词做推测"
        "\n\n参考资料：\n" + "\n---\n".join(context_chunks)
    )

    llm = LLMService()

    async def generate():
        yield "data: " + json.dumps({"type": "sources", "sources": sources}) + "\n\n"
        async for chunk in llm.chat_stream(system_prompt, request.query):
            yield chunk

    return StreamingResponse(generate(), media_type="text/event-stream")
