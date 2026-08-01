# CodeTrack 教师端迁移到学生端项目执行清单（AI 可直接执行版）

> **目标**：把 `XinSaiChuangYi` 中已经开发的教师端前端，迁移到现有学生端项目 `CodeTrack` 中。  
> **最终形态**：同一个前端、同一个后端、同一个登录页，根据账号角色自动进入学生端或教师端。  
> **迁移原则**：以学生端 `CodeTrack` 的工程结构、UI 风格、认证方式、API 返回格式、数据模型和现有功能为唯一基准；教师端代码只作为页面功能和交互参考，不允许整仓覆盖。

---

# 一、迁移结论

## 1.1 可以迁移

- [x] 教师工作台页面结构
- [x] 课程列表页面
- [x] 课程工作区页面
- [x] 任务创建表单
- [x] 任务监控页面结构
- [x] 批改工作区页面结构
- [x] 学情诊断页面
- [x] 班级学情图表
- [x] 学生个体诊断页面
- [x] 预警中心页面
- [x] Ant Design 表格、卡片、表单和标签交互
- [x] 教师页面之间的路由关系
- [x] 教师端页面中的筛选、分页、加载、空状态设计

## 1.2 不能直接迁移，必须改造

- [ ] 教师端独立 `App.tsx`
- [ ] 教师端独立 `BrowserRouter`
- [ ] 教师端 `MainLayout.tsx`
- [ ] 教师端 `index.css`
- [ ] 教师端 Axios 请求层
- [ ] 教师端本地 Token 名称
- [ ] 教师端数字型 ID 类型
- [ ] 教师端小写角色和状态枚举
- [ ] 教师端写死的课程、学生、任务和成绩数据
- [ ] 教师端独立后端 API 契约
- [ ] 教师端独立数据库模型和 Alembic 迁移

## 1.3 暂不迁移

- [ ] `Frame` 目录中的教学改进扩展页面整包
- [ ] 自动发布成绩
- [ ] 完整教师评分系统
- [ ] 完整课程大纲增删改
- [ ] 完整资料上传和文档解析
- [ ] 抄袭自动认定
- [ ] 任意编程题通用判题
- [ ] 教师端独立后台和独立数据库

这些功能可以保留页面参考，但在学生端项目没有对应数据结构或后端接口前，不得伪装成真实功能。

---

# 二、两个压缩包的使用优先级

## 2.1 目标项目

迁移后的唯一项目：

```text
CodeTrack/
├── backend/
├── frontend/
├── sandbox/
├── tests/
└── ...
```

以下内容必须以 `CodeTrack` 为准：

- UI 视觉
- 登录认证
- Token 存储
- API 请求封装
- FastAPI 后端
- SQLAlchemy 模型
- 课程、班级、任务和提交数据
- 沙箱执行
- AI 诊断
- 学习画像
- 测试和构建命令

## 2.2 教师端主参考目录

优先使用：

```text
XinSaiChuangYi/frontend/src/
```

其中包括：

```text
App.tsx
components/MainLayout.tsx
pages/teacher/Dashboard.tsx
pages/teacher/CourseList.tsx
pages/teacher/CourseWorkspace.tsx
pages/teacher/TaskCreate.tsx
pages/teacher/TaskMonitor.tsx
pages/teacher/GradingWorkspace.tsx
pages/teacher/DiagnosisSummary.tsx
pages/teacher/diagnosis/AlertCenter.tsx
pages/teacher/diagnosis/ClassOverview.tsx
pages/teacher/diagnosis/StudentDiagnosis.tsx
services/api.ts
services/diagnosisApi.ts
types/index.ts
types/diagnosis.ts
```

该顶层教师前端可以通过 TypeScript 检查，可作为本次迁移的主来源。

## 2.3 `Frame` 目录的处理方式

目录：

```text
XinSaiChuangYi/Frame/frontend/src/
```

只作为以下内容的后续参考：

- 教学改进看板
- 教学建议详情
- 效果对比
- 多班级对比
- A/B 教学方案
- 阶段总结
- 学期总结

不得整包复制，原因：

- 当前存在 TypeScript 编译错误
- 含有大量硬编码班级、任务和知识点
- 含有大量 Mock 数据
- 接口与学生端后端不一致
- 会引入重复布局、重复请求层和重复类型

---

# 三、迁移总原则

执行迁移的 AI 必须遵守以下规则。

## 3.1 不合并两个仓库

禁止：

```text
把 XinSaiChuangYi/backend 覆盖到 CodeTrack/backend
把 XinSaiChuangYi/frontend 覆盖到 CodeTrack/frontend
把两个 package.json 直接合并
把两个 App.tsx 直接拼接
```

正确方式：

```text
以 CodeTrack 为主项目
→ 在 CodeTrack/frontend/src 下新增教师端目录
→ 逐页迁移教师页面
→ 改写请求和类型
→ 接入 CodeTrack 现有后端
```

## 3.2 学生端已有功能不得回归

迁移后必须继续可用：

- 学生登录
- 学习首页
- 班级任务
- 编程工作台
- 客观题工作台
- 自主学习
- AI 导师
- 收藏夹
- 学习画像
- 沙箱执行
- AI 诊断
- 分层提示

不得为了接入教师端重写或删除现有学生页面。

## 3.3 同一套数据

教师端必须读取学生端现有数据：

```text
教师看到的 Task
= 学生看到的 Task

教师看到的 Submission
= 学生真实提交的 Submission

教师看到的测试结果
= 沙箱真实产生的 TestResult

教师看到的 AI 诊断
= 学生端使用的 Diagnosis

教师看到的学习画像
= 学生端同一套 LearnerProfile 数据
```

禁止在教师端再次创建静态演示数据代替真实数据。

---

# 四、最终目标目录

建议迁移后形成以下前端结构：

```text
CodeTrack/frontend/src/
├── App.tsx
├── main.tsx
├── api.ts
├── authSession.ts
├── styles.css
├── pages/
│   ├── LearningHome.tsx
│   ├── CourseTasks.tsx
│   ├── TaskWorkspace.tsx
│   ├── QuestionWorkspace.tsx
│   ├── SelfStudy.tsx
│   ├── AiTutor.tsx
│   ├── LearningLibrary.tsx
│   ├── LearningProfile.tsx
│   └── LoginPage.tsx
└── teacher/
    ├── TeacherAppContent.tsx
    ├── teacherRoutes.tsx
    ├── teacherTypes.ts
    ├── teacherApi.ts
    ├── components/
    │   ├── TeacherLayout.tsx
    │   ├── TeacherPageHeader.tsx
    │   ├── TeacherEmptyState.tsx
    │   └── TeacherStatusTag.tsx
    └── pages/
        ├── Dashboard.tsx
        ├── CourseList.tsx
        ├── CourseWorkspace.tsx
        ├── TaskCreate.tsx
        ├── TaskMonitor.tsx
        ├── GradingWorkspace.tsx
        ├── DiagnosisSummary.tsx
        └── diagnosis/
            ├── AlertCenter.tsx
            ├── ClassOverview.tsx
            └── StudentDiagnosis.tsx
```

也可以使用 `pages/teacher/`，但整个项目必须只保留一种教师页面目录，不得同时存在：

```text
src/teacher/pages/
src/pages/teacher/
```

本文默认使用：

```text
src/teacher/pages/
```

---

# 五、统一登录和角色分流

## 5.1 当前学生端已经具备的认证能力

现有后端已经提供：

```text
POST /api/v1/auth/login
GET  /api/v1/auth/me
POST /api/v1/auth/logout
```

登录响应中已经包含：

```json
{
  "user": {
    "id": "user_teacher_001",
    "username": "teacher_wang",
    "display_name": "王老师",
    "role": "TEACHER"
  }
}
```

当前种子账号已经包含：

```text
学生：
wang / codetrack123
liu / codetrack123

教师：
teacher_wang / codetrack123
teacher_li / codetrack123
```

因此不需要重新开发教师登录接口，也不需要让用户手动选择“教师登录”或“学生登录”。

正确逻辑：

```text
输入账号和密码
→ 后端验证账号
→ 后端返回角色
→ 前端按照角色自动分流
```

## 5.2 修改 `LoginPage.tsx`

原文字：

```text
登录学生助学系统
```

修改为：

```text
登录 CodeTrack 教学与助学平台
```

原说明：

```text
系统会按登录身份加载班级、课程任务和学习画像。
```

修改为：

```text
系统将根据账号角色自动进入学生端或教师端。
```

演示账号增加：

```text
王同学 / wang
刘同学 / liu
王老师 / teacher_wang
李老师 / teacher_li
```

不要增加角色下拉框。账号角色由后端决定，避免伪造角色。

## 5.3 修改 `App.tsx`

当前问题：

```text
只要 authUser 存在
→ 所有角色都进入 AppContent
→ 教师也进入学生端
```

必须拆分为：

```text
StudentAppContent
TeacherAppContent
```

角色首页函数：

```tsx
function homePathForRole(role: string) {
  if (role === "TEACHER") return "/teacher/dashboard";
  if (role === "STUDENT") return "/";
  return "/unauthorized";
}
```

推荐路由结构：

```tsx
<Routes>
  <Route
    path="/login"
    element={
      authUser
        ? <Navigate to={homePathForRole(authUser.role)} replace />
        : <LoginPage onLogin={setAuthUser} />
    }
  />

  <Route
    path="/teacher/*"
    element={
      authUser?.role === "TEACHER"
        ? <TeacherAppContent authUser={authUser} onLogout={handleLogout} />
        : <Navigate to={authUser ? homePathForRole(authUser.role) : "/login"} replace />
    }
  />

  <Route
    path="/*"
    element={
      authUser?.role === "STUDENT"
        ? <StudentAppContent authUser={authUser} onLogout={handleLogout} />
        : <Navigate to={authUser ? homePathForRole(authUser.role) : "/login"} replace />
    }
  />
</Routes>
```

## 5.4 角色恢复

页面刷新时现有代码会调用：

```text
GET /api/v1/auth/me
```

恢复登录后也必须执行角色分流：

```text
STUDENT → 当前学生路由
TEACHER → /teacher/dashboard
```

## 5.5 路由保护

必须验证：

- [ ] 学生访问 `/teacher/dashboard` 时被跳回学生端
- [ ] 教师访问 `/tasks` 时被跳到教师首页
- [ ] 未登录用户访问任意页面时跳到 `/login`
- [ ] 后端教师接口继续校验 `require_role(user, "TEACHER")`
- [ ] 不能只依靠前端隐藏菜单实现权限

---

# 六、教师端 UI 迁移规范

## 6.1 学生端 UI 是唯一视觉基准

教师端必须复用学生端现有视觉：

- 深蓝色顶部栏
- CodeTrack Logo
- 白色左侧导航
- 蓝色选中状态
- 浅灰页面背景
- 8px 基础圆角
- 克制的卡片边框和阴影
- 相同字体
- 相同按钮风格
- 相同状态标签
- 相同加载和空状态

主要复用的现有 CSS：

```text
.replica-shell
.replica-topbar
.logo-link
.ct-brand-mark
.ct-brand-word
.top-actions
.top-user
.authed-user
.logout-btn
.replica-app
.replica-sidebar
.replica-side-nav
.side-link
.side-link.active
.side-icon
.collapse-btn
.app-content
.page-grid
.page-lead
.empty-panel
```

## 6.2 不复制教师端原布局

禁止直接复制：

```text
XinSaiChuangYi/frontend/src/components/MainLayout.tsx
```

原因：

- 使用 Ant Design 黑色 `Sider`
- 与学生端品牌风格不同
- 内部写死“教师用户”
- 退出登录只是 `console.log`
- 导航中存在没有路由的“通知”和“个人设置”
- 会形成第二套布局

正确方式：

```text
参考教师 MainLayout 的菜单内容
→ 使用学生端 replica-shell 重新实现 TeacherLayout
```

## 6.3 教师端导航建议

第一版只展示已经有页面的入口：

```text
教师首页      /teacher/dashboard
我的课程      /teacher/courses
学情诊断      /teacher/diagnosis
```

课程、任务监控和批改详情通过页面内部跳转进入。

暂不展示没有真实页面的入口：

```text
通知
个人设置
```

以后完成页面后再加入导航，不允许点击后进入空白路由。

## 6.4 教师顶部栏

必须显示真实登录用户：

```tsx
<strong>{authUser.display_name}</strong>
<small>教师账号</small>
```

退出登录复用学生端：

```text
api.logout()
apiCache.clear()
clearAccessToken()
```

不要使用教师端原代码中的：

```text
console.log("Logout")
```

---

# 七、依赖处理

## 7.1 保留学生端现有版本

禁止降级或覆盖：

- React
- React Router
- Ant Design
- Vite
- TypeScript
- lucide-react

## 7.2 图标

教师端大量使用：

```text
@ant-design/icons
```

学生端已使用：

```text
lucide-react
```

推荐全部替换为 `lucide-react`，例如：

| 原图标 | 替换图标 |
|---|---|
| DashboardOutlined | LayoutDashboard |
| BookOutlined | BookOpen |
| TeamOutlined | Users |
| FileTextOutlined | FileText |
| BarChartOutlined | ChartNoAxesColumnIncreasing |
| SettingOutlined | Settings |
| PlusOutlined | Plus |
| SearchOutlined | Search |
| EyeOutlined | Eye |
| CheckCircleOutlined | CircleCheck |
| ClockCircleOutlined | Clock |
| SaveOutlined | Save |
| DeleteOutlined | Trash2 |

不建议只为教师端新增一套图标库。

## 7.3 请求库

禁止迁移：

```text
axios
XinSaiChuangYi/frontend/src/services/api.ts
```

统一使用学生端现有：

```text
CodeTrack/frontend/src/api.ts
fetch
authHeaders()
request<T>()
```

## 7.4 图表库

> **实际实现偏离本节（2026-08-01，学情诊断落地时）**
>
> 教师学情诊断页最终**没有引入 `recharts`**，而是沿用学生端的内联 SVG 方案：
> 雷达图抽成 `frontend/src/teacher/components/RadarChart.tsx`（按维度数真实计算顶点，
> 复用 `.profile-radar` 样式），成绩趋势用 `.line-chart`，热力图和错误分布用
> CSS grid / flex（`.diagnosis-heatmap`、`.diagnosis-error-bars`）。
>
> 原因：本节的目标是"控件样式贴合学生端"，而学生端全站零图表依赖、所有图都是内联
> SVG + `styles.css` 类。引入 recharts 反而要手动改配色去贴合，且 recharts 没有原生
> 热力图。当前方案视觉与学生端完全一致，也不增加依赖。
>
> 后续若有交互需求（tooltip、缩放、图例联动）再评估引入图表库，届时**仍只能引入一个**。

原始约定（保留作为历史参考）：教师诊断页面使用 `recharts`。

学生端目前没有该依赖。迁移诊断图表时可以新增：

```text
recharts
```

不要同时再引入 ECharts、Chart.js 或其他图表库。

## 7.5 不需要新增

本次核心教师页面不需要：

```text
dayjs
axios
@ant-design/icons
```

---

# 八、统一 API 请求层

## 8.1 Token

学生端 Token 键为：

```text
codetrack.accessToken
```

教师原代码使用：

```text
token
```

迁移后只能使用：

```text
codetrack.accessToken
```

不得保留两套 Token。

## 8.2 响应格式

学生端统一格式：

```json
{
  "data": {},
  "meta": {
    "request_id": "..."
  }
}
```

学生端 `request<T>()` 已经自动返回：

```text
body.data
```

教师原项目的格式：

```json
{
  "success": true,
  "message": "操作成功",
  "data": {}
}
```

不得迁入目标项目。

## 8.3 类型 ID

学生端 ID 是字符串：

```ts
id: string
course_id: string
task_id: string
student_id: string
```

教师原类型大量使用：

```ts
id: number
course_id: number
student_id: number
```

迁移时全部改为字符串，不得用：

```ts
Number(courseId)
parseInt(courseId)
```

除非某个字段本身确实是数字统计值。

## 8.4 角色

目标项目使用：

```text
STUDENT
TEACHER
ADMIN
```

不得迁入：

```text
student
teacher
admin
teaching_assistant
```

## 8.5 新建教师 API 文件

可以新增：

```text
frontend/src/teacher/teacherApi.ts
```

但该文件必须复用学生端 `request` 能力。

更简单的方式是在现有 `api.ts` 中增加教师方法。

推荐方法：

```ts
getTeacherContext()
getTeacherDashboard(teachingAssignmentId)
listTeacherCourses()
getTeacherCourse(courseId)
getTeacherCourseStudents(teachingAssignmentId)
getTeacherCourseTasks(teachingAssignmentId)
createTeacherTask(courseId, payload)
getTaskMonitor(taskId)
getTeacherSubmission(submissionId)
getTeacherTimeline(submissionId)
getClassAnalytics(params)
getStudentAnalytics(params)
getTeacherAlerts(params)
```

不得继续保留两个不同的请求封装。

---

# 九、现有后端可以立即复用的能力

## 9.1 登录和角色

可以直接复用：

```text
POST /api/v1/auth/login
GET  /api/v1/auth/me
POST /api/v1/auth/logout
```

## 9.2 教师提交列表

现有接口：

```text
GET /api/v1/teacher/courses/{course_id}/submissions
```

可用于：

- 教师查看课程提交
- 任务监控初版
- 学生提交列表
- 最新诊断类型
- 提示等级
- 提交版本数量

## 9.3 提交时间线

现有接口：

```text
GET /api/v1/teacher/submissions/{submission_id}/timeline
```

可用于：

- 学生提交详情
- 版本时间线
- 执行结果时间线
- AI 诊断时间线
- 提示查看记录
- 能力证据记录

## 9.4 提交版本和结果

现有版本接口已经允许教师在所属课程范围内查看：

- 提交版本
- 执行结果
- 测试结果
- AI 诊断

迁移批改页时优先复用现有版本接口，不重新创建教师专用执行器。

---

# 十、必须修正的现有前端问题

学生端 `api.ts` 当前存在：

```ts
listTeacherSubmissions: () =>
  request<TeacherSubmission[]>(
    "/api/v1/teacher/courses/course_ds_001/submissions"
  )
```

这里写死了：

```text
course_ds_001
```

必须改为：

```ts
listTeacherSubmissions: (courseId: string) =>
  request<TeacherSubmission[]>(
    `/api/v1/teacher/courses/${encodeURIComponent(courseId)}/submissions`
  )
```

禁止教师页面写死：

- `course_ds_001`
- `task-001`
- `class-1`
- `student-001`
- 数字课程 ID
- 固定教师姓名
- 固定学生名单

---

# 十一、页面逐项迁移清单

---

## 11.1 教师工作台 Dashboard

### 来源

```text
XinSaiChuangYi/frontend/src/pages/teacher/Dashboard.tsx
```

### 目标

```text
CodeTrack/frontend/src/teacher/pages/Dashboard.tsx
```

### 可迁移

- [x] 统计卡片布局
- [x] 最近任务表格
- [x] 学情概览区域
- [x] 待办事项区域
- [x] 查看任务详情跳转

### 必须删除

- [ ] 写死的课程数量 `5`
- [ ] 写死的学生数量 `128`
- [ ] 写死的待批改数量
- [ ] 写死的任务列表
- [ ] 2024 年的截止时间
- [ ] “图表将在此处显示”静态占位

### 改造要求

第一版若后端没有完整首页聚合接口：

- 使用真实课程提交列表计算可计算的指标
- 无法计算的区域显示“暂未接入”
- 不得显示虚假数字

建议后端新增：

```text
GET /api/v1/teacher/dashboard
```

参数：

```text
teaching_assignment_id
```

### 验收

- [ ] 教师姓名来自登录用户
- [ ] 任务跳转使用真实字符串 ID
- [ ] 卡片点击可进入真实页面
- [ ] 无数据时显示空状态
- [ ] 页面视觉与学生首页同品牌

---

## 11.2 我的课程 CourseList

### 来源

```text
XinSaiChuangYi/frontend/src/pages/teacher/CourseList.tsx
```

### 目标

```text
CodeTrack/frontend/src/teacher/pages/CourseList.tsx
```

### 可迁移

- [x] 课程卡片
- [x] 课程搜索框
- [x] 状态筛选器
- [x] 课程详情跳转
- [x] 空状态

### 必须删除

- [ ] 数据结构、程序设计等写死课程
- [ ] 张教授、李教授、王教授
- [ ] 写死学生人数
- [ ] 写死任务数量
- [ ] 没有实现的“新建课程”按钮

### 改造要求

当前项目已有：

```text
Course
Enrollment
TeachingAssignment
```

建议新增：

```text
GET /api/v1/teacher/teaching-assignments
```

返回教师负责的：

- 课程
- 班级
- 学期
- 学生人数
- 任务数量

若暂时不开发课程创建：

- 隐藏“新建课程”
- 或显示禁用状态并说明由管理员配置
- 不允许按钮只执行 `console.log`

### 验收

- [ ] 王老师只看到自己负责的课程
- [ ] 李老师只看到自己负责的课程
- [ ] 点击课程进入真实字符串 `courseId`
- [ ] 搜索和筛选对真实数据生效

---

## 11.3 课程工作区 CourseWorkspace

### 来源

```text
XinSaiChuangYi/frontend/src/pages/teacher/CourseWorkspace.tsx
```

### 目标

```text
CodeTrack/frontend/src/teacher/pages/CourseWorkspace.tsx
```

### 可迁移

- [x] Tab 页面结构
- [x] 课程概览
- [x] 课程任务表格
- [x] 班级与学生名单表格
- [x] 课程大纲页面外壳
- [x] 教学资料页面外壳

### 当前可接真实数据

#### 课程概览

可使用：

- `Course`
- `TeachingAssignment`
- `AdministrativeClass`

#### 班级与花名册

可使用：

- `StudentClassMembership`
- `User`
- `AdministrativeClass`

#### 课程任务

可使用：

- `Task`
- `TaskAssignment`

### 当前不能完整接入

学生端项目当前没有完整：

- `Chapter`
- `KnowledgePoint`
- `Material`
- 资料文件上传
- 课程大纲 CRUD

处理方式：

```text
保留 Tab
→ 显示明确的空状态或待开发状态
→ 不保留教师原项目中的静态章节和学生
```

### 必须删除

- [ ] `张教授`
- [ ] `学生A、学生B、学生C`
- [ ] 固定章节
- [ ] 固定任务
- [ ] “添加学生”按钮

教师端不能负责行政班学生导入，除非后续明确增加管理员能力。

### 验收

- [ ] 课程标题来自真实接口
- [ ] 学生名单来自真实班级成员
- [ ] 任务来自学生端同一套任务数据
- [ ] 未实现 Tab 明确标注，不伪造数据
- [ ] 课程上下文切换后正确刷新

---

## 11.4 任务创建 TaskCreate

### 来源

```text
XinSaiChuangYi/frontend/src/pages/teacher/TaskCreate.tsx
```

### 目标

```text
CodeTrack/frontend/src/teacher/pages/TaskCreate.tsx
```

### 可迁移

- [x] 基本信息表单
- [x] 评分规则表格
- [x] 测试用例表格
- [x] 增加和删除行
- [x] 权重输入
- [x] 隐藏测试开关
- [x] 表单校验

### 当前问题

原页面提交逻辑只有：

```text
TODO
message.success
navigate
```

没有真实 API。

### 后端现状

当前项目已有：

- `Task`
- `TestCase`
- `Question`
- `QuestionOption`
- `TaskAssignment`

但没有完整教师 CRUD 接口。

### 迁移策略

第一阶段只允许：

- 创建草稿
- 创建客观题任务
- 复制现有模板化编程任务
- 配置现有判题模板支持的测试用例

禁止第一版支持任意 C++ 编程题。

### 必须增加的校验

- [ ] 评分权重总和为 100%
- [ ] 至少一个测试用例
- [ ] 隐藏测试不返回学生端
- [ ] 任务标题不能为空
- [ ] 任务知识点不能为空时才可发布
- [ ] 发布前验证参考答案
- [ ] 已发布任务核心内容不能直接覆盖

### 页面无法接后端时

可以迁移 UI，但：

- 保存按钮显示“暂未接入”
- 或只保存前端草稿状态
- 不得提示“任务创建成功”却没有写入数据库

---

## 11.5 任务监控 TaskMonitor

### 来源

```text
XinSaiChuangYi/frontend/src/pages/teacher/TaskMonitor.tsx
```

### 目标

```text
CodeTrack/frontend/src/teacher/pages/TaskMonitor.tsx
```

### 可迁移

- [x] 总人数卡片
- [x] 已提交卡片
- [x] 待提交卡片
- [x] 提交进度条
- [x] 学生提交表格
- [x] 状态标签
- [x] 查看详情
- [x] 批改入口

### 必须删除

- [ ] 学生A、学生B等静态名单
- [ ] 写死成绩
- [ ] 写死提交时间
- [ ] 数字提交 ID
- [ ] 固定 45 人

### 可立即使用的接口

```text
GET /api/v1/teacher/courses/{course_id}/submissions
```

第一版可以：

```text
加载课程提交
→ 按 task_id 过滤
→ 形成任务提交列表
```

后续建议新增：

```text
GET /api/v1/teacher/tasks/{task_id}/progress
```

用来准确返回：

- 班级总人数
- 未开始学生
- 进行中学生
- 已提交学生
- 已通过学生
- 逾期学生

只查询 Submission 无法完整统计“未开始学生”。

### 验收

- [ ] 表格使用真实学生提交
- [ ] 可进入真实提交详情
- [ ] 无提交时显示空状态
- [ ] 教师不能看到其他课程提交
- [ ] 不暴露其他教师班级数据

---

## 11.6 批改工作区 GradingWorkspace

### 来源

```text
XinSaiChuangYi/frontend/src/pages/teacher/GradingWorkspace.tsx
```

### 目标

```text
CodeTrack/frontend/src/teacher/pages/GradingWorkspace.tsx
```

### 可迁移

- [x] 左侧学生或版本列表
- [x] 中间代码查看区域
- [x] 测试结果区域
- [x] AI 诊断区域
- [x] 右侧评分和评语区域
- [x] 保存草稿和发布按钮布局

### 当前可接入

- 提交版本
- 源代码
- 编译结果
- 公开测试
- 隐藏测试
- AI 诊断
- 提示记录
- 时间线

### 当前不能真实接入

学生端后端目前没有完整：

- Grade 表
- TeacherFeedback 表
- 成绩发布流程
- 教师人工评分接口

### 第一阶段建议

将页面命名和功能调整为：

```text
提交详情与教师反馈
```

第一版先实现：

- 查看代码
- 查看测试
- 查看 AI 诊断
- 查看时间线
- 输入教师评语草稿

成绩发布按钮先隐藏，直到后端完成。

### 不得迁移

- [ ] 原教师项目的独立 Grade 后端
- [ ] 独立 Grade 表
- [ ] 数字型 Submission ID
- [ ] 假保存和假发布提示

### 验收

- [ ] 教师可查看学生真实代码
- [ ] 教师可查看完整隐藏测试
- [ ] 学生仍然不能看到隐藏测试
- [ ] 原始 AI 诊断不可被教师覆盖
- [ ] 未实现评分时不显示假成绩

---

## 11.7 学情诊断 DiagnosisSummary

### 来源

优先使用顶层真实接口版本：

```text
XinSaiChuangYi/frontend/src/pages/teacher/DiagnosisSummary.tsx
```

不要使用 `Frame` 中的静态统计版本。

### 目标

```text
CodeTrack/frontend/src/teacher/pages/DiagnosisSummary.tsx
```

### 可迁移

- [x] 课程选择
- [x] 班级选择
- [x] 任务选择
- [x] 学生选择
- [x] 班级总览 Tab
- [x] 学生诊断 Tab
- [x] 预警中心 Tab
- [x] 加载和错误状态

### 必须改造

教师原接口使用数字 ID：

```text
course_id: number
student_id: number
```

目标项目必须改为：

```text
course_id: string
student_id: string
```

教师原接口路径与目标后端不一致，不能直接使用原 `diagnosisApi.ts`。

### 后端建议

复用学生端画像计算逻辑，新增教师视角接口：

```text
GET /api/v1/teacher/diagnosis/options/courses
GET /api/v1/teacher/diagnosis/options/classes
GET /api/v1/teacher/diagnosis/options/students
GET /api/v1/teacher/diagnosis/options/tasks
GET /api/v1/teacher/analytics/class
GET /api/v1/teacher/analytics/student
```

教师端与学生端使用同一：

- `LearnerProfileSnapshot`
- `LearnerKnowledgeState`
- `LearnerErrorStat`
- `LearnerEvent`
- `CapabilityEvidence`
- `Submission`
- `Diagnosis`

### 验收

- [x] 选择项只显示当前教师的数据
- [x] 班级数据与学生个人数据口径一致
- [x] 真实零值和无数据明确区分
- [x] 不使用教师项目中的演示班级数据

> 落地说明（2026-08-01）：
> - 课程下拉改用 `/api/v1/teacher/teaching-assignments` 而不是 `/courses`。后者会把
>   「教师只是课程成员但没有教学安排」的课程也算进来，选中即 403，因为学情范围按
>   教学安排算（§15.1）。
> - 口径一致靠 `backend/app/services/learner_profile.py::serialize_learner_profile`
>   —— 学生端 `/student/profile` 和教师端 `/analytics/student` 调同一个函数，
>   `tests/test_teacher_diagnosis.py` 里有一条测试逐字段比对两端返回，防止漂移。
> - 零值与无数据：没有评分的任务 `avg_score` 返回 `null` 而不是 0；名册内没有画像的
>   学生不计入均值，并在页面常驻「N/M 名学生已有画像数据」提示。

---

## 11.8 班级学情 ClassOverview

### 来源

```text
XinSaiChuangYi/frontend/src/pages/teacher/diagnosis/ClassOverview.tsx
```

### 目标

```text
CodeTrack/frontend/src/teacher/pages/diagnosis/ClassOverview.tsx
```

### 可迁移

- [x] 学生人数统计
- [x] 提交率
- [x] 平均分
- [x] 通过率
- [x] 能力维度
- [x] 知识点热力图
- [x] 错误分布图
- [x] 成绩趋势图
- [x] 数据充分性提示

### 依赖

需要新增：

```text
recharts
```

### 改造要求

- 所有图表数据必须来自接口
- 无数据时显示 Empty
- 不使用随机数
- 不使用固定演示数据
- 图表颜色调整为学生端蓝色体系
- 图表容器使用学生端卡片边框和圆角

---

## 11.9 学生个体诊断 StudentDiagnosis

### 来源

```text
XinSaiChuangYi/frontend/src/pages/teacher/diagnosis/StudentDiagnosis.tsx
```

### 目标

```text
CodeTrack/frontend/src/teacher/pages/diagnosis/StudentDiagnosis.tsx
```

### 可迁移

- [x] 学生能力雷达图
- [x] 成绩历史
- [x] 知识短板
- [x] 提示使用分析
- [x] 行为轨迹
- [x] 错误历史
- [x] 数据不足提示

### 必须删除

原文件中存在演示回退数据，例如：

- 数组基础练习
- 排序算法练习
- 递归综合练习
- 演示班级
- 固定行为事件

迁移后接口失败时：

```text
显示错误状态
```

不得自动切换为看起来真实的演示学生数据。

### 后端来源

应复用：

- 学生画像
- 知识掌握
- 高频错误
- 学习事件
- 提示记录
- 能力证据
- 任务提交

---

## 11.10 预警中心 AlertCenter

### 来源

```text
XinSaiChuangYi/frontend/src/pages/teacher/diagnosis/AlertCenter.tsx
```

### 目标

```text
CodeTrack/frontend/src/teacher/pages/diagnosis/AlertCenter.tsx
```

### 可迁移

- [x] 预警列表 UI
- [x] 风险等级标签
- [x] 状态筛选
- [x] 证据展示
- [x] 确认和解决操作
- [x] AI 处置建议弹窗
- [x] “建议仅供教师复核”的边界提示

### 当前不能直接接入

学生端后端当前没有：

- `LearningAlert`
- 预警状态表
- 代码相似度结果
- 预警处置建议接口

### 第一阶段处理

> **实际实现（2026-08-01）：没有走方案 A 或 B，而是实现了真实规则预警（只读）。**
>
> §10.3 那七条第一版规则全部可以从现有表实时算出来，所以新增了
> `backend/app/services/learning_alerts.py`，由 `GET /api/v1/teacher/alerts` 返回
> 命中的学生、命中的规则和每条规则的**可追查证据**（例如「头节点返回值遗漏 已累计
> 出现 3 次」）。不新建预警表、不写任何库。
>
> 写操作（标记已处理、发送提醒、下发干预）仍然缺 `LearningAlert` 状态表，所以接口
> 返回 `actions_available: false` 和 `actions_disabled_reason`，前端按此把三个按钮
> 渲染成禁用并显示原因 —— 符合 §15.2，也不是方案 B 那种整页「暂未接入」。
>
> 代码相似度和抄袭判定仍然**没有实现**，也不在本轮范围内。

原始两个候选方案（保留作为历史参考）：

#### 方案 A：暂不显示预警 Tab

在真实后端完成前隐藏。

#### 方案 B：显示页面但明确标记

```text
预警能力暂未接入
```

不得显示虚假风险学生。

### 后续规则

预警只能标记：

```text
未完成风险
成绩下降风险
重复错误风险
长期无学习行为
高相似度风险
```

系统不能直接认定抄袭或自动处罚。

---

# 十二、`Frame` 教学改进模块的处理

## 12.1 可作为参考的页面

```text
TeachingImprovement.tsx
SuggestionDetail.tsx
EffectCompare.tsx
MultiClassCompare.tsx
ABTesting.tsx
StageSummary.tsx
SemesterSummary.tsx
```

## 12.2 不进入本次直接迁移

原因：

- 编译尚未通过
- 需要补充必需的 `courseId`
- 有未使用导入和变量
- `ImportMeta.env` 类型缺失
- 大量固定班级和任务 ID
- 大量 Mock 建议和统计
- 当前学生端后端没有对应接口

## 12.3 后续迁移方式

先完成：

```text
教师登录
→ 我的课程
→ 任务监控
→ 提交详情
→ 学情诊断
```

再基于真实诊断数据重建教学改进，不要直接复制 Mock。

---

# 十三、绝对禁止迁移的文件

以下文件不得直接复制到学生端项目：

```text
XinSaiChuangYi/frontend/src/App.tsx
XinSaiChuangYi/frontend/src/main.tsx
XinSaiChuangYi/frontend/src/components/MainLayout.tsx
XinSaiChuangYi/frontend/src/index.css
XinSaiChuangYi/frontend/src/services/api.ts
XinSaiChuangYi/backend/
XinSaiChuangYi/shared/
XinSaiChuangYi/Frame/backend/
XinSaiChuangYi/Frame/frontend/src/App.tsx
XinSaiChuangYi/Frame/frontend/src/components/MainLayout.tsx
```

不得复制教师端：

- `.env`
- `codetrack.db`
- Alembic migrations
- `init_db.py`
- 用户、课程、任务、提交和成绩模型
- 独立认证
- 独立 API 响应格式

---

# 十四、后端迁移原则

## 14.1 后端只能在学生项目中扩展

目标后端：

```text
CodeTrack/backend/app/
```

教师端接口继续放在：

```text
CodeTrack/backend/app/api/teacher.py
```

后续接口变多时再拆为：

```text
backend/app/api/teacher/
├── context.py
├── courses.py
├── tasks.py
├── submissions.py
├── analytics.py
└── feedback.py
```

## 14.2 可以参考但不能复制的逻辑

可以参考教师端：

```text
XinSaiChuangYi/backend/app/services/diagnosis.py
```

其中的：

- 班级聚合思路
- 学生行为统计思路
- 错误类型统计
- 预警判断思路

但必须重新适配：

- 学生端字符串 ID
- 学生端模型
- 学生端权限
- 学生端 API 格式
- 学生端数据库

## 14.3 教师权限范围

现有 `ensure_course_member()` 只能按课程校验。

后续教师端更严谨的接口应优先使用：

```text
teaching_assignment_id
```

校验：

```text
TeachingAssignment.teacher_id == 当前教师 ID
```

避免同一课程多个教师或多个班级时越权。

---

# 十五、Mock 数据处理规范

## 15.1 必须删除页面内静态业务数据

包括：

- 固定课程
- 固定学生
- 固定任务
- 固定成绩
- 固定提交
- 固定截止时间
- 固定班级
- 固定知识点统计

## 15.2 后端未完成时的正确表现

允许：

```text
加载骨架
空状态
“暂未接入”提示
禁用按钮并解释原因
开发环境显式 Mock 模式
```

不允许：

```text
用静态数字伪装真实数据
按钮点击只 console.log
没有请求却提示保存成功
没有数据库写入却提示发布成功
```

## 15.3 如需保留开发 Mock

必须：

- 放入独立 `mock/` 目录
- 字段完全符合真实 API Schema
- 页面明显标记“演示数据”
- 生产模式不得启用

---

# 十六、推荐迁移执行顺序

## 阶段 1：角色分流

- [ ] 修改登录页文案
- [ ] 增加教师演示账号
- [ ] 拆分 `StudentAppContent`
- [ ] 新建 `TeacherAppContent`
- [ ] 增加教师角色路由守卫
- [ ] 验证学生登录不受影响
- [ ] 验证教师登录进入 `/teacher/dashboard`

## 阶段 2：教师统一布局

- [ ] 使用学生端顶部栏
- [ ] 使用学生端侧边栏
- [ ] 增加教师导航
- [ ] 显示真实教师姓名
- [ ] 复用退出登录
- [ ] 删除教师原 MainLayout

## 阶段 3：迁移静态页面结构

按顺序迁移：

```text
Dashboard
→ CourseList
→ CourseWorkspace
→ TaskMonitor
→ GradingWorkspace
→ DiagnosisSummary
```

此阶段只迁移 UI 和路由，不允许保留虚假业务数据。

## 阶段 4：接入现有真实接口

优先接：

```text
登录与用户信息
→ 教师课程提交
→ 提交时间线
→ 提交版本
→ 测试结果
→ AI 诊断
```

先形成：

```text
教师登录
→ 查看课程提交
→ 打开学生提交
→ 查看真实代码、测试和诊断
```

## 阶段 5：补充教师后端接口

依次补：

```text
教学上下文
→ 教师课程列表
→ 班级学生名单
→ 任务完成情况
→ 班级学情
→ 学生个体学情
```

## 阶段 6：写操作

最后再开发：

```text
任务创建
→ 任务发布
→ 教师反馈
→ 成绩发布
→ 预警处理
```

写操作比展示页风险更高，不要先做假接口。

---

# 十七、给迁移 AI 的直接执行指令

下面内容可以原样交给代码 AI：

```text
你现在需要把 XinSaiChuangYi 教师端迁移到 CodeTrack 学生端项目中。

严格要求：

1. CodeTrack 是唯一目标项目和事实来源。
2. 不覆盖 CodeTrack 现有学生端页面、后端、数据库和 API。
3. 不复制 XinSaiChuangYi 的独立后端、数据库、App.tsx、main.tsx、MainLayout.tsx、index.css 和 Axios 请求层。
4. 使用 CodeTrack 现有登录接口和 codetrack.accessToken。
5. 根据 AuthUser.role 自动分流：
   - STUDENT 进入现有学生端；
   - TEACHER 进入 /teacher/dashboard。
6. 学生端现有路由保持不变，教师端统一使用 /teacher/*。
7. 新建 CodeTrack/frontend/src/teacher/ 目录迁移教师页面。
8. 教师布局必须使用 CodeTrack 现有深蓝顶部栏、白色左侧导航、Logo、字体、颜色和卡片风格。
9. 不直接复制教师端黑色 Ant Design Sider。
10. 统一使用 lucide-react 图标；不要新增 @ant-design/icons。
11. 统一使用 CodeTrack 的 fetch request 封装；不要引入 Axios。
12. 所有 ID 改为 string，角色改为大写枚举。
13. 删除页面中的静态课程、学生、任务、成绩和截止时间。
14. 后端接口未完成时显示空状态或“暂未接入”，不得伪造真实数据。
15. 先迁移 XinSaiChuangYi/frontend/src 顶层版本。
16. XinSaiChuangYi/Frame 只作为教学改进参考，不整包迁移。
17. 首先完成教师登录、教师布局、课程提交列表、提交时间线和学情诊断。
18. 每完成一步都运行：
   - python -m pytest
   - cd frontend && npm run build
19. 不修改学生端沙箱、诊断和画像业务，教师端必须复用这些结果。
20. 迁移完成后输出：
   - 修改文件列表；
   - 新增文件列表；
   - 已接真实接口；
   - 暂未接接口；
   - 删除的 Mock；
   - 构建和测试结果。
```

---

# 十八、验收测试清单

## 18.1 登录

- [ ] `wang` 登录进入学生端
- [ ] `liu` 登录进入学生端
- [ ] `teacher_wang` 登录进入教师端
- [ ] `teacher_li` 登录进入教师端
- [ ] 账号角色由后端决定
- [ ] 刷新页面后角色保持正确
- [ ] 退出登录后回到统一登录页

## 18.2 权限

- [ ] 学生不能进入 `/teacher/*`
- [ ] 教师不能进入学生任务工作台
- [ ] 教师不能查看其他教师课程
- [ ] 教师不能查看其他课程学生
- [ ] 前端和后端都执行权限校验

## 18.3 学生端回归

- [ ] 学习首页正常
- [ ] 班级任务正常
- [ ] 编程提交正常
- [ ] 客观题提交正常
- [ ] AI 诊断正常
- [ ] 分层提示正常
- [ ] 学习画像正常

## 18.4 教师端

- [ ] 教师顶部栏与学生端视觉统一
- [ ] 教师导航正常
- [ ] 课程页面正常
- [ ] 任务监控读取真实提交
- [ ] 提交详情读取真实时间线
- [ ] 教师可查看真实测试结果
- [ ] 教师可查看真实 AI 诊断
- [ ] 无数据时显示空状态
- [ ] 无虚假成功提示
- [ ] 无写死业务 ID

## 18.5 工程

- [ ] 只有一个 `BrowserRouter`
- [ ] 只有一个登录体系
- [ ] 只有一个 Token 键
- [ ] 只有一个 FastAPI 后端
- [ ] 只有一套数据库模型
- [ ] 不存在重复 Axios 请求层
- [ ] TypeScript 构建通过
- [ ] Python 测试通过

---

# 十九、迁移完成的最低闭环

本次迁移达到以下流程，即可认为第一阶段完成：

```text
教师使用 teacher_wang 登录
→ 自动进入教师端
→ 查看自己负责的课程
→ 进入课程提交监控
→ 查看王同学真实提交
→ 查看代码版本和测试结果
→ 查看 AI 诊断和提示记录
→ 退出登录

王同学使用 wang 登录
→ 自动进入学生端
→ 完成原有任务流程
→ 学生端所有功能保持正常
```

---

# 二十、最终判断

本次迁移不是把教师端项目“搬进”学生端，而是：

```text
保留学生端工程和 UI
＋ 提取教师端页面结构
＋ 统一角色路由
＋ 改写教师请求层
＋ 复用学生端后端和数据
＋ 删除教师端独立体系
```

最优先迁移的真实功能是：

```text
统一登录
→ 教师布局
→ 教师课程
→ 任务提交监控
→ 提交详情
→ AI 诊断查看
→ 学情诊断
```

任务创建、成绩发布、预警和教学改进放在真实后端契约完善之后继续开发。
