# Demo V0.1 API 合同

**状态：首个 Demo 开发基线**

所有接口使用 `/api/v1` 前缀，响应结构遵循 `api/01_api_conventions.md`。

## 1. 获取任务列表

`GET /api/v1/tasks`

返回学生已授权且开放的任务。

```json
{
  "data": [
    {
      "task_id": "task_linked_list_delete_001",
      "course_id": "course_ds_001",
      "course_name": "数据结构",
      "title": "单链表指定位置节点删除",
      "language": "CPP",
      "status": "OPEN",
      "progress_status": "NOT_STARTED",
      "latest_submission_id": null,
      "latest_version_id": null,
      "last_submitted_at": null,
      "passed_at": null
    }
  ],
  "meta": {
    "request_id": "req_xxx"
  }
}
```

`progress_status` 枚举：`NOT_STARTED`、`IN_PROGRESS`、`PASSED`、`FAILED`。

## 2. 获取任务详情

`GET /api/v1/tasks/{task_id}`

返回任务说明、接口、学习目标、公开测试说明、学生当前进度。

不得返回隐藏测试输入、完整判定逻辑和标准答案。

```json
{
  "data": {
    "task_id": "task_linked_list_delete_001",
    "course_id": "course_ds_001",
    "title": "单链表指定位置节点删除",
    "language": "CPP",
    "status": "OPEN",
    "description": "实现删除单链表指定位置节点的函数。",
    "interface_spec": {
      "function_signature": "ListNode* deleteAt(ListNode* head, int position);",
      "editable_region": "FUNCTION_ONLY",
      "student_template": "ListNode* deleteAt(ListNode* head, int position) {\\n    return head;\\n}",
      "rules": [
        "空链表返回 nullptr",
        "非法位置返回原链表",
        "删除头节点时返回新的头节点"
      ]
    },
    "learning_objectives": [
      "理解单链表删除操作",
      "处理空链表",
      "处理删除头节点",
      "正确维护前驱节点和后继节点"
    ],
    "public_tests": [
      {
        "test_case_id": "tc_delete_middle",
        "name": "删除中间节点",
        "input_summary": "[1,2,3], position=1",
        "expected_output_summary": "[1,3]"
      },
      {
        "test_case_id": "tc_delete_head",
        "name": "删除头节点",
        "input_summary": "[1,2,3], position=0",
        "expected_output_summary": "[2,3]"
      },
      {
        "test_case_id": "tc_delete_empty",
        "name": "空链表删除",
        "input_summary": "[], position=0",
        "expected_output_summary": "[]"
      }
    ],
    "current_progress": {
      "submission_id": null,
      "latest_version_id": null,
      "status": "NOT_STARTED",
      "version_no": null,
      "passed_count": 0,
      "total_required_count": 5,
      "highest_hint_level": 0
    }
  },
  "meta": {
    "request_id": "req_xxx"
  }
}
```

## 3. 提交代码

`POST /api/v1/tasks/{task_id}/submissions`

请求：

```json
{
  "language": "CPP",
  "source_code": "ListNode* deleteAt(ListNode* head, int position) {\\n    return head;\\n}"
}
```

头部：`Idempotency-Key`。

返回 `202 Accepted`：

```json
{
  "data": {
    "submission_id": "sub_001",
    "version_id": "ver_001",
    "version_no": 1,
    "execution_id": "exe_001",
    "status": "QUEUED",
    "status_url": "/api/v1/executions/exe_001"
  },
  "meta": {
    "request_id": "req_xxx"
  }
}
```

校验：

- 任务开放；
- 当前用户属于课程；
- 语言为 `CPP`；
- 代码非空；
- 代码不超过 20KB；
- 同一用户、同一任务、同一 `Idempotency-Key` 重复请求返回同一结果。

常见错误码：

- `TASK_NOT_FOUND`；
- `TASK_NOT_OPEN`；
- `AUTH_FORBIDDEN`；
- `SUBMISSION_CODE_EMPTY`；
- `SUBMISSION_CODE_TOO_LARGE`；
- `SUBMISSION_LANGUAGE_NOT_SUPPORTED`。

## 4. 查询执行

`GET /api/v1/executions/{execution_id}`

执行中返回：

```json
{
  "data": {
    "execution_id": "exe_001",
    "version_id": "ver_001",
    "status": "RUNNING_TESTS",
    "compile_status": "SUCCEEDED",
    "test_progress": {
      "completed": 2,
      "total": 5
    },
    "started_at": "2026-07-15T08:00:00Z",
    "finished_at": null,
    "result_url": null
  },
  "meta": {
    "request_id": "req_xxx"
  }
}
```

终态返回：

```json
{
  "data": {
    "execution_id": "exe_001",
    "version_id": "ver_001",
    "status": "SUCCEEDED",
    "compile_status": "SUCCEEDED",
    "test_progress": {
      "completed": 5,
      "total": 5
    },
    "passed_count": 4,
    "failed_count": 1,
    "started_at": "2026-07-15T08:00:00Z",
    "finished_at": "2026-07-15T08:00:03Z",
    "result_url": "/api/v1/submission-versions/ver_001/results"
  },
  "meta": {
    "request_id": "req_xxx"
  }
}
```

`status` 使用执行状态枚举：`PENDING`、`PREPARING`、`COMPILING`、`RUNNING_TESTS`、`SUCCEEDED`、`COMPILE_ERROR`、`RUNTIME_ERROR`、`TIMEOUT`、`RESOURCE_LIMIT`、`SECURITY_REJECTED`、`INFRASTRUCTURE_ERROR`。

## 5. 获取版本结果

`GET /api/v1/submission-versions/{version_id}/results`

返回编译结果、测试结果、诊断状态和当前允许提示层级。

```json
{
  "data": {
    "submission_id": "sub_001",
    "version_id": "ver_001",
    "version_no": 1,
    "submission_status": "FEEDBACK_READY",
    "execution": {
      "execution_id": "exe_001",
      "status": "SUCCEEDED",
      "compile_exit_code": 0,
      "compiler_stdout": "",
      "compiler_stderr": "",
      "started_at": "2026-07-15T08:00:00Z",
      "finished_at": "2026-07-15T08:00:03Z"
    },
    "tests": [
      {
        "test_case_id": "tc_delete_middle",
        "name": "删除中间节点",
        "visibility": "PUBLIC",
        "status": "PASSED",
        "expected_output_summary": "[1,3]",
        "actual_output": "[1,3]",
        "duration_ms": 3,
        "error_tag": "NORMAL_DELETE"
      },
      {
        "test_case_id": "tc_delete_head",
        "name": "删除头节点",
        "visibility": "PUBLIC",
        "status": "FAILED",
        "expected_output_summary": "[2,3]",
        "actual_output": "[1,2,3]",
        "duration_ms": 3,
        "error_tag": "LINKED_LIST_HEAD_UPDATE_ERROR"
      },
      {
        "test_case_id": "tc_delete_tail",
        "name": "隐藏边界测试",
        "visibility": "HIDDEN",
        "status": "PASSED",
        "expected_output_summary": "边界位置删除结果应正确",
        "actual_output": "已通过",
        "duration_ms": 2,
        "error_tag": "TAIL_DELETE"
      }
    ],
    "diagnosis": {
      "status": "NOT_STARTED",
      "diagnosis_id": null,
      "needs_teacher_review": false
    },
    "hint_access": {
      "highest_viewed_level": 0,
      "available_levels": [],
      "reference_answer_viewed": false
    }
  },
  "meta": {
    "request_id": "req_xxx"
  }
}
```

隐藏测试规则：

- 不返回隐藏测试原始输入；
- 不返回隐藏测试完整期望输出；
- 失败时只返回教师配置的摘要。

## 6. 获取诊断

`GET /api/v1/submission-versions/{version_id}/diagnosis`

AI/RAG 接入后返回。第一根不接 AI 的纵向链路可返回 `404 DIAGNOSIS_NOT_READY` 或 `status: NOT_STARTED`。

```json
{
  "data": {
    "diagnosis_id": "diag_001",
    "version_id": "ver_001",
    "status": "READY",
    "diagnosis_type": "LINKED_LIST_HEAD_UPDATE_ERROR",
    "confidence": 0.87,
    "explanation": "当前版本在删除第一个节点时仍返回旧的头节点，导致结果保留了原首节点。",
    "verified_evidence_ids": ["tr_tc_delete_head"],
    "knowledge_source_ids": ["kb_head_node_delete"],
    "knowledge_sources": [
      {
        "source_id": "kb_head_node_delete",
        "title": "删除头节点时返回新头指针",
        "summary": "删除单链表第一个节点后，链表起点应变为原第二个节点。",
        "source_type": "COURSE_NOTE",
        "version": "v0.1",
        "authority_level": "HIGH"
      }
    ],
    "needs_teacher_review": false,
    "hint_level": 1,
    "hint": "当前失败集中在删除第一个节点。请检查删除后，代表链表起点的返回值是否发生变化。"
  },
  "meta": {
    "request_id": "req_xxx"
  }
}
```

## 7. 请求提示

`POST /api/v1/diagnoses/{diagnosis_id}/hints`

请求：

```json
{
  "requested_level": 2
}
```

返回：

```json
{
  "data": {
    "hint_id": "hint_002",
    "diagnosis_id": "diag_001",
    "level": 2,
    "content": "请重点查看 position == 0 的分支。删除首节点时没有前驱节点，返回值需要代表新的链表起点。",
    "unlocked": true,
    "unlock_reason": "学生主动申请且一级提示已查看",
    "generated_at": "2026-07-15T08:02:00Z",
    "viewed_at": "2026-07-15T08:02:00Z"
  },
  "meta": {
    "request_id": "req_xxx"
  }
}
```

错误：

- `HINT_LEVEL_NOT_AVAILABLE`；
- `HINT_DIAGNOSIS_NOT_READY`；
- `HINT_ALREADY_VIEWED`；
- `HINT_GENERATION_FAILED`。

## 8. 获取版本历史

`GET /api/v1/submissions/{submission_id}/versions`

```json
{
  "data": [
      {
        "version_id": "ver_001",
        "version_no": 1,
        "language": "CPP",
        "source_code": "ListNode* deleteAt(...) { ... }",
        "code_hash": "sha256_hex",
        "created_at": "2026-07-15T08:00:00Z",
        "submission_status": "FEEDBACK_READY",
        "execution_status": "SUCCEEDED",
      "passed_count": 4,
      "total_required_count": 5,
      "highest_hint_level": 1,
      "is_latest": false,
      "is_final": false
    },
      {
        "version_id": "ver_002",
        "version_no": 2,
        "language": "CPP",
        "source_code": "ListNode* deleteAt(...) { ... }",
        "code_hash": "sha256_hex",
        "created_at": "2026-07-15T08:05:00Z",
        "submission_status": "PASSED",
      "execution_status": "SUCCEEDED",
      "passed_count": 5,
      "total_required_count": 5,
      "highest_hint_level": 1,
      "is_latest": true,
      "is_final": true
    }
  ],
  "meta": {
    "request_id": "req_xxx"
  }
}
```

## 9. 获取完成总结

`GET /api/v1/submissions/{submission_id}/summary`

```json
{
  "data": {
    "submission_id": "sub_001",
    "task_id": "task_linked_list_delete_001",
    "final_status": "PASSED",
    "version_count": 2,
    "highest_hint_level": 1,
    "started_at": "2026-07-15T08:00:00Z",
    "passed_at": "2026-07-15T08:05:03Z",
    "total_duration_ms": 303000,
    "next_step_suggestion": "建议独立复述头节点删除时返回值变化的原因，并完成一个相似链表边界题。",
    "test_comparison": [
      {
        "test_case_id": "tc_delete_head",
        "name": "删除头节点",
        "first_status": "FAILED",
        "final_status": "PASSED"
      }
    ],
    "capability_evidence": {
      "evidence_id": "evi_001",
      "capability_code": "LINKED_LIST_BOUNDARY_HANDLING",
      "strength": "MODERATE",
      "evidence_type": "PASSED_AFTER_LEVEL_1_HINT",
      "explanation": "学生在一级提示后修复删除头节点问题，并通过全部必要测试。"
    }
  },
  "meta": {
    "request_id": "req_xxx"
  }
}
```

`capability_evidence.strength` 当前可返回 `STRONG`、`MODERATE`、`WEAK`、`NEUTRAL`、`NEGATIVE`。

`NEGATIVE` 证据用于同类关键边界错误在多个提交版本重复出现的场景，`evidence_type` 为 `REPEATED_BOUNDARY_FAILURE`，并可把能力状态更新为 `NEEDS_SUPPORT`。

## 10. 教师查看课程提交

`GET /api/v1/teacher/courses/{course_id}/submissions`

支持按状态、错因、提示层级筛选。

```json
{
  "data": [
    {
      "submission_id": "sub_001",
      "task_id": "task_linked_list_delete_001",
      "task_title": "单链表指定位置节点删除",
      "student_id": "user_student_001",
      "student_name": "学生一",
      "status": "PASSED",
      "version_count": 2,
      "latest_version_id": "ver_002",
      "highest_hint_level": 1,
      "latest_diagnosis_type": "LINKED_LIST_HEAD_UPDATE_ERROR",
      "passed_at": "2026-07-15T08:05:03Z"
    }
  ],
  "meta": {
    "request_id": "req_xxx",
    "page": 1,
    "page_size": 50,
    "total": 1
  }
}
```

## 11. 教师查看提交时间线

`GET /api/v1/teacher/submissions/{submission_id}/timeline`

返回按时间排序的提交、执行、测试、诊断、提示和能力证据事件。

```json
{
  "data": {
    "submission_id": "sub_001",
    "student_id": "user_student_001",
    "student_name": "学生一",
    "task_id": "task_linked_list_delete_001",
    "task_title": "单链表指定位置节点删除",
    "events": [
      {
        "event_id": "evt_001",
        "type": "VERSION_SUBMITTED",
        "version_id": "ver_001",
        "occurred_at": "2026-07-15T08:00:00Z",
        "summary": "学生提交第 1 版代码"
      },
      {
        "event_id": "evt_002",
        "type": "TEST_RESULT",
        "version_id": "ver_001",
        "execution_id": "exe_001",
        "occurred_at": "2026-07-15T08:00:03Z",
        "summary": "通过 4/5 个必要测试，删除头节点失败"
      },
      {
        "event_id": "evt_003",
        "type": "HINT_VIEWED",
        "version_id": "ver_001",
        "diagnosis_id": "diag_001",
        "occurred_at": "2026-07-15T08:02:00Z",
        "summary": "查看一级提示"
      },
      {
        "event_id": "evt_004",
        "type": "CAPABILITY_EVIDENCE_CREATED",
        "version_id": "ver_002",
        "occurred_at": "2026-07-15T08:05:04Z",
        "summary": "生成链表边界处理中等正向证据"
      }
    ]
  },
  "meta": {
    "request_id": "req_xxx"
  }
}
```

## 12. 健康检查

- `GET /health`：应用状态；
- `GET /ready`：数据库、队列等必要依赖；
- 沙箱和模型依赖可在管理监控中单独展示，避免健康检查被短暂外部故障完全拖死。
