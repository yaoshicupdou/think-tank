import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.db.database import engine, Base, SessionLocal
from app.routers import documents, chat, auth, visualize
from app.models.user import User
from app.models.document import Document
from app.models.system_config import SystemConfig
from app.core.config import settings
from app.services.config_service import config_service
from passlib.context import CryptContext


def seed_admin():
    """启动时确保默认管理员 admin/admin 存在。"""
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
            admin = User(
                username="admin",
                hashed_password=pwd_context.hash("admin"),
                is_admin=True,
            )
            db.add(admin)
            db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    seed_admin()
    config_service.init_defaults()
    yield


app = FastAPI(
    title="Think Tank",
    description="企业本地知识库 RAG 服务",
    version="1.0.0",
    lifespan=lifespan,
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
    # 静态文件、文档、健康检查、登录接口不需要认证
    public_paths = {"/docs", "/openapi.json", "/health"}
    if request.url.path in public_paths or request.url.path.startswith("/api/v1/auth/"):
        return await call_next(request)

    if not request.url.path.startswith("/api/"):
        return await call_next(request)

    # 验证 JWT Bearer token
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        from jose import jwt as jose_jwt
        try:
            token = auth_header.removeprefix("Bearer ")
            jose_jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
            return await call_next(request)
        except Exception:
            pass

    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=403, content={"detail": "未授权访问"})


@app.get("/health")
def health_check():
    return {"status": "ok"}


# API 路由必须在 StaticFiles mount 之前注册
app.include_router(auth.router, prefix="/api/v1")
app.include_router(documents.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
from app.routers import admin
app.include_router(admin.router, prefix="/api/v1")
app.include_router(visualize.router, prefix="/api/v1")

# SPA fallback: 前端静态文件（生产模式）
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist), name="static")

    from starlette.exceptions import HTTPException as StarletteHTTPException
    from fastapi.responses import FileResponse, JSONResponse

    @app.exception_handler(StarletteHTTPException)
    async def spa_handler(request, exc):
        if exc.status_code == 404 and not request.url.path.startswith("/api/"):
            return FileResponse(os.path.join(frontend_dist, "index.html"))
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
