from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from app.db.database import get_db
from app.models.user import User
from app.routers.auth import require_admin, get_current_user
from app.services.config_service import config_service

router = APIRouter(prefix="/admin", tags=["admin"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Schemas ──────────────────────────────────────────────

class SystemConfigOut(BaseModel):
    token_expire_hours: str
    llm_model: str
    llm_base_url: str
    llm_api_key: str  # 脱敏后的


class SystemConfigIn(BaseModel):
    token_expire_hours: str
    llm_model: str
    llm_base_url: str
    llm_api_key: str = ""  # 留空则不更新


class UserOut(BaseModel):
    id: int
    username: str
    is_admin: bool
    can_upload: bool
    group_name: str | None
    created_at: str | None


class CreateUserRequest(BaseModel):
    username: str
    password: str
    is_admin: bool = False
    can_upload: bool = True
    group_name: str | None = None


class UpdateUserRequest(BaseModel):
    is_admin: bool | None = None
    can_upload: bool | None = None
    group_name: str | None = None
    password: str = ""


# ── Config endpoints ─────────────────────────────────────

@router.get("/config")
def get_config(admin: User = Depends(require_admin)):
    key = config_service.get("llm_api_key", "")
    masked = key[:4] + "****" + key[-4:] if len(key) > 8 else "****"
    return SystemConfigOut(
        token_expire_hours=config_service.get("token_expire_hours", "24"),
        llm_model=config_service.get("llm_model", ""),
        llm_base_url=config_service.get("llm_base_url", ""),
        llm_api_key=masked,
    )


@router.put("/config")
def update_config(req: SystemConfigIn, admin: User = Depends(require_admin)):
    config_service.set("token_expire_hours", req.token_expire_hours)
    config_service.set("llm_model", req.llm_model)
    config_service.set("llm_base_url", req.llm_base_url)
    if req.llm_api_key.strip():
        config_service.set("llm_api_key", req.llm_api_key.strip())
    return {"message": "配置已更新"}


# ── User management endpoints ────────────────────────────

@router.get("/users")
def list_users(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.id).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "is_admin": u.is_admin,
            "can_upload": u.can_upload,
            "group_name": u.group_name,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@router.post("/users")
def create_user(req: CreateUserRequest, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == req.username).first():
        raise HTTPException(status_code=409, detail="用户名已存在")
    if len(req.password) < 3:
        raise HTTPException(status_code=400, detail="密码至少 3 位")

    user = User(
        username=req.username,
        hashed_password=pwd_context.hash(req.password),
        is_admin=req.is_admin,
        can_upload=req.can_upload,
        group_name=req.group_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "username": user.username, "message": "用户创建成功"}


@router.put("/users/{user_id}")
def update_user(user_id: int, req: UpdateUserRequest, request: Request, db: Session = Depends(get_db)):
    current = get_current_user(request, db)
    if not current.is_admin:
        raise HTTPException(status_code=403, detail="需要管理员权限")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    if req.is_admin is not None:
        if user.id == current.id and not req.is_admin:
            raise HTTPException(status_code=400, detail="不能取消自己的管理员权限")
        user.is_admin = req.is_admin
    if req.can_upload is not None:
        user.can_upload = req.can_upload
    if req.group_name is not None:
        user.group_name = req.group_name if req.group_name.strip() else None
    if req.password.strip():
        if len(req.password) < 3:
            raise HTTPException(status_code=400, detail="密码至少 3 位")
        user.hashed_password = pwd_context.hash(req.password)

    db.commit()
    return {"message": "用户信息已更新"}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, request: Request, db: Session = Depends(get_db)):
    current = get_current_user(request, db)
    if not current.is_admin:
        raise HTTPException(status_code=403, detail="需要管理员权限")

    if user_id == current.id:
        raise HTTPException(status_code=400, detail="不能删除自己")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    db.delete(user)
    db.commit()
    return {"message": "用户已删除"}
