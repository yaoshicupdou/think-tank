import os
from functools import lru_cache

class Settings:
    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://ai:aipass@db:5432/thinktank")
    API_SECRET = os.getenv("API_SECRET", "default")
    UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/app/uploads")
    LLM_API_KEY = os.getenv("LLM_API_KEY", "")
    LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.moonshot.cn/v1")
    LLM_MODEL = os.getenv("LLM_MODEL", "moonshot-v1-8k")
    EMBEDDING_MODEL_PATH = os.getenv("EMBEDDING_MODEL_PATH", "/models")
    CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "500"))
    CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "100"))
    TOP_K = int(os.getenv("TOP_K", "5"))
    SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.7"))
    JWT_SECRET = os.getenv("JWT_SECRET", "thinktank-jwt-secret-change-in-production")

@lru_cache()
def get_settings():
    return Settings()

settings = get_settings()
