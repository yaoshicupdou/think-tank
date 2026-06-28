# Think Tank — AI 知识库系统

基于 RAG（检索增强生成）架构的企业本地知识库。上传文档 → 自动分片向量化 → 自然语言提问，AI 基于文档内容作答。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + Vite 8 + Tailwind CSS 4 |
| 后端 | FastAPI (Python 3.11) |
| 数据库 | PostgreSQL + pgvector（向量存储） |
| LLM | Kimi (Moonshot)，兼容 OpenAI 格式 |
| Embedding | BGE-M3（本地 CPU 推理，1024 维） |
| 部署 | Docker Compose |

---

## 快速开始

### 1. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，必填项：

```ini
LLM_API_KEY=sk-your-moonshot-api-key   # Kimi API 密钥
API_SECRET=your-secret-key-here        # 自定义 API 访问密码
```

其余配置项有默认值，见下方「环境变量」章节。

### 2. 启动服务

```bash
docker compose up -d
```

首次启动会自动拉取镜像、安装依赖、下载 BGE-M3 模型（约 2GB），需要 5-10 分钟。

### 3. 访问

浏览器打开 **http://localhost:8000**，跳转到登录页，使用默认账户：

- 用户名：`admin`
- 密码：`admin`

登录后获得 24 小时有效的 JWT Token，侧边栏显示当前用户名。

---

## 页面路由

| 地址 | 页面 | 说明 |
|---|---|---|
| `/` | 自动跳转 | 未登录重定向到 `/login`，已登录跳转 `/chat` |
| `/login` | 登录页 | 用户名/密码登录 |
| `/chat` | 知识库对话 | 基于已上传文档的 RAG 问答 |
| `/documents` | 文档管理 | 上传、查看、删除文档 |
| `/docs` | Swagger API 文档 | 无需认证 |
| `/health` | 健康检查 | 返回 `{"status":"ok"}` |

---

## API 接口

### 认证

用户体系基于 JWT。除 `/docs`、`/openapi.json`、`/health`、`/api/v1/auth/login` 外，所有 `/api/` 路径需要认证，支持两种方式（优先级从高到低）：

**方式一：JWT Bearer Token（推荐）**

```
Authorization: Bearer <access_token>
```

Token 通过登录接口获取，有效期 24 小时。

**方式二：API Key（兼容旧版）**

```
X-API-Key: <API_SECRET>
```

### 登录

```
POST /api/v1/auth/login
Content-Type: application/json

{ "username": "admin", "password": "admin" }
```

成功返回：

```json
{
  "access_token": "eyJhbG...",
  "token_type": "bearer",
  "username": "admin",
  "is_admin": true
}
```

### 当前用户

```
GET /api/v1/auth/me
Authorization: Bearer <access_token>
```

### 文档管理

#### 上传文档

```
POST /api/v1/documents/upload
Content-Type: multipart/form-data

file: <PDF/TXT/MD/DOCX>
```

支持格式：`.pdf` `.txt` `.md` `.doc` `.docx`

上传后文件进入 `pending` 状态，后台异步解析分片并生成向量索引，完成后变为 `completed`。

#### 文档列表

```
GET /api/v1/documents/
```

返回示例：

```json
[
  {
    "id": 1,
    "filename": "产品手册.pdf",
    "status": "completed",
    "created_at": "2026-06-28T10:30:00"
  }
]
```

状态说明：

| status | 含义 |
|---|---|
| `pending` | 已上传，等待处理 |
| `processing` | 正在解析和向量化 |
| `completed` | 处理完成，可参与问答 |
| `failed` | 处理失败 |

#### 删除文档

```
DELETE /api/v1/documents/{doc_id}
```

删除文档及其所有切片数据，同时删除服务器上的原始文件。

### 对话

#### 流式问答（SSE）

```
POST /api/v1/chat/stream
Content-Type: application/json

{ "query": "产品支持哪些支付方式？" }
```

返回 SSE 事件流：

```
data: {"type":"sources","sources":[{"document_id":1,"filename":"产品手册.pdf","content":"...","similarity":0.87}]}

data: {"choices":[{"delta":{"content":"根据"}}]}

data: {"choices":[{"delta":{"content":"产品手册"}}]}

...

data: [DONE]
```

第一条事件是检索到的参考来源，后续事件是 LLM 流式输出。

### 健康检查

```
GET /health
→ 200 {"status":"ok"}
```

用于 Docker healthcheck 和监控探活。

---

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DATABASE_URL` | `postgresql://ai:aipass@db:5432/thinktank` | PostgreSQL 连接串 |
| `API_SECRET` | `dev-key` | API Key 认证密钥（兼容旧版） |
| `JWT_SECRET` | `thinktank-jwt-secret-...` | JWT 签名密钥，生产环境务必修改 |
| `LLM_API_KEY` | — | **必填**，Kimi/Moonshot API Key |
| `LLM_BASE_URL` | `https://api.moonshot.cn/v1` | LLM API 地址 |
| `LLM_MODEL` | `moonshot-v1-8k` | 模型名称 |
| `EMBEDDING_MODEL_PATH` | `/models` | BGE-M3 模型缓存路径 |
| `CHUNK_SIZE` | `500` | 文本分片大小（字符） |
| `CHUNK_OVERLAP` | `100` | 分片重叠长度 |
| `TOP_K` | `5` | 检索返回数量 |
| `SIMILARITY_THRESHOLD` | `0.7` | 相似度阈值（0-1） |
| `UPLOAD_DIR` | `/app/uploads` | 上传文件存储目录 |

---

## 运维指南

### 常用命令

```bash
# 启动
docker compose up -d

# 查看日志
docker compose logs -f api        # 仅 API 日志
docker compose logs -f --tail=100  # 最近 100 行

# 重启
docker compose restart api

# 停止
docker compose down

# 完全重建（清除数据库数据 + 模型缓存）
docker compose down -v
docker compose up -d --build
```

### 健康监控

```bash
curl http://localhost:8000/health
# 期望: {"status":"ok"}

docker compose ps
# 两个容器均为 Up 状态
```

### 数据备份

```bash
# 备份 PostgreSQL 数据
docker exec thinktank-db pg_dump -U ai thinktank > backup_$(date +%Y%m%d).sql

# 恢复
docker exec -i thinktank-db psql -U ai thinktank < backup_20260628.sql
```

### 上传文件存储

上传的原始文件保存在 `UPLOAD_DIR`（默认容器内 `/app/uploads`）。文件在删除文档时同步删除。如需持久化，在 `docker-compose.yml` 中为 api 服务添加 volume：

```yaml
volumes:
  - ./uploads:/app/uploads
```

### 模型缓存

BGE-M3 模型在 Docker 构建时预下载到 `/models`，通过 `model-cache` volume 持久化。首次构建耗时较长（约 2GB），后续重建会复用缓存。

### 性能参考

- BGE-M3 embedding 在 CPU 上约 **20-50 条/秒**（取决于文本长度）
- 一篇 50 页 PDF 约生成 200 个分片，处理耗时约 **10-30 秒**
- 流式对话首字延迟约 **2-5 秒**（embedding + LLM API 延迟）

### 常见问题

| 问题 | 排查方向 |
|---|---|
| 401 / 403 未授权 | 检查是否已登录，Token 是否过期（重新登录即可） |
| 无法登录 | 默认账户 admin/admin，确认数据库已初始化 |
| 文档一直 pending | 检查 api 容器日志，可能 LLM_API_KEY 未设置导致向量化失败 |
| LLM 返回错误 | 检查 `LLM_API_KEY` 和 `LLM_BASE_URL` 是否正确 |
| 检索无结果 | 调低 `SIMILARITY_THRESHOLD`（如 0.5），或增大 `TOP_K` |
| 端口被占用 | 修改 `docker-compose.yml` 中 ports 映射 |

---

## 开发指南

### 仅开发前端

```bash
cd frontend
npm install
npm run dev          # Vite 热更新，自动代理 /api 到 localhost:8000
```

需确保后端（`docker compose up db api` 或本地 `uvicorn`）已在 8000 端口运行。

### 仅开发后端

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 项目结构

```
think-tank/
├── backend/
│   ├── Dockerfile
│   ├── main.py                  # FastAPI 入口
│   ├── requirements.txt
│   └── app/
│       ├── core/config.py       # 环境变量配置
│       ├── core/exceptions.py   # 全局异常处理
│       ├── db/database.py       # SQLAlchemy 连接
│       ├── models/
│       │   ├── document.py     # Document + Chunk 模型
│       │   └── user.py         # User 模型
│       ├── routers/
│       │   ├── auth.py         # 登录 + JWT
│       │   ├── documents.py    # 文档 CRUD + 上传
│       │   └── chat.py         # SSE 流式对话
│       ├── schemas/document.py  # Pydantic 模型
│       └── services/
│           ├── parser.py        # 文件解析（PDF/TXT/MD/DOCX）
│           ├── chunker.py       # 文本分片
│           ├── embedding.py     # BGE-M3 向量化
│           ├── retriever.py     # 向量检索 + 去重
│           └── llm.py           # LLM 流式调用
├── frontend/
│   ├── vite.config.js           # Tailwind + API 代理
│   └── src/
│       ├── App.jsx              # 布局 + 路由 + 侧边栏
│       ├── api.js               # API 封装 + SSE 流
│       └── pages/
│           ├── Login.jsx        # 登录页
│           ├── Documents.jsx    # 文档管理页
│           └── Chat.jsx         # 对话页
├── docker-compose.yml
└── .env
```
