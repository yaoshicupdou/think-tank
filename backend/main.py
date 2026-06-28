import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db.database import engine, Base
from app.routers import documents, chat

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Think Tank",
    description="企业本地知识库 RAG 服务",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def auth_middleware(request, call_next):
    if request.url.path in ["/docs", "/openapi.json", "/health"]:
        return await call_next(request)
    api_key = request.headers.get("X-API-Key")
    if api_key != os.getenv("API_SECRET", "default"):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=403, content={"detail": "Invalid API Key"})
    return await call_next(request)

@app.get("/health")
def health_check():
    return {"status": "ok"}

app.include_router(documents.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
