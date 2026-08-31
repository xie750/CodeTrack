import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Download,
  FileText,
  GitBranchPlus,
  Layers3,
  Loader2,
  MessageSquareText,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Route,
  Save,
  Sparkles,
  Target,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { api, apiCache, StudentKnowledgeGraph, StudentKnowledgeGraphEdge, StudentKnowledgeGraphNode, type StudentProfile } from "../api";

type KnowledgeMapProps = {
  scope?: "course" | "self-study";
  courseName?: string;
};

type Selection = { kind: "node" | "edge"; id: string } | null;

type NodeDraft = {
  label: string;
  type: string;
  description: string;
  difficulty: number;
};

type RelationType = "前驱" | "后继" | "相关";

type InspectorTab = "knowledge" | "resources" | "questions" | "diagnosis";

type NodeDiagnosis = {
  status: "running" | "ready";
  nodeId: string;
  masteryScore: number;
  masteryLabel: string;
  confidence: number;
  summary: string;
  evidence: string[];
  riskFactors: string[];
  misconceptions: string[];
  prerequisites: string[];
  nextActions: string[];
  recommendedPractice: string;
  profileUsed: boolean;
  generatedAt: string;
};

type PendingRelation = {
  type: RelationType;
  sourceNodeId: string;
};

const selfStudyGraphStorageKey = "codetrack.selfStudyKnowledgeGraph.v1";

const defaultNodeDraft: NodeDraft = {
  label: "",
  type: "知识点",
  description: "",
  difficulty: 2,
};

const nodeTypeColors: Record<string, string> = {
  知识点: "#2563eb",
  概念: "#2563eb",
  方法: "#0f766e",
  公式: "#7c3aed",
  案例: "#d97706",
  能力: "#dc2626",
};

const relationStyles: Record<string, { color: string; width: number; type?: "solid" | "dashed" }> = {
  前驱: { color: "#CBD5E1", width: 1.5, type: "solid" },
  后继: { color: "#67E8F9", width: 1.2, type: "solid" },
  相关: { color: "#93C5FD", width: 1.2, type: "dashed" },
};

const relationTypes: RelationType[] = ["前驱", "后继", "相关"];

const inspectorTabs: { key: InspectorTab; label: string }[] = [
  { key: "knowledge", label: "知识" },
  { key: "resources", label: "资源" },
  { key: "questions", label: "题目" },
  { key: "diagnosis", label: "诊断" },
];

function clampDifficulty(value: number) {
  return Math.max(1, Math.min(5, Number.isFinite(value) ? value : 2));
}

function symbolSize(difficulty: number) {
  return 30 + clampDifficulty(difficulty) * 8;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value: string | null) {
  if (!value) return "暂无时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function fileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "未知大小";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function statusLabel(status: string) {
  if (status === "draft") return "本地草稿";
  return status === "published" ? "已发布" : status;
}

function stateTone(score?: number) {
  if (score === undefined) return "blue";
  if (score >= 4) return "orange";
  if (score <= 2) return "green";
  return "blue";
}

function masteryLabel(score: number) {
  if (score >= 85) return "掌握稳定";
  if (score >= 70) return "基本掌握";
  if (score >= 55) return "需要巩固";
  return "薄弱预警";
}

function clampMastery(value: number) {
  return Math.max(35, Math.min(96, Math.round(value)));
}

function estimateNodeMastery(node: StudentKnowledgeGraphNode, edges: StudentKnowledgeGraphEdge[] = []) {
  const difficulty = clampDifficulty(node.difficulty);
  return clampMastery(88 - difficulty * 8 - (node.description ? 0 : 8) + Math.min(8, edges.length * 2));
}

function rgbaFromHex(color: string, alpha: number) {
  const normalized = color.trim();
  const shortHex = normalized.match(/^#([0-9a-f]{3})$/i);
  const fullHex = normalized.match(/^#([0-9a-f]{6})$/i);
  const value = shortHex
    ? shortHex[1].split("").map((item) => item + item).join("")
    : fullHex?.[1];
  if (!value) return normalized;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function masteryFill(color: string, score: number) {
  const progress = Math.max(0, Math.min(1, score / 100));
  const boundary = Math.max(0, Math.min(1, 1 - progress));
  const nextBoundary = Math.min(1, boundary + 0.002);
  return {
    type: "linear",
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: "#ffffff" },
      { offset: boundary, color: "#ffffff" },
      { offset: nextBoundary, color: rgbaFromHex(color, 0.24) },
      { offset: 1, color: rgbaFromHex(color, 0.68) },
    ],
  };
}

function edgeTitle(edge: StudentKnowledgeGraphEdge, nodesById: Map<string, StudentKnowledgeGraphNode>) {
  const source = nodesById.get(edge.source)?.label ?? edge.source;
  const target = nodesById.get(edge.target)?.label ?? edge.target;
  return `${source} -> ${target}`;
}

function createEmptySelfStudyGraph(): StudentKnowledgeGraph {
  const now = new Date().toISOString();
  return {
    id: "self_study_graph_local",
    teaching_assignment_id: "self-study",
    course_id: "self-study",
    course_name: "自主学习",
    class_id: "personal",
    teacher_id: "",
    teacher_name: "学生自定义",
    title: "我的自学知识图谱",
    description: "学生个人创建和维护的自学知识图谱。",
    status: "draft",
    target_classes: [],
    source_files: [],
    source_summary: "自学图谱由学生自行创建、导入和维护，不影响教师发布的课程知识图谱。",
    node_count: 0,
    edge_count: 0,
    nodes: [],
    edges: [],
    created_at: now,
    updated_at: now,
    published_at: null,
  };
}

function withGraphCounts(graph: StudentKnowledgeGraph): StudentKnowledgeGraph {
  return {
    ...graph,
    node_count: graph.nodes.length,
    edge_count: graph.edges.length,
    updated_at: new Date().toISOString(),
  };
}

function buildNodeDiagnosis({
  node,
  graph,
  edges,
  profile,
  isSelfStudy,
}: {
  node: StudentKnowledgeGraphNode;
  graph: StudentKnowledgeGraph;
  edges: StudentKnowledgeGraphEdge[];
  profile: StudentProfile | null;
  isSelfStudy: boolean;
}): NodeDiagnosis {
  const knowledgeState = profile?.knowledge_states.find((item) => item.knowledge_point === node.label) ?? null;
  const profileUsed = Boolean(knowledgeState);
  const prereqCount = edges.filter((edge) => edge.target === node.id && edge.type === "前驱").length;
  const nextCount = edges.filter((edge) => edge.source === node.id && edge.type === "后继").length;
  const peerCount = edges.filter((edge) => edge.type === "相关").length;
  const difficulty = clampDifficulty(node.difficulty);
  const fallbackScore = estimateNodeMastery(node, edges);
  const masteryScore = clampMastery(knowledgeState?.mastery_score ?? fallbackScore);
  const weak = masteryScore < 70;
  const highDifficulty = difficulty >= 4;
  const hasDefinition = Boolean(node.description.trim());
  const confidence = clampMastery((profileUsed ? 78 : 58) + Math.min(12, edges.length * 3) + (hasDefinition ? 6 : 0)) / 100;
  const prerequisites = edges
    .filter((edge) => edge.target === node.id && edge.type === "前驱")
    .map((edge) => graph.nodes.find((item) => item.id === edge.source)?.label ?? edge.source)
    .slice(0, 4);
  const nextNodes = edges
    .filter((edge) => edge.source === node.id && edge.type === "后继")
    .map((edge) => graph.nodes.find((item) => item.id === edge.target)?.label ?? edge.target)
    .slice(0, 3);
  const relatedErrors = profile?.frequent_errors
    .filter((item) => item.related_knowledge_points.includes(node.label))
    .map((item) => `${item.label} ${item.count} 次`)
    .slice(0, 3) ?? [];

  const riskFactors = [
    weak ? `掌握度 ${masteryScore}%，低于稳定线 70%。` : "",
    highDifficulty ? "节点难度较高，适合拆成概念、例题和迁移练习三步巩固。" : "",
    prereqCount === 0 ? "当前节点缺少前驱知识标注，学习路径可能不够清晰。" : "",
    !hasDefinition ? "节点定义为空，AI 难以判断你是否能用自己的话解释。" : "",
    relatedErrors.length ? `画像中关联错因：${relatedErrors.join("、")}。` : "",
  ].filter(Boolean);

  const misconceptions = [
    node.label.includes("链表") || node.label.includes("头节点") ? "容易把“修改当前节点”误认为“更新链表入口”，删除头节点时需要特别检查返回值。" : "",
    node.label.includes("栈") ? "容易只记住后进先出定义，却忽略它适合处理最近未闭合状态。" : "",
    node.label.includes("队列") ? "容易把队列和栈的出入顺序混用，建议用连续操作手推验证。" : "",
    node.label.includes("递归") || node.label.includes("遍历") || node.label.includes("二叉树") ? "容易只背遍历顺序，没有说清递归出口、访问时机和子问题边界。" : "",
    node.label.includes("过拟合") || node.label.includes("正则化") ? "容易把训练集表现好当成模型真正掌握规律，需要结合验证集表现判断。" : "",
    node.label.includes("Python") || node.label.includes("函数") ? "容易停在语法记忆，建议用参数、返回值和边界输入解释程序行为。" : "",
  ].filter(Boolean);

  if (!misconceptions.length) {
    misconceptions.push("当前节点需要重点检查：能否说出定义、适用场景、一个反例，以及和相邻节点的关系。");
  }

  const nextActions = [
    prerequisites.length ? `先复盘前驱：${prerequisites.join("、")}。` : "先补一条前驱知识或写下该节点依赖的基础概念。",
    weak ? "完成 3 道基础题，优先验证定义和边界条件。" : "完成 1 道迁移题，验证能否在新场景中使用。",
    nextNodes.length ? `再连接到后继：${nextNodes.join("、")}。` : "补充一个后继应用场景，避免知识点孤立。",
    "把诊断结果整理成一张知识卡片，并在资料库中保留来源。",
  ];

  const evidence = [
    profileUsed ? `学习画像：${knowledgeState?.state}，掌握度 ${masteryScore}%，证据 ${knowledgeState?.evidence_count ?? 0} 条。` : "暂无精确画像匹配，当前为结构化规则估算。",
    `图谱结构：前驱 ${prereqCount} 个，后继 ${nextCount} 个，相关 ${peerCount} 个。`,
    `节点属性：类型 ${node.type}，难度 ${difficulty} / 5，来源 ${node.source === "ai" ? "AI 草稿" : isSelfStudy ? "学生自定义" : "教师自定义"}。`,
    graph.source_files.length ? `课程资料来源：${graph.source_files.length} 份。` : "当前节点暂无独立来源文件证据。",
  ];

  return {
    status: "ready",
    nodeId: node.id,
    masteryScore,
    masteryLabel: masteryLabel(masteryScore),
    confidence,
    summary: weak
      ? `${node.label} 当前还需要巩固，建议先补齐前驱理解，再用小题验证边界和应用。`
      : `${node.label} 当前学习状态较稳定，建议进入迁移练习或连接后继知识。`,
    evidence,
    riskFactors: riskFactors.length ? riskFactors : ["暂未发现明显风险，建议保持低频复盘。"],
    misconceptions,
    prerequisites: prerequisites.length ? prerequisites : ["暂无显式前驱节点"],
    nextActions,
    recommendedPractice: weak
      ? `生成一组围绕“${node.label}”的基础诊断题，要求每题说明判断依据。`
      : `生成一组围绕“${node.label}”的应用迁移题，要求关联相邻知识点。`,
    profileUsed,
    generatedAt: new Date().toISOString(),
  };
}

function readSelfStudyGraph(): StudentKnowledgeGraph {
  if (typeof window === "undefined") return createEmptySelfStudyGraph();
  const saved = window.localStorage.getItem(selfStudyGraphStorageKey);
  if (!saved) return createEmptySelfStudyGraph();
  try {
    const parsed = JSON.parse(saved) as StudentKnowledgeGraph;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
      return createEmptySelfStudyGraph();
    }
    return withGraphCounts({
      ...createEmptySelfStudyGraph(),
      ...parsed,
      id: parsed.id || "self_study_graph_local",
      status: parsed.status || "draft",
      nodes: parsed.nodes,
      edges: parsed.edges,
      source_files: Array.isArray(parsed.source_files) ? parsed.source_files : [],
      target_classes: Array.isArray(parsed.target_classes) ? parsed.target_classes : [],
    });
  } catch {
    return createEmptySelfStudyGraph();
  }
}

function nodeToDraft(node: StudentKnowledgeGraphNode | null): NodeDraft {
  if (!node) return defaultNodeDraft;
  return {
    label: node.label,
    type: node.type || "知识点",
    description: node.description || "",
    difficulty: clampDifficulty(node.difficulty),
  };
}

function patchZoomedPointerEvent(event: Event) {
  if (!(event instanceof MouseEvent)) return;
  const target = event.target instanceof HTMLElement ? event.target : null;
  const canvas = target?.tagName === "CANVAS" ? target : target?.querySelector?.("canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const scaleX = canvas.clientWidth / rect.width;
  const scaleY = canvas.clientHeight / rect.height;
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) return;

  const offsetX = (event.clientX - rect.left) * scaleX;
  const offsetY = (event.clientY - rect.top) * scaleY;
  try {
    Object.defineProperty(event, "offsetX", { configurable: true, value: offsetX });
    Object.defineProperty(event, "offsetY", { configurable: true, value: offsetY });
  } catch {
    // Some browser builds keep offsetX/Y non-configurable. In that case ECharts
    // falls back to its native coordinates; the page remains usable, just less precise.
  }
}

function buildChartOption(
  graph: StudentKnowledgeGraph,
  selection: Selection,
  pendingRelation: PendingRelation | null,
  masteryByNode: ReadonlyMap<string, number>,
): EChartsOption {
  const selectedId = selection?.id;
  const option = {
    tooltip: {
      trigger: "item",
      backgroundColor: "#fff",
      borderColor: "#E5EAF2",
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: "#111827", fontSize: 12 },
      extraCssText: "border-radius:10px;box-shadow:0 4px 16px rgba(15,23,42,.08);",
      formatter: (params: any) => {
        if (params.dataType === "edge") {
          return `<strong>${escapeHtml(params.data?.raw?.label ?? params.data?.relationType ?? "关系")}</strong>`;
        }
        const node = params.data;
        const difficulty = clampDifficulty(node?.raw?.difficulty ?? node?.value ?? 2);
        const masteryScore = clampMastery(node?.masteryScore ?? 50);
        return [
          `<strong>${escapeHtml(node?.name ?? "")}</strong>`,
          `<div>类型：${escapeHtml(node?.raw?.type ?? "知识点")}</div>`,
          `<div>掌握：${masteryScore}% · ${escapeHtml(masteryLabel(masteryScore))}</div>`,
          `<div>难度：${"★".repeat(difficulty)}${"☆".repeat(5 - difficulty)}</div>`,
          node?.raw?.description ? `<div>${escapeHtml(node.raw.description)}</div>` : "",
        ].filter(Boolean).join("");
      },
    },
    animationDuration: 800,
    animationEasingUpdate: "quinticInOut",
    series: [
      {
        type: "graph",
        layout: "force",
        data: graph.nodes.map((node) => {
          const color = node.color || nodeTypeColors[node.type] || "#2563eb";
          const masteryScore = masteryByNode.get(node.id) ?? estimateNodeMastery(
            node,
            graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id)
          );
          const selected = selectedId === node.id;
          const relationSource = pendingRelation?.sourceNodeId === node.id;
          return {
            id: node.id,
            name: node.label,
            value: clampDifficulty(node.difficulty),
            x: node.x,
            y: node.y,
            raw: node,
            masteryScore,
            symbolSize: symbolSize(node.difficulty),
            itemStyle: {
              color: masteryFill(color, masteryScore),
              borderColor: relationSource ? "#f59e0b" : selected ? "#2563eb" : color,
              borderWidth: relationSource ? 4 : selected ? 4 : 1.5,
              shadowBlur: relationSource ? 18 : selected ? 16 : 8,
              shadowColor: relationSource ? "rgba(245,158,11,.3)" : selected ? "rgba(37,99,235,.28)" : `${color}33`,
            },
            label: {
              show: true,
              position: "bottom",
              formatter: "{b}",
              fontSize: 11,
              fontWeight: 700,
              color: "#374151",
              distance: 7,
              width: 112,
              overflow: "truncate",
            },
          };
        }),
        links: graph.edges.map((edge) => {
          const base = relationStyles[edge.type] ?? relationStyles.相关;
          const selected = selectedId === edge.id;
          return {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            relationType: edge.type,
            raw: edge,
            lineStyle: {
              color: selected ? "#2563eb" : base.color,
              width: selected ? 2.8 : base.width,
              type: base.type ?? "solid",
              opacity: selected ? 0.96 : 0.78,
              curveness: 0.15,
            },
            label: {
              show: selected,
              formatter: edge.label || edge.type,
              color: "#1f3762",
              fontSize: 11,
              fontWeight: 700,
              backgroundColor: "rgba(255,255,255,.86)",
              borderColor: "#dbeafe",
              borderWidth: 1,
              borderRadius: 5,
              padding: [3, 6],
            },
          };
        }),
        categories: Object.keys(nodeTypeColors).map((name) => ({ name })),
        roam: true,
        draggable: true,
        focusNodeAdjacency: true,
        force: {
          repulsion: 360,
          gravity: 0.08,
          edgeLength: [105, 210],
          friction: 0.58,
        },
        emphasis: {
          focus: "adjacency",
          blurScope: "global",
          itemStyle: {
            borderWidth: 3,
            borderColor: "#2563EB",
            shadowBlur: 14,
            shadowColor: "rgba(37, 99, 235, 0.28)",
          },
          lineStyle: {
            width: 2.6,
            color: "#2563eb",
          },
        },
        selectedMode: "single",
        scaleLimit: { min: 0.35, max: 3 },
        edgeSymbol: ["none", "arrow"],
        edgeSymbolSize: 7,
        edgeLabel: { show: false },
      },
    ],
  };
  return option as EChartsOption;
}

export default function StudentKnowledgeMap({ scope = "course", courseName }: KnowledgeMapProps) {
  const { courseId = "" } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const diagnosisTimerRef = useRef<number | null>(null);
  const isSelfStudy = scope === "self-study";
  const [graph, setGraph] = useState<StudentKnowledgeGraph | null>(() => (
    isSelfStudy ? readSelfStudyGraph() : (courseId ? apiCache.peekStudentKnowledgeGraph(courseId) : null)
  ));
  const [loading, setLoading] = useState(!isSelfStudy && !graph);
  const [message, setMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [nodeEditor, setNodeEditor] = useState<{ mode: "create" | "edit"; values: NodeDraft } | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("knowledge");
  const [relationMenuOpen, setRelationMenuOpen] = useState(false);
  const [pendingRelation, setPendingRelation] = useState<PendingRelation | null>(null);
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [diagnosesByNode, setDiagnosesByNode] = useState<Record<string, NodeDiagnosis>>({});

  function disposeChart(clearDom = false) {
    const chart = chartRef.current;
    if (!chart) return;
    const dom = chart.getDom();
    chart.dispose();
    chartRef.current = null;
    if (clearDom && dom instanceof HTMLElement) {
      dom.replaceChildren();
    }
  }

  useEffect(() => {
    if (isSelfStudy) {
      setGraph((current) => current ?? readSelfStudyGraph());
      setLoading(false);
      setMessage(null);
      return undefined;
    }
    if (!courseId) return undefined;
    let alive = true;
    setLoading(!graph);
    setMessage(null);
    api.getStudentKnowledgeGraph(courseId)
      .then((data) => {
        if (!alive) return;
        setGraph(data);
        setSelection(data.nodes[0] ? { kind: "node", id: data.nodes[0].id } : null);
      })
      .catch(() => {
        if (!alive) return;
        setMessage("当前课程暂无已发布知识图谱。");
        setGraph(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [courseId, isSelfStudy]);

  useEffect(() => {
    if (!isSelfStudy || !graph || typeof window === "undefined") return;
    window.localStorage.setItem(selfStudyGraphStorageKey, JSON.stringify(withGraphCounts(graph)));
  }, [graph, isSelfStudy]);

  useEffect(() => {
    if (isSelfStudy || !courseId) {
      setStudentProfile(null);
      return undefined;
    }
    let alive = true;
    api.getStudentProfile(courseId)
      .then((profile) => {
        if (alive) setStudentProfile(profile);
      })
      .catch(() => {
        if (alive) setStudentProfile(null);
      });
    return () => {
      alive = false;
    };
  }, [courseId, isSelfStudy]);

  const nodesById = useMemo(() => new Map((graph?.nodes ?? []).map((node) => [node.id, node])), [graph]);
  const selectedNode = selection?.kind === "node" ? nodesById.get(selection.id) ?? null : null;
  const selectedEdge = selection?.kind === "edge" ? graph?.edges.find((edge) => edge.id === selection.id) ?? null : null;
  const hasNodes = Boolean(graph?.nodes.length);
  const relationTargets = useMemo(() => (
    selectedNode ? (graph?.nodes ?? []).filter((node) => node.id !== selectedNode.id) : []
  ), [graph, selectedNode]);
  const relatedEdges = useMemo(() => {
    if (!graph || !selectedNode) return [];
    return graph.edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id);
  }, [graph, selectedNode]);
  const masteryByNode = useMemo(() => {
    const scores = new Map<string, number>();
    if (!graph) return scores;
    const profileByKnowledgePoint = new Map(
      (studentProfile?.knowledge_states ?? []).map((item) => [item.knowledge_point, item.mastery_score])
    );
    graph.nodes.forEach((node) => {
      const diagnosis = diagnosesByNode[node.id];
      const related = graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id);
      const score = diagnosis?.status === "ready"
        ? diagnosis.masteryScore
        : profileByKnowledgePoint.get(node.label) ?? estimateNodeMastery(node, related);
      scores.set(node.id, clampMastery(score));
    });
    return scores;
  }, [diagnosesByNode, graph, studentProfile]);
  const prereqEdges = relatedEdges.filter((edge) => edge.target === selectedNode?.id && edge.type === "前驱");
  const nextEdges = relatedEdges.filter((edge) => edge.source === selectedNode?.id && edge.type === "后继");
  const peerEdges = relatedEdges.filter((edge) => edge.type === "相关");

  useEffect(() => {
    if (!graph?.nodes.length) {
      if (selection) setSelection(null);
      return;
    }
    if (selection?.kind === "node" && nodesById.has(selection.id)) return;
    if (selection?.kind === "edge" && graph.edges.some((edge) => edge.id === selection.id)) return;
    setSelection({ kind: "node", id: graph.nodes[0].id });
  }, [graph, nodesById, selection]);

  useEffect(() => {
    if (loading || !graph || !hasNodes) {
      disposeChart(true);
      return undefined;
    }
    if (!chartContainerRef.current) return undefined;
    const container = chartContainerRef.current;
    const chart = chartRef.current ?? echarts.init(container, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    chart.setOption(buildChartOption(graph, selection, pendingRelation, masteryByNode), true);

    const handleClick = (params: any) => {
      if (params.dataType === "node" && params.data?.id) {
        if (pendingRelation) {
          createRelationToTarget(params.data.id);
          return;
        }
        selectNode(params.data.id);
        return;
      }
      if (params.dataType === "edge" && params.data?.id) {
        setSelection({ kind: "edge", id: params.data.id });
        setNodeEditor(null);
        setRelationMenuOpen(false);
      }
    };
    chart.off("click");
    chart.on("click", handleClick);

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(container);
    const eventTypes = ["pointerdown", "pointermove", "pointerup", "mousedown", "mousemove", "mouseup", "click", "dblclick", "wheel"];
    eventTypes.forEach((type) => container.addEventListener(type, patchZoomedPointerEvent, { capture: true, passive: true }));
    return () => {
      resizeObserver.disconnect();
      chart.off("click", handleClick);
      eventTypes.forEach((type) => container.removeEventListener(type, patchZoomedPointerEvent, { capture: true }));
    };
  }, [graph, hasNodes, loading, masteryByNode, pendingRelation, selection]);

  useEffect(() => {
    return () => {
      if (diagnosisTimerRef.current) {
        window.clearTimeout(diagnosisTimerRef.current);
      }
      disposeChart();
    };
  }, []);

  const title = isSelfStudy ? "自学知识图谱" : "课程知识图谱";
  const displayCourseName = graph?.course_name || courseName || "当前课程";
  const edgeSourceNode = selectedEdge ? nodesById.get(selectedEdge.source) ?? null : null;
  const edgeTargetNode = selectedEdge ? nodesById.get(selectedEdge.target) ?? null : null;
  const activeNode = selectedNode ?? graph?.nodes[0] ?? null;
  const selectedTone = stateTone(activeNode?.difficulty);
  const activeDiagnosis = activeNode ? diagnosesByNode[activeNode.id] ?? null : null;
  const matchedKnowledgeState = activeNode
    ? studentProfile?.knowledge_states.find((item) => item.knowledge_point === activeNode.label)
    : null;
  const activeMasteryScore = activeNode ? masteryByNode.get(activeNode.id) ?? estimateNodeMastery(activeNode, relatedEdges) : 0;

  function selectNode(nodeId: string) {
    setSelection({ kind: "node", id: nodeId });
    setNodeEditor(null);
    setPendingRelation(null);
    setRelationMenuOpen(false);
    setInspectorTab("knowledge");
  }

  function runNodeDiagnosis(node: StudentKnowledgeGraphNode) {
    if (!graph) return;
    if (diagnosisTimerRef.current) {
      window.clearTimeout(diagnosisTimerRef.current);
    }
    setSelection({ kind: "node", id: node.id });
    setNodeEditor(null);
    setPendingRelation(null);
    setRelationMenuOpen(false);
    setInspectorTab("diagnosis");
    setDiagnosesByNode((current) => ({
      ...current,
      [node.id]: {
        status: "running",
        nodeId: node.id,
        masteryScore: 0,
        masteryLabel: "分析中",
        confidence: 0,
        summary: "AI 正在读取节点掌握度、前驱后继关系、资源证据和学习画像。",
        evidence: [],
        riskFactors: [],
        misconceptions: [],
        prerequisites: [],
        nextActions: [],
        recommendedPractice: "",
        profileUsed: false,
        generatedAt: new Date().toISOString(),
      },
    }));
    diagnosisTimerRef.current = window.setTimeout(() => {
      const latestGraph = graph;
      const latestRelatedEdges = latestGraph.edges.filter((edge) => edge.source === node.id || edge.target === node.id);
      setDiagnosesByNode((current) => ({
        ...current,
        [node.id]: buildNodeDiagnosis({
          node,
          graph: latestGraph,
          edges: latestRelatedEdges,
          profile: studentProfile,
          isSelfStudy,
        }),
      }));
    }, 900);
  }

  function selectEdge(edge: StudentKnowledgeGraphEdge) {
    setPendingRelation(null);
    setRelationMenuOpen(false);
    setNodeEditor(null);
    setSelection({ kind: "edge", id: edge.id });
  }

  function actionToSelfStudy() {
    navigate("/self-study", { state: { knowledgePoint: activeNode?.label, fromCourseId: courseId } });
  }

  function openCreateNode() {
    if (!isSelfStudy) return;
    setGraph((current) => {
      const base = current ?? createEmptySelfStudyGraph();
      const nextIndex = base.nodes.length + 1;
      const label = base.nodes.some((node) => node.label === "自定义节点") ? `自定义节点 ${nextIndex}` : "自定义节点";
      const node: StudentKnowledgeGraphNode = {
        id: `self_node_${Date.now()}`,
        label,
        type: "知识点",
        description: "",
        difficulty: 2,
        x: 120 + (base.nodes.length % 4) * 160,
        y: 120 + Math.floor(base.nodes.length / 4) * 130,
        color: nodeTypeColors.知识点,
        source: "custom",
      };
      setSelection({ kind: "node", id: node.id });
      setInspectorTab("knowledge");
      return withGraphCounts({ ...base, nodes: [...base.nodes, node] });
    });
    setNodeEditor(null);
    setPendingRelation(null);
    setRelationMenuOpen(false);
    setMessage("已添加自定义节点，可在右侧继续调整。");
  }

  function openEditNode(node: StudentKnowledgeGraphNode) {
    setSelection({ kind: "node", id: node.id });
    setNodeEditor({ mode: "edit", values: nodeToDraft(node) });
    setPendingRelation(null);
    setRelationMenuOpen(false);
  }

  function updateNodeDraft(field: keyof NodeDraft, value: string | number) {
    setNodeEditor((current) => (
      current ? { ...current, values: { ...current.values, [field]: value } } : current
    ));
  }

  function saveNodeDraft() {
    if (!nodeEditor || !isSelfStudy) return;
    const label = nodeEditor.values.label.trim() || "未命名知识点";
    const description = nodeEditor.values.description.trim();
    const difficulty = clampDifficulty(Number(nodeEditor.values.difficulty));
    setGraph((current) => {
      const base = current ?? createEmptySelfStudyGraph();
      if (selectedNode) {
        return withGraphCounts({
          ...base,
          nodes: base.nodes.map((node) => (
            node.id === selectedNode.id
              ? {
                  ...node,
                  label,
                  type: nodeEditor.values.type,
                  description,
                  difficulty,
                  color: nodeTypeColors[nodeEditor.values.type] || node.color || "#2563eb",
                }
              : node
          )),
        });
      }
      return base;
    });
    setNodeEditor(null);
    setPendingRelation(null);
    setRelationMenuOpen(false);
    setMessage("自学图谱已更新。");
  }

  function deleteActiveNode() {
    if (!isSelfStudy || !selectedNode) return;
    setGraph((current) => {
      const base = current ?? createEmptySelfStudyGraph();
      const nextNodes = base.nodes.filter((node) => node.id !== selectedNode.id);
      setSelection(nextNodes[0] ? { kind: "node", id: nextNodes[0].id } : null);
      return withGraphCounts({
        ...base,
        nodes: nextNodes,
        edges: base.edges.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id),
      });
    });
    setNodeEditor(null);
    setPendingRelation(null);
    setRelationMenuOpen(false);
    setMessage("节点已删除，相关关系也已同步移除。");
  }

  function openCreateRelation(type: RelationType) {
    if (!isSelfStudy || !selectedNode) return;
    if (!graph || !relationTargets.length) {
      setMessage("至少需要两个节点后才能创建关联关系。");
      return;
    }
    setPendingRelation({ type, sourceNodeId: selectedNode.id });
    setRelationMenuOpen(false);
    setNodeEditor(null);
    setMessage(`正在添加${type}关系，请在图中点击目标节点。`);
  }

  function createRelationToTarget(targetNodeId: string) {
    if (!isSelfStudy || !graph || !pendingRelation) return;
    const sourceNode = nodesById.get(pendingRelation.sourceNodeId);
    const targetNode = nodesById.get(targetNodeId);
    if (!sourceNode || !targetNode) {
      setPendingRelation(null);
      setMessage("当前活动节点不存在，请重新选择节点后再添加关系。");
      return;
    }
    if (sourceNode.id === targetNode.id) {
      setMessage("不能把节点关联到自己，请选择另一个节点。");
      return;
    }
    const edgeSource = pendingRelation.type === "前驱" ? targetNode.id : sourceNode.id;
    const edgeTarget = pendingRelation.type === "前驱" ? sourceNode.id : targetNode.id;
    const duplicate = graph.edges.find((edge) => edge.source === edgeSource && edge.target === edgeTarget && edge.type === pendingRelation.type);
    if (duplicate) {
      setSelection({ kind: "edge", id: duplicate.id });
      setPendingRelation(null);
      setMessage("这条关系已经存在，已帮你选中。");
      return;
    }
    const edge: StudentKnowledgeGraphEdge = {
      id: `self_edge_${Date.now()}`,
      source: edgeSource,
      target: edgeTarget,
      type: pendingRelation.type,
      label: pendingRelation.type,
    };
    setGraph((current) => {
      const base = current ?? createEmptySelfStudyGraph();
      return withGraphCounts({ ...base, edges: [...base.edges, edge] });
    });
    setNodeEditor(null);
    setSelection({ kind: "node", id: sourceNode.id });
    setInspectorTab("knowledge");
    setPendingRelation(null);
    setMessage(`${pendingRelation.type}关系已添加。`);
  }

  function deleteSelectedEdge() {
    if (!isSelfStudy || !selectedEdge) return;
    const fallbackNodeId = selectedEdge.source;
    setGraph((current) => {
      const base = current ?? createEmptySelfStudyGraph();
      return withGraphCounts({
        ...base,
        edges: base.edges.filter((edge) => edge.id !== selectedEdge.id),
      });
    });
    setSelection(nodesById.has(fallbackNodeId) ? { kind: "node", id: fallbackNodeId } : null);
    setPendingRelation(null);
    setRelationMenuOpen(false);
    setMessage("关系已删除。");
  }

  function exportSelfStudyGraph() {
    if (!graph || !isSelfStudy) return;
    const blob = new Blob([JSON.stringify(withGraphCounts(graph), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "self-study-knowledge-map.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function importSelfStudyGraph(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !isSelfStudy) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Partial<StudentKnowledgeGraph>;
        if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
          throw new Error("invalid graph");
        }
        const imported = withGraphCounts({
          ...createEmptySelfStudyGraph(),
          ...parsed,
          status: "draft",
          teacher_name: "学生自定义",
          course_name: "自主学习",
          nodes: parsed.nodes,
          edges: parsed.edges,
          source_files: [],
          source_summary: parsed.source_summary || "从本地 JSON 导入的学生自学知识图谱。",
          published_at: null,
        });
        setGraph(imported);
        setSelection(imported.nodes[0] ? { kind: "node", id: imported.nodes[0].id } : null);
        setMessage("图谱已导入，可继续编辑节点。");
      } catch {
        setMessage("导入失败：请选择包含 nodes 和 edges 的知识图谱 JSON 文件。");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="student-map-page student-graph-page">
      <header className="student-map-head student-graph-head">
        <div>
          <h1>{title}</h1>
          <p>
            {isSelfStudy
              ? "这是你的个人自学图谱，可自行创建节点、编辑内容、导入导出，不影响教师下发的课程图谱。"
              : graph
              ? `${graph.teacher_name} 发布给 ${graph.target_classes.join("、") || "当前班级"} 的唯一课程图谱。`
              : "读取教师发布给当前班级的课程知识图谱。"}
          </p>
        </div>
        {isSelfStudy ? (
          <div className="student-graph-head-actions">
            <button type="button" onClick={() => importInputRef.current?.click()}>
              <Upload size={17} />
              导入图谱
            </button>
            <input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={importSelfStudyGraph} />
          </div>
        ) : (
          <button type="button" disabled={!graph} onClick={actionToSelfStudy}>
            <Route size={17} />
            生成学习路径
          </button>
        )}
      </header>

      {message ? <p className="student-data-message">{message}</p> : null}

      <section className="student-graph-stats">
        {(isSelfStudy ? [
          { label: "节点", value: graph?.node_count ?? 0, sub: hasNodes ? "学生自建结构" : "尚未创建", icon: <Network size={23} />, tone: "blue" },
          { label: "关系", value: graph?.edge_count ?? 0, sub: "可导入或后续编辑", icon: <Layers3 size={23} />, tone: "green" },
          { label: "状态", value: hasNodes ? "本地草稿" : "空白图谱", sub: formatDate(graph?.updated_at ?? null), icon: <CheckCircle2 size={23} />, tone: "purple" },
          { label: "来源", value: "个人", sub: "学生自定义", icon: <FileText size={23} />, tone: "orange" },
        ] : [
          { label: "节点", value: graph?.node_count ?? 0, sub: "知识结构", icon: <Network size={23} />, tone: "blue" },
          { label: "关系", value: graph?.edge_count ?? 0, sub: "前驱/后继/相关", icon: <Layers3 size={23} />, tone: "green" },
          { label: "状态", value: graph ? statusLabel(graph.status) : "读取中", sub: formatDate(graph?.published_at ?? null), icon: <CheckCircle2 size={23} />, tone: "purple" },
          { label: "来源", value: graph?.source_files.length ?? 0, sub: "课程资料", icon: <FileText size={23} />, tone: "orange" },
        ]).map((item) => (
          <article className={`course-dashboard-stat ${item.tone}`} key={item.label}>
            <span>{item.icon}</span>
            <div>
              <em>{item.label}</em>
              <strong>{loading ? "..." : item.value}</strong>
              <p>{item.sub}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="student-map-layout student-graph-layout">
        <main className="student-graph-main">
          <div className="student-graph-toolbar">
            <div>
              {Object.entries(nodeTypeColors).map(([type, color]) => (
                <span key={type}><i style={{ background: color }} />{type}</span>
              ))}
            </div>
            <div className="student-graph-toolbar-actions">
              {isSelfStudy ? (
                <>
                  <button type="button" onClick={openCreateNode}>
                    <Plus size={15} />
                    新建节点
                  </button>
                  <div className="student-graph-dropdown">
                    <button
                      type="button"
                      className={pendingRelation ? "active" : ""}
                      disabled={!selectedNode || relationTargets.length === 0}
                      aria-haspopup="menu"
                      aria-expanded={relationMenuOpen}
                      onClick={() => setRelationMenuOpen((open) => !open)}
                    >
                      <GitBranchPlus size={15} />
                      添加关系
                      <ChevronDown size={14} />
                    </button>
                    {relationMenuOpen ? (
                      <div className="student-graph-dropdown-menu" role="menu">
                        {relationTypes.map((type) => (
                          <button key={type} type="button" role="menuitem" onClick={() => openCreateRelation(type)}>
                            <span>{type}</span>
                            <small>
                              {type === "前驱"
                                ? "点选当前节点的前置知识"
                                : type === "后继"
                                ? "点选当前节点的后续知识"
                                : "点选可共同复习的知识"}
                            </small>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button type="button" disabled={!selectedNode && !selectedEdge} onClick={selectedEdge ? deleteSelectedEdge : deleteActiveNode}>
                    <Trash2 size={15} />
                    {selectedEdge ? "删除关系" : "删除节点"}
                  </button>
                  <button type="button" disabled={!graph} onClick={exportSelfStudyGraph}>
                    <Download size={15} />
                    导出
                  </button>
                </>
              ) : null}
              <button type="button" disabled={!graph || !hasNodes} onClick={() => chartRef.current?.resize()}>
                <RefreshCw size={15} />
                重置视图
              </button>
            </div>
          </div>

          <div className="student-graph-canvas-shell">
            {pendingRelation && selectedNode ? (
              <div className="student-graph-linking-state">
                <span><GitBranchPlus size={15} /> 正在添加{pendingRelation.type}关系</span>
                <strong>活动节点：{selectedNode.label}</strong>
                <button type="button" onClick={() => setPendingRelation(null)}>取消</button>
              </div>
            ) : null}
            {!loading && graph && hasNodes ? (
              <div className="student-graph-mastery-legend" aria-hidden="true">
                <strong>填充高度 = 掌握度</strong>
                <span><i />低</span>
                <span><i />高</span>
              </div>
            ) : null}
            {loading ? (
              <div key="graph-loading" className="student-graph-empty">
                <Loader2 size={24} />
                <strong>正在读取知识图谱</strong>
                <p>系统会按当前学生所在班级和课程匹配唯一图谱。</p>
              </div>
            ) : graph && hasNodes ? (
              <div key="graph-canvas" className="student-graph-canvas" ref={chartContainerRef} aria-label={`${displayCourseName} 知识图谱`} />
            ) : isSelfStudy ? (
              <div key="self-study-empty" className="student-graph-empty student-graph-start-state">
                <div className="student-graph-empty-visual">
                  <span><Network size={24} /></span>
                  <i />
                  <span><GitBranchPlus size={22} /></span>
                  <i />
                  <span><BookOpen size={22} /></span>
                </div>
                <strong>开始搭建你的自学知识图谱</strong>
                <p>当前还没有节点。你可以先创建一个知识点，也可以导入已有 JSON 图谱，后续再补充关系和学习资料。</p>
                <div className="student-graph-empty-actions">
                  <button type="button" onClick={openCreateNode}>
                    <Plus size={15} />
                    创建第一个节点
                  </button>
                  <button type="button" onClick={() => importInputRef.current?.click()}>
                    <Upload size={15} />
                    导入图谱
                  </button>
                </div>
                <div className="student-graph-empty-tips">
                  <span>个人可编辑</span>
                  <span>可导入导出</span>
                  <span>与课程图谱隔离</span>
                </div>
              </div>
            ) : (
              <div key="course-empty" className="student-graph-empty">
                <Network size={26} />
                <strong>还没有图谱内容</strong>
                <p>教师发布到当前班级后，学生端会在这里显示课程图谱。</p>
              </div>
            )}
          </div>
        </main>

        <aside className="student-map-side student-graph-side">
          <section className="student-panel student-graph-inspector">
            {selectedEdge ? (
              <>
                <div className="student-graph-node-head">
                  <span className="teacher-soft-icon blue"><ArrowRight size={20} /></span>
                  <div className="student-graph-node-title">
                    <h2>关系详情</h2>
                    <p>{selectedEdge.type} · {edgeTitle(selectedEdge, nodesById)}</p>
                  </div>
                </div>
                <div className="student-graph-edge-flow">
                  <button type="button" onClick={() => edgeSourceNode && selectNode(edgeSourceNode.id)} disabled={!edgeSourceNode}>
                    <span>起点</span>
                    <strong>{edgeSourceNode?.label ?? selectedEdge.source}</strong>
                  </button>
                  <ArrowRight size={18} />
                  <button type="button" onClick={() => edgeTargetNode && selectNode(edgeTargetNode.id)} disabled={!edgeTargetNode}>
                    <span>终点</span>
                    <strong>{edgeTargetNode?.label ?? selectedEdge.target}</strong>
                  </button>
                </div>
                <div className="student-graph-definition">
                  <strong>关系定义</strong>
                  <p>{selectedEdge.label || selectedEdge.type}</p>
                </div>
              </>
            ) : activeNode ? (
              <>
                <div className="student-graph-node-head">
                  <span className={`teacher-soft-icon ${selectedTone}`}><BookOpen size={20} /></span>
                  <div className="student-graph-node-title">
                    <h2>{activeNode.label}</h2>
                    <p>{activeNode.type} · {activeNode.source === "ai" ? "AI 草稿" : isSelfStudy ? "学生自定义" : "教师自定义"}</p>
                  </div>
                  <div className="student-graph-node-actions">
                    <button type="button" className="student-graph-ai-button" onClick={() => runNodeDiagnosis(activeNode)}>
                      <BrainCircuit size={15} />
                      AI诊断
                    </button>
                    {isSelfStudy ? (
                      <button type="button" className="student-graph-icon-button" aria-label="编辑节点" onClick={() => openEditNode(activeNode)}>
                        <Pencil size={16} />
                      </button>
                    ) : null}
                  </div>
                </div>

                {nodeEditor ? (
                  <div className="student-graph-editor">
                    <label>
                      节点名称
                      <input
                        value={nodeEditor.values.label}
                        onChange={(event) => updateNodeDraft("label", event.target.value)}
                        placeholder="例如：梯度下降"
                      />
                    </label>
                    <label>
                      节点类型
                      <select value={nodeEditor.values.type} onChange={(event) => updateNodeDraft("type", event.target.value)}>
                        {Object.keys(nodeTypeColors).map((type) => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </label>
                    <label>
                      难度
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={nodeEditor.values.difficulty}
                        onChange={(event) => updateNodeDraft("difficulty", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      说明
                      <textarea
                        value={nodeEditor.values.description}
                        onChange={(event) => updateNodeDraft("description", event.target.value)}
                        placeholder="写下你对这个知识点的理解、来源或待解决问题"
                        rows={4}
                      />
                    </label>
                    <div className="student-graph-editor-actions">
                      <button type="button" onClick={saveNodeDraft}><Save size={15} />保存</button>
                      <button type="button" onClick={() => setNodeEditor(null)}><X size={15} />取消</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="student-graph-inspector-tabs" role="tablist" aria-label="节点详情">
                      {inspectorTabs.map((tab) => (
                        <button
                          type="button"
                          role="tab"
                          aria-selected={inspectorTab === tab.key}
                          className={inspectorTab === tab.key ? "active" : ""}
                          key={tab.key}
                          onClick={() => setInspectorTab(tab.key)}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="student-graph-tab-body">
                      {inspectorTab === "knowledge" ? (
                        <>
                          <div className="student-graph-relation-summary">
                            <span><em>前驱</em><strong>{prereqEdges.length}</strong></span>
                            <span><em>后继</em><strong>{nextEdges.length}</strong></span>
                            <span><em>相关</em><strong>{peerEdges.length}</strong></span>
                          </div>
                          <div className="student-graph-section-label">关联节点</div>
                          <div className="student-graph-relations">
                            <RelationGroup title="前驱知识" edges={prereqEdges} nodesById={nodesById} currentId={activeNode.id} onSelect={selectEdge} />
                            <RelationGroup title="后继知识" edges={nextEdges} nodesById={nodesById} currentId={activeNode.id} onSelect={selectEdge} />
                            <RelationGroup title="相关知识" edges={peerEdges} nodesById={nodesById} currentId={activeNode.id} onSelect={selectEdge} />
                            {isSelfStudy && relationTargets.length === 0 ? (
                              <div className="empty-panel compact">再新建一个节点后，就可以为当前节点添加前驱、后继或相关关系。</div>
                            ) : null}
                          </div>
                          <div className="student-graph-section-label">属性</div>
                          <div className="student-graph-meta">
                            <span>类型 <strong>{activeNode.type}</strong></span>
                            <span>掌握 <strong>{activeMasteryScore}% · {masteryLabel(activeMasteryScore)}</strong></span>
                            <span>难度 <strong>{clampDifficulty(activeNode.difficulty)} / 5</strong></span>
                            <span>来源 <strong>{activeNode.source === "ai" ? "AI 草稿" : isSelfStudy ? "学生自定义" : "教师自定义"}</strong></span>
                          </div>
                          <div className="student-graph-section-label">定义</div>
                          <div className="student-graph-definition">
                            <p>{activeNode.description || "暂无定义，可点击标题旁的编辑按钮补充说明。"}</p>
                          </div>
                        </>
                      ) : null}

                      {inspectorTab === "resources" ? (
                        <>
                          {graph?.source_summary ? (
                            <div className="map-advice">
                              <span className="teacher-soft-icon green"><CircleDot size={20} /></span>
                              <div>
                                <strong>资料摘要</strong>
                                <p>{graph.source_summary}</p>
                              </div>
                            </div>
                          ) : null}
                          <div className="map-source-list student-graph-resource-list">
                            {(graph?.source_files ?? []).map((source) => (
                              <article key={source.filename}>
                                <span className="blue"><FileText size={16} /></span>
                                <div>
                                  <strong>{source.filename}</strong>
                                  <p>{fileSize(source.size_bytes)} · {source.mime_type}</p>
                                </div>
                              </article>
                            ))}
                            {!loading && graph && !graph.source_files.length ? (
                              <div className="empty-panel compact">
                                {isSelfStudy ? "自学图谱暂无来源文件，后续可接入资料库或导入来源。" : "暂无来源文件。"}
                              </div>
                            ) : null}
                          </div>
                        </>
                      ) : null}

                      {inspectorTab === "questions" ? (
                        <div className="student-graph-question-list">
                          <article>
                            <span><Target size={16} /></span>
                            <div>
                              <strong>生成练习</strong>
                              <p>围绕当前活动节点生成巩固题和追问。</p>
                            </div>
                            <button type="button" onClick={actionToSelfStudy}>开始</button>
                          </article>
                          <article>
                            <span><Sparkles size={16} /></span>
                            <div>
                              <strong>生成讲解</strong>
                              <p>把节点定义、前驱和后继整合成学习材料。</p>
                            </div>
                            <button type="button" onClick={actionToSelfStudy}>生成</button>
                          </article>
                          <article>
                            <span><MessageSquareText size={16} /></span>
                            <div>
                              <strong>向 AI 提问</strong>
                              <p>带着当前节点上下文进入助学问答。</p>
                            </div>
                            <button type="button" onClick={actionToSelfStudy}>提问</button>
                          </article>
                        </div>
                      ) : null}

                      {inspectorTab === "diagnosis" ? (
                        <div className="student-graph-diagnosis">
                          {!activeDiagnosis ? (
                            <section className="student-graph-diagnosis-empty">
                              <span><BrainCircuit size={18} /></span>
                              <strong>等待 AI 诊断</strong>
                              <p>点击右上角 AI诊断 后，系统会根据掌握度、关系结构、来源证据和学习画像生成分析。</p>
                            </section>
                          ) : activeDiagnosis.status === "running" ? (
                            <section className="student-graph-diagnosis-running">
                              <Loader2 size={20} />
                              <strong>正在分析 {activeNode.label}</strong>
                              <p>{activeDiagnosis.summary}</p>
                            </section>
                          ) : (
                            <>
                              <section className={`student-graph-diagnosis-score ${activeDiagnosis.masteryScore < 70 ? "weak" : "stable"}`}>
                                <div>
                                  <strong>{activeDiagnosis.masteryScore}%</strong>
                                  <span>{activeDiagnosis.masteryLabel}</span>
                                </div>
                                <p>{activeDiagnosis.summary}</p>
                              </section>

                              <div className="student-graph-diagnosis-metrics">
                                <span>置信度 <strong>{Math.round(activeDiagnosis.confidence * 100)}%</strong></span>
                                <span>画像匹配 <strong>{activeDiagnosis.profileUsed ? "已使用" : "未匹配"}</strong></span>
                                <span>证据数 <strong>{matchedKnowledgeState?.evidence_count ?? "估算"}</strong></span>
                              </div>

                              <DiagnosisList title="判断依据" items={activeDiagnosis.evidence} />
                              <DiagnosisList title="风险信号" items={activeDiagnosis.riskFactors} />
                              <DiagnosisList title="常见误区" items={activeDiagnosis.misconceptions} />
                              <DiagnosisList title="前驱补齐" items={activeDiagnosis.prerequisites} />
                              <DiagnosisList title="下一步动作" items={activeDiagnosis.nextActions} />

                              <section className="student-graph-diagnosis-practice">
                                <strong>推荐练习</strong>
                                <p>{activeDiagnosis.recommendedPractice}</p>
                                <button type="button" onClick={actionToSelfStudy}>
                                  <Target size={15} />
                                  去生成练习
                                </button>
                              </section>
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </>
            ) : (
              <p className="student-panel-copy">
                {isSelfStudy ? "创建或导入节点后，可以在这里编辑节点说明、难度和来源。" : "点击图谱中的节点或关系后，这里会显示学习详情。"}
              </p>
            )}
          </section>
        </aside>
      </section>
    </div>
  );
}

function RelationGroup({
  title,
  edges,
  nodesById,
  currentId,
  onSelect,
}: {
  title: string;
  edges: StudentKnowledgeGraphEdge[];
  nodesById: Map<string, StudentKnowledgeGraphNode>;
  currentId: string;
  onSelect: (edge: StudentKnowledgeGraphEdge) => void;
}) {
  return (
    <div>
      <strong>{title}</strong>
      {edges.length ? edges.map((edge) => {
        const otherId = edge.source === currentId ? edge.target : edge.source;
        const node = nodesById.get(otherId);
        return (
          <button type="button" key={edge.id} onClick={() => onSelect(edge)}>
            <span>{node?.label ?? otherId}</span>
            <small>{edge.type}</small>
          </button>
        );
      }) : <p>暂无</p>}
    </div>
  );
}

function DiagnosisList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="student-graph-diagnosis-list">
      <strong>{title}</strong>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
