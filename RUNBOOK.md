# CodeTrack 前后端运行与运维手册

本文面向拿到 CodeTrack 源码后需要安装、启动、测试、部署或维护项目的开发人员。所有命令默认在项目根目录执行。

## 1. 项目概览

CodeTrack 是一个前后端一体的教学管理系统：

- 前端：React 19、TypeScript、Vite、Ant Design。
- 后端：FastAPI、SQLAlchemy、Pydantic。
- 数据库：SQLite，默认文件为根目录 `codetrack.db`。
- 数据库迁移：Alembic。
- 文件存储：本地目录 `backend/uploads/`。
- 前端开发端口：`5173`。
- 后端开发端口：`8001`。
- API 前缀：`/api/v1`。

开发模式下，浏览器访问 Vite；Vite 将 `/api` 请求代理到 FastAPI：

```text
浏览器 http://127.0.0.1:5173
        |
        +-- 前端页面 -> Vite 5173
        +-- /api/*  -> FastAPI 8001 -> SQLite + backend/uploads
```

## 2. 必需环境

推荐使用以下版本：

| 软件 | 推荐版本 | 说明 |
| --- | --- | --- |
| Node.js | 20.19+、22.12+ 或 24 | 当前项目已在 Node 24 验证 |
| pnpm | 11.x | 当前锁文件已在 pnpm 11.5 验证 |
| Python | 3.11-3.13 | 当前项目已在 Python 3.13 验证 |
| Git | 当前稳定版 | 用于获取和更新源码 |

检查环境：

```powershell
node --version
pnpm --version
python --version
```

如果没有 pnpm：

```powershell
npm install --global pnpm@11
```

不要把其他电脑生成的 `node_modules/` 一起交付。不同 Node 或 pnpm 版本之间复用依赖目录，可能触发 pnpm 删除并重装依赖的提示。

## 3. 首次安装

### 3.1 Windows PowerShell

```powershell
git clone <仓库地址> teacher
Set-Location teacher

py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt

pnpm install
```

如果 PowerShell 禁止激活虚拟环境，可仅对当前窗口放开：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\.venv\Scripts\Activate.ps1
```

### 3.2 macOS / Linux

```bash
git clone <仓库地址> teacher
cd teacher

python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt

pnpm install
```

## 4. 一键开发启动

### 4.1 指定 Python 解释器

项目的一键脚本读取 `CODETRACK_PYTHON`。建议显式指向项目虚拟环境，避免误用系统 Python。

Windows PowerShell：

```powershell
$env:CODETRACK_PYTHON = (Resolve-Path .\.venv\Scripts\python.exe).Path
pnpm run dev
```

macOS / Linux：

```bash
export CODETRACK_PYTHON="$PWD/.venv/bin/python"
pnpm run dev
```

启动成功后终端应显示：

```text
CodeTrack API: http://127.0.0.1:8001/api/v1/health
CodeTrack UI:  http://127.0.0.1:5173/
```

访问地址：

- 教师端：<http://127.0.0.1:5173/>
- API 健康检查：<http://127.0.0.1:8001/api/v1/health>
- OpenAPI 文档：<http://127.0.0.1:8001/docs>
- ReDoc：<http://127.0.0.1:8001/redoc>

在运行终端按 `Ctrl+C` 可同时停止前后端。

注意：`pnpm run dev` 启动的后端没有自动重载。需要频繁修改后端代码时，使用下一节的分离启动方式。

## 5. 前后端分离启动

打开两个终端，并在两个终端中进入项目根目录、激活 Python 虚拟环境。

终端一，启动后端并启用热重载：

```powershell
python -m uvicorn teacher_backend.app.main:app --host 127.0.0.1 --port 8001 --reload
```

也可以使用：

```powershell
pnpm run dev:backend
```

终端二，启动前端：

```powershell
pnpm run dev:frontend
```

前端必须使用 `5173`，后端默认使用 `8001`，因为 `vite.config.ts` 中的开发代理按这两个端口配置。

## 6. 首次启动与数据库初始化

默认数据库位置：

```text
<项目根目录>/codetrack.db
```

FastAPI 启动时会执行以下操作：

1. 创建缺失的数据表。
2. 补齐旧数据库中的必要字段。
3. 如果数据库中没有用户，写入演示教师、学生、课程、班级、任务和提交数据。
4. 初始化课程材料目录等原型数据。

已有数据库不会在普通启动时被清空。种子逻辑检测到已有用户后会保留现有业务数据。

### 6.1 使用 Alembic

新环境建议在第一次启动前执行：

```powershell
python -m alembic -c backend\alembic.ini upgrade head
```

macOS / Linux：

```bash
python -m alembic -c backend/alembic.ini upgrade head
```

查看迁移状态和历史：

```powershell
python -m alembic -c backend\alembic.ini current
python -m alembic -c backend\alembic.ini history
```

迁移命令必须从项目根目录运行。当前 `backend/alembic.ini` 固定指向根目录 `codetrack.db`；如果使用自定义数据库地址，需要同步调整 Alembic 的 `sqlalchemy.url`。

### 6.2 自定义 SQLite 数据库

运行时可设置 `CODETRACK_DATABASE_URL`：

```powershell
$env:CODETRACK_DATABASE_URL = "sqlite:///D:/codetrack-data/codetrack.db"
python -m uvicorn teacher_backend.app.main:app --host 127.0.0.1 --port 8001
```

macOS / Linux：

```bash
export CODETRACK_DATABASE_URL="sqlite:////var/lib/codetrack/codetrack.db"
python -m uvicorn teacher_backend.app.main:app --host 127.0.0.1 --port 8001
```

当前数据库连接和迁移脚本按 SQLite 设计。切换 PostgreSQL 或 MySQL 前，需要修改连接参数、迁移配置并重新验证测试，不能只替换 URL。

## 7. 默认账号与认证方式

教师端演示登录：

| 姓名 | 后端用户 ID | 教师编号 | 前端演示密码 |
| --- | --- | --- | --- |
| 王老师 | `teacher-01` | `T2024001` | `123456` |
| 林老师 | `teacher-02` | `T2024002` | `123456` |

学生种子账号包括 `student-01` 至 `student-06`，课堂讨论演示默认使用 `student-03`。

当前项目通过请求头 `X-User-Id` 模拟统一身份认证。例如：

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:8001/api/v1/teacher/courses" `
  -Headers @{ "X-User-Id" = "teacher-01" }
```

前端的 `123456` 仅是演示登录逻辑，不是生产级密码认证。项目接入公网或真实学校数据前，必须替换为 SSO、JWT 或其他正式身份系统。

## 8. 健康检查与启动验收

后端检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8001/api/v1/health
```

预期包含：

```json
{
  "status": "ok",
  "service": "codetrack-api"
}
```

前端检查：

```powershell
(Invoke-WebRequest http://127.0.0.1:5173/ -UseBasicParsing).StatusCode
```

预期结果为 `200`。

完整人工验收建议：

1. 使用王老师登录教师端。
2. 打开工作台首页和我的课程。
3. 进入一门课程，检查班级、任务、资料和学情页面。
4. 在任务管理中进入学生成绩和任务监控。
5. 打开 API 文档，确认 `/api/v1/health` 可调用。

## 9. 自动化测试

运行后端测试：

```powershell
python -m pytest backend\tests -q -p no:cacheprovider
```

或：

```powershell
pnpm run test:backend
```

运行前端类型检查与生产构建：

```powershell
pnpm run build
```

当前基线验收结果：

- 后端：`11 passed`。
- 前端：TypeScript 和 Vite 生产构建通过。
- 构建存在 JavaScript 包体积超过 500 kB 的提示，不影响启动，但后续可通过路由懒加载优化。

测试使用 `backend/test_codetrack.db`，不会覆盖根目录的开发数据库。上传测试可能在 `backend/uploads/` 生成少量测试文件，该目录已被 Git 忽略。

## 10. 生产构建与运行

### 10.1 构建前端

```powershell
pnpm install --frozen-lockfile
pnpm run build
```

构建输出位于：

```text
dist/
```

### 10.2 执行迁移

```powershell
python -m alembic -c backend\alembic.ini upgrade head
```

### 10.3 由 FastAPI 托管构建结果

必须先完成 `dist/` 构建，再启动 FastAPI。后端仅在进程启动时检测并挂载 `dist/`。

```powershell
python -m uvicorn teacher_backend.app.main:app --host 0.0.0.0 --port 8000
```

访问：

- 应用首页：<http://127.0.0.1:8000/>
- 健康检查：<http://127.0.0.1:8000/api/v1/health>
- API 文档：<http://127.0.0.1:8000/docs>

修改并重新构建前端后，应重启 FastAPI 进程。

当前静态托管使用 FastAPI `StaticFiles`。直接刷新 `/teacher/dashboard` 等前端深层路径可能返回 `404`；单机演示时从根地址进入即可。正式部署建议使用下一节的 Nginx SPA 回退配置。

### 10.4 推荐的 Nginx 部署

将 `dist/` 复制到 `/var/www/codetrack/`，FastAPI 仅监听本机 `8001`：

```bash
python -m uvicorn teacher_backend.app.main:app --host 127.0.0.1 --port 8001
```

Nginx 示例：

```nginx
server {
    listen 80;
    server_name example.com;

    root /var/www/codetrack;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        client_max_body_size 200m;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

`try_files ... /index.html` 用于保证 React Router 深层地址刷新后仍可进入前端。

生产环境还应配置 HTTPS、进程守护、日志轮转和正式认证。不要将当前演示认证直接暴露到公网。

## 11. 文件上传与数据目录

上传文件保存在：

```text
backend/uploads/
```

默认允许的扩展名：

```text
.pdf .ppt .pptx .doc .docx .csv .xlsx .mp4 .txt
```

单文件最大 `200 MB`。如果经过 Nginx，还需要设置：

```nginx
client_max_body_size 200m;
```

业务数据备份至少包括：

```text
codetrack.db
backend/uploads/
```

## 12. 数据备份、恢复与重置

执行备份或恢复前先停止后端，避免复制到写入中的 SQLite 文件。

### 12.1 Windows 备份

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Path ".\backups\$stamp" -Force
Copy-Item .\codetrack.db ".\backups\$stamp\codetrack.db"
Copy-Item .\backend\uploads ".\backups\$stamp\uploads" -Recurse
```

### 12.2 Linux 备份

```bash
stamp=$(date +%Y%m%d-%H%M%S)
mkdir -p "backups/$stamp"
cp codetrack.db "backups/$stamp/codetrack.db"
cp -a backend/uploads "backups/$stamp/uploads"
```

恢复时停止服务，将备份的数据库和上传目录放回原位置，再启动服务并执行健康检查。

### 12.3 重置为演示数据

重置会丢失现有业务数据。先确认已经备份，并停止后端。

Windows PowerShell：

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Move-Item .\codetrack.db ".\codetrack.before-reset-$stamp.db"
python -m uvicorn teacher_backend.app.main:app --host 127.0.0.1 --port 8001
```

下一次启动会创建新数据库并写入演示数据。上传文件不会自动删除；如果需要完全重置，应在备份后单独清理 `backend/uploads/`。

## 13. 常见故障

### 13.1 `pnpm` 询问是否删除并重装 `node_modules`

原因通常是依赖目录由其他 pnpm 版本创建。源码交付时不要包含 `node_modules/`。接手者使用项目锁文件重新执行：

```powershell
pnpm install
```

### 13.2 `ModuleNotFoundError: fastapi` 或 `No module named uvicorn`

虚拟环境未激活或依赖未安装：

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
```

### 13.3 前端页面打开，但接口请求失败

检查后端：

```powershell
Invoke-RestMethod http://127.0.0.1:8001/api/v1/health
```

检查端口占用：

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 5173,8001 }
```

确认前端使用 `5173`，后端使用 `8001`。如果修改端口，需要同步修改 `vite.config.ts`。

### 13.4 `Address already in use` 或端口被占用

Windows：

```powershell
Get-NetTCPConnection -LocalPort 5173,8001 -State Listen
```

Linux：

```bash
lsof -i :5173
lsof -i :8001
```

停止旧进程后重新启动。开发环境不建议随意改后端端口，因为 Vite 代理固定指向 `8001`。

### 13.5 数据库被锁定

SQLite 同时写入能力有限。确认没有重复启动多个后端实例，停止多余进程后重试。生产并发提高后应评估迁移到服务型数据库。

### 13.6 上传失败

检查：

- 文件扩展名是否在允许列表中。
- 文件是否超过 `200 MB`。
- `backend/uploads/` 是否可写。
- 反向代理的上传大小限制是否至少为 `200m`。

### 13.7 生产环境刷新深层地址返回 404

使用 Nginx，并配置：

```nginx
try_files $uri $uri/ /index.html;
```

## 14. 源码交付清单

交付源码时应包含：

```text
backend/
public/
scripts/
src/
index.html
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
tsconfig*.json
vite.config.ts
README.md
RUNBOOK.md
```

通常不要交付：

```text
node_modules/
.venv/
.pnpm-store/
dist/
backups/
*.log
*.tsbuildinfo
backend/test_codetrack.db
```

是否交付以下数据由双方确认：

- `codetrack.db`：包含当前业务数据；不提供时，系统首次启动会生成演示数据。
- `backend/uploads/`：包含实际上传材料，应与数据库一起交付或一起排除。

数据库与上传文件必须成对备份，避免数据库记录存在但文件缺失。

## 15. 上线前安全检查

当前项目适合本地演示和开发验收。接入真实用户或公网前至少完成：

1. 用正式 SSO/JWT 替换 `X-User-Id` 演示认证。
2. 移除前端固定演示密码。
3. 配置 HTTPS 和受控域名。
4. 收紧 CORS 白名单。
5. 设置数据库与上传目录权限。
6. 配置定时备份和恢复演练。
7. 配置进程守护、访问日志和错误监控。
8. 评估 SQLite 是否满足实际并发量。
9. 运行全部测试并记录版本、迁移号和构建产物。

完成以上步骤后，再将服务开放给真实教师和学生。

