# CodeTrack 运行命令

本文档整理 CodeTrack 当前项目的常用启动、初始化、测试和构建命令。以下命令默认在项目根目录执行：

```powershell
cd D:\Office_File\other\CodeTrack
```

## 一、本地开发启动

本地开发推荐分两个终端启动：一个跑后端，一个跑前端。

### 1. 后端启动

首次运行先安装 Python 依赖：

```powershell
python -m pip install -r backend\requirements.txt
```

初始化数据库迁移：

```powershell
alembic upgrade head
```

写入 Demo 数据：

```powershell
python scripts\seed_demo.py
```

启动 FastAPI 后端：

```powershell
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

后端地址：

```text
http://127.0.0.1:8000
```

健康检查：

```text
http://127.0.0.1:8000/health
```

说明：

- 不配置 `.env` 时，后端默认使用项目根目录下的 `codetrack_dev.db` SQLite 数据库。
- 本地模式下如果没有配置 `CODETRACK_SANDBOX_SERVICE_URL`，后端会使用本地 sandbox fallback 执行。
- sandbox 测试 C++ 代码时需要本机 `g++` 已加入 `PATH`。

### 2. 前端启动

打开第二个终端：

```powershell
cd D:\Office_File\other\CodeTrack\frontend
npm install
npm run dev
```

前端地址：

```text
http://127.0.0.1:5173
```

说明：

- Vite 开发服务器端口是 `5173`。
- 前端会把 `/api`、`/health`、`/ready` 代理到 `http://127.0.0.1:8000`。
- 所以后端必须先在 `8000` 端口启动。

## 二、Docker Compose 启动

如果想一次性启动 PostgreSQL、Redis、后端、sandbox、前端，可以使用 Docker Compose。

```powershell
docker compose -f deploy\docker-compose.yml up --build
```

服务启动后，在另一个终端初始化数据库：

```powershell
docker compose -f deploy\docker-compose.yml exec backend alembic upgrade head
docker compose -f deploy\docker-compose.yml exec backend python scripts/seed_demo.py
```

访问地址：

```text
前端：http://127.0.0.1:5173
后端：http://127.0.0.1:8000
```

停止服务：

```powershell
docker compose -f deploy\docker-compose.yml down
```

如果需要连同 PostgreSQL 数据卷一起清理：

```powershell
docker compose -f deploy\docker-compose.yml down -v
```

注意：

- Docker Compose 模式下 backend 会连接 compose 内的 PostgreSQL。
- sandbox 服务需要挂载 Docker socket：`/var/run/docker.sock`。
- Windows 环境运行该 compose 文件时，需要确保 Docker Desktop 正常启动，并支持 Linux 容器。

## 三、常用测试命令

运行全部后端测试：

```powershell
python -m pytest
```

运行单个测试文件：

```powershell
python -m pytest tests\test_demo_flow.py
```

运行发布验证脚本：

```powershell
python scripts\verify_demo_release.py
```

## 四、前端构建命令

进入前端目录：

```powershell
cd D:\Office_File\other\CodeTrack\frontend
```

安装依赖：

```powershell
npm install
```

构建生产包：

```powershell
npm run build
```

预览生产包：

```powershell
npm run preview
```

## 五、可选环境变量

项目根目录有 `.env.example`，可以复制为 `.env` 后按需修改：

```powershell
Copy-Item .env.example .env
```

常用变量：

```text
CODETRACK_DATABASE_URL=postgresql+psycopg2://codetrack:codetrack@localhost:5432/codetrack
CODETRACK_DEMO_USER_ID=user_student_001
CODETRACK_SANDBOX_TIMEOUT_SECONDS=3
CODETRACK_SANDBOX_SERVICE_URL=http://sandbox:8011
CODETRACK_MODEL_GATEWAY_URL=
CODETRACK_MODEL_API_KEY=
CODETRACK_MODEL_API_BASE_URL=https://api.openai.com/v1
CODETRACK_MODEL_NAME=
```

本地 SQLite 开发时可以不创建 `.env`。

## 六、推荐日常开发顺序

```powershell
cd D:\Office_File\other\CodeTrack
python -m pip install -r backend\requirements.txt
alembic upgrade head
python scripts\seed_demo.py
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

然后打开第二个终端：

```powershell
cd D:\Office_File\other\CodeTrack\frontend
npm install
npm run dev
```

最后访问：

```text
http://127.0.0.1:5173
```
