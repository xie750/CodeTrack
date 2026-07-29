# CodeTrack 学生端与教师端共享数据设计说明

更新时间：2026-07-29  
适用范围：第二阶段学生助学系统、教师端课程任务与学习画像共享

## 1. 文档目的

本文档用于在学生端与教师端之间统一数据口径，说明：

- 学生、行政班、课程、任课教师、任务下发之间是什么关系。
- 学生端为什么按课程展示任务和学习画像。
- 教师端能够共享哪些画像数据，不能越界查看哪些数据。
- SQLite 阶段需要设计哪些表和字段，后续如何迁移到更完整数据库。

本文档不是完整教务系统设计，也不是教师端全部功能清单。第一版目标是支持“教师下发任务 -> 学生完成任务 -> 系统形成课程级学习画像 -> 教师查看自己负责课程范围内的聚合画像”。

## 2. 核心业务结论

当前建议采用以下逻辑：

```text
学生
-> 归属一个行政班
-> 行政班开设多门课程
-> 每门课程由对应教师负责
-> 教师基于“行政班 + 课程”的教学安排下发任务
-> 学生收到自己行政班中对应课程的任务
-> 学生完成任务后形成“学生 + 课程”级学习画像
-> 教师只能查看自己负责的“行政班 + 课程”范围内的数据
```

关键点：

- 学生端不应该理解为“加入某个老师的班级”，而是“学生属于某个行政班”。
- 学生通常只有一个行政班，例如“软件工程 1 班”。
- 一个行政班会有多门课程，例如“数据结构与程序设计基础”“计算机网络”“计算机组成原理”。
- 多个老师可以分别负责同一个行政班下的不同课程。
- 一个老师也可以负责多个行政班的同一门课程。
- 任务下发目标不是单纯的班级，而是“某个行政班的某门课程”。
- 学习画像建议按 `student_id + course_id` 建立，不把所有课程混成一个大画像。

## 3. 为什么画像要按课程共享给教师端

学习画像如果只做成学生全局画像，会出现三个问题：

1. 数据不准确  
   学生在数据结构里的薄弱点，不一定代表他在计算机网络里也薄弱。

2. 教师端越界  
   数据结构老师只应该看到自己课程内的学习表现，不应该看到学生在其他课程里的完整画像。

3. 教师无法行动  
   教师端最需要的是本课程、本班级的薄弱知识点、任务完成情况和风险学生，而不是学生所有学习行为的混合结果。

因此建议：

```text
学生端：
展示个人视角，可以切换课程查看自己的课程画像。

教师端：
默认展示教师负责范围内的班级课程聚合画像。
必要时可展开查看某个学生在该课程下的画像详情。
不默认展示学生其他课程画像。
```

## 4. 主要数据实体关系

```text
users
  ├─ student
  └─ teacher

administrative_classes
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
  └─ submissions / diagnoses / hints

learner_events
  ├─ learner_profile_snapshots
  ├─ learner_knowledge_states
  ├─ learner_error_stats
  └─ recommendations
```

## 5. 核心表设计

### 5.1 users

用户表，保存学生和教师。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String | 用户 ID |
| display_name | String | 显示名称 |
| role | String | `STUDENT` / `TEACHER` |
| status | String | `ACTIVE` / `DISABLED` |
| created_at | DateTime | 创建时间 |

### 5.2 administrative_classes

行政班表，表示学校真实班级。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String | 行政班 ID |
| name | String | 班级名称，例如“软件工程 1 班” |
| grade | String | 年级，例如 `2026` |
| major_name | String | 专业名称，例如“软件工程” |
| status | String | `ACTIVE` / `ARCHIVED` |
| created_at | DateTime | 创建时间 |

说明：行政班不是教师个人创建的班级，也不是单门课程班。

### 5.3 student_class_memberships

学生行政班归属表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | Integer | 自增主键 |
| class_id | String | 行政班 ID |
| student_id | String | 学生 ID |
| status | String | `ACTIVE` / `TRANSFERRED` |
| joined_at | DateTime | 加入时间 |

第一版约束：

```text
同一学生只允许一个 ACTIVE 行政班。
```

### 5.4 courses

课程表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String | 课程 ID |
| name | String | 课程名称 |
| description | Text | 课程说明 |
| term | String | 学期 |
| status | String | `ACTIVE` / `ARCHIVED` |

说明：课程本身不建议强绑定单个教师，教师关系通过教学安排表表达。

### 5.5 teaching_assignments

教学安排表，表示“哪个老师教哪个行政班的哪门课”。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String | 教学安排 ID |
| class_id | String | 行政班 ID |
| course_id | String | 课程 ID |
| teacher_id | String | 教师 ID |
| term | String | 学期 |
| status | String | `ACTIVE` / `ARCHIVED` |
| created_at | DateTime | 创建时间 |

示例：

```text
王老师 -> 软件工程 1 班 -> 数据结构与程序设计基础
李老师 -> 软件工程 1 班 -> 计算机网络
王老师 -> 计科 1 班 -> 数据结构与程序设计基础
```

教师端所有数据权限都应该从 `teaching_assignments` 开始过滤。

### 5.6 tasks

任务本体表，保存任务内容。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String | 任务 ID |
| course_id | String | 所属课程 ID |
| title | String | 任务标题 |
| description | Text | 任务说明 |
| task_type | String | `CODING` / `QUIZ` / `PRACTICE` |
| language | String | 编程语言，例如 `CPP` |
| difficulty | String | `BASIC` / `MEDIUM` / `HARD` |
| interface_spec | Text | 编程接口说明 |
| learning_objectives | Text | JSON 字符串 |
| knowledge_points | Text | JSON 字符串 |
| status | String | `DRAFT` / `ACTIVE` / `ARCHIVED` |
| created_by | String | 创建教师 ID |
| created_at | DateTime | 创建时间 |

### 5.7 task_assignments

任务下发表，表示任务发布给哪个教学安排。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String | 下发 ID |
| task_id | String | 任务 ID |
| teaching_assignment_id | String | 教学安排 ID |
| published_by | String | 发布教师 ID |
| publish_status | String | `DRAFT` / `PUBLISHED` / `CLOSED` |
| assignment_mode | String | `PRACTICE` / `EXAM` |
| allow_hint_level_3 | Boolean | 是否允许三级提示 |
| published_at | DateTime | 发布时间 |
| deadline | DateTime | 截止时间 |

说明：学生端任务列表应该从 `task_assignments` 出发，而不是只查 `tasks`。

### 5.8 student_task_progress

学生任务进度表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | Integer | 自增主键 |
| assignment_id | String | 任务下发 ID |
| student_id | String | 学生 ID |
| status | String | `NOT_STARTED` / `IN_PROGRESS` / `SUBMITTED` / `NEEDS_REVISION` / `COMPLETED` / `EXPIRED` |
| latest_submission_id | String | 最近提交 ID |
| latest_version_id | String | 最近版本 ID |
| passed_count | Integer | 通过测试数量 |
| total_required_count | Integer | 必要测试数量 |
| highest_hint_level | Integer | 最高已查看提示层级 |
| score | Float | 分数，可为空 |
| started_at | DateTime | 开始时间 |
| last_submitted_at | DateTime | 最近提交时间 |
| completed_at | DateTime | 完成时间 |
| updated_at | DateTime | 更新时间 |

## 6. 学习画像数据设计

画像不建议做成一张巨大宽表，而是采用：

```text
学习事件明细 + 画像聚合快照
```

底层保留证据，页面展示聚合结果。

### 6.1 learner_events

学习事件表，记录画像更新依据。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String | 事件 ID |
| student_id | String | 学生 ID |
| course_id | String | 课程 ID |
| class_id | String | 行政班 ID |
| teaching_assignment_id | String | 教学安排 ID，可为空 |
| assignment_id | String | 任务下发 ID，可为空 |
| task_id | String | 任务 ID，可为空 |
| event_type | String | 事件类型 |
| knowledge_points | Text | JSON 字符串 |
| error_type | String | 错因类型，可为空 |
| payload | Text | JSON 字符串 |
| created_at | DateTime | 发生时间 |

事件类型示例：

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

### 6.2 learner_profile_snapshots

课程级画像快照表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String | 快照 ID |
| student_id | String | 学生 ID |
| course_id | String | 课程 ID |
| class_id | String | 行政班 ID |
| summary_text | Text | 画像摘要 |
| overall_progress | Float | 总体进度 0-100 |
| hint_dependency_level | String | `LOW` / `MEDIUM` / `HIGH` |
| compile_error_rate | Float | 编译错误比例 |
| logic_error_rate | Float | 逻辑错误比例 |
| recent_task_completion | Float | 近期任务完成率 |
| recommendation_text | Text | 推荐下一步 |
| updated_at | DateTime | 更新时间 |

唯一约束建议：

```text
student_id + course_id
```

### 6.3 learner_knowledge_states

知识点掌握状态表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | Integer | 自增主键 |
| student_id | String | 学生 ID |
| course_id | String | 课程 ID |
| knowledge_point | String | 知识点 |
| mastery_score | Float | 掌握度 0-100 |
| state | String | `STRONG` / `STABLE` / `WEAK` |
| evidence_count | Integer | 证据数量 |
| last_evidence | Text | 最近依据 |
| updated_at | DateTime | 更新时间 |

### 6.4 learner_error_stats

错因统计表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | Integer | 自增主键 |
| student_id | String | 学生 ID |
| course_id | String | 课程 ID |
| error_type | String | 错因编码 |
| label | String | 展示名称 |
| count | Integer | 出现次数 |
| severity | String | `LOW` / `MEDIUM` / `HIGH` |
| related_knowledge_points | Text | JSON 字符串 |
| updated_at | DateTime | 更新时间 |

### 6.5 recommendations

推荐下一步表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String | 推荐 ID |
| student_id | String | 学生 ID |
| course_id | String | 课程 ID |
| recommendation_type | String | `TASK` / `REVIEW` / `SELF_STUDY` / `ARTIFACT` |
| title | String | 推荐标题 |
| reason | Text | 推荐原因 |
| priority | Integer | 优先级 |
| related_task_id | String | 关联任务，可为空 |
| related_knowledge_points | Text | JSON 字符串 |
| suggested_action | String | 建议动作 |
| status | String | `ACTIVE` / `DONE` / `DISMISSED` |
| created_at | DateTime | 创建时间 |

## 7. 教师端共享视图

教师端不建议直接把所有学生画像明细铺出来，而是分两层：

### 7.1 班级课程总览

教师进入某个教学安排后，默认看到：

```text
班级名称
课程名称
任课教师
学生人数
任务总数
任务完成率
平均总体进度
薄弱知识点 Top 5
高频错因 Top 5
风险学生 Top 10
最近任务提交情况
```

### 7.2 单个学生课程画像

教师点击某个学生后，只查看该学生在当前课程下的画像：

```text
学生基础信息
当前课程进度
知识点掌握
薄弱项诊断
高频错因
提示依赖程度
最近任务提交
推荐干预动作
```

教师端不默认展示：

```text
该学生其他课程画像
该学生非本课程自学细节
该学生跨课程综合评价标签
```

## 8. 建议接口设计

### 8.1 学生端接口

获取学生当前班级和课程：

```http
GET /api/v1/student/learning-context
```

获取学生课程任务：

```http
GET /api/v1/student/tasks?course_id=course_ds_001
```

获取学生课程画像：

```http
GET /api/v1/student/profile?course_id=course_ds_001
```

### 8.2 教师端接口

获取教师负责的教学安排：

```http
GET /api/v1/teacher/teaching-assignments
```

返回示例：

```json
[
  {
    "teaching_assignment_id": "ta_se1_ds",
    "class_id": "class_se_001",
    "class_name": "软件工程 1 班",
    "course_id": "course_ds_001",
    "course_name": "数据结构与程序设计基础",
    "teacher_id": "user_teacher_ds_001",
    "teacher_name": "王老师",
    "student_count": 42,
    "task_count": 3
  }
]
```

获取班级课程画像总览：

```http
GET /api/v1/teacher/teaching-assignments/{teaching_assignment_id}/profile-overview
```

返回示例：

```json
{
  "teaching_assignment_id": "ta_se1_ds",
  "class_name": "软件工程 1 班",
  "course_name": "数据结构与程序设计基础",
  "teacher_name": "王老师",
  "student_count": 42,
  "task_completion_rate": 0.76,
  "average_progress": 68,
  "weak_points": [
    {
      "knowledge_point": "链表边界处理",
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

获取单个学生在当前课程下的画像：

```http
GET /api/v1/teacher/teaching-assignments/{teaching_assignment_id}/students/{student_id}/profile
```

说明：该接口必须校验 `teacher_id -> teaching_assignment_id` 权限，不能仅靠 `student_id` 查询。

教师下发任务：

```http
POST /api/v1/teacher/task-assignments
```

请求示例：

```json
{
  "task_id": "task_linked_list_delete_001",
  "teaching_assignment_id": "ta_se1_ds",
  "assignment_mode": "PRACTICE",
  "allow_hint_level_3": true,
  "deadline": "2026-08-05T23:59:00"
}
```

## 9. 前端展示口径

### 9.1 学生端班级任务页

页面标题可以继续叫“班级任务”，但内部逻辑应该是：

```text
当前行政班：软件工程 1 班
课程筛选：全部课程 / 数据结构 / 计算机网络 / 计算机组成原理
任务列表：跟随课程切换
任务来源：教师基于教学安排下发
```

任务卡建议展示：

```text
任务标题
课程名称
发布教师
任务类型
知识点
难度
截止时间
学生进度状态
最近一次提交摘要
进入任务按钮
```

### 9.2 学生端学习画像页

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

### 9.3 教师端画像页

教师端建议优先展示聚合视图：

```text
我负责的班级课程
班级课程总览
任务完成趋势
薄弱知识点 Top 5
高频错因 Top 5
需要关注的学生
任务下发与干预建议
```

只有在教师主动点开学生时，再展示单个学生在当前课程下的画像详情。

## 10. SQLite 阶段落地说明

第一版继续使用 SQLite 是可以的，原因：

- 当前阶段主要验证数据关系、接口契约和前端响应。
- 演示数据量较小，SQLite 足够支撑。
- 项目已有 SQLAlchemy 和 Alembic，后续迁移成本可控。
- JSON 类字段可以先用 `Text` 保存，业务层用 `json.dumps` / `json.loads` 转换。

后续如果迁移 PostgreSQL，可以把部分 `Text` 字段升级为 JSON 类型，并增加聚合视图或物化视图。

优先索引建议：

```text
student_class_memberships.student_id
teaching_assignments.teacher_id
teaching_assignments.class_id
teaching_assignments.course_id
task_assignments.teaching_assignment_id
student_task_progress.assignment_id
student_task_progress.student_id
learner_profile_snapshots.student_id + course_id
learner_knowledge_states.student_id + course_id
learner_error_stats.student_id + course_id
```

## 11. 第一版模拟数据建议

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
  王老师 -> 软件工程 1 班 -> 数据结构与程序设计基础
  李老师 -> 软件工程 1 班 -> 计算机网络
  王老师 -> 计科 1 班 -> 数据结构与程序设计基础

任务：
  数据结构：单链表指定位置节点删除
  数据结构：栈实现括号匹配
  数据结构：二叉树前序遍历
  计算机网络：IP 地址与子网划分练习

学生画像：
  王同学 + 数据结构：链表边界处理薄弱
  王同学 + 计算机网络：子网划分需要复习
```

## 12. 共享边界与文案注意

教师端画像是教学辅助数据，不是学生评价标签。

建议文案：

```text
需要关注
建议复盘
提示依赖偏高
近期完成率偏低
薄弱知识点
```

不建议文案：

```text
差生
能力不足
学习态度差
问题学生
排名垫底
```

教师端应该提供“下一步教学动作”，例如：

```text
给该学生推荐链表边界专项练习
提醒复盘最近一次失败提交
在课堂中补充讲解头节点处理
给全班发布一次错因讲解
```

## 13. 最终推荐方案

第一版推荐采用：

```text
行政班固定
课程可切换
教师通过教学安排关联班级和课程
任务通过教学安排下发
学生进度通过任务下发表记录
学习画像按 student_id + course_id 聚合
教师端只看自己负责的 teaching_assignment 范围
```

这样既能满足学生端“切换课程后任务和画像变化”的响应，也能让教师端共享到足够有用的数据，同时避免教师看到不属于自己课程范围的学生隐私数据。
