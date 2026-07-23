import Editor from "@monaco-editor/react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Collapse,
  Empty,
  Input,
  Layout,
  List,
  Menu,
  Progress,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography
} from "antd";
import {
  BookOpen,
  Bot,
  ChevronRight,
  ClipboardPaste,
  FileText,
  GraduationCap,
  Library,
  Map,
  Play,
  RefreshCw,
  Search,
  Sparkles
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  api,
  Diagnosis,
  ExecutionStatus,
  Hint,
  Summary,
  TaskDetail,
  TaskListItem,
  VersionHistoryItem,
  VersionResult
} from "./api";

const { Sider, Header, Content } = Layout;
const { Text, Title, Paragraph } = Typography;

type PageKey = "home" | "tasks" | "workspace" | "selfStudy" | "aiTutor" | "library";

type DemoTask = {
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

type Artifact = {
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

const wrongHeadUpdateCode = `ListNode* deleteAt(ListNode* head, int position) {
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

const terminalStatuses = new Set([
  "SUCCEEDED",
  "COMPILE_ERROR",
  "RUNTIME_ERROR",
  "TIMEOUT",
  "RESOURCE_LIMIT",
  "SECURITY_REJECTED",
  "INFRASTRUCTURE_ERROR"
]);

const profileSummary = {
  studentName: "王同学",
  courseName: "数据结构与程序设计基础",
  progress: 62,
  strongPoints: ["指针遍历", "中间节点删除"],
  weakPoints: ["链表边界处理", "递归出口", "隐藏用例意识"],
  frequentErrors: ["头节点返回值遗漏", "空指针保护不足", "只验证普通用例"],
  hintDependency: "中等",
  recommendation: "先修正单链表删除头节点，再用一组边界测试复盘。"
};

const knowledgeSources = [
  {
    id: "kb_head_node_delete",
    title: "删除头节点时的链表起点更新",
    summary: "删除第一个节点时没有前驱节点，需要返回新的头节点。",
    level: "HIGH"
  },
  {
    id: "kb_boundary_test_reasoning",
    title: "用边界测试验证链表删除",
    summary: "链表删除应覆盖头节点、尾节点、空链表和非法位置。",
    level: "MEDIUM"
  },
  {
    id: "kb_stack_queue_basic",
    title: "栈与队列的访问顺序",
    summary: "栈适合最近未匹配结构，队列适合按到达顺序处理任务。",
    level: "HIGH"
  },
  {
    id: "kb_tree_traversal_recursive",
    title: "二叉树递归遍历",
    summary: "递归遍历必须明确当前节点处理顺序和空节点出口。",
    level: "HIGH"
  }
];

const demoTasks: DemoTask[] = [
  {
    task_id: "task_linked_list_delete_001",
    title: "单链表指定位置节点删除",
    course_name: "数据结构与程序设计基础",
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
    course_name: "数据结构与程序设计基础",
    status: "OPEN",
    progress_status: "NOT_STARTED",
    deadline: "2026-07-27 23:59",
    difficulty: "基础",
    knowledge_points: ["栈与队列", "后进先出"],
    latest_summary: "演示任务：本轮作为任务列表和推荐链路占位。",
    real: false
  },
  {
    task_id: "demo_binary_tree_preorder_001",
    title: "二叉树前序遍历",
    course_name: "数据结构与程序设计基础",
    status: "OPEN",
    progress_status: "REVIEW_REQUIRED",
    deadline: "2026-07-30 23:59",
    difficulty: "中等",
    knowledge_points: ["二叉树", "递归"],
    latest_summary: "演示任务：用于画像和自主学习推荐。",
    real: false
  }
];

const artifacts: Artifact[] = [
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
    id: "artifact_ppt_tree",
    type: "PPT 大纲",
    title: "二叉树前序遍历讲解大纲",
    knowledgePoints: ["二叉树", "递归"],
    source: "自主学习生成",
    content: "1. 递归出口；2. 根左右访问顺序；3. 手动画调用栈；4. 空节点样例。",
    citations: ["kb_tree_traversal_recursive"],
    aiGenerated: true,
    createdAt: "2026-07-22",
    note: "第一版只保存大纲，不导出 PPT 文件。"
  }
];

const selfStudyOutputs: Record<string, Record<string, string>> = {
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

const navItems = [
  { key: "home", label: "学习首页", icon: <GraduationCap size={18} /> },
  { key: "tasks", label: "课程任务", icon: <BookOpen size={18} /> },
  { key: "selfStudy", label: "自主学习", icon: <Map size={18} /> },
  { key: "aiTutor", label: "AI 助学", icon: <Bot size={18} /> },
  { key: "library", label: "我的资料", icon: <Library size={18} /> }
];

function statusColor(status: string) {
  if (status === "PASSED" || status === "SUCCEEDED" || status === "已完成") return "success";
  if (status === "FAILED" || status === "COMPILE_ERROR" || status === "TIMEOUT" || status === "待修正") return "error";
  if (status === "FEEDBACK_READY" || status === "REVIEW_REQUIRED" || status === "即将截止") return "warning";
  if (status === "NOT_STARTED") return "default";
  return "processing";
}

function progressLabel(status: string) {
  const labels: Record<string, string> = {
    NOT_STARTED: "未开始",
    IN_PROGRESS: "进行中",
    PASSED: "已完成",
    FAILED: "待修正",
    REVIEW_REQUIRED: "需要复习"
  };
  return labels[status] ?? status;
}

function mapApiTask(task: TaskListItem): DemoTask {
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

function buildTaskCards(apiTasks: TaskListItem[]) {
  const mapped = apiTasks.map(mapApiTask);
  const ids = new Set(mapped.map((item) => item.task_id));
  return [...mapped, ...demoTasks.filter((item) => !ids.has(item.task_id))];
}

export default function App() {
  const [activePage, setActivePage] = useState<PageKey>("home");
  const [selectedTaskId, setSelectedTaskId] = useState("task_linked_list_delete_001");

  function openWorkspace(taskId = "task_linked_list_delete_001") {
    setSelectedTaskId(taskId);
    setActivePage("workspace");
  }

  const activeTitle = activePage === "workspace" ? "任务工作台" : navItems.find((item) => item.key === activePage)?.label;

  return (
    <Layout className="student-app">
      <Sider width={232} className="side-nav" breakpoint="lg" collapsedWidth={0}>
        <div className="brand">
          <div className="brand-mark">CT</div>
          <div>
            <Title level={4}>CodeTrack</Title>
            <Text>学生助学 harness</Text>
          </div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[activePage === "workspace" ? "tasks" : activePage]}
          items={navItems}
          onClick={(event) => setActivePage(event.key as PageKey)}
        />
        <div className="nav-profile">
          <Text type="secondary">当前画像</Text>
          <Text strong>{profileSummary.studentName}</Text>
          <Progress percent={profileSummary.progress} size="small" />
        </div>
      </Sider>
      <Layout className="main-layout">
        <Header className="topbar">
          <div>
            <Text type="secondary">{profileSummary.courseName}</Text>
            <Title level={3}>{activeTitle}</Title>
          </div>
          <Space wrap className="top-actions">
            <Input prefix={<Search size={16} />} placeholder="搜索任务、知识点或资料" />
            <Button icon={<Bot size={16} />} onClick={() => setActivePage("aiTutor")}>
              AI 快问
            </Button>
            <Badge status="processing" text="本地开发环境" />
          </Space>
        </Header>
        <Content className="content">
          {activePage === "home" && <LearningHome onNavigate={setActivePage} onOpenWorkspace={openWorkspace} />}
          {activePage === "tasks" && <CourseTasks onOpenWorkspace={openWorkspace} />}
          {activePage === "workspace" && <TaskWorkspace taskId={selectedTaskId} onBack={() => setActivePage("tasks")} />}
          {activePage === "selfStudy" && <SelfStudy />}
          {activePage === "aiTutor" && <AiTutor />}
          {activePage === "library" && <LearningLibrary />}
        </Content>
      </Layout>
      <div className="mobile-nav">
        {navItems.map((item) => (
          <button
            key={item.key}
            className={(activePage === item.key || (activePage === "workspace" && item.key === "tasks")) ? "active" : ""}
            onClick={() => setActivePage(item.key as PageKey)}
            type="button"
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </Layout>
  );
}

function LearningHome({
  onNavigate,
  onOpenWorkspace
}: {
  onNavigate: (page: PageKey) => void;
  onOpenWorkspace: (taskId?: string) => void;
}) {
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listTasks()
      .then(setTasks)
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, []);

  const cards = buildTaskCards(tasks);
  const todayTask = cards[0];

  return (
    <div className="page-grid">
      <section className="page-lead">
        <div>
          <Text type="secondary">今天优先处理</Text>
          <Title level={2}>{todayTask.title}</Title>
          <Paragraph>{todayTask.latest_summary}</Paragraph>
        </div>
        <Space wrap>
          <Button type="primary" icon={<Play size={16} />} onClick={() => onOpenWorkspace(todayTask.task_id)}>
            进入任务工作台
          </Button>
          <Button icon={<Sparkles size={16} />} onClick={() => onNavigate("selfStudy")}>
            复习薄弱点
          </Button>
        </Space>
      </section>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title="今日任务" loading={loading}>
            <Space direction="vertical" className="full">
              {cards.slice(0, 3).map((task) => (
                <div className="compact-row" key={task.task_id}>
                  <div>
                    <Text strong>{task.title}</Text>
                    <div>
                      <Text type="secondary">{task.deadline}</Text>
                    </div>
                  </div>
                  <Tag color={statusColor(task.progress_status)}>{progressLabel(task.progress_status)}</Tag>
                </div>
              ))}
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="学习进度">
            <Progress percent={profileSummary.progress} />
            <div className="metric-grid">
              <div>
                <Text type="secondary">提示依赖</Text>
                <Text strong>{profileSummary.hintDependency}</Text>
              </div>
              <div>
                <Text type="secondary">高频错因</Text>
                <Text strong>{profileSummary.frequentErrors[0]}</Text>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="薄弱知识点">
            <Space wrap>
              {profileSummary.weakPoints.map((point) => (
                <Tag key={point} color="orange">
                  {point}
                </Tag>
              ))}
            </Space>
            <Alert className="inline-alert" type="info" message="画像由任务提交、提示使用和资料保存记录更新。" showIcon />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card title="推荐下一步">
            <List
              dataSource={[
                "提交单链表删除任务，先验证头节点删除。",
                "生成链表边界处理复习笔记并保存到资料库。",
                "完成一组栈与队列对比练习。"
              ]}
              renderItem={(item, index) => (
                <List.Item actions={[<Button key="act" type="link" onClick={() => (index === 0 ? onOpenWorkspace() : onNavigate("selfStudy"))}>开始</Button>]}>
                  <List.Item.Meta title={item} description={index === 0 ? "Learning Navigator Agent 推荐" : "规则 harness 推荐"} />
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={7}>
          <Card title="最近资料">
            <List
              dataSource={artifacts.slice(0, 3)}
              renderItem={(item) => (
                <List.Item onClick={() => onNavigate("library")} className="clickable-row">
                  <List.Item.Meta title={item.title} description={`${item.type} · ${item.knowledgePoints.join("、")}`} />
                  <ChevronRight size={16} />
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={7}>
          <Card title="AI 助学建议">
            <Space direction="vertical" className="full">
              <Alert
                type="success"
                showIcon
                message="建议问题"
                description="为什么链表删除头节点容易出错？请结合我最近的提交解释。"
              />
              <Space wrap>
                <Tag color="blue">结合画像</Tag>
                <Tag color="gold">引用课程知识</Tag>
                <Tag color="green">置信度 86%</Tag>
              </Space>
              <Button block icon={<Bot size={16} />} onClick={() => onNavigate("aiTutor")}>
                打开 AI 助学
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

function CourseTasks({ onOpenWorkspace }: { onOpenWorkspace: (taskId?: string) => void }) {
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("全部");

  useEffect(() => {
    api
      .listTasks()
      .then(setTasks)
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, []);

  const cards = buildTaskCards(tasks);
  const filtered = cards.filter((task) => {
    if (filter === "全部") return true;
    if (filter === "未开始") return task.progress_status === "NOT_STARTED";
    if (filter === "进行中") return task.progress_status === "IN_PROGRESS";
    if (filter === "需要复习") return task.progress_status === "REVIEW_REQUIRED" || task.progress_status === "FAILED";
    return true;
  });

  return (
    <div className="page-grid">
      <section className="page-lead">
        <div>
          <Text type="secondary">教师任务学习</Text>
          <Title level={2}>从任务进入诊断、提示和学习总结</Title>
          <Paragraph>本页只展示学生侧任务完成链路，教师分发作为输入来源，不展开教师端后台。</Paragraph>
        </div>
        <Segmented value={filter} onChange={(value) => setFilter(String(value))} options={["全部", "未开始", "进行中", "需要复习"]} />
      </section>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={17}>
          <Spin spinning={loading}>
            <div className="task-card-list">
              {filtered.map((task) => (
                <Card key={task.task_id}>
                  <div className="task-card">
                    <div>
                      <Space wrap>
                        <Tag color={statusColor(task.progress_status)}>{progressLabel(task.progress_status)}</Tag>
                        <Tag>{task.difficulty}</Tag>
                        {task.real ? <Tag color="green">真实提交链路</Tag> : <Tag color="default">演示占位</Tag>}
                      </Space>
                      <Title level={4}>{task.title}</Title>
                      <Text type="secondary">{task.course_name} · 截止 {task.deadline}</Text>
                      <div className="tag-row">
                        {task.knowledge_points.map((point) => (
                          <Tag key={point} color="blue">
                            {point}
                          </Tag>
                        ))}
                      </div>
                      <Paragraph>{task.latest_summary}</Paragraph>
                    </div>
                    <Button
                      type={task.real ? "primary" : "default"}
                      icon={<ChevronRight size={16} />}
                      disabled={!task.real}
                      onClick={() => onOpenWorkspace(task.task_id)}
                    >
                      {task.real ? "进入工作台" : "待接入"}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </Spin>
        </Col>
        <Col xs={24} xl={7}>
          <Card title="截止与复习提醒">
            <Space direction="vertical" className="full">
              <Alert type="warning" message="单链表任务即将截止" description="建议今天完成一次修正提交，并查看诊断来源。" showIcon />
              <Alert type="info" message="二叉树需要复习" description="画像显示递归出口仍不稳定，适合进入自主学习生成例题。" showIcon />
            </Space>
          </Card>
          <Card title="任务页约束">
            <List
              size="small"
              dataSource={["状态必须明确", "知识点必须可见", "进入工作台动作必须清晰", "演示占位不能伪装成真实接口"]}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

function TaskWorkspace({ taskId, onBack }: { taskId: string; onBack: () => void }) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [code, setCode] = useState("");
  const [execution, setExecution] = useState<ExecutionStatus | null>(null);
  const [result, setResult] = useState<VersionResult | null>(null);
  const [versions, setVersions] = useState<VersionHistoryItem[]>([]);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [hints, setHints] = useState<Hint[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadVersion(versionId: string, submissionId: string | null) {
    const loaded = await api.getResults(versionId);
    setResult(loaded);
    setDiagnosis(null);
    setHints([]);
    if (loaded.diagnosis.status === "READY") {
      const loadedDiagnosis = await api.getDiagnosis(versionId);
      setDiagnosis(loadedDiagnosis);
      if (loadedDiagnosis.hint) {
        setHints([
          {
            hint_id: `${loadedDiagnosis.diagnosis_id}_level_${loadedDiagnosis.hint_level ?? 1}`,
            diagnosis_id: loadedDiagnosis.diagnosis_id,
            level: loadedDiagnosis.hint_level ?? 1,
            content: loadedDiagnosis.hint,
            unlocked: true,
            unlock_reason: "AUTO_LEVEL_1",
            generated_at: "",
            viewed_at: ""
          }
        ]);
      }
    }
    if (submissionId) {
      setVersions(await api.getVersions(submissionId));
      if (loaded.submission_status === "PASSED") {
        setSummary(await api.getSummary(submissionId));
      }
    }
  }

  async function loadTask() {
    setLoading(true);
    setError(null);
    setExecution(null);
    setResult(null);
    setDiagnosis(null);
    setHints([]);
    setVersions([]);
    setSummary(null);
    try {
      const detail = await api.getTask(taskId);
      setTask(detail);
      setCode(detail.interface_spec.student_template);
      if (detail.current_progress.latest_version_id) {
        await loadVersion(detail.current_progress.latest_version_id, detail.current_progress.submission_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (!task) return;
    setSubmitting(true);
    setError(null);
    setExecution(null);
    setResult(null);
    try {
      const submitted = await api.submitCode(task.task_id, code);
      let next = await api.getExecution(submitted.execution_id);
      setExecution(next);
      for (let i = 0; i < 10 && !terminalStatuses.has(next.status); i++) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        next = await api.getExecution(submitted.execution_id);
        setExecution(next);
      }
      await loadVersion(submitted.version_id, submitted.submission_id);
      const detail = await api.getTask(task.task_id);
      setTask(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function requestHint(level: number) {
    if (!diagnosis) return;
    setError(null);
    try {
      const nextHint = await api.requestHint(diagnosis.diagnosis_id, level);
      setHints((current) => {
        const withoutSame = current.filter((item) => item.level !== nextHint.level);
        return [...withoutSame, nextHint].sort((a, b) => a.level - b.level);
      });
      if (result) {
        setResult({
          ...result,
          hint_access: {
            ...result.hint_access,
            highest_viewed_level: Math.max(result.hint_access.highest_viewed_level, level),
            available_levels: level >= 2 ? [1, 2, 3] : result.hint_access.available_levels
          }
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "提示申请失败");
    }
  }

  useEffect(() => {
    loadTask();
  }, [taskId]);

  const passedCount = result?.tests.filter((test) => test.status === "PASSED").length ?? 0;
  const failedCount = result?.tests.filter((test) => test.status === "FAILED").length ?? 0;

  if (loading) return <Spin />;

  if (!task) {
    return (
      <div className="page-grid">
        {error && <Alert type="error" message={error} showIcon />}
        <Empty description="任务暂不可用" />
        <Button onClick={onBack}>返回任务列表</Button>
      </div>
    );
  }

  return (
    <div className="workspace">
      {error && <Alert type="error" message={error} showIcon />}
      <section className="page-lead">
        <div>
          <Text type="secondary">真实后端链路 · {task.language}</Text>
          <Title level={2}>{task.title}</Title>
          <Paragraph>提交后先展示系统验证事实，再展示 AI 诊断、课程来源和渐进提示。</Paragraph>
        </div>
        <Space wrap>
          <Button onClick={onBack}>返回任务列表</Button>
          <Button type="primary" icon={<Play size={16} />} loading={submitting} onClick={submit}>
            提交并诊断
          </Button>
        </Space>
      </section>

      <Row gutter={[16, 16]} className="workspace-grid">
        <Col xs={24} xl={7}>
          <Card title="任务说明">
            <Paragraph>{task.description}</Paragraph>
            <div className="signature">{task.interface_spec.function_signature}</div>
            <List size="small" dataSource={task.interface_spec.rules} renderItem={(item) => <List.Item>{item}</List.Item>} />
          </Card>
          <Card title="知识点与公开样例">
            <Space wrap className="tag-row">
              {task.learning_objectives.map((item) => (
                <Tag key={item} color="blue">
                  {item}
                </Tag>
              ))}
            </Space>
            <List
              size="small"
              dataSource={task.public_tests}
              renderItem={(item) => (
                <List.Item>
                  <Space direction="vertical" size={2}>
                    <Text strong>{item.name}</Text>
                    <Text type="secondary">
                      {JSON.stringify(item.input_summary)} -&gt; {item.expected_output_summary}
                    </Text>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <Card
            title="代码编辑器"
            extra={
              <Space wrap>
                <Button icon={<ClipboardPaste size={16} />} onClick={() => setCode(wrongHeadUpdateCode)}>
                  错误示例
                </Button>
                <Button icon={<RefreshCw size={16} />} onClick={() => setCode(task.interface_spec.student_template)}>
                  恢复模板
                </Button>
              </Space>
            }
          >
            <Editor
              height="460px"
              language="cpp"
              theme="vs"
              value={code}
              options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false }}
              onChange={(value) => setCode(value ?? "")}
            />
          </Card>
          <Card title="版本历史">
            <List
              dataSource={versions}
              locale={{ emptyText: "暂无版本" }}
              renderItem={(item) => (
                <List.Item>
                  <Space wrap>
                    <Text strong>第 {item.version_no} 版</Text>
                    <Tag color={statusColor(item.submission_status)}>{item.submission_status}</Tag>
                    <Text>{item.passed_count}/{item.total_required_count}</Text>
                    {item.is_latest && <Tag>最新</Tag>}
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col xs={24} xl={7}>
          <Card title="系统验证">
            {execution || result ? (
              <Space direction="vertical" className="full">
                <Space wrap>
                  <Tag color={statusColor(execution?.status ?? result?.execution.status ?? "PENDING")}>
                    {execution?.status ?? result?.execution.status}
                  </Tag>
                  <Text>通过 {passedCount} 项</Text>
                  <Text>失败 {failedCount} 项</Text>
                </Space>
                {result?.execution.compiler_stderr && <pre className="stderr">{result.execution.compiler_stderr}</pre>}
                <Table
                  size="small"
                  rowKey="test_case_id"
                  pagination={false}
                  dataSource={result?.tests ?? []}
                  columns={[
                    { title: "测试", dataIndex: "name" },
                    { title: "状态", dataIndex: "status", render: (value: string) => <Tag color={statusColor(value)}>{value}</Tag> },
                    { title: "实际输出", dataIndex: "actual_output" }
                  ]}
                />
              </Space>
            ) : (
              <Empty description="尚未执行" />
            )}
          </Card>

          <Card title="AI 诊断与来源">
            {diagnosis ? (
              <Space direction="vertical" className="full">
                <Alert
                  type={diagnosis.needs_teacher_review ? "warning" : "info"}
                  showIcon
                  message={diagnosis.diagnosis_type}
                  description={diagnosis.explanation}
                />
                <Space wrap>
                  <Tag color="gold">置信度 {Math.round(diagnosis.confidence * 100)}%</Tag>
                  <Tag color={diagnosis.model_provider === "RULE_FALLBACK" ? "orange" : "blue"}>{diagnosis.model_provider}</Tag>
                  <Tag color="purple">AI 生成内容</Tag>
                  {diagnosis.needs_teacher_review && <Tag color="red">需教师复核</Tag>}
                </Space>
              </Space>
            ) : (
              <Alert type="info" showIcon message="诊断状态" description={result ? result.diagnosis.status : "提交后展示诊断状态。"} />
            )}
            {result && (
              <Collapse
                className="section-collapse"
                items={[
                  {
                    key: "facts",
                    label: "工具事实",
                    children: <Text>执行状态 {result.execution.status}，提交状态 {result.submission_status}。</Text>
                  },
                  {
                    key: "diagnosis",
                    label: "AI 分析",
                    children: diagnosis ? (
                      <Space direction="vertical">
                        <Text>{diagnosis.explanation}</Text>
                        <Text type="secondary">证据：{diagnosis.verified_evidence_ids.join(", ")}</Text>
                      </Space>
                    ) : (
                      <Text>{result.diagnosis.status}</Text>
                    )
                  },
                  {
                    key: "sources",
                    label: "课程来源",
                    children: diagnosis ? (
                      diagnosis.knowledge_sources.length > 0 ? (
                        <List
                          size="small"
                          dataSource={diagnosis.knowledge_sources}
                          renderItem={(source) => (
                            <List.Item>
                              <Space direction="vertical" size={2}>
                                <Space wrap>
                                  <Text strong>{source.title}</Text>
                                  <Tag>{source.source_id}</Tag>
                                  <Tag color="blue">{source.version}</Tag>
                                  <Tag color="green">{source.authority_level}</Tag>
                                </Space>
                                <Text type="secondary">{source.summary}</Text>
                              </Space>
                            </List.Item>
                          )}
                        />
                      ) : (
                        <Text type="secondary">暂无可打开的课程来源</Text>
                      )
                    ) : (
                      <Text>暂无来源</Text>
                    )
                  },
                  {
                    key: "hints",
                    label: "渐进提示",
                    children: (
                      <Space direction="vertical" className="full">
                        {hints.length === 0 ? (
                          <Text type="secondary">暂无提示</Text>
                        ) : (
                          hints.map((hint) => (
                            <Alert
                              key={`${hint.diagnosis_id}_${hint.level}`}
                              type="success"
                              showIcon
                              message={`第 ${hint.level} 级提示`}
                              description={hint.content}
                            />
                          ))
                        )}
                        {diagnosis && (
                          <Space wrap>
                            <Button disabled={hints.some((hint) => hint.level === 2)} onClick={() => requestHint(2)}>
                              申请二级提示
                            </Button>
                            <Button
                              disabled={!hints.some((hint) => hint.level === 2) || hints.some((hint) => hint.level === 3)}
                              onClick={() => requestHint(3)}
                            >
                              申请三级提示
                            </Button>
                          </Space>
                        )}
                      </Space>
                    )
                  }
                ]}
              />
            )}
          </Card>

          <Card title="学习总结">
            {summary ? (
              <Space direction="vertical" className="full">
                <Tag color={statusColor(summary.final_status)}>{summary.final_status}</Tag>
                <Text>提交次数：{summary.version_count}</Text>
                <Alert type="info" message="下一步建议" description={summary.next_step_suggestion} showIcon />
                {summary.capability_evidence && (
                  <Alert type="success" message={summary.capability_evidence.capability_code} description={summary.capability_evidence.explanation} showIcon />
                )}
              </Space>
            ) : (
              <Empty description="通过后生成，并进入我的资料" />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

function SelfStudy() {
  const [point, setPoint] = useState("链表");
  const [outputType, setOutputType] = useState("复习笔记");
  const [saved, setSaved] = useState(false);
  const content = selfStudyOutputs[point][outputType];

  useEffect(() => {
    setSaved(false);
  }, [point, outputType]);

  return (
    <div className="page-grid">
      <section className="page-lead">
        <div>
          <Text type="secondary">自主学习链路</Text>
          <Title level={2}>按知识点生成讲解、练习和资料</Title>
          <Paragraph>第一版开放链表、栈与队列、二叉树；生成结果使用规则 harness，保留后续接入 Artifact Generator Agent 的结构。</Paragraph>
        </div>
        <Button type="primary" icon={<FileText size={16} />} onClick={() => setSaved(true)}>
          保存到我的资料
        </Button>
      </section>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={6}>
          <Card title="知识地图">
            <List
              dataSource={["链表", "栈与队列", "二叉树"]}
              renderItem={(item) => (
                <List.Item className={point === item ? "selected-row" : "clickable-row"} onClick={() => setPoint(item)}>
                  <Text strong={point === item}>{item}</Text>
                  {point === item && <Tag color="blue">当前</Tag>}
                </List.Item>
              )}
            />
          </Card>
          <Card title="画像提醒">
            <Alert type="warning" message="适配建议" description={`你最近在${profileSummary.weakPoints[0]}上出错较多，建议优先生成复习笔记。`} showIcon />
          </Card>
        </Col>
        <Col xs={24} lg={11}>
          <Card title={`${point}学习路径`}>
            <List
              dataSource={["先复习概念", "看一个分步例题", "做一道练习", "整理成资料", "完成巩固题"]}
              renderItem={(item, index) => (
                <List.Item>
                  <Badge count={index + 1} />
                  <Text>{item}</Text>
                </List.Item>
              )}
            />
          </Card>
          <Card title="生成结果">
            <Space direction="vertical" className="full">
              <Segmented
                value={outputType}
                onChange={(value) => setOutputType(String(value))}
                options={["概念讲解", "练习题", "复习笔记", "知识卡片", "思维导图", "PPT 大纲"]}
              />
              <Alert type="info" message={`${point} · ${outputType}`} description={content} showIcon />
              <Space wrap>
                <Tag color="purple">AI 生成内容</Tag>
                <Tag color="green">置信度 84%</Tag>
                <Tag color="blue">可保存为资料</Tag>
              </Space>
              {saved && <Alert type="success" message="已保存到我的资料演示列表" showIcon />}
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={7}>
          <Card title="引用来源">
            <List
              dataSource={knowledgeSources.filter((source) => source.title.includes(point.replace("与", "")) || source.summary.includes(point[0]) || point === "链表")}
              renderItem={(source) => (
                <List.Item>
                  <List.Item.Meta title={source.title} description={source.summary} />
                  <Tag color={source.level === "HIGH" ? "green" : "blue"}>{source.level}</Tag>
                </List.Item>
              )}
            />
          </Card>
          <Card title="下一步动作">
            <Space direction="vertical" className="full">
              <Button block>生成 5 道练习</Button>
              <Button block>整理成知识卡片</Button>
              <Button block>加入复习计划</Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

function AiTutor() {
  return (
    <div className="page-grid">
      <section className="page-lead">
        <div>
          <Text type="secondary">Concept Tutor Agent · Citation Guard Agent</Text>
          <Title level={2}>结合页面上下文、学习画像和课程知识库回答</Title>
          <Paragraph>这里不是通用聊天框，回答必须显示画像适配、引用来源、置信度和下一步动作。</Paragraph>
        </div>
        <Button type="primary" icon={<Sparkles size={16} />}>
          生成复习笔记
        </Button>
      </section>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={15}>
          <Card title="对话区">
            <div className="chat-flow">
              <div className="chat-bubble user">
                <Text strong>学生提问</Text>
                <Paragraph>为什么链表删除头节点容易出错？请结合我最近的提交解释。</Paragraph>
              </div>
              <div className="chat-bubble ai">
                <Space direction="vertical" className="full">
                  <Space wrap>
                    <Tag color="purple">AI 生成内容</Tag>
                    <Tag color="green">置信度 88%</Tag>
                    <Tag color="blue">已结合画像</Tag>
                  </Space>
                  <Paragraph>
                    头节点删除容易出错，是因为普通节点可以通过前驱节点改 `prev-&gt;next`，但头节点没有前驱节点。你最近的提交已经能删除中间节点，
                    但在 `position == 0` 时仍返回旧 head，所以公开样例中的头节点删除会失败。
                  </Paragraph>
                  <Paragraph>
                    下一步建议：先单独写出 `position == 0` 分支，返回 `head-&gt;next`；再用空链表、头节点、尾节点和越界位置四组样例验证。
                  </Paragraph>
                </Space>
              </div>
            </div>
            <Input.TextArea rows={4} placeholder="继续追问，例如：帮我把这段诊断整理成复习笔记" />
            <Space wrap className="action-bar">
              <Button>继续追问</Button>
              <Button>生成练习</Button>
              <Button>生成知识卡片</Button>
              <Button type="primary">保存到资料</Button>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={9}>
          <Card title="当前上下文">
            <List
              size="small"
              dataSource={["页面：任务工作台", "任务：单链表指定位置节点删除", "画像：链表边界处理薄弱", "风险：不能直接给完整答案"]}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          </Card>
          <Card title="引用来源">
            <List
              dataSource={knowledgeSources.slice(0, 2)}
              renderItem={(source) => (
                <List.Item>
                  <List.Item.Meta title={source.title} description={source.summary} />
                </List.Item>
              )}
            />
          </Card>
          <Card title="可执行下一步">
            <Space direction="vertical" className="full">
              <Button block>跳转相关任务</Button>
              <Button block>整理成笔记</Button>
              <Button block>更新复习计划</Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

function LearningLibrary() {
  const [type, setType] = useState("全部");
  const [point, setPoint] = useState("全部");
  const filtered = artifacts.filter((item) => {
    const typeMatch = type === "全部" || item.type === type;
    const pointMatch = point === "全部" || item.knowledgePoints.includes(point);
    return typeMatch && pointMatch;
  });
  const selected = filtered[0] ?? artifacts[0];

  return (
    <div className="page-grid">
      <section className="page-lead">
        <div>
          <Text type="secondary">资料沉淀</Text>
          <Title level={2}>保存笔记、卡片、总结、思维导图和 PPT 大纲</Title>
          <Paragraph>资料库承接任务总结、AI 回答和自主学习生成内容，第一版先不做真实 PPT 文件导出。</Paragraph>
        </div>
        <Space wrap>
          <Select value={type} onChange={setType} options={["全部", "学习笔记", "知识卡片", "错题总结", "思维导图", "PPT 大纲"].map((value) => ({ value, label: value }))} />
          <Select value={point} onChange={setPoint} options={["全部", "链表", "指针", "栈与队列", "二叉树"].map((value) => ({ value, label: value }))} />
        </Space>
      </section>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={15}>
          <Card title="资料列表">
            <List
              dataSource={filtered}
              locale={{ emptyText: "暂无资料" }}
              renderItem={(item) => (
                <List.Item actions={[<Button key="ask" type="link">向 AI 追问</Button>, <Button key="practice" type="link">生成练习</Button>]}>
                  <List.Item.Meta
                    title={
                      <Space wrap>
                        <Text strong>{item.title}</Text>
                        <Tag>{item.type}</Tag>
                        {item.aiGenerated && <Tag color="purple">AI 生成</Tag>}
                      </Space>
                    }
                    description={`${item.source} · ${item.knowledgePoints.join("、")} · ${item.createdAt}`}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={9}>
          <Card title="资料预览">
            {selected ? (
              <Space direction="vertical" className="full">
                <Title level={4}>{selected.title}</Title>
                <Paragraph>{selected.content}</Paragraph>
                <Alert type="info" message="学生备注" description={selected.note} showIcon />
                <Space wrap>
                  {selected.citations.map((citation) => (
                    <Tag key={citation} color="blue">
                      {citation}
                    </Tag>
                  ))}
                </Space>
                <Button type="primary" block>
                  继续学习这份资料
                </Button>
              </Space>
            ) : (
              <Empty description="请选择资料" />
            )}
          </Card>
          <Card title="资料库约束">
            <List
              size="small"
              dataSource={["记录资料类型", "记录来源页面", "保留课程引用", "支持继续向 AI 提问", "支持从资料生成练习"]}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
