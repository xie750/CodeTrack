import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleDot,
  Download,
  FileText,
  GitBranchPlus,
  Layers3,
  Loader2,
  MessageSquareText,
  Network,
  NotebookPen,
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
import { api, apiCache, StudentKnowledgeGraph, StudentKnowledgeGraphEdge, StudentKnowledgeGraphNode } from "../api";

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
        return [
          `<strong>${escapeHtml(node?.name ?? "")}</strong>`,
          `<div>类型：${escapeHtml(node?.raw?.type ?? "知识点")}</div>`,
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
          const selected = selectedId === node.id;
          return {
            id: node.id,
            name: node.label,
            value: clampDifficulty(node.difficulty),
            x: node.x,
            y: node.y,
            raw: node,
            symbolSize: symbolSize(node.difficulty),
            itemStyle: {
              color: "#fff",
              borderColor: selected ? "#2563eb" : color,
              borderWidth: selected ? 4 : 1.5,
              shadowBlur: selected ? 16 : 8,
              shadowColor: selected ? "rgba(37,99,235,.28)" : `${color}33`,
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
  const isSelfStudy = scope === "self-study";
  const [graph, setGraph] = useState<StudentKnowledgeGraph | null>(() => (
    isSelfStudy ? readSelfStudyGraph() : (courseId ? apiCache.peekStudentKnowledgeGraph(courseId) : null)
  ));
  const [loading, setLoading] = useState(!isSelfStudy && !graph);
  const [message, setMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [nodeEditor, setNodeEditor] = useState<{ mode: "create" | "edit"; values: NodeDraft } | null>(null);

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

  const nodesById = useMemo(() => new Map((graph?.nodes ?? []).map((node) => [node.id, node])), [graph]);
  const selectedNode = selection?.kind === "node" ? nodesById.get(selection.id) ?? null : null;
  const selectedEdge = selection?.kind === "edge" ? graph?.edges.find((edge) => edge.id === selection.id) ?? null : null;
  const relatedEdges = useMemo(() => {
    if (!graph || !selectedNode) return [];
    return graph.edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id);
  }, [graph, selectedNode]);
  const prereqEdges = relatedEdges.filter((edge) => edge.target === selectedNode?.id && edge.type === "前驱");
  const nextEdges = relatedEdges.filter((edge) => edge.source === selectedNode?.id && edge.type === "后继");
  const peerEdges = relatedEdges.filter((edge) => edge.type === "相关");

  useEffect(() => {
    if (!chartContainerRef.current || !graph || loading) return undefined;
    const container = chartContainerRef.current;
    const chart = chartRef.current ?? echarts.init(container, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    chart.setOption(buildChartOption(graph, selection), true);

    const handleClick = (params: any) => {
      if (params.dataType === "node" && params.data?.id) {
        setSelection({ kind: "node", id: params.data.id });
        return;
      }
      if (params.dataType === "edge" && params.data?.id) {
        setSelection({ kind: "edge", id: params.data.id });
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
  }, [graph, loading, selection]);

  useEffect(() => {
    return () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  const title = isSelfStudy ? "自学知识图谱" : "课程知识图谱";
  const displayCourseName = graph?.course_name || courseName || "当前课程";
  const activeNode = selectedNode ?? graph?.nodes[0] ?? null;
  const selectedTone = stateTone(activeNode?.difficulty);
  const hasNodes = Boolean(graph?.nodes.length);

  function selectEdge(edge: StudentKnowledgeGraphEdge) {
    setSelection({ kind: "edge", id: edge.id });
  }

  function actionToSelfStudy() {
    navigate("/self-study", { state: { knowledgePoint: activeNode?.label, fromCourseId: courseId } });
  }

  function openCreateNode() {
    setNodeEditor({ mode: "create", values: defaultNodeDraft });
  }

  function openEditNode(node: StudentKnowledgeGraphNode) {
    setNodeEditor({ mode: "edit", values: nodeToDraft(node) });
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
      if (nodeEditor.mode === "edit" && selectedNode) {
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
      const node: StudentKnowledgeGraphNode = {
        id: `self_node_${Date.now()}`,
        label,
        type: nodeEditor.values.type,
        description,
        difficulty,
        x: 120 + (base.nodes.length % 4) * 160,
        y: 120 + Math.floor(base.nodes.length / 4) * 130,
        color: nodeTypeColors[nodeEditor.values.type] || "#2563eb",
        source: "custom",
      };
      setSelection({ kind: "node", id: node.id });
      return withGraphCounts({ ...base, nodes: [...base.nodes, node] });
    });
    setNodeEditor(null);
    setMessage("自学图谱已更新。");
  }

  function deleteActiveNode() {
    if (!isSelfStudy || !selectedNode) return;
    setGraph((current) => {
      const base = current ?? createEmptySelfStudyGraph();
      return withGraphCounts({
        ...base,
        nodes: base.nodes.filter((node) => node.id !== selectedNode.id),
        edges: base.edges.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id),
      });
    });
    setSelection(null);
    setNodeEditor(null);
    setMessage("节点已删除，相关关系也已同步移除。");
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
            <button type="button" onClick={openCreateNode}>
              <Plus size={17} />
              新建节点
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
            {loading ? (
              <div className="student-graph-empty">
                <Loader2 size={24} />
                <strong>正在读取知识图谱</strong>
                <p>系统会按当前学生所在班级和课程匹配唯一图谱。</p>
              </div>
            ) : graph && hasNodes ? (
              <div className="student-graph-canvas" ref={chartContainerRef} aria-label={`${displayCourseName} 知识图谱`} />
            ) : isSelfStudy ? (
              <div className="student-graph-empty student-graph-start-state">
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
              <div className="student-graph-empty">
                <Network size={26} />
                <strong>还没有图谱内容</strong>
                <p>教师发布到当前班级后，学生端会在这里显示课程图谱。</p>
              </div>
            )}
          </div>
        </main>

        <aside className="student-map-side student-graph-side">
          <section className="student-panel student-graph-inspector">
            <h2>{nodeEditor ? (nodeEditor.mode === "create" ? "新建节点" : "编辑节点") : selectedEdge ? "关系详情" : "知识点详情"}</h2>
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
            ) : null}
            {activeNode || selectedEdge ? (
              selectedEdge ? (
                <div className="student-graph-detail">
                  <span className="teacher-soft-icon blue"><ArrowRight size={20} /></span>
                  <strong>{selectedEdge.type}</strong>
                  <p>{edgeTitle(selectedEdge, nodesById)}</p>
                </div>
              ) : activeNode ? (
                <>
                  <div className="student-graph-detail">
                    <span className={`teacher-soft-icon ${selectedTone}`}><BookOpen size={20} /></span>
                    <strong>{activeNode.label}</strong>
                    <p>{activeNode.description || "暂无说明。"}</p>
                  </div>
                  <div className="student-graph-meta">
                    <span>类型 <strong>{activeNode.type}</strong></span>
                    <span>难度 <strong>{clampDifficulty(activeNode.difficulty)} / 5</strong></span>
                    <span>来源 <strong>{activeNode.source === "ai" ? "AI 草稿" : isSelfStudy ? "学生自定义" : "教师自定义"}</strong></span>
                  </div>
                  <div className="student-graph-actions">
                    {isSelfStudy ? (
                      <>
                        <button type="button" onClick={() => openEditNode(activeNode)}><Pencil size={15} />编辑节点</button>
                        <button type="button" onClick={deleteActiveNode}><Trash2 size={15} />删除节点</button>
                        <button type="button" onClick={exportSelfStudyGraph}><Download size={15} />导出图谱</button>
                        <button type="button"><MessageSquareText size={15} />向 AI 提问</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={actionToSelfStudy}><Sparkles size={15} />生成讲解</button>
                        <button type="button" onClick={actionToSelfStudy}><Target size={15} />生成练习</button>
                        <button type="button"><NotebookPen size={15} />保存笔记</button>
                        <button type="button"><MessageSquareText size={15} />向 AI 提问</button>
                      </>
                    )}
                  </div>
                </>
              ) : null
            ) : (
              <p className="student-panel-copy">
                {isSelfStudy ? "创建或导入节点后，可以在这里编辑节点说明、难度和来源。" : "点击图谱中的节点或关系后，这里会显示学习详情。"}
              </p>
            )}
          </section>

          <section className="student-panel">
            <h2>关联节点</h2>
            {activeNode ? (
              <div className="student-graph-relations">
                <RelationGroup title="前驱知识" edges={prereqEdges} nodesById={nodesById} currentId={activeNode.id} onSelect={selectEdge} />
                <RelationGroup title="后继知识" edges={nextEdges} nodesById={nodesById} currentId={activeNode.id} onSelect={selectEdge} />
                <RelationGroup title="相关知识" edges={peerEdges} nodesById={nodesById} currentId={activeNode.id} onSelect={selectEdge} />
              </div>
            ) : (
              <div className="empty-panel compact">
                {isSelfStudy ? "创建节点后可继续补充关联关系；后端接口就绪后可同步保存。" : "选择一个知识点查看关联关系。"}
              </div>
            )}
          </section>

          <section className="student-panel">
            <h2>来源资料</h2>
            {graph?.source_summary ? (
              <div className="map-advice">
                <span className="teacher-soft-icon green"><CircleDot size={20} /></span>
                <div>
                  <strong>资料摘要</strong>
                  <p>{graph.source_summary}</p>
                </div>
              </div>
            ) : null}
            <div className="map-source-list">
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
