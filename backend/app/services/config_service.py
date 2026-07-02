from app.db.database import SessionLocal
from app.models.system_config import SystemConfig
from app.core.config import settings


class ConfigService:
    """系统配置单例，内存缓存 + DB 持久化。"""
    _instance = None

    def __init__(self):
        self._cache = {}
        self._loaded = False

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _ensure_loaded(self):
        if self._loaded:
            return
        db = SessionLocal()
        try:
            rows = db.query(SystemConfig).all()
            self._cache = {r.key: r.value for r in rows}
        finally:
            db.close()
        self._loaded = True

    def get(self, key: str, default: str = "") -> str:
        self._ensure_loaded()
        return self._cache.get(key, default)

    def set(self, key: str, value: str):
        db = SessionLocal()
        try:
            cfg = db.query(SystemConfig).filter(SystemConfig.key == key).first()
            if cfg:
                cfg.value = value
            else:
                cfg = SystemConfig(key=key, value=value)
                db.add(cfg)
            db.commit()
            self._cache[key] = value
        finally:
            db.close()

    def reload(self):
        self._loaded = False
        self._ensure_loaded()

    def init_defaults(self):
        """启动时确保关键配置项存在（从 .env 读取初始值）。"""
        defaults = {
            "token_expire_hours": "24",
            "llm_model": settings.LLM_MODEL,
            "llm_base_url": settings.LLM_BASE_URL,
            "llm_api_key": settings.LLM_API_KEY,
        }
        db = SessionLocal()
        try:
            for key, value in defaults.items():
                if not db.query(SystemConfig).filter(SystemConfig.key == key).first():
                    db.add(SystemConfig(key=key, value=value))
            db.commit()
        finally:
            db.close()
        self.reload()


config_service = ConfigService.get_instance()
