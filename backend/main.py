import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.db.database import engine, Base
from app.routers import documents, chat

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Think Tank",
    description="企业本地知识库 RAG 服务",
    version="1.0.0"
)

# CORS 仅在开发时需要（生产由同端口托管，不需要）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def auth_middleware(request, call_next):
    # 静态文件、文档、健康检查不需要认证
    if not request.url.path.startswith("/api/"):
        return await call_next(request)
    api_key = request.headers.get("X-API-Key")
    if api_key != os.getenv("API_SECRET", "default"):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=403, content={"detail": "Invalid API Key"})
    return await call_next(request)

@app.get("/health")
def health_check():
    return {"status": "ok"}

# API 路由必须在 StaticFiles mount 之前注册
app.include_router(documents.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")

# SPA fallback: 前端静态文件（生产模式）
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")
