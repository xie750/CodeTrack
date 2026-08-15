export type DemoTask = {
  task_id: string;
  title: string;
  course_name: string;
  status: string;
  progress_status: string;
  deadline: string;
  difficulty: string;
  knowledge_points: string[];
  latest_summary: string;
  real: boolean;
};

export type Artifact = {
  id: string;
  type: string;
  title: string;
  knowledgePoints: string[];
  source: string;
  content: string;
  citations: string[];
  aiGenerated: boolean;
  createdAt: string;
  note: string;
};

export const wrongHeadUpdateCode = `ListNode* deleteAt(ListNode* head, int position) {
    if (head == nullptr || position < 0) {
        return head;
    }

    ListNode* prev = nullptr;
    ListNode* cur = head;
    int index = 0;

    while (cur != nullptr && index < position) {
        prev = cur;
        cur = cur->next;
        index++;
    }

    if (cur == nullptr) {
        return head;
    }

    if (prev != nullptr) {
        prev->next = cur->next;
    }

    return head;
}`;

export const terminalStatuses = new Set([
  "SUCCEEDED",
  "COMPILE_ERROR",
  "RUNTIME_ERROR",
  "TIMEOUT",
  "RESOURCE_LIMIT",
  "SECURITY_REJECTED",
  "INFRASTRUCTURE_ERROR"
]);

export const profileSummary = {
  studentName: "王同学",
  courseName: "机器学习",
  progress: 62,
  strongPoints: ["数据集划分", "基础 Python 实验"],
  weakPoints: ["过拟合与正则化", "链表边界处理", "隐藏用例意识"],
  frequentErrors: ["训练集、验证集、测试集混淆", "头节点返回值遗漏", "只验证普通用例"],
  hintDependency: "中等",
  recommendation: "先复盘过拟合与正则化，再用 Python 和数据结构任务补足实验能力。"
};

export const knowledgeSources = [
  {
    id: "kb_head_node_delete",
    title: "删除头节点时的链表起点更新",
    summary: "删除第一个节点时没有前驱节点，需要返回新的头节点。",
    level: "HIGH" as const
  },
  {
    id: "kb_boundary_test_reasoning",
    title: "用边界测试验证链表删除",
    summary: "链表删除应覆盖头节点、尾节点、空链表和非法位置。",
    level: "MEDIUM" as const
  },
  {
    id: "kb_stack_queue_basic",
    title: "栈与队列的访问顺序",
    summary: "栈适合最近未匹配结构，队列适合按到达顺序处理任务。",
    level: "HIGH" as const
  },
  {
    id: "kb_tree_traversal_recursive",
    title: "二叉树递归遍历",
    summary: "递归遍历必须明确当前节点处理顺序和空节点出口。",
    level: "HIGH" as const
  }
];

export const demoTasks: DemoTask[] = [
  {
    task_id: "task_linked_list_delete_001",
    title: "单链表指定位置节点删除",
    course_name: "数据结构",
    status: "OPEN",
    progress_status: "IN_PROGRESS",
    deadline: "2026-07-24 23:59",
    difficulty: "基础进阶",
    knowledge_points: ["链表", "边界处理", "指针"],
    latest_summary: "真实后端链路：可提交 C++ 代码并查看诊断。",
    real: true
  },
  {
    task_id: "demo_stack_match_001",
    title: "栈实现括号匹配",
    course_name: "数据结构",
    status: "OPEN",
    progress_status: "NOT_STARTED",
    deadline: "2026-07-27 23:59",
    difficulty: "基础",
    knowledge_points: ["栈与队列", "后进先出"],
    latest_summary: "演示任务：本轮作为任务列表和推荐链路占位。",
    real: false
  },
  {
    task_id: "demo_ml_overfitting_001",
    title: "过拟合与正则化概念测验",
    course_name: "机器学习",
    status: "OPEN",
    progress_status: "REVIEW_REQUIRED",
    deadline: "2026-07-30 23:59",
    difficulty: "中等",
    knowledge_points: ["过拟合", "正则化", "模型评估"],
    latest_summary: "演示任务：用于人工智能专业画像和自主学习推荐。",
    real: false
  }
];

export const artifacts: Artifact[] = [
  {
    id: "artifact_note_linked_list",
    type: "学习笔记",
    title: "链表删除边界复习笔记",
    knowledgePoints: ["链表", "边界处理"],
    source: "任务学习总结",
    content: "删除头节点时要返回新的 head；删除中间节点时维护 prev->next；非法位置保持原链表。",
    citations: ["kb_head_node_delete", "kb_boundary_test_reasoning"],
    aiGenerated: true,
    createdAt: "2026-07-20",
    note: "复习时先手写 4 个边界样例。"
  },
  {
    id: "artifact_card_pointer",
    type: "知识卡片",
    title: "指针修改前先判断空节点",
    knowledgePoints: ["指针", "链表"],
    source: "AI 助学回答",
    content: "访问 cur->next 前先确认 cur 不为空，隐藏用例通常覆盖空链表和越界位置。",
    citations: ["kb_boundary_test_reasoning"],
    aiGenerated: true,
    createdAt: "2026-07-21",
    note: "提交前对 while 条件做口头检查。"
  },
  {
    id: "artifact_map_stack_queue",
    type: "思维导图",
    title: "栈与队列适用场景对比",
    knowledgePoints: ["栈与队列"],
    source: "自主学习生成",
    content: "栈：括号匹配、递归模拟、撤销；队列：层序遍历、任务调度、广度优先搜索。",
    citations: ["kb_stack_queue_basic"],
    aiGenerated: true,
    createdAt: "2026-07-22",
    note: "后续补一道括号匹配练习。"
  },
  {
    id: "artifact_ppt_ml",
    type: "PPT 大纲",
    title: "过拟合与正则化讲解大纲",
    knowledgePoints: ["机器学习", "过拟合", "正则化"],
    source: "自主学习生成",
    content: "1. 泛化误差；2. 过拟合现象；3. 正则化直觉；4. 训练集、验证集、测试集划分。",
    citations: ["kb_ml_overfitting_regularization"],
    aiGenerated: true,
    createdAt: "2026-07-22",
    note: "第一版只保存大纲，不导出 PPT 文件。"
  }
];

export const selfStudyOutputs: Record<string, Record<string, string>> = {
  机器学习: {
    概念讲解: "机器学习的核心是让模型从数据中学习规律，并在未见过的数据上保持较好的泛化能力。过拟合表示模型过度记住训练数据，正则化可以约束模型复杂度。",
    练习题: "给出一个训练准确率 98%、测试准确率 70% 的场景，判断是否可能过拟合，并写出两种缓解方法。",
    复习笔记: "训练集用于拟合参数，验证集用于模型选择和调参，测试集用于最终评估；正则化通过惩罚复杂模型降低过拟合风险。",
    知识卡片: "卡片正面：为什么不能反复用测试集调参？反面：会让测试集信息泄露到模型选择过程，评估不再可靠。",
    思维导图: "机器学习 -> 数据集划分 -> 模型训练 -> 模型评估 -> 过拟合 -> 正则化。",
    "PPT 大纲": "第 1 页数据集划分，第 2 页过拟合现象，第 3 页正则化直觉，第 4 页常见缓解方法。"
  },
  Python程序设计: {
    概念讲解: "Python 程序设计在人工智能专业中主要承担实验编程、数据处理和模型调用基础。写统计函数时要先明确输入、输出和异常分支。",
    练习题: "实现 stats(values)，返回 count、max、average，并说明空列表时为什么不能直接除以长度。",
    复习笔记: "列表遍历负责取样本，条件分支负责处理空列表，字典适合组织多个统计结果。",
    知识卡片: "卡片正面：空列表求平均值为什么危险？反面：长度为 0 会导致除零，需要单独返回 None 或约定值。",
    思维导图: "Python 数据处理 -> 函数 -> 列表遍历 -> 条件分支 -> 统计结果。",
    "PPT 大纲": "第 1 页函数接口，第 2 页列表遍历，第 3 页统计值计算，第 4 页空列表边界。"
  },
  链表: {
    概念讲解: "链表的关键不是连续存储，而是每个节点通过 next 指向后继。删除节点时要先找到位置，再处理头节点、尾节点和非法位置。",
    练习题: "写出 3 个测试：删除头节点、删除尾节点、删除越界位置，并说明每个测试要验证什么。",
    复习笔记: "删除头节点返回 head->next；删除普通节点修改 prev->next；遍历时先判断当前指针是否为空。",
    知识卡片: "卡片正面：为什么删除头节点特殊？反面：因为没有前驱节点，需要更新链表入口。",
    思维导图: "链表删除 -> 前置判断 -> 定位节点 -> 分情况修改 -> 边界测试。",
    "PPT 大纲": "第 1 页概念，第 2 页删除流程，第 3 页头节点样例，第 4 页边界测试。"
  },
  栈与队列: {
    概念讲解: "栈遵循后进先出，适合处理最近出现且尚未匹配的元素；队列遵循先进先出，适合按顺序扩展状态。",
    练习题: "用栈判断字符串 `([]{})` 是否括号匹配，再说明遇到右括号时为什么要查看栈顶。",
    复习笔记: "栈看栈顶，队列看队首；栈常用于匹配和回退，队列常用于层序和调度。",
    知识卡片: "卡片正面：什么时候选栈？反面：需要最近元素优先被处理时。",
    思维导图: "线性结构 -> 栈 -> 匹配/撤销；线性结构 -> 队列 -> 层序/调度。",
    "PPT 大纲": "第 1 页访问顺序，第 2 页括号匹配，第 3 页队列层序，第 4 页选型对比。"
  },
  二叉树: {
    概念讲解: "二叉树递归遍历要明确两个问题：空节点什么时候返回，以及当前节点相对左右子树什么时候处理。",
    练习题: "给定根节点 A，左子 B，右子 C，写出前序、中序、后序结果，并标出递归出口。",
    复习笔记: "前序是根左右，中序是左根右，后序是左右根；空节点直接返回。",
    知识卡片: "卡片正面：前序遍历第一步做什么？反面：先访问当前根节点。",
    思维导图: "二叉树遍历 -> 递归出口 -> 当前节点位置 -> 左右子树顺序。",
    "PPT 大纲": "第 1 页树结构，第 2 页递归出口，第 3 页三种顺序，第 4 页调用栈演示。"
  }
};

export function statusColor(status: string) {
  if (status === "PASSED" || status === "SUCCEEDED" || status === "已完成") return "success";
  if (status === "FAILED" || status === "COMPILE_ERROR" || status === "TIMEOUT" || status === "待修正") return "error";
  if (status === "FEEDBACK_READY" || status === "REVIEW_REQUIRED" || status === "即将截止") return "warning";
  if (status === "NOT_STARTED") return "default";
  return "processing";
}

export function progressLabel(status: string) {
  const labels: Record<string, string> = {
    NOT_STARTED: "未开始",
    IN_PROGRESS: "进行中",
    PASSED: "已完成",
    FAILED: "待修正",
    REVIEW_REQUIRED: "需要复习"
  };
  return labels[status] ?? status;
}

export function mapApiTask(task: import("../api").TaskListItem): DemoTask {
  const fallback = demoTasks.find((item) => item.task_id === task.task_id);
  return {
    task_id: task.task_id,
    title: task.title,
    course_name: task.course_name,
    status: task.status,
    progress_status: task.progress_status,
    deadline: fallback?.deadline ?? "2026-07-24 23:59",
    difficulty: fallback?.difficulty ?? "基础进阶",
    knowledge_points: fallback?.knowledge_points ?? ["链表", "边界处理"],
    latest_summary: task.latest_version_id ? "已有提交记录，可继续进入工作台修正。" : "尚未提交，建议先运行公开样例。",
    real: true
  };
}

export function buildTaskCards(apiTasks: import("../api").TaskListItem[]) {
  return apiTasks.map(mapApiTask);
}
