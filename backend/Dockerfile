# ===== Stage 1: 构建前端 =====
FROM node:22-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit 2>/dev/null || npm install --no-audit
COPY frontend/ .
RUN npm run build

# ===== Stage 2: 后端 =====
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    openssl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 预下载 Embedding 模型到独立目录（避免与代码挂载冲突）
RUN mkdir -p /models && \
    python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-m3', cache_folder='/models')"

RUN mkdir -p /app/uploads /data

# Entrypoint：首次启动自动生成 JWT_SECRET
COPY backend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 复制前端构建产物
COPY --from=frontend-builder /frontend/dist /frontend/dist

# 复制后端代码
COPY backend/ .

ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
