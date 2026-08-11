# CodeTrack 教师端全栈系统

CodeTrack 是教师端与学生端共享数据底座的教学闭环。本工作区实现了 Word 原型中的 12 个教师端页面，并提供真实 FastAPI、SQLAlchemy、SQLite、Alembic、文件上传、权限校验和端到端测试。

完整的环境安装、前后端启动、数据库迁移、生产部署、备份恢复与故障排查说明请查看 [RUNBOOK.md](./RUNBOOK.md)。

## 已实现闭环

```text
教师创建课程
→ 创建教学班、邀请学生
→ 编排章节和知识点
→ 创建任务与测试用例
→ 发布到教学班
→ 学生端读取并提交代码
→ 系统生成测试结果与 AI 诊断
→ 教师监控、审核、批改和反馈
→ 发布成绩与学生通知
→ 班级学情和知识点掌握更新
```

## 一键开发运行

```powershell
pnpm install
pnpm run dev
```

- 教师端：[http://127.0.0.1:5173/](http://127.0.0.1:5173/)
- API 健康检查：[http://127.0.0.1:8001/api/v1/health](http://127.0.0.1:8001/api/v1/health)
- OpenAPI：[http://127.0.0.1:8001/docs](http://127.0.0.1:8001/docs)

可通过 `CODETRACK_PYTHON` 指定 Python 路径。本机脚本会优先使用 `D:/Anaconda/python.exe`。

## 生产运行

```powershell
pnpm run build
python -m alembic -c backend/alembic.ini upgrade head
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

生产构建后，FastAPI 会直接托管 `dist/`，访问 `http://127.0.0.1:8000/` 即可使用前后端一体应用。

## 验证

```powershell
python -m pytest backend/tests -q -p no:cacheprovider
pnpm run build
```

后端测试使用独立的 `backend/test_codetrack.db`，不会污染开发数据库。

## 目录

- `src/exact/`：按 Word 原型还原的教师端页面
- `src/api.ts`：统一请求层和共享前端类型
- `backend/app/models.py`：共享领域模型
- `backend/app/main.py`：教师端、学生端与闭环 API
- `backend/app/uploads.py`：真实文件上传与权限下载
- `backend/alembic/`：数据库迁移
- `backend/tests/`：权限、上传和全流程测试
- `artifacts/exact/`：1672×941 原型验收截图

## 默认账号

- 教师：`teacher-01`
- 学生：`student-03`

当前认证通过 `X-User-Id` 请求头模拟统一身份服务。进入生产前应替换为学校 SSO/JWT，但服务端角色、课程归属和资源权限校验已经生效。
