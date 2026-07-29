# 系统登录与角色认证设计

## 1. 设计目标

本阶段从“模拟用户切换”升级为“轻量正式登录”。

核心目标：

```text
登录页输入账号密码
-> 后端校验 SQLite 中的 seed 用户
-> 后端签发 JWT access token
-> 前端携带 Authorization: Bearer <token>
-> 后端解析 token 得到 current_user
-> 按角色和用户 ID 过滤学生数据
```

本阶段仍然使用 SQLite。SQLite seed 数据是产品原型的事实来源，不再把学生身份、任务、画像等业务数据硬编码在前端。

## 2. 数据来源口径

推荐分层：

| 类型 | 放置位置 | 说明 |
| --- | --- | --- |
| 用户、角色、班级、课程、任务、进度、画像、推荐 | SQLite seed | 业务事实来源 |
| 登录状态、access token | 前端本地状态 / localStorage | 浏览器当前会话 |
| UI 空状态文案、兜底提示 | 前端代码 | 非业务事实 |
| 规则生成模板、演示知识源模板 | 后端或前端代码 | 后续可替换为数据库或工作流 |

避免长期保留：

- 前端模拟学生身份；
- 前端硬编码课程任务；
- 前端硬编码学习画像；
- 靠 `X-Demo-User-Id` 作为正式身份来源。

## 3. 演示账号

第一版 seed 账号：

| 账号 | 密码 | 用户 | 角色 | 行政班 |
| --- | --- | --- | --- | --- |
| `wang` | `codetrack123` | 王同学 | `STUDENT` | 软件工程 1 班 |
| `liu` | `codetrack123` | 刘同学 | `STUDENT` | 计科 1 班 |
| `teacher_wang` | `codetrack123` | 王老师 | `TEACHER` | 数据结构教师 |
| `teacher_li` | `codetrack123` | 李老师 | `TEACHER` | 计算机网络教师 |

密码只作为本地演示用途，入库时必须保存哈希，不保存明文。

## 4. 用户表字段

`users` 增加认证字段：

```text
username
password_hash
last_login_at
```

说明：

- `username` 用于登录。
- `password_hash` 使用 PBKDF2 哈希字符串。
- `last_login_at` 记录最近登录时间。

## 5. API 设计

### 5.1 登录

```http
POST /api/v1/auth/login
```

请求：

```json
{
  "username": "wang",
  "password": "codetrack123"
}
```

返回：

```json
{
  "access_token": "...",
  "token_type": "bearer",
  "expires_in": 1800,
  "user": {
    "id": "user_student_001",
    "username": "wang",
    "display_name": "王同学",
    "role": "STUDENT"
  }
}
```

### 5.2 当前用户

```http
GET /api/v1/auth/me
```

用于前端刷新页面后恢复当前用户。

### 5.3 退出

```http
POST /api/v1/auth/logout
```

第一版退出由前端删除 token 即可，后端返回成功状态。后续如引入 refresh token，再扩展服务端失效表。

## 6. JWT 设计

Access token payload：

```json
{
  "sub": "user_student_001",
  "username": "wang",
  "role": "STUDENT",
  "iat": 1785310000,
  "exp": 1785311800
}
```

第一版：

- access token 有效期 30 分钟；
- 暂不实现 refresh token；
- 前端将 access token 存入 localStorage；
- 后续如果需要更接近生产，可改成短 access token + HttpOnly refresh cookie。

## 7. 角色与数据边界

学生端接口：

```text
/api/v1/student/*
```

要求：

```text
current_user.role == STUDENT
```

并且所有数据从 `current_user.id` 派生，不能由前端传学生 ID 越权查看。

教师端接口：

```text
/api/v1/teacher/*
```

要求：

```text
current_user.role == TEACHER
```

并且教师只能查看自己负责的课程与教学安排范围。

## 8. 前端交互

新增登录页：

```text
/login
```

未登录访问学生端页面时：

```text
跳转 /login
```

登录成功后：

```text
保存 access token
调用 /api/v1/auth/me 获取用户信息
进入学习首页
```

顶部用户入口改为：

```text
当前登录用户
所属班级 / 角色标签
退出登录
```

不再显示“切换模拟用户”。

## 9. 开发兼容说明

为减少旧测试和本地调试成本，后端短期保留 `X-Demo-User-Id` 兼容入口。

正式前端不再使用该 header。后续收口时，可以通过配置关闭该兼容入口。

