import { useEffect, useMemo, useState } from "react";
import { Modal } from "antd";
import { ChevronLeft, ChevronRight, Download, ExternalLink } from "lucide-react";
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

export default function GeneratedResourcePreviewModal({
  resource,
  onClose,
  onDownload
}: GeneratedResourcePreviewModalProps) {
  const [activeItem, setActiveItem] = useState(0);
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
  const showPdfPreview = Boolean(shouldUsePdfPreview) && pdfPreviewStatus !== "failed";
  const showPdfPreviewUnavailable = Boolean(shouldUsePdfPreview) && pdfPreviewStatus === "failed";

  useEffect(() => {
    setActiveItem(0);
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
  const activeCitationIds =
    activeSlide?.citation_ids ??
    activeSection?.citation_ids ??
    activeQuestion?.citation_ids ??
    activeCard?.citation_ids ??
    activeSegment?.citation_ids ??
    nodes[0]?.citation_ids ??
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
      width={1180}
      className="ai-resource-preview-modal"
      title={resource ? `${resource.title} · 预览` : ""}
    >
      {resource ? (
        <div className="ai-resource-preview">
          <aside className="ai-resource-slide-nav" aria-label="资源目录">
            {navItems.map((title, index) => (
              <button type="button" key={`${resource.id}_${index}`} className={index === activeIndex ? "active" : ""} onClick={() => setActiveItem(index)}>
                <span>{index + 1}</span>
                <strong>{title}</strong>
              </button>
            ))}
          </aside>
          <main className="ai-resource-stage">
            <div className={`ai-ppt-viewer${shouldUsePdfPreview ? " pdf" : ""}`}>
              {!shouldUsePdfPreview ? (
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
                  <section className="ai-preview-mindmap">
                    <div className="ai-mindmap-center">
                      <strong>{nodes[0]?.label ?? resource.title}</strong>
                      <span>{nodes[0]?.summary ?? resource.summary}</span>
                    </div>
                    <div className="ai-mindmap-branches">
                      {nodes.filter((node) => node.level === 1).map((node) => (
                        <article key={node.id}>
                          <b>{node.label}</b>
                          <p>{node.summary}</p>
                          <div>
                            {nodes.filter((child) => child.level === 2 && payload?.edges?.some((edge) => edge.source === node.id && edge.target === child.id)).map((child) => (
                              <span key={child.id}>{child.label}</span>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
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
              {!shouldUsePdfPreview ? (
                <button type="button" className="ai-ppt-arrow right" aria-label="下一页" onClick={() => moveSlide(1)} disabled={activeIndex >= navItems.length - 1}>
                  <ChevronRight size={20} />
                </button>
              ) : null}
            </div>
            <section className="ai-resource-preview-meta">
              <span>{shouldUsePdfPreview ? "PDF 预览" : `${activeIndex + 1}/${Math.max(navItems.length, 1)}`}</span>
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
