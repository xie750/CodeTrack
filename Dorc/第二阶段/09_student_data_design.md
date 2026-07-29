# 学生助学数据设计

## 1. 设计结论

第二阶段数据模型围绕“学生端助学闭环”设计，不把教师端后台做成完整教务系统。

核心口径：

- 学生通常固定归属一个行政班，例如“软件工程 1 班”。
- 行政班下面会开设多门课程，例如“数据结构”“计算机网络”“计算机组成原理”。
- 不同课程可以由不同老师负责。
- 一个老师可以教授多个行政班的同一门课程。
- 老师下发任务时，目标不是单纯“班级”，而是“某个行政班的某门课程”。
- 学生端不重点切换班级，而是基于自己的行政班切换课程任务。
- 学习画像按 `student_id + course_id` 聚合，首页可以展示总摘要，详情按课程切换。
- 教师端只查看自己负责的 `班级 + 课程` 范围内的画像聚合，不直接展示学生全部课程画像。

推荐关系：

```text
学生
-> 所属行政班
-> 行政班开设多门课程
-> 每门课程存在教学安排
-> 教师基于教学安排下发任务
-> 学生完成任务并产生提交、诊断、提示、资料和画像事件
```

## 2. 关键概念

### 2.1 行政班

行政班表示学校真实班级，例如：

- 软件工程 1 班；
- 软件工程 2 班；
- 计科 1 班。

行政班不是课程班，也不是老师个人创建的班级。

### 2.2 课程

课程表示学科或科目，例如：

- 数据结构与程序设计基础；
- 计算机网络；
- 计算机组成原理。

### 2.3 教学安排

教学安排表示“哪个老师教哪个行政班的哪门课”。

示例：

```text
王老师 -> 软件工程 1 班 -> 数据结构
李老师 -> 软件工程 1 班 -> 计算机网络
王老师 -> 计科 1 班 -> 数据结构
```

任务下发、学生任务列表、教师端画像聚合，都应该围绕教学安排过滤。

### 2.4 任务本体与任务下发

任务本体表示任务内容，例如“单链表指定位置节点删除”。

任务下发表示这份任务被发布给哪个教学安排，例如：

```text
单链表指定位置节点删除
-> 发布给 软件工程 1 班 的 数据结构
-> 发布给 计科 1 班 的 数据结构
```

因此 `tasks` 和 `task_assignments` 必须分开。

## 3. 核心实体关系

```text
users
  ├─ teachers
  └─ students

classes
  └─ student_class_memberships
       └─ students

courses
  └─ teaching_assignments
       ├─ class_id
       ├─ course_id
       └─ teacher_id

tasks
  └─ task_assignments
       └─ teaching_assignment_id

task_assignments
  └─ student_task_progress
       └─ student_id

student_task_progress
  └─ submissions
       └─ submission_versions
            ├─ execution_runs
            ├─ diagnoses
            └─ hint_records

learner_events
  ├─ learner_profile_snapshots
  ├─ learner_knowledge_states
  ├─ learner_error_stats
  └─ recommendations
```

## 4. 表设计

### 4.1 users

用户表，保留学生和教师。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String(64) | 用户 ID |
| display_name | String(100) | 展示名称 |
| role | String(20) | `STUDENT` / `TEACHER` |
| status | String(20) | `ACTIVE` / `DISABLED` |
| created_at | DateTime | 创建时间 |

当前项目已有该表，可继续复用。

### 4.2 classes

行政班表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String(64) | 班级 ID |
| name | String(100) | 班级名称，例如“软件工程 1 班” |
| grade | String(20) | 年级，例如 `2026` |
| major_name | String(100) | 专业名称，例如“软件工程” |
| status | String(20) | `ACTIVE` / `ARCHIVED` |
| created_at | DateTime | 创建时间 |

第一版可 seed：

```text
class_se_001: 软件工程 1 班
class_se_002: 软件工程 2 班
class_cs_001: 计科 1 班
```

### 4.3 student_class_memberships

学生行政班归属表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | Integer | 自增主键 |
| class_id | String(64) | 行政班 ID |
| student_id | String(64) | 学生 ID |
| status | String(20) | `ACTIVE` / `TRANSFERRED` |
| joined_at | DateTime | 加入时间 |

约束：

```text
同一学生第一版只允许一个 ACTIVE 行政班。
```

这符合当前产品口径，也让学生端不需要设计复杂班级切换。

### 4.4 courses

课程表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String(64) | 课程 ID |
| name | String(100) | 课程名称 |
| description | Text | 课程说明 |
| term | String(40) | 学期，例如 `2026-demo` |
| status | String(20) | `ACTIVE` / `ARCHIVED` |

当前项目已有 `courses.owner_teacher_id`。后续若采用教学安排表，课程本身可以不强绑定单一老师。

### 4.5 teaching_assignments

教学安排表，表示“老师教某个班的某门课”。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String(64) | 教学安排 ID |
| class_id | String(64) | 行政班 ID |
| course_id | String(64) | 课程 ID |
| teacher_id | String(64) | 教师 ID |
| term | String(40) | 学期 |
| status | String(20) | `ACTIVE` / `ARCHIVED` |
| created_at | DateTime | 创建时间 |

唯一约束建议：

```text
class_id + course_id + teacher_id + term
```

示例数据：

```text
ta_se1_ds: 软件工程 1 班 + 数据结构 + 王老师
ta_se1_net: 软件工程 1 班 + 计算机网络 + 李老师
ta_cs1_ds: 计科 1 班 + 数据结构 + 王老师
```

### 4.6 tasks

任务本体表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String(64) | 任务 ID |
| course_id | String(64) | 课程 ID |
| title | String(160) | 任务标题 |
| description | Text | 任务说明 |
| task_type | String(30) | `CODING` / `QUIZ` / `PRACTICE` |
| language | String(20) | `CPP` 等 |
| difficulty | String(30) | `BASIC` / `MEDIUM` / `HARD` |
| interface_spec | Text | 编程接口说明 |
| learning_objectives | Text | JSON 字符串 |
| knowledge_points | Text | JSON 字符串 |
| status | String(20) | `DRAFT` / `ACTIVE` / `ARCHIVED` |
| created_by | String(64) | 创建教师 ID |
| created_at | DateTime | 创建时间 |

当前项目已有 `tasks`，可以在后续迁移中逐步补充 `task_type`、`difficulty`、`knowledge_points`、`created_by`。

### 4.7 task_assignments

任务下发表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String(64) | 下发 ID |
| task_id | String(64) | 任务 ID |
| teaching_assignment_id | String(64) | 教学安排 ID |
| published_by | String(64) | 发布教师 ID |
| publish_status | String(20) | `DRAFT` / `PUBLISHED` / `CLOSED` |
| assignment_mode | String(20) | `PRACTICE` / `EXAM` |
| allow_hint_level_3 | Boolean | 是否允许三级提示 |
| published_at | DateTime | 发布时间 |
| deadline | DateTime | 截止时间 |

任务列表应从这张表出发，而不是只查 `tasks`。

### 4.8 student_task_progress

学生任务进度表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | Integer | 自增主键 |
| assignment_id | String(64) | 任务下发 ID |
| student_id | String(64) | 学生 ID |
| status | String(30) | 学生进度状态 |
| latest_submission_id | String(64) | 最近提交 ID |
| latest_version_id | String(64) | 最近版本 ID |
| passed_count | Integer | 通过测试数 |
| total_required_count | Integer | 必要测试数 |
| highest_hint_level | Integer | 最高已查看提示层级 |
| score | Float | 分数，可为空 |
| started_at | DateTime | 开始时间 |
| last_submitted_at | DateTime | 最近提交时间 |
| completed_at | DateTime | 完成时间 |
| updated_at | DateTime | 更新时间 |

状态枚举：

```text
NOT_STARTED
IN_PROGRESS
SUBMITTED
NEEDS_REVISION
COMPLETED
EXPIRED
```

唯一约束建议：

```text
assignment_id + student_id
```

## 5. 学习画像设计

画像不建议做成一张巨大宽表，而是采用“事件明细 + 聚合快照”的设计。

底层存细，页面展示粗。

### 5.1 learner_events

学习事件表，用于记录画像更新依据。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String(64) | 事件 ID |
| student_id | String(64) | 学生 ID |
| course_id | String(64) | 课程 ID |
| class_id | String(64) | 行政班 ID |
| teaching_assignment_id | String(64) | 教学安排 ID，可为空 |
| assignment_id | String(64) | 任务下发 ID，可为空 |
| task_id | String(64) | 任务 ID，可为空 |
| event_type | String(50) | 事件类型 |
| knowledge_points | Text | JSON 字符串 |
| error_type | String(80) | 错因类型，可为空 |
| payload | Text | JSON 字符串 |
| created_at | DateTime | 发生时间 |

事件类型：

```text
TASK_STARTED
CODE_SUBMITTED
EXECUTION_FINISHED
DIAGNOSIS_GENERATED
HINT_VIEWED
TASK_COMPLETED
SELF_STUDY_GENERATED
ARTIFACT_SAVED
AI_QUESTION_ASKED
```

### 5.2 learner_profile_snapshots

课程级画像快照表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String(64) | 快照 ID |
| student_id | String(64) | 学生 ID |
| course_id | String(64) | 课程 ID |
| class_id | String(64) | 行政班 ID |
| summary_text | Text | 画像摘要 |
| overall_progress | Float | 总体进度 0-100 |
| hint_dependency_level | String(20) | `LOW` / `MEDIUM` / `HIGH` |
| compile_error_rate | Float | 编译错误比例 |
| logic_error_rate | Float | 逻辑错误比例 |
| recent_task_completion | Float | 近期任务完成率 |
| recommendation_text | Text | 推荐下一步 |
| updated_at | DateTime | 更新时间 |

唯一约束建议：

```text
student_id + course_id
```

### 5.3 learner_knowledge_states

知识点掌握状态表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | Integer | 自增主键 |
| student_id | String(64) | 学生 ID |
| course_id | String(64) | 课程 ID |
| knowledge_point | String(100) | 知识点 |
| mastery_score | Float | 掌握度 0-100 |
| state | String(20) | `STRONG` / `STABLE` / `WEAK` |
| evidence_count | Integer | 证据数量 |
| last_evidence | Text | 最近依据 |
| updated_at | DateTime | 更新时间 |

唯一约束建议：

```text
student_id + course_id + knowledge_point
```

### 5.4 learner_error_stats

错因统计表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | Integer | 自增主键 |
| student_id | String(64) | 学生 ID |
| course_id | String(64) | 课程 ID |
| error_type | String(80) | 错因编码 |
| label | String(100) | 展示名称 |
| count | Integer | 出现次数 |
| severity | String(20) | `LOW` / `MEDIUM` / `HIGH` |
| related_knowledge_points | Text | JSON 字符串 |
| updated_at | DateTime | 更新时间 |

### 5.5 recommendations

推荐下一步表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String(64) | 推荐 ID |
| student_id | String(64) | 学生 ID |
| course_id | String(64) | 课程 ID |
| recommendation_type | String(40) | `TASK` / `REVIEW` / `SELF_STUDY` / `ARTIFACT` |
| title | String(160) | 推荐标题 |
| reason | Text | 推荐原因 |
| priority | Integer | 优先级 |
| related_task_id | String(64) | 关联任务，可为空 |
| related_knowledge_points | Text | JSON 字符串 |
| suggested_action | String(80) | 建议动作 |
| status | String(20) | `ACTIVE` / `DONE` / `DISMISSED` |
| created_at | DateTime | 创建时间 |

## 6. 教师端画像聚合

课程画像按学生细分会带来更多数据，但这是正确方向。

原因：

- 不同课程的能力表现不能混在一起。
- 数据结构老师只需要看数据结构画像，不应该看到学生的计算机网络画像。
- 教师端需要可行动的班级课程摘要，而不是铺满每个学生所有细节。

教师端查询边界：

```text
teacher_id
-> teaching_assignments
-> class_id + course_id
-> learner_profile_snapshots / learner_knowledge_states / learner_error_stats
```

教师端默认展示聚合：

```text
班级课程总览
-> 任务完成率
-> 薄弱知识点 Top 5
-> 高频错因 Top 5
-> 风险学生 Top 10
-> 可展开查看单个学生课程画像
```

建议接口返回：

```json
{
  "class_id": "class_se_001",
  "class_name": "软件工程 1 班",
  "course_id": "course_ds_001",
  "course_name": "数据结构与程序设计基础",
  "teacher_name": "王老师",
  "student_count": 42,
  "task_completion_rate": 0.76,
  "weak_points": [
    {
      "name": "链表边界处理",
      "affected_students": 18,
      "avg_mastery_score": 54
    }
  ],
  "frequent_errors": [
    {
      "error_type": "HEAD_NODE_RETURN_MISSING",
      "label": "头节点返回值遗漏",
      "count": 21
    }
  ],
  "risk_students": [
    {
      "student_id": "user_student_001",
      "student_name": "王同学",
      "reason": "连续 2 次任务未通过，提示依赖中等偏高"
    }
  ]
}
```

## 7. 学生端接口建议

### 7.1 获取学生当前班级和课程

```http
GET /api/v1/student/learning-context
```

返回：

```json
{
  "student": {
    "id": "user_student_001",
    "name": "王同学",
    "class_id": "class_se_001",
    "class_name": "软件工程 1 班"
  },
  "courses": [
    {
      "course_id": "course_ds_001",
      "course_name": "数据结构与程序设计基础",
      "teacher_name": "王老师",
      "task_count": 3,
      "unfinished_count": 2
    },
    {
      "course_id": "course_network_001",
      "course_name": "计算机网络",
      "teacher_name": "李老师",
      "task_count": 1,
      "unfinished_count": 0
    }
  ]
}
```

### 7.2 获取课程任务列表

```http
GET /api/v1/student/tasks?course_id=course_ds_001
```

返回：

```json
[
  {
    "assignment_id": "assign_ds_linked_list_001",
    "task_id": "task_linked_list_delete_001",
    "course_id": "course_ds_001",
    "course_name": "数据结构与程序设计基础",
    "class_id": "class_se_001",
    "class_name": "软件工程 1 班",
    "teacher_name": "王老师",
    "title": "单链表指定位置节点删除",
    "task_type": "CODING",
    "deadline": "2026-08-05T23:59:00",
    "difficulty": "BASIC",
    "knowledge_points": ["链表", "边界处理", "指针"],
    "status": "IN_PROGRESS",
    "passed_count": 2,
    "total_required_count": 5,
    "highest_hint_level": 1,
    "latest_summary": "最近一次提交未通过头节点删除用例"
  }
]
```

### 7.3 获取学生课程画像

```http
GET /api/v1/student/profile?course_id=course_ds_001
```

返回：

```json
{
  "student": {
    "id": "user_student_001",
    "name": "王同学",
    "class_name": "软件工程 1 班"
  },
  "course": {
    "id": "course_ds_001",
    "name": "数据结构与程序设计基础",
    "teacher_name": "王老师"
  },
  "overview": {
    "overall_progress": 62,
    "hint_dependency_level": "MEDIUM",
    "compile_error_rate": 0.18,
    "logic_error_rate": 0.42,
    "recent_task_completion": 0.67,
    "summary": "链表边界处理仍是当前主要薄弱点，建议先完成边界专项练习。"
  },
  "knowledge_states": [
    {
      "knowledge_point": "链表边界处理",
      "mastery_score": 52,
      "state": "WEAK",
      "last_evidence": "单链表删除任务中头节点用例失败"
    }
  ],
  "frequent_errors": [
    {
      "error_type": "HEAD_NODE_RETURN_MISSING",
      "label": "头节点返回值遗漏",
      "count": 3,
      "severity": "HIGH"
    }
  ],
  "recommendations": [
    {
      "title": "完成链表边界专项复盘",
      "reason": "最近 2 次提交均暴露头节点处理问题",
      "suggested_action": "OPEN_SELF_STUDY"
    }
  ]
}
```

## 8. SQLite 落地说明

第一版继续使用 SQLite 是合理的。

原因：

- 演示数据量小；
- 本阶段重点是验证链路和数据协议；
- SQLAlchemy + Alembic 已经存在；
- JSON 类字段可以先用 `Text` 存储；
- 后续迁移 PostgreSQL 时，可把部分 `Text` 字段升级为 JSON 类型。

SQLite 阶段建议：

```text
Text 字段存 JSON 字符串
业务层使用 json.dumps / json.loads
尽量保留稳定字段名
不要为了 SQLite 写死无法迁移的特殊逻辑
```

优先加索引：

```text
student_class_memberships.student_id
teaching_assignments.class_id
teaching_assignments.teacher_id
teaching_assignments.course_id
task_assignments.teaching_assignment_id
student_task_progress.assignment_id
student_task_progress.student_id
learner_profile_snapshots.student_id + course_id
learner_knowledge_states.student_id + course_id
learner_error_stats.student_id + course_id
```

## 9. 第一版种子数据建议

最小演示数据：

```text
用户：
  王老师：数据结构教师
  李老师：计算机网络教师
  王同学：学生

行政班：
  软件工程 1 班
  计科 1 班

课程：
  数据结构与程序设计基础
  计算机网络
  计算机组成原理

教学安排：
  王老师 -> 软件工程 1 班 -> 数据结构
  李老师 -> 软件工程 1 班 -> 计算机网络
  王老师 -> 计科 1 班 -> 数据结构

任务：
  数据结构：单链表指定位置节点删除
  数据结构：栈实现括号匹配
  数据结构：二叉树前序遍历
  计算机网络：IP 地址与子网划分练习

学生画像：
  王同学 + 数据结构：链表边界处理薄弱
  王同学 + 计算机网络：子网划分待巩固
```

学生端展示：

```text
当前班级：软件工程 1 班
课程筛选：全部 / 数据结构 / 计算机网络 / 计算机组成原理
任务列表随课程变化
画像详情随课程变化
```

教师端展示：

```text
王老师只能看到：
  软件工程 1 班的数据结构画像
  计科 1 班的数据结构画像

李老师只能看到：
  软件工程 1 班的计算机网络画像
```

## 10. 前端展示口径

### 10.1 班级任务页

页面标题可保留“班级任务”，但筛选控件建议改为：

```text
当前班级：软件工程 1 班
课程选择：全部课程 / 数据结构 / 计算机网络 / 计算机组成原理
```

不要让学生主动切换到其他行政班。

任务卡展示字段：

```text
任务标题
课程名称
发布老师
任务类型
知识点
难度
截止时间
学生进度状态
最近一次提交摘要
进入任务按钮
```

### 10.2 学习画像页

画像页建议按课程切换：

```text
全部摘要
数据结构画像
计算机网络画像
计算机组成原理画像
```

页面模块：

```text
课程画像总览
知识点掌握状态
薄弱知识点
高频错因
提示依赖程度
最近任务完成情况
下一步推荐
画像依据说明
```

注意：画像是学习状态，不是学生评价标签。文案应避免“差生”“能力不足”等表达。

## 11. 后续扩展

后续可以扩展但第一版不必实现：

- 学生转班历史；
- 一个学生同时存在多个行政班身份；
- 多教师共同教授同一班同一课程；
- 教师端完整建班和排课后台；
- 全校级画像统计；
- PostgreSQL JSON 字段和物化视图；
- 定时画像聚合任务。

当前第一版先保证：

```text
行政班归属清楚
课程筛选清楚
教师教学安排清楚
任务下发目标清楚
学生任务进度清楚
课程级学习画像清楚
教师端只看自己负责范围内的数据
```
