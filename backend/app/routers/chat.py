import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from fastapi.responses import StreamingResponse
from app.db.database import get_db
from app.schemas.document import ChatRequest
from app.services.retriever import Retriever
from app.services.llm import LLMService

router = APIRouter(prefix="/chat", tags=["chat"])

@router.post("/stream")
async def chat_stream(request: ChatRequest, db: Session = Depends(get_db)):
    retriever = Retriever(db)
    results = retriever.search(request.query, top_k=5)

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
        "\n\n重要推理规则："
        "\n- 参考资料由多个片段组成，请注意综合分析所有片段的信息"
        "\n- 对于涉及日期计算的问题（如到期日、有效期），需要同时找到起止条件和时间跨度才能回答"
        "\n- 不要将片段中的单一日期当作最终答案，除非该片段明确说明了该问题的完整答案"
        "\n\n参考资料：\n" + "\n---\n".join(context_chunks)
    )

    llm = LLMService()

    async def generate():
        yield "data: " + json.dumps({"type": "sources", "sources": sources}) + "\n\n"
        async for chunk in llm.chat_stream(system_prompt, request.query):
            yield chunk

    return StreamingResponse(generate(), media_type="text/event-stream")
