window.CODETRACK_MOCK = {
  student: {
    name: "王同学",
    className: "软件工程 1 班",
    profile: {
      progress: 62,
      weakPoints: ["链表边界处理", "指针更新顺序", "递归终止条件"],
      strengths: ["栈的后进先出", "基础循环结构"],
      hintDependency: "中等",
      recommendation: "先完成链表删除任务，再生成一份边界条件知识卡片"
    }
  },
  teacher: {
    name: "王老师",
    course: "数据结构与程序设计基础",
    term: "2026 秋季"
  },
  course: {
    name: "数据结构与程序设计基础",
    major: "计算机类专业基础课",
    knowledgePoints: ["链表", "栈与队列", "二叉树"],
    sources: [
      { id: "S1", title: "链表头节点删除讲义", chapter: "第 2 章 链表", type: "讲义" },
      { id: "S2", title: "指针与边界条件 PPT", chapter: "第 2 章 链表", type: "PPT" },
      { id: "S3", title: "栈的后进先出规则", chapter: "第 3 章 栈与队列", type: "讲义" },
      { id: "S4", title: "括号匹配示例", chapter: "第 3 章 栈与队列", type: "代码样例" },
      { id: "S5", title: "二叉树递归遍历讲义", chapter: "第 5 章 二叉树", type: "讲义" },
      { id: "S6", title: "递归终止条件说明", chapter: "第 5 章 二叉树", type: "教材片段" }
    ]
  },
  tasks: [
    {
      id: "T1",
      title: "单链表指定位置节点删除",
      course: "数据结构与程序设计基础",
      teacher: "王老师",
      knowledgePoints: ["链表", "边界处理", "指针"],
      difficulty: "基础",
      due: "2026-08-08 23:59",
      status: "待修正",
      lastSubmit: "7/10 用例通过，头节点删除失败"
    },
    {
      id: "T2",
      title: "栈实现括号匹配",
      course: "数据结构与程序设计基础",
      teacher: "王老师",
      knowledgePoints: ["栈与队列", "字符串扫描"],
      difficulty: "基础",
      due: "2026-08-12 23:59",
      status: "未开始",
      lastSubmit: "暂无提交"
    },
    {
      id: "T3",
      title: "二叉树前序遍历",
      course: "数据结构与程序设计基础",
      teacher: "王老师",
      knowledgePoints: ["二叉树", "递归"],
      difficulty: "进阶",
      due: "2026-08-18 23:59",
      status: "已完成",
      lastSubmit: "10/10 用例通过"
    }
  ],
  aiDiagnosis: {
    answer: "系统测试显示普通位置删除通过，但删除第 1 个节点时失败。更可能的问题是没有单独处理头节点变化，导致返回的链表头仍指向旧节点。",
    citations: ["S1", "S2"],
    confidence: 0.86,
    ai_generated: true,
    based_on_profile: true,
    next_actions: ["查看一级提示", "复习链表边界条件", "重新提交"],
    risk_flags: ["不展示隐藏用例细节", "不直接给完整答案"]
  },
  aiTutorAnswer: {
    answer: "链表删除题要先判断删除位置是否会改变头指针，再处理普通节点的前驱连接。你最近的错因集中在边界条件，可以先把 pos=1、pos=n、空链表三个场景单独写成检查清单。",
    citations: ["S1", "S2"],
    confidence: 0.82,
    ai_generated: true,
    based_on_profile: true,
    next_actions: ["生成练习", "保存笔记", "跳转链表任务"],
    risk_flags: []
  }
};
