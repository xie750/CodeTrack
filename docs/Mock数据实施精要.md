# 学习画像页面 Mock 数据实施精要

## 1. 当前阶段的正确路线

```text
UI设计 → 定义数据结构 → 编写Mock数据 → 完成页面与交互
→ 接入SQLite → 实现指标计算 → 替换为真实数据
```

现阶段先用 Mock 数据，不必先做数据库和画像算法。

---

## 2. 核心原则

### 页面不直接写死数据

错误：

```tsx
<div>综合能力：82分</div>
```

正确：

```tsx
<div>综合能力：{portraitData.overview.overallScore}分</div>
```

### Mock 数据必须符合未来接口结构

现在：

```text
Mock数据 → Service层 → 页面
```

以后：

```text
SQLite → 后端接口 → Service层 → 页面
```

页面组件不用修改，只替换数据来源。

---

## 3. 推荐目录结构

```text
src/
├── pages/
│   └── StudentPortrait/
├── mock/
│   └── studentPortrait.ts
├── services/
│   └── studentPortrait.ts
└── types/
    └── studentPortrait.ts
```

页面只调用 `services`，不要直接引用 Mock 文件。

---

## 4. 学习画像数据结构

建议统一为：

```ts
{
  student: {},
  overview: {},
  currentGoal: {},
  abilities: [],
  knowledgeMastery: [],
  weaknesses: [],
  recommendations: [],
  behavior: {},
  recentRecords: [],
  evaluations: {}
}
```

未来接口：

```http
GET /api/students/{studentId}/portrait
```

---

## 5. Mock 数据必须逻辑一致

例如：

```text
本周任务：完成8个 / 共10个
任务完成率：80%
```

知识画像也要形成完整链路：

```text
循环结构掌握度：58%
最近正确率：52%
重复错误：3次
薄弱项：嵌套循环
推荐：循环专项练习
```

不能出现“掌握度很高，却又被判断为严重薄弱”的冲突数据。

---

## 6. 至少准备四类页面状态

1. **正常状态**：数据完整，可生成画像。
2. **数据不足**：作答数量太少，显示“暂无足够数据”。
3. **空状态**：没有目标、任务或学习记录。
4. **异常状态**：接口失败，支持重新加载。

同时补充加载骨架屏。

---

## 7. 推荐实现方式

UI 初期使用静态 TypeScript Mock：

```ts
export async function getStudentPortrait() {
  return Promise.resolve(studentPortraitMock)
}
```

以后接后端时只修改 Service：

```ts
export async function getStudentPortrait(studentId: string) {
  return request.get(`/api/students/${studentId}/portrait`)
}
```

页面代码保持不变。

---

## 8. 比赛展示口径

可以表述为：

> 当前系统基于统一学习画像数据协议完成前端验证。后续将采集学习时长、答题记录、任务完成情况等真实过程数据，动态生成知识掌握、行为分析、薄弱项诊断和个性化学习建议。

不要把模拟数据描述成真实采集数据。

---

## 9. 最终建议

当前采用：

```text
静态Mock数据
+ TypeScript类型约束
+ 独立Service层
+ 正常/空白/数据不足/异常状态
```

先把学习画像页面和交互完整跑通，再接 SQLite 和真实计算逻辑。
