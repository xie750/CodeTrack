import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "antd";
import { ChevronLeft, ChevronRight, Download, ExternalLink } from "lucide-react";
import MindElixir, { type MindElixirData, type NodeObj } from "mind-elixir";
import "mind-elixir/style.css";
import { api, type GeneratedResource } from "../api";
import { authHeaders } from "../authSession";

type GeneratedResourcePreviewModalProps = {
  resource: GeneratedResource | null;
  onClose: () => void;
  onDownload?: (resource: GeneratedResource) => void;
};

function navItemsFor(resource: GeneratedResource | null) {
  const payload = resource?.render_payload;
  const presentonSlides = payload?.presenton_slides ?? [];
  const slides = payload?.slides ?? [];
  const sections = payload?.sections ?? [];
  const nodes = payload?.nodes ?? [];
  const questions = payload?.questions ?? [];
  const cards = payload?.cards ?? [];
  const segments = payload?.segments ?? [];

  if (presentonSlides.length) return presentonSlides.map((item) => item.title);
  if (slides.length) return slides.map((item) => item.title);
  if (sections.length) return sections.map((item) => item.heading);
  if (nodes.length) return nodes.filter((item) => item.level <= 1).map((item) => item.label);
  if (questions.length) return questions.map((_, index) => `第 ${index + 1} 题`);
  if (cards.length) return cards.map((item, index) => item.front || `卡片 ${index + 1}`);
  return segments.map((item) => `${item.speaker} · ${item.label}`);
}

function safeSlideTone(index: number) {
  return ["blue", "mint", "amber", "indigo"][index % 4];
}

function mindMapNodeId(node: { id?: string; node_id?: string }) {
  return node.id || node.node_id || "";
}

function relationshipLabel(type?: string) {
  const labels: Record<string, string> = {
    prerequisite: "前置",
    contains: "包含",
    causes: "导致",
    solves: "解决",
    example_of: "示例",
    common_mistake: "易错",
    next_step: "下一步",
    contrast: "对比"
  };
  return type ? labels[type] ?? type : "关联";
}

function nodeTypeLabel(type?: string) {
  const labels: Record<string, string> = {
    central_topic: "中心主题",
    concept: "概念",
    procedure: "过程",
    example: "示例",
    mistake: "易错点",
    profile_tip: "画像提醒",
    practice: "练习",
    next_action: "下一步"
  };
  return type ? labels[type] ?? type : "节点";
}

type MindMapNodeMetadata = {
  summary: string;
  nodeType?: string;
  knowledgePoints: string[];
  citationIds: string[];
  confidence?: number;
};

function branchPalette(index: number) {
  return ["#176cf5", "#10a37f", "#e07b39", "#7c5cff", "#d14d72", "#1785a6"][index % 6];
}

function buildMindElixirTree(resource: GeneratedResource): MindElixirData<MindMapNodeMetadata> | null {
  const payload = resource.render_payload;
  const nodes = payload.nodes ?? [];
  if (!nodes.length) return null;

  const rootNode = nodes.find((node) => (node.level ?? node.depth ?? 0) === 0) ?? nodes[0];
  const rootId = mindMapNodeId(rootNode);
  const childMap = new Map<string, typeof nodes>();
  const nodeById = new Map(nodes.map((node) => [mindMapNodeId(node), node]));
  const attachedNodeIds = new Set<string>();

  function addChild(parentId: string, child: typeof nodes[number]) {
    const childId = mindMapNodeId(child);
    if (!parentId || !childId || parentId === childId || childId === rootId) return;
    const current = childMap.get(parentId) ?? [];
    if (current.some((item) => mindMapNodeId(item) === childId)) return;
    current.push(child);
    childMap.set(parentId, current);
    attachedNodeIds.add(childId);
  }

  for (const node of nodes) {
    const parentId = node.parent_id;
    if (!parentId) continue;
    addChild(parentId, node);
  }

  for (const edge of payload.edges ?? []) {
    const sourceId = edge.source || edge.source_node_id || "";
    const targetId = edge.target || edge.target_node_id || "";
    const sourceNode = nodeById.get(sourceId);
    const targetNode = nodeById.get(targetId);
    if (!sourceNode || !targetNode || attachedNodeIds.has(targetId)) continue;

    const sourceDepth = sourceNode.level ?? sourceNode.depth ?? 0;
    const targetDepth = targetNode.level ?? targetNode.depth ?? 0;
    const isHierarchyEdge = edge.relationship_type === "contains" || sourceId === rootId || targetDepth > sourceDepth;
    if (isHierarchyEdge) addChild(sourceId, targetNode);
  }

  for (const node of nodes) {
    const nodeId = mindMapNodeId(node);
    if (nodeId === rootId || attachedNodeIds.has(nodeId)) continue;
    if ((node.level ?? node.depth ?? 0) === 1) addChild(rootId, node);
  }

  function convert(node: typeof nodes[number], depth = 0, branchIndex = 0): NodeObj<MindMapNodeMetadata> {
    const nodeId = mindMapNodeId(node);
    const citationIds = node.citation_ids ?? node.citations ?? [];
    const children = (childMap.get(nodeId) ?? []).map((child, index) => convert(child, depth + 1, index));
    const color = depth === 0 ? "#0f1b45" : branchPalette(branchIndex);
    return {
      id: nodeId,
      topic: node.title ?? node.label,
      expanded: true,
      branchColor: color,
      tags: [
        nodeTypeLabel(node.node_type),
        `${Math.round((node.confidence ?? resource.confidence) * 100)}%`,
        ...(citationIds.length ? ["有引用"] : []),
      ],
      style: {
        color: depth === 0 ? "#ffffff" : "#17243b",
        background: depth === 0 ? "#176cf5" : "#ffffff",
        border: depth === 0 ? "0" : "1px solid #dbe7f5",
        fontWeight: depth <= 1 ? "800" : "700",
        fontSize: depth === 0 ? "18" : depth === 1 ? "15" : "13",
      },
      metadata: {
        summary: node.summary ?? "",
        nodeType: node.node_type,
        knowledgePoints: node.knowledge_points ?? [resource.knowledge_point],
        citationIds,
        confidence: node.confidence,
      },
      children,
    };
  }

  const parentPairs = new Set(Array.from(childMap.entries()).flatMap(([parentId, children]) => children.map((child) => `${parentId}->${mindMapNodeId(child)}`)));
  const nodeIds = new Set(nodes.map((node) => mindMapNodeId(node)));
  const arrows: MindElixirData<MindMapNodeMetadata>["arrows"] = (payload.edges ?? [])
    .filter((edge) => {
      const source = edge.source || edge.source_node_id || "";
      const target = edge.target || edge.target_node_id || "";
      return source && target && nodeIds.has(source) && nodeIds.has(target) && !parentPairs.has(`${source}->${target}`);
    })
    .slice(0, 6)
    .map((edge, index) => ({
      id: `arrow_${index}_${edge.source || edge.source_node_id}_${edge.target || edge.target_node_id}`,
      from: edge.source || edge.source_node_id || "",
      to: edge.target || edge.target_node_id || "",
      label: relationshipLabel(edge.relationship_type),
      style: {
        stroke: "#7da8da",
        strokeWidth: 2,
        opacity: 0.72,
        labelColor: "#40506a",
      },
      metadata: {
        summary: edge.label ?? "",
        nodeType: edge.relationship_type,
        knowledgePoints: [resource.knowledge_point],
        citationIds: [],
      },
    }));

  return {
    nodeData: convert(rootNode),
    arrows,
    direction: MindElixir.SIDE,
    meta: {
      resourceId: resource.id,
      artifactType: "MIND_MAP",
    },
  };
}

function MindElixirPreview({
  resource,
  activeNodeId,
  onSelectNode
}: {
  resource: GeneratedResource;
  activeNodeId: string;
  onSelectNode: (nodeId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<MindElixir<MindMapNodeMetadata> | null>(null);
  const data = useMemo(() => buildMindElixirTree(resource), [resource]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !data) return undefined;

    container.innerHTML = "";
    let disposed = false;
    let mind: MindElixir<MindMapNodeMetadata> | null = null;
    const handleSelectNodes = (selected: NodeObj<MindMapNodeMetadata>[]) => {
      const first = selected[0];
      if (first?.id) onSelectNode(first.id);
    };
    const initTimer = window.setTimeout(() => {
      if (disposed) return;
      const currentMind = new MindElixir<MindMapNodeMetadata>({
        el: container,
        direction: MindElixir.SIDE,
        editable: false,
        contextMenu: false,
        toolBar: true,
        keypress: false,
        overflowHidden: false,
        compact: false,
        scaleMin: 0.45,
        scaleMax: 1.8,
        theme: {
          name: "CodeTrack",
          palette: ["#176cf5", "#10a37f", "#e07b39", "#7c5cff", "#d14d72", "#1785a6"],
          cssVar: {
            "--node-gap-x": "38px",
            "--node-gap-y": "14px",
            "--main-gap-x": "76px",
            "--main-gap-y": "18px",
            "--main-color": "#176cf5",
            "--main-bgcolor": "#ffffff",
            "--main-bgcolor-transparent": "rgba(255, 255, 255, 0.86)",
            "--main-border": "1px solid #b8d6ff",
            "--color": "#17243b",
            "--bgcolor": "#ffffff",
            "--selected": "#176cf5",
            "--accent-color": "#10a37f",
            "--root-color": "#ffffff",
            "--root-bgcolor": "#176cf5",
            "--root-border-color": "#176cf5",
            "--root-radius": "8px",
            "--main-radius": "8px",
            "--topic-padding": "8px 12px",
            "--panel-color": "23, 36, 59",
            "--panel-bgcolor": "255, 255, 255",
            "--panel-border-color": "#dbe7f5",
            "--map-padding": "70px 120px"
          }
        }
      });
      mind = currentMind;
      instanceRef.current = currentMind;

      currentMind.init(data).then(() => {
        if (disposed) return;
        requestAnimationFrame(() => {
          if (disposed) return;
          currentMind.scaleFit();
          currentMind.toCenter();
        });
      });

      currentMind.bus.addListener("selectNodes", handleSelectNodes);
    }, 120);

    return () => {
      disposed = true;
      window.clearTimeout(initTimer);
      if (mind) {
        mind.bus.removeListener("selectNodes", handleSelectNodes);
        mind.destroy();
      }
      instanceRef.current = null;
    };
  }, [data, onSelectNode]);

  useEffect(() => {
    const mind = instanceRef.current;
    if (!mind || !activeNodeId) return;
    try {
      const element = mind.findEle(activeNodeId);
      if (element) {
        mind.selectNode(element);
        mind.scrollIntoView(element, true);
      }
    } catch {
      // MindElixir throws when the selected id is no longer in the rendered tree.
    }
  }, [activeNodeId]);

  return <div className="ai-mindmap-kernel" ref={containerRef} aria-label={`${resource.title} 思维导图`} />;
}

export default function GeneratedResourcePreviewModal({
  resource,
  onClose,
  onDownload
}: GeneratedResourcePreviewModalProps) {
  const [activeItem, setActiveItem] = useState(0);
  const [activeMindMapNodeId, setActiveMindMapNodeId] = useState("");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  const [pdfPreviewStatus, setPdfPreviewStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const navItems = useMemo(() => navItemsFor(resource), [resource]);
  const payload = resource?.render_payload;
  const presentonSlides = payload?.presenton_slides ?? [];
  const slides = payload?.slides ?? [];
  const sections = payload?.sections ?? [];
  const nodes = payload?.nodes ?? [];
  const questions = payload?.questions ?? [];
  const cards = payload?.cards ?? [];
  const segments = payload?.segments ?? [];
  const citationMap = new Map((resource?.citations ?? []).map((item) => [item.source_id, item]));
  const editUrl = typeof payload?.metadata?.presenton_edit_url === "string" ? payload.metadata.presenton_edit_url : "";
  const shouldUsePdfPreview = resource?.resource_type === "PPT";
  const shouldUseMindMapPreview = resource?.resource_type === "MIND_MAP";
  const showPdfPreview = Boolean(shouldUsePdfPreview) && pdfPreviewStatus !== "failed";
  const showPdfPreviewUnavailable = Boolean(shouldUsePdfPreview) && pdfPreviewStatus === "failed";

  useEffect(() => {
    setActiveItem(0);
    setActiveMindMapNodeId("");
  }, [resource?.id]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";

    if (!resource?.id || resource.resource_type !== "PPT") {
      setPdfPreviewUrl("");
      setPdfPreviewStatus("idle");
      return undefined;
    }

    setPdfPreviewUrl("");
    setPdfPreviewStatus("loading");
    fetch(api.generatedResourcePreviewUrl(resource.id), { headers: authHeaders() })
      .then((response) => {
        if (!response.ok) throw new Error(`preview request failed: ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfPreviewUrl(objectUrl);
        setPdfPreviewStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setPdfPreviewStatus("failed");
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [resource?.id, resource?.resource_type]);

  const activeIndex = Math.min(activeItem, Math.max(navItems.length - 1, 0));
  const activePresentonSlide = presentonSlides[activeIndex];
  const activeSlide = slides[activeIndex];
  const activeSection = sections[activeIndex];
  const activeQuestion = questions[activeIndex];
  const activeCard = cards[activeIndex];
  const activeSegment = segments[activeIndex];
  const mindMapRoot = nodes.find((node) => (node.level ?? node.depth ?? 0) === 0) ?? nodes[0];
  const mindMapBranches = nodes.filter((node) => (node.level ?? node.depth ?? 0) === 1);
  const activeMindMapNode =
    nodes.find((node) => mindMapNodeId(node) === activeMindMapNodeId) ??
    (activeIndex > 0 ? mindMapBranches[Math.max(0, Math.min(activeIndex - 1, Math.max(mindMapBranches.length - 1, 0)))] : mindMapRoot) ??
    mindMapRoot;
  const activeCitationIds =
    activeSlide?.citation_ids ??
    activeSection?.citation_ids ??
    activeQuestion?.citation_ids ??
    activeCard?.citation_ids ??
    activeSegment?.citation_ids ??
    activeMindMapNode?.citation_ids ??
    activeMindMapNode?.citations ??
    [];

  function moveSlide(delta: number) {
    setActiveItem((current) => Math.min(Math.max(current + delta, 0), Math.max(navItems.length - 1, 0)));
  }

  return (
    <Modal
      open={Boolean(resource)}
      onCancel={onClose}
      footer={null}
      centered
      width={shouldUsePdfPreview ? 1120 : 1180}
      className={`ai-resource-preview-modal${shouldUsePdfPreview ? " ai-resource-preview-modal-pdf" : ""}${shouldUseMindMapPreview ? " ai-resource-preview-modal-mindmap" : ""}`}
      title={resource ? `${resource.title} · 预览` : ""}
    >
      {resource ? (
        <div className={`ai-resource-preview${shouldUsePdfPreview ? " pdf-preview" : ""}${shouldUseMindMapPreview ? " mindmap-preview" : ""}`}>
          {!shouldUsePdfPreview && !shouldUseMindMapPreview ? (
            <aside className="ai-resource-slide-nav" aria-label="资源目录">
              {navItems.map((title, index) => (
                <button type="button" key={`${resource.id}_${index}`} className={index === activeIndex ? "active" : ""} onClick={() => setActiveItem(index)}>
                  <span>{index + 1}</span>
                  <strong>{title}</strong>
                </button>
              ))}
            </aside>
          ) : null}
          <main className={`ai-resource-stage${shouldUsePdfPreview ? " pdf-stage" : ""}${shouldUseMindMapPreview ? " mindmap-stage" : ""}`}>
            <div className={`ai-ppt-viewer${shouldUsePdfPreview ? " pdf" : ""}${shouldUseMindMapPreview ? " mindmap" : ""}`}>
              {!shouldUsePdfPreview && !shouldUseMindMapPreview ? (
                <button type="button" className="ai-ppt-arrow left" aria-label="上一页" onClick={() => moveSlide(-1)} disabled={activeIndex <= 0}>
                  <ChevronLeft size={20} />
                </button>
              ) : null}
              <div className="ai-ppt-canvas-shell">
                {showPdfPreview ? (
                  <section className="ai-ppt-pdf-preview">
                    {pdfPreviewStatus === "ready" && pdfPreviewUrl ? (
                      <iframe src={pdfPreviewUrl} title={`${resource.title} PDF 预览`} />
                    ) : (
                      <div>
                        <strong>正在加载 PDF 预览</strong>
                        <p>预览由最终 PPTX 文件转换生成。</p>
                      </div>
                    )}
                  </section>
                ) : showPdfPreviewUnavailable ? (
                  <section className="ai-ppt-pdf-preview unavailable">
                    <div>
                      <strong>真实预览还没有生成</strong>
                      <p>当前未检测到本机 PowerPoint 或 LibreOffice 转换结果。为了避免错版预览，这里不再展示旧版 HTML 幻灯片。</p>
                    </div>
                  </section>
                ) : activePresentonSlide ? (
                  <section className={`ai-ppt-canvas presenton ${safeSlideTone(activeIndex)}`}>
                    <div className="ai-ppt-corner top" />
                    <div className="ai-ppt-corner bottom" />
                    <div className="ai-ppt-copy">
                      <small>{activePresentonSlide.layout_group || "Presenton 生成"}</small>
                      <h2>{activePresentonSlide.title}</h2>
                      <p>{activePresentonSlide.summary}</p>
                    </div>
                    {activePresentonSlide.image_url ? (
                      <figure>
                        <img src={activePresentonSlide.image_url} alt="" />
                      </figure>
                    ) : null}
                    {activePresentonSlide.speaker_note ? (
                      <footer>
                        <strong>讲稿提示</strong>
                        <p>{activePresentonSlide.speaker_note}</p>
                      </footer>
                    ) : null}
                  </section>
                ) : activeSlide ? (
                  <section className={`ai-ppt-canvas ${activeSlide.layout ?? "content"} ${safeSlideTone(activeIndex)}`}>
                    <div className="ai-ppt-corner top" />
                    <div className="ai-ppt-corner bottom" />
                    <div className="ai-ppt-copy">
                      <small>{resource.knowledge_point || "自主学习资源"}</small>
                      <h2>{activeSlide.title}</h2>
                      {activeSlide.subtitle ? <p>{activeSlide.subtitle}</p> : null}
                    </div>
                    <ul>
                      {activeSlide.bullets.map((bullet, index) => (
                        <li key={`${activeSlide.title}_${index}`}>{bullet}</li>
                      ))}
                    </ul>
                    {activeSlide.speaker_notes ? (
                      <footer>
                        <strong>讲稿提示</strong>
                        <p>{activeSlide.speaker_notes}</p>
                      </footer>
                    ) : null}
                  </section>
                ) : activeSection ? (
                  <section className="ai-preview-document">
                    <small>{resource.knowledge_point || "自主学习资源"}</small>
                    <h2>{activeSection.heading}</h2>
                    {activeSection.paragraphs.map((paragraph, index) => (
                      <p key={`${activeSection.heading}_${index}`}>{paragraph}</p>
                    ))}
                  </section>
                ) : nodes.length ? (
                  <section className="ai-preview-mindmap ai-preview-mindmap-kernel">
                    <MindElixirPreview
                      resource={resource}
                      activeNodeId={mindMapNodeId(activeMindMapNode ?? {})}
                      onSelectNode={setActiveMindMapNodeId}
                    />
                    <aside className="ai-mindmap-detail">
                      <header>
                        <span>{nodeTypeLabel(activeMindMapNode?.node_type)}</span>
                        <strong>{activeMindMapNode?.title ?? activeMindMapNode?.label ?? resource.title}</strong>
                      </header>
                      <p>{activeMindMapNode?.summary ?? resource.summary}</p>
                      <div className="ai-mindmap-detail-meta">
                        <span>置信度 {Math.round((activeMindMapNode?.confidence ?? resource.confidence) * 100)}%</span>
                        {(activeMindMapNode?.knowledge_points ?? [resource.knowledge_point]).map((point) => (
                          <span key={point}>{point}</span>
                        ))}
                      </div>
                      <div className="ai-mindmap-detail-relations">
                        {(payload?.edges ?? [])
                          .filter((edge) => (edge.source || edge.source_node_id) === mindMapNodeId(activeMindMapNode ?? {}))
                          .slice(0, 4)
                          .map((edge) => {
                            const target = nodes.find((node) => mindMapNodeId(node) === (edge.target || edge.target_node_id));
                            return (
                              <span key={`${edge.source}-${edge.target}-${edge.relationship_type}`}>
                                {relationshipLabel(edge.relationship_type)}：{target?.title ?? target?.label ?? edge.target}
                              </span>
                            );
                          })}
                      </div>
                      <footer>
                        {(activeCitationIds.length ? activeCitationIds : []).map((sourceId) => {
                          const source = citationMap.get(sourceId);
                          return source ? <span key={sourceId}>引用：{source.title}</span> : null;
                        })}
                        {payload?.risk_flags && Array.isArray(payload.risk_flags)
                          ? payload.risk_flags.map((flag) => <span className="risk" key={String(flag)}>{String(flag)}</span>)
                          : null}
                      </footer>
                    </aside>
                  </section>
                ) : activeQuestion ? (
                  <section className="ai-preview-practice">
                    <small>{resource.knowledge_point || "自主学习资源"}</small>
                    <h2>{activeQuestion.stem}</h2>
                    {activeQuestion.options?.length ? (
                      <ol>
                        {activeQuestion.options.map((option) => <li key={option}>{option}</li>)}
                      </ol>
                    ) : null}
                    <footer>
                      <strong>参考答案</strong>
                      <p>{activeQuestion.answer}</p>
                      <strong>解析</strong>
                      <p>{activeQuestion.analysis}</p>
                    </footer>
                  </section>
                ) : activeCard ? (
                  <section className="ai-preview-cards">
                    <article>
                      <small>正面</small>
                      <h2>{activeCard.front}</h2>
                    </article>
                    <article>
                      <small>背面</small>
                      <p>{activeCard.back}</p>
                      {activeCard.tips?.map((tip) => <span key={tip}>{tip}</span>)}
                    </article>
                  </section>
                ) : activeSegment ? (
                  <section className="ai-preview-podcast">
                    <small>{activeSegment.label}</small>
                    <h2>{activeSegment.speaker}</h2>
                    <p>{activeSegment.text}</p>
                  </section>
                ) : null}
              </div>
              {!shouldUsePdfPreview && !shouldUseMindMapPreview ? (
                <button type="button" className="ai-ppt-arrow right" aria-label="下一页" onClick={() => moveSlide(1)} disabled={activeIndex >= navItems.length - 1}>
                  <ChevronRight size={20} />
                </button>
              ) : null}
            </div>
            <section className="ai-resource-preview-meta">
              <span>
                {shouldUseMindMapPreview
                  ? `思维导图 · ${nodes.length} 个节点`
                  : shouldUsePdfPreview
                    ? "PDF 预览"
                    : `${activeIndex + 1}/${Math.max(navItems.length, 1)}`}
              </span>
              <span>AI 生成</span>
              <span>置信度 {Math.round(resource.confidence * 100)}%</span>
              {activeCitationIds.map((sourceId) => {
                const source = citationMap.get(sourceId);
                return source ? <span key={sourceId}>引用：{source.title}</span> : null;
              })}
              {onDownload ? (
                <button type="button" onClick={() => onDownload(resource)} disabled={!resource.download_available}>
                  <Download size={15} />
                  下载
                </button>
              ) : null}
              {editUrl ? (
                <a href={editUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={15} />
                  打开
                </a>
              ) : null}
            </section>
          </main>
        </div>
      ) : null}
    </Modal>
  );
}
