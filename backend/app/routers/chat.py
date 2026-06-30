import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from fastapi.responses import StreamingResponse
from app.db.database import get_db
from app.schemas.document import ChatRequest
from app.services.retriever import Retriever
from app.services.llm import LLMService

import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("chat")

router = APIRouter(prefix="/chat", tags=["chat"])

@router.post("/stream")
async def chat_stream(request: ChatRequest, db: Session = Depends(get_db)):
    retriever = Retriever(db)
    results = retriever.search(request.query, top_k=5)

    # 调试日志
    logger.info(f"查询: {request.query}")
    for i, r in enumerate(results):
        logger.info(f"  chunk[{i}] doc={r['chunk'].document.filename} sim={r['similarity']:.4f} content={r['chunk'].content[:200]}")

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

    system_prompt = (
        "你是一个企业知识库助手，只能基于以下参考资料回答用户问题。"
        "如果资料中没有答案，请明确说明'根据现有资料无法回答'。"
        "\n\n严格规则（必须遵守）："
        "\n1. 禁止使用外部常识或行业惯例进行推断。参考资料未写明的内容，一律视为未知"
        "\n2. 对于日期计算问题，必须同时从资料中找到明确的起止时间和明确的时间跨度，缺一不可"
        "\n3. 例如：只找到'生效日期2025年1月1日'但未找到'保险期间一年'，则不得计算到期日"
        "\n4. 不得使用'通常'、'一般'、'按惯例'等词做推测"
        "\n\n参考资料：\n" + "\n---\n".join(context_chunks)
    )

    llm = LLMService()

    async def generate():
        yield "data: " + json.dumps({"type": "sources", "sources": sources}) + "\n\n"
        async for chunk in llm.chat_stream(system_prompt, request.query):
            yield chunk

    return StreamingResponse(generate(), media_type="text/event-stream")
