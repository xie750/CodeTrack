# Piston 沙箱接入说明

## 接入位置

Piston 不直接接前端。前端仍然调用 CodeTrack 自己的提交接口：

```text
POST /api/v1/tasks/{task_id}/submissions
```

后端链路是：

```text
tasks.py
-> submissions.run_execution()
-> sandbox_client.run_sandbox_execution()
-> piston_client.execute_with_piston()
-> Piston /api/v2/execute
```

这样提交记录、执行状态、测试结果、AI 诊断、学习者画像更新都还留在 CodeTrack 后端，不会被 Piston 的接口形状绑死。

## 本地配置

在项目根目录新建或修改 `.env`：

```bash
CODETRACK_PISTON_BASE_URL=http://127.0.0.1:2000
CODETRACK_SANDBOX_TIMEOUT_SECONDS=3
```

如果 FastAPI 跑在 Windows 主机，而 Piston 跑在 WSL，通常 `http://127.0.0.1:2000` 可以直接访问。若不通，用 WSL 里 `hostname -I` 看到的地址，例如：

```bash
CODETRACK_PISTON_BASE_URL=http://172.25.12.27:2000
```

如果 FastAPI 也跑在 Docker 容器里，优先用同一个 docker compose 网络里的服务名；如果 Piston 在宿主机上，可以尝试：

```bash
CODETRACK_PISTON_BASE_URL=http://host.docker.internal:2000
```

## 当前支持的 runner

- `leetcode_two_sum_v1`：函数式题目包装器，支持 Python / C++ / JavaScript。
- `stdio_cpp_v1`：完整 C++ 程序，按测试用例的 `input_data.stdin` 喂 stdin，比对 stdout。
- `legacy_linked_list_delete_v1`：仍保留原来的本地/旧沙箱执行路径，避免影响现有链表演示闭环。

## 验证方式

先确认 Piston 可用：

```bash
curl http://127.0.0.1:2000/api/v2/execute ^
  -H "Content-Type: application/json" ^
  -d "{\"language\":\"python\",\"version\":\"*\",\"files\":[{\"name\":\"main.py\",\"content\":\"print('ok')\"}]}"
```

再确认已安装语言：

```bash
curl http://127.0.0.1:2000/api/v2/runtimes
```

当前项目的 C++ 任务需要返回结果里出现 `c++` runtime。没有的话，在 Piston 目录里安装：

```bash
node index.js --api-url http://127.0.0.1:2000 ppman install c++
```

再启动 CodeTrack 后端：

```bash
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

进入前端任务工作区提交 `task_two_sum_001`，执行结果的 `resource_usage.profile` 应该是 `leetcode_two_sum_v1`，并带有 `piston_ms`。

## 新增题型时怎么接

1. 在 `backend/app/services/programming_specs.py` 定义新的 `ProgrammingSpec`，决定语言、模板和 `runner_profile`。
2. 在 `backend/app/services/piston_client.py` 为这个 `runner_profile` 增加代码包装器或 stdin/stdout 映射。
3. 种子数据或教师创建任务时，让 `interface_spec` 能被 `get_programming_spec()` 识别。
4. 保持返回的测试结果字段稳定：`test_case_id`、`status`、`actual_output`、`expected_output_summary`、`error_tag`。
