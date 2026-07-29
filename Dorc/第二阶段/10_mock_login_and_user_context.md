# Mock 登录与用户上下文设计

> 状态更新：本文件记录从“模拟用户切换”到“用户上下文绑定”的过渡设计。后续系统登录以 `11_auth_login_design.md` 为准；前端不再使用模拟用户切换作为正式身份来源。

## 1. 目标

本阶段先实现“演示登录 / 学生上下文切换”，用于验证学生端助学数据是否已经按用户绑定。

它不是正式认证系统，暂不实现密码、验证码、JWT、刷新令牌、权限后台和账号管理。

第一版目标是：

```text
选择模拟学生
-> 前端记录 currentStudentId
-> API 请求携带 X-Demo-User-Id
-> 后端按当前学生读取行政班、课程、任务、画像
-> 页面实时刷新
```

## 2. 模拟用户

第一版固定两个学生：

| 用户 ID | 展示名 | 行政班 | 演示特征 |
| --- | --- | --- | --- |
| `user_student_001` | 王同学 | 软件工程 1 班 | 数据结构任务进行中，链表边界处理薄弱 |
| `user_student_002` | 刘同学 | 计科 1 班 | 数据结构任务已进入修正，二叉树递归和栈匹配需要巩固 |

后续正式登录接入时，可以保留这些用户作为 seed/demo 数据。

## 3. 数据绑定口径

学生端所有核心数据都从当前学生派生：

```text
currentStudentId
-> student_class_memberships
-> classes
-> teaching_assignments
-> courses
-> task_assignments
-> student_task_progress
-> learner_profile_snapshots
-> learner_knowledge_states
-> learner_error_stats
-> recommendations
```

关键规则：

- 学生第一版只有一个 `ACTIVE` 行政班。
- 学生不主动切换行政班。
- 课程来自学生行政班的教学安排。
- 任务列表从 `task_assignments + student_task_progress` 得到。
- 学习画像按 `student_id + course_id` 聚合。
- 首页默认使用学生第一个可用课程的画像，后续可以增加课程切换。

## 4. 前端状态流

前端保留一个当前演示用户：

```text
currentUserId
-> learningContext
-> selectedCourseId
-> dashboard / tasks / profile / ai tutor / library
```

切换用户时必须：

- 更新顶部用户入口。
- 重新获取学习上下文。
- 重新获取课程任务列表。
- 重新获取课程画像。
- 让首页、班级任务、学习画像、AI 助学和资料展示跟随变化。

## 5. API 约定

演示登录通过请求头传递：

```http
X-Demo-User-Id: user_student_001
```

核心接口：

```http
GET /api/v1/student/learning-context
GET /api/v1/student/tasks?course_id=course_ds_001
GET /api/v1/student/profile?course_id=course_ds_001
```

提交代码、查看执行结果、诊断、提示等学生链路同样使用当前 `X-Demo-User-Id`。

## 6. 验收标准

切换到王同学时，应看到：

- 当前班级为软件工程 1 班。
- 数据结构和计算机网络课程可见。
- 单链表任务处于进行中。
- 画像提示链表边界处理薄弱。

切换到刘同学时，应看到：

- 当前班级为计科 1 班。
- 数据结构课程可见。
- 任务进度、薄弱点和推荐内容与王同学不同。
- AI 助学上下文显示已结合刘同学画像。
