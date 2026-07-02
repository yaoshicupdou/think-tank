from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from jose import jwt
from passlib.context import CryptContext

from app.db.database import get_db
from app.models.user import User
from app.core.config import settings
from app.core.rate_limiter import login_rate_limiter
from app.core.security import extract_token_from_request, decode_token, set_token_cookies, clear_token_cookies, ALGORITHM
from app.services.config_service import config_service

router = APIRouter(prefix="/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    is_admin: bool


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


def create_access_token(user_id: int, username: str) -> str:
    hours = int(config_service.get("token_expire_hours", "24"))
    expire = datetime.now(timezone.utc) + timedelta(hours=hours)
    to_encode = {"sub": str(user_id), "username": username, "exp": expire}
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=ALGORITHM)


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """从 cookie 或 Authorization header 提取 JWT，返回当前用户。"""
    token = extract_token_from_request(request)
    if not token:
        raise HTTPException(status_code=401, detail="未登录")

    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="无效的认证令牌")

    user_id = int(payload.get("sub"))
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    return user


def require_admin(request: Request, db: Session = Depends(get_db)) -> User:
    user = get_current_user(request, db)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user


@router.post("/login", response_model=LoginResponse)
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    # 登录频率限制
    ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or request.client.host
    rate_key = f"{ip}:{req.username}"
    if login_rate_limiter.is_blocked(rate_key):
        remaining = login_rate_limiter.remaining_block_seconds(rate_key)
        raise HTTPException(status_code=429, detail=f"登录尝试过于频繁，请在 {remaining} 秒后重试")

    user = db.query(User).filter(User.username == req.username).first()
    if not user or not pwd_context.verify(req.password, user.hashed_password):
        login_rate_limiter.record_failure(rate_key)
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    login_rate_limiter.reset(rate_key)

    token = create_access_token(user.id, user.username)
    content = LoginResponse(
        access_token=token,
        username=user.username,
        is_admin=user.is_admin,
    )
    response = JSONResponse(content=content.model_dump())
    set_token_cookies(response, token, secure=settings.COOKIE_SECURE)
    return response


@router.post("/refresh")
def refresh_token(request: Request, db: Session = Depends(get_db)):
    """使用当前 token 换取新 token，自动续期。"""
    token = extract_token_from_request(request)
    if not token:
        raise HTTPException(status_code=401, detail="未登录")

    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="令牌无效或已过期")

    user_id = int(payload.get("sub"))
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")

    new_token = create_access_token(user.id, user.username)
    content = LoginResponse(
        access_token=new_token,
        username=user.username,
        is_admin=user.is_admin,
    )
    response = JSONResponse(content=content.model_dump())
    set_token_cookies(response, new_token, secure=settings.COOKIE_SECURE)
    return response


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "is_admin": current_user.is_admin,
        "can_upload": current_user.can_upload,
        "group_name": current_user.group_name,
    }


@router.post("/logout")
def logout():
    response = JSONResponse(content={"message": "已退出登录"})
    clear_token_cookies(response)
    return response


@router.put("/password")
def change_password(
    req: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not pwd_context.verify(req.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="旧密码不正确")

    current_user.hashed_password = pwd_context.hash(req.new_password)
    db.commit()

    return {"message": "密码修改成功，请使用新密码重新登录"}
