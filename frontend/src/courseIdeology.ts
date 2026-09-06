export type CourseIdeologyInsight = {
  title: string;
  dimension: string;
  summary: string;
  reflection: string;
  source: string;
};

type ResolveIdeologyInput = {
  courseName?: string | null;
  knowledgePoints?: Array<string | null | undefined>;
  taskTitle?: string | null;
};

const DEFAULT_INSIGHT: CourseIdeologyInsight = {
  title: "把技术问题放回真实场景",
  dimension: "AI 向善",
  summary: "学习专业知识时同步关注技术选择对用户、组织和社会场景的影响。",
  reflection: "完成本次学习后，可以补问自己一句：这个方法如果进入真实系统，需要额外注意哪些安全、公平或可靠性问题？",
  source: "课程思政轻量规则库"
};

const INSIGHTS: Array<CourseIdeologyInsight & { keywords: string[] }> = [
  {
    keywords: ["机器学习", "模型评估", "准确率", "召回率", "分类", "过拟合", "泛化"],
    title: "模型评估不只看分数",
    dimension: "算法公平与社会责任",
    summary: "评价 AI 模型时，除了准确率，还要关注数据偏差、误判风险和不同群体的使用体验。",
    reflection: "如果一个模型整体准确率很高，但在某类样本上持续误判，你会如何补充评估指标和改进方案？",
    source: "机器学习课程思政提示"
  },
  {
    keywords: ["Python", "数据处理", "文件", "爬虫", "字典", "列表", "数据清洗"],
    title: "数据处理要有边界意识",
    dimension: "数据安全与隐私保护",
    summary: "编写数据处理程序时，应关注数据来源、授权范围、脱敏处理和结果使用边界。",
    reflection: "如果这段程序处理的是同学的学习数据，哪些字段需要匿名化，哪些输出不应该直接公开？",
    source: "Python 程序设计课程思政提示"
  },
  {
    keywords: ["函数", "封装", "模块", "接口", "复用"],
    title: "好代码服务协作",
    dimension: "工程规范与协作意识",
    summary: "函数封装和接口设计不仅是语法训练，也体现可维护、可协作、可复用的工程责任。",
    reflection: "这段代码交给别人维护时，命名、边界条件和注释是否足够清楚？",
    source: "Python 程序设计课程思政提示"
  },
  {
    keywords: ["数据结构", "链表", "指针", "边界", "删除节点", "空链表"],
    title: "边界条件体现工程严谨",
    dimension: "严谨求证与工程责任",
    summary: "链表、指针和边界条件错误常出现在真实系统的异常路径中，认真处理边界就是对工程质量负责。",
    reflection: "本题是否覆盖了空输入、头节点、尾节点和越界位置？这些小情况在真实系统里可能造成什么影响？",
    source: "数据结构课程思政提示"
  },
  {
    keywords: ["栈", "队列", "括号匹配", "二叉树", "递归", "遍历", "图"],
    title: "结构化思维支撑可靠系统",
    dimension: "可靠性与规则意识",
    summary: "栈、队列、递归和遍历训练的是有序处理复杂状态的能力，真实系统也依赖清晰规则避免漏判和误判。",
    reflection: "如果这个算法用于日志告警或安全检查，哪些状态遗漏会让系统给出错误判断？",
    source: "数据结构课程思政提示"
  },
  {
    keywords: ["复杂度", "排序", "查找", "Top-K", "效率", "性能"],
    title: "算法效率也是资源责任",
    dimension: "绿色计算与效率意识",
    summary: "复杂度优化不仅影响运行速度，也关系到算力、能耗和服务成本，是工程实践中的责任选择。",
    reflection: "当数据规模扩大 100 倍时，当前算法的时间和空间开销是否仍然可接受？",
    source: "数据结构课程思政提示"
  }
];

export function resolveCourseIdeologyInsight(input: ResolveIdeologyInput): CourseIdeologyInsight {
  const text = [
    input.courseName,
    input.taskTitle,
    ...(input.knowledgePoints ?? [])
  ]
    .filter(Boolean)
    .join(" ");

  const matched = INSIGHTS.find((item) => item.keywords.some((keyword) => text.includes(keyword)));
  if (!matched) return DEFAULT_INSIGHT;
  const { keywords: _keywords, ...insight } = matched;
  return insight;
}
