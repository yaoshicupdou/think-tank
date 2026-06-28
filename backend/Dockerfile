FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 预下载 Embedding 模型到独立目录（避免与代码挂载冲突）
RUN mkdir -p /models && \
    python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-m3', cache_folder='/models')"

# 创建上传目录
RUN mkdir -p /app/uploads

# 代码通过 docker-compose volume 挂载进来，开发时无需 COPY
# 生产构建可取消下面注释
# COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
