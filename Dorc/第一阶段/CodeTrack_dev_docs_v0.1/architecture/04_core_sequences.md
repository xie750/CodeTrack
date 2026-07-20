# 核心时序设计

## 1. 首次提交与执行

```mermaid
sequenceDiagram
    actor S as 学生
    participant UI as 学生端
    participant API as 后端API
    participant DB as 数据库
    participant Q as 任务队列
    participant SB as 沙箱服务

    S->>UI: 点击提交
    UI->>API: POST 提交代码
    API->>API: 校验权限、任务状态、代码
    API->>DB: 创建 Submission / Version
    API->>Q: 创建执行任务
    API-->>UI: 返回 version_id 和 QUEUED
    Q->>SB: 执行版本
    SB->>SB: 编译与测试
    SB-->>API: 返回结构化结果
    API->>DB: 保存 Execution / TestResult
    UI->>API: 查询执行状态
    API-->>UI: 返回终态和测试结果
```

## 2. AI 诊断

```mermaid
sequenceDiagram
    participant API as 工作流编排
    participant DB as 数据库
    participant RAG as 知识检索
    participant AI as 模型网关
    participant V as 输出校验

    API->>DB: 读取任务、代码、测试结果
    API->>RAG: 检索课程资料
    RAG-->>API: 返回带来源知识片段
    API->>AI: 发送结构化上下文
    AI-->>V: 返回 JSON
    V->>V: Schema 与泄露检查
    alt 校验通过
      V-->>API: 有效诊断
      API->>DB: 保存 Diagnosis / 引用 / 一级提示
    else 校验失败
      V-->>API: 错误原因
      API->>AI: 限次重试
    end
```

## 3. 提示升级

1. 学生请求下一层提示；
2. 后端检查当前层级、失败次数、是否已有新提交；
3. 满足规则后返回已生成提示或触发生成；
4. 保存查看时间与层级；
5. 学生查看完整参考答案时单独记录，不等同普通提示。

## 4. 重新提交

- 同一个 `Submission` 下创建新 `SubmissionVersion`；
- 新版本必须重新执行所有必要测试；
- 不继承旧版本的通过状态；
- AI 可以读取历史诊断，但必须基于新测试结果重新判断；
- 页面展示版本时间线和前后差异。

## 5. 能力证据生成

```mermaid
sequenceDiagram
    participant W as 工作流
    participant R as 规则引擎
    participant DB as 数据库

    W->>R: 提交最终结果、提示记录、历史表现
    R->>R: 匹配能力映射与证据规则
    R->>DB: 创建 CapabilityEvidence
    R->>DB: 更新 CapabilityState
```

## 6. 教师报告

- 定时或按请求聚合事实数据；
- 先生成确定性统计；
- 再把统计摘要交给 AI 生成教学建议；
- 页面分别展示“数据事实”和“AI 建议”；
- 教师可以采纳、修改或忽略建议。
