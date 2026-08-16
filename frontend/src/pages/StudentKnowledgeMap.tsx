import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleDot,
  FileText,
  Layers3,
  Loader2,
  MessageSquareText,
  Network,
  NotebookPen,
  RefreshCw,
  Route,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";
import { api, apiCache, StudentKnowledgeGraph, StudentKnowledgeGraphEdge, StudentKnowledgeGraphNode } from "../api";

type KnowledgeMapProps = {
  scope?: "course" | "self-study";
  courseName?: string;
};

type Selection = { kind: "node" | "edge"; id: string } | null;

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
  const [graph, setGraph] = useState<StudentKnowledgeGraph | null>(() => (
    courseId ? apiCache.peekStudentKnowledgeGraph(courseId) : null
  ));
  const [loading, setLoading] = useState(!graph);
  const [message, setMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);

  useEffect(() => {
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
  }, [courseId]);

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

  const title = scope === "course" ? "课程知识图谱" : "自学知识图谱";
  const displayCourseName = graph?.course_name || courseName || "当前课程";
  const activeNode = selectedNode ?? graph?.nodes[0] ?? null;
  const selectedTone = stateTone(activeNode?.difficulty);

  function selectEdge(edge: StudentKnowledgeGraphEdge) {
    setSelection({ kind: "edge", id: edge.id });
  }

  function actionToSelfStudy() {
    navigate("/self-study", { state: { knowledgePoint: activeNode?.label, fromCourseId: courseId } });
  }

  return (
    <div className="student-map-page student-graph-page">
      <header className="student-map-head student-graph-head">
        <div>
          <h1>{title}</h1>
          <p>
            {graph
              ? `${graph.teacher_name} 发布给 ${graph.target_classes.join("、") || "当前班级"} 的唯一课程图谱。`
              : "读取教师发布给当前班级的课程知识图谱。"}
          </p>
        </div>
        <button type="button" disabled={!graph} onClick={actionToSelfStudy}>
          <Route size={17} />
          生成学习路径
        </button>
      </header>

      {message ? <p className="student-data-message">{message}</p> : null}

      <section className="student-graph-stats">
        {[
          { label: "节点", value: graph?.node_count ?? 0, sub: "知识结构", icon: <Network size={23} />, tone: "blue" },
          { label: "关系", value: graph?.edge_count ?? 0, sub: "前驱/后继/相关", icon: <Layers3 size={23} />, tone: "green" },
          { label: "状态", value: graph ? statusLabel(graph.status) : "读取中", sub: formatDate(graph?.published_at ?? null), icon: <CheckCircle2 size={23} />, tone: "purple" },
          { label: "来源", value: graph?.source_files.length ?? 0, sub: "课程资料", icon: <FileText size={23} />, tone: "orange" },
        ].map((item) => (
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
            <button type="button" disabled={!graph} onClick={() => chartRef.current?.resize()}>
              <RefreshCw size={15} />
              重置视图
            </button>
          </div>

          <div className="student-graph-canvas-shell">
            {loading ? (
              <div className="student-graph-empty">
                <Loader2 size={24} />
                <strong>正在读取知识图谱</strong>
                <p>系统会按当前学生所在班级和课程匹配唯一图谱。</p>
              </div>
            ) : graph && graph.nodes.length ? (
              <div className="student-graph-canvas" ref={chartContainerRef} aria-label={`${displayCourseName} 知识图谱`} />
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
            <h2>{selectedEdge ? "关系详情" : "知识点详情"}</h2>
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
                    <span>来源 <strong>{activeNode.source === "ai" ? "AI 草稿" : "教师自定义"}</strong></span>
                  </div>
                  <div className="student-graph-actions">
                    <button type="button" onClick={actionToSelfStudy}><Sparkles size={15} />生成讲解</button>
                    <button type="button" onClick={actionToSelfStudy}><Target size={15} />生成练习</button>
                    <button type="button"><NotebookPen size={15} />保存笔记</button>
                    <button type="button"><MessageSquareText size={15} />向 AI 提问</button>
                  </div>
                </>
              ) : null
            ) : (
              <p className="student-panel-copy">点击图谱中的节点或关系后，这里会显示学习详情。</p>
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
              <div className="empty-panel compact">选择一个知识点查看关联关系。</div>
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
                <div className="empty-panel compact">暂无来源文件。</div>
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
