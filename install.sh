#!/bin/bash
set -e

# ============================================================
# Think Tank 生产部署脚本
# 支持: Ubuntu 20.04+ / Debian 11+
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ---------- 检查 root ----------
if [ "$(id -u)" != "0" ]; then
    err "请用 root 运行: sudo bash install.sh"
fi

PROJECT_DIR="/opt/think-tank"
SERVICE_USER="${SUDO_USER:-root}"

echo "============================================"
echo "  Think Tank 安装脚本"
echo "============================================"
echo ""

# ---------- 配置 ----------
read -p "LLM API Key (Kimi Moonshot): " LLM_API_KEY
if [ -z "$LLM_API_KEY" ]; then
    err "API Key 不能为空"
fi

read -p "数据库密码 (默认 aipass): " DB_PASSWORD
DB_PASSWORD="${DB_PASSWORD:-aipass}"

JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")
log "已生成随机 JWT_SECRET"

# ---------- 系统依赖 ----------
log "更新软件源..."
apt-get update -qq

log "安装系统依赖..."
apt-get install -y -qq \
    postgresql postgresql-contrib postgresql-server-dev-14 \
    python3 python3-pip python3-venv \
    nodejs npm \
    curl git nginx certbot python3-certbot-nginx \
    build-essential

# 检查 Node.js 版本
NODE_VERSION=$(node --version 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ] 2>/dev/null; then
    warn "Node.js 版本过低 (${NODE_VERSION:-未安装})，安装 22.x..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y -qq nodejs
fi

# ---------- PostgreSQL ----------
log "配置 PostgreSQL..."
systemctl start postgresql
systemctl enable postgresql

# 创建用户和数据库（幂等）
su - postgres -c "psql -c \"CREATE USER ai WITH PASSWORD '${DB_PASSWORD}';\"" 2>/dev/null || log "数据库用户已存在"
su - postgres -c "psql -c \"CREATE DATABASE thinktank OWNER ai;\"" 2>/dev/null || log "数据库已存在"

# ---------- pgvector ----------
if ! su - postgres -c "psql -d thinktank -c 'SELECT 1 FROM pg_extension WHERE extname=\"vector\"'" 2>/dev/null | grep -q 1; then
    log "安装 pgvector..."
    cd /tmp
    rm -rf pgvector
    git clone --branch v0.7.0 --depth 1 https://github.com/pgvector/pgvector.git
    cd pgvector && make -j$(nproc) && make install
    su - postgres -c "psql -d thinktank -c 'CREATE EXTENSION vector;'"
    log "pgvector 安装完成"
else
    log "pgvector 已安装"
fi

# ---------- 部署项目 ----------
log "部署项目文件..."
if [ -d "$PROJECT_DIR" ]; then
    warn "项目目录已存在，只更新代码"
    cd "$PROJECT_DIR"
    git pull origin master 2>/dev/null || log "git pull 失败，保留现有文件"
else
    git clone https://gitee.com/yaoshicupdou/think-tank.git "$PROJECT_DIR"
    cd "$PROJECT_DIR"
fi

# ---------- 环境变量 ----------
log "写入 .env 配置..."
cat > "$PROJECT_DIR/.env" << EOF
DATABASE_URL=postgresql://ai:${DB_PASSWORD}@localhost:5432/thinktank
JWT_SECRET=${JWT_SECRET}
LLM_API_KEY=${LLM_API_KEY}
LLM_BASE_URL=https://api.moonshot.cn/v1
LLM_MODEL=moonshot-v1-8k
EMBEDDING_MODEL_PATH=${PROJECT_DIR}/models
UPLOAD_DIR=${PROJECT_DIR}/uploads
CHUNK_SIZE=500
CHUNK_OVERLAP=100
TOP_K=5
SIMILARITY_THRESHOLD=0.7
EOF

mkdir -p "$PROJECT_DIR/models" "$PROJECT_DIR/uploads"
chown -R "$SERVICE_USER":"$SERVICE_USER" "$PROJECT_DIR"

# ---------- Python 依赖 ----------
log "安装 Python 依赖（CPU 版 PyTorch）..."
pip3 install torch --index-url https://download.pytorch.org/whl/cpu --break-system-packages
pip3 install -r "$PROJECT_DIR/backend/requirements.txt" --break-system-packages

# ---------- 预下载 Embedding 模型 ----------
log "预下载 BGE-M3 模型（首次需下载约 2GB）..."
python3 -c "
from sentence_transformers import SentenceTransformer
SentenceTransformer('BAAI/bge-m3', cache_folder='${PROJECT_DIR}/models')
print('模型下载完成')
"

# ---------- 前端构建 ----------
log "构建前端..."
cd "$PROJECT_DIR/frontend"
npm install --no-audit --no-fund
npm run build

# ---------- systemd 服务 ----------
log "注册 systemd 服务..."
cat > /etc/systemd/system/thinktank.service << EOF
[Unit]
Description=Think Tank API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${PROJECT_DIR}/backend
Environment="DATABASE_URL=postgresql://ai:${DB_PASSWORD}@localhost:5432/thinktank"
Environment="JWT_SECRET=${JWT_SECRET}"
Environment="LLM_API_KEY=${LLM_API_KEY}"
Environment="LLM_BASE_URL=https://api.moonshot.cn/v1"
Environment="LLM_MODEL=moonshot-v1-8k"
Environment="EMBEDDING_MODEL_PATH=${PROJECT_DIR}/models"
Environment="UPLOAD_DIR=${PROJECT_DIR}/uploads"
ExecStart=/usr/bin/python3 -m uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable thinktank
systemctl restart thinktank

# ---------- Nginx ----------
log "配置 Nginx 反向代理..."
cat > /etc/nginx/sites-available/thinktank << 'NGINX'
server {
    listen 80;
    server_name _;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE 支持
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/thinktank /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ---------- 完成 ----------
sleep 3
echo ""
echo "============================================"
echo -e "  ${GREEN}Think Tank 部署完成！${NC}"
echo "============================================"
echo ""
echo "  地址:     http://$(hostname -I | awk '{print $1}')"
echo "  管理员:   admin / admin"
echo "  API 文档: http://$(hostname -I | awk '{print $1}')/docs"
echo ""
echo "  常用命令:"
echo "    sudo systemctl status thinktank"
echo "    sudo systemctl restart thinktank"
echo "    sudo journalctl -u thinktank -f"
echo ""
echo "  配置 HTTPS:"
echo "    sudo certbot --nginx"
echo ""
echo "  JWT Secret 已保存到: ${PROJECT_DIR}/.env"
echo "============================================"
