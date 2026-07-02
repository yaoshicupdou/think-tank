import time
from jose import jwt
from app.core.config import settings

ALGORITHM = "HS256"


def extract_token_from_request(request) -> str | None:
    """从 httpOnly cookie 或 Authorization header 提取 JWT（cookie 优先）。"""
    token = request.cookies.get("token")
    if token:
        return token
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header.removeprefix("Bearer ")
    return None


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
    except Exception:
        return None


def set_token_cookies(response, token: str, *, secure: bool = False):
    payload = decode_token(token)
    max_age = 86400
    exp = 0
    if payload:
        exp = payload.get("exp", 0)
        now = int(time.time())
        max_age = max(1, exp - now) if exp > now else 1

    response.set_cookie(
        key="token",
        value=token,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
        max_age=max_age,
    )
    response.set_cookie(
        key="token_exp",
        value=str(exp),
        httponly=False,
        secure=secure,
        samesite="lax",
        path="/",
        max_age=max_age,
    )


def clear_token_cookies(response):
    response.delete_cookie(key="token", path="/", samesite="lax")
    response.delete_cookie(key="token_exp", path="/", samesite="lax")
