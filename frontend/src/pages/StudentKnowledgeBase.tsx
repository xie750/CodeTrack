import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clipboard,
  Clock3,
  Database,
  FileText,
  FileSearch,
  FileUp,
  Folder,
  ListChecks,
  Map,
  MoreHorizontal,
  Network,
  Plus,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import {
  api,
  type RagIngestionRun,
  type RagIngestionStep,
  type RagKnowledgeBaseListItem,
  type RagKnowledgeChunk,
  type RagKnowledgeDocument
} from "../api";

type KnowledgeBaseStatus = "READY" | "PARTIAL_READY" | "PROCESSING" | "FAILED" | "DRAFT";
type TraceViewMode = "timeline" | "town";
type DocumentStatus =
  | "UPLOADED"
  | "QUEUED"
  | "PARSING"
  | "NORMALIZING"
  | "CHUNKING"
  | "EMBEDDING"
  | "INDEXING"
  | "READY"
  | "FAILED"
  | "QUEUE_FAILED";

type KnowledgeDocumentView = {
  id: string;
  title: string;
  filename: string;
  fileType: string;
  size: string;
  status: DocumentStatus;
  progress: number;
  chunkCount: number;
  uploadedAt: string;
  errorMessage?: string;
};

type KnowledgeBaseView = {
  id: string;
  title: string;
  status: KnowledgeBaseStatus;
  documentCount: number;
  chunkCount: number;
};

const expectedRagAgentSteps = [
  { name: "file_intake_agent", icon: FileUp, zone: "接入站", agent: "接收员", badge: "INTAKE" },
  { name: "document_parser_agent", icon: FileSearch, zone: "解析塔", agent: "解析师", badge: "PARSE" },
  { name: "content_profile_agent", icon: Building2, zone: "画像馆", agent: "画像师", badge: "PROFILE" },
  { name: "cleaning_strategy_agent", icon: ShieldCheck, zone: "清洗厂", agent: "清洗员", badge: "CLEAN" },
  { name: "chunk_planner_agent", icon: Map, zone: "规划所", agent: "规划师", badge: "PLAN" },
  { name: "chunk_builder_agent", icon: Network, zone: "切片坊", agent: "切片工", badge: "CHUNK" },
  { name: "retrieval_quality_agent", icon: CheckCircle2, zone: "质检站", agent: "质检员", badge: "QA" },
  { name: "embedding_agent", icon: Database, zone: "向量港", agent: "向量员", badge: "VECTOR" },
  { name: "index_agent", icon: Folder, zone: "索引库", agent: "归档员", badge: "INDEX" }
] as const;

const activeStepByDocumentStatus: Partial<Record<DocumentStatus, string>> = {
  QUEUED: "file_intake_agent",
  PARSING: "document_parser_agent",
  NORMALIZING: "cleaning_strategy_agent",
  CHUNKING: "chunk_builder_agent",
  EMBEDDING: "embedding_agent",
  INDEXING: "index_agent"
};

function activeTownAgentName(run: RagIngestionRun | null, doc: KnowledgeDocumentView) {
  if (doc.status === "READY") return "index_agent";
  const activeByStatus = activeStepByDocumentStatus[doc.status];
  if (activeByStatus) return activeByStatus;
  const lastStep = run?.steps[run.steps.length - 1];
  return lastStep?.name ?? "file_intake_agent";
}

function statusText(status: KnowledgeBaseStatus | DocumentStatus) {
  const map: Record<string, string> = {
    READY: "可检索",
    PROCESSING: "处理中",
    PARTIAL_READY: "部分可检索",
    FAILED: "处理失败",
    DRAFT: "草稿",
    UPLOADED: "待处理",
    QUEUED: "排队中",
    PARSING: "解析中",
    NORMALIZING: "清洗中",
    CHUNKING: "切片中",
    EMBEDDING: "向量化",
    INDEXING: "索引中",
    QUEUE_FAILED: "投递失败"
  };
  return map[status] ?? status;
}

function statusTone(status: KnowledgeBaseStatus | DocumentStatus) {
  if (status === "READY") return "ready";
  if (status === "FAILED" || status === "QUEUE_FAILED") return "failed";
  if (status === "DRAFT" || status === "UPLOADED") return "draft";
  return "processing";
}

const processingStatuses = new Set<DocumentStatus>(["QUEUED", "PARSING", "NORMALIZING", "CHUNKING", "EMBEDDING", "INDEXING"]);

function isProcessing(status: DocumentStatus) {
  return processingStatuses.has(status);
}

function deriveBaseStatus(documents: KnowledgeDocumentView[]): KnowledgeBaseStatus {
  if (!documents.length) return "DRAFT";
  if (documents.some((doc) => isProcessing(doc.status))) return "PROCESSING";
  const readyCount = documents.filter((doc) => doc.status === "READY").length;
  if (readyCount === documents.length) return "READY";
  if (readyCount > 0) return "PARTIAL_READY";
  if (documents.some((doc) => doc.status === "FAILED" || doc.status === "QUEUE_FAILED")) return "FAILED";
  return "DRAFT";
}

function documentProgress(doc: KnowledgeDocumentView) {
  const progressMap: Record<DocumentStatus, number> = {
    UPLOADED: 8,
    QUEUED: 12,
    PARSING: 22,
    NORMALIZING: 42,
    CHUNKING: 64,
    EMBEDDING: 78,
    INDEXING: 88,
    READY: 100,
    FAILED: 100,
    QUEUE_FAILED: 100
  };
  return doc.progress || progressMap[doc.status];
}

function workflowText(doc: KnowledgeDocumentView) {
  if (doc.status === "UPLOADED") return "已上传，待确认后处理入库";
  if (doc.status === "READY") return `${doc.chunkCount} 个切片已入库`;
  if (doc.status === "FAILED" || doc.status === "QUEUE_FAILED") return doc.errorMessage || "处理失败，可删除或重新处理";
  return `${statusText(doc.status)}，正在生成可引用知识切片`;
}

function agentStepText(name: string) {
  const map: Record<string, string> = {
    file_intake_agent: "文件接收代理",
    document_parser_agent: "文档解析代理",
    content_profile_agent: "内容画像代理",
    cleaning_strategy_agent: "清洗策略代理",
    chunk_planner_agent: "切分规划代理",
    chunk_builder_agent: "切片构建代理",
    retrieval_quality_agent: "检索质量代理",
    embedding_agent: "向量化代理",
    index_agent: "索引入库代理"
  };
  return map[name] ?? name;
}

function agentStepSummary(step: RagIngestionStep) {
  const output = step.output;
  if (step.name === "document_parser_agent") return `解析出 ${Number(output.element_count ?? 0)} 个结构元素`;
  if (step.name === "content_profile_agent") return `${String(output.content_profile ?? "通用资料")} · ${String(output.chunking_strategy ?? "默认切分")}`;
  if (step.name === "cleaning_strategy_agent") return `${Number(output.input_element_count ?? 0)} -> ${Number(output.output_element_count ?? 0)} 个元素`;
  if (step.name === "chunk_builder_agent") return `${Number(output.parent_count ?? 0)} 个父切片 · ${Number(output.child_count ?? 0)} 个检索切片`;
  if (step.name === "retrieval_quality_agent") {
    const flags = Array.isArray(output.risk_flags) ? output.risk_flags.length : 0;
    return flags ? `${flags} 个质量风险，需关注切片边界` : "切片质量检查通过";
  }
  if (step.name === "embedding_agent") return `${Number(output.embedding_count ?? 0)} 个切片已向量化`;
  if (step.name === "index_agent") return `${Number(output.child_count ?? 0)} 个切片写入索引`;
  return step.status === "SUCCEEDED" ? "已完成" : step.status;
}

function agentRunDuration(run: RagIngestionRun | null) {
  if (!run?.finished_at) return "运行中";
  const start = new Date(run.started_at).getTime();
  const end = new Date(run.finished_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "已完成";
  const seconds = Math.max(0.1, (end - start) / 1000);
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)} 秒`;
}

function cyberTownStationState(name: string, run: RagIngestionRun | null, doc: KnowledgeDocumentView) {
  const recorded = run?.steps.find((step) => step.name === name);
  if (recorded?.status === "FAILED") return "failed";
  if (recorded?.status === "WARNING") return "warning";
  if (recorded) return "done";
  if (doc.status === "FAILED" || doc.status === "QUEUE_FAILED") return "failed";
  if (activeStepByDocumentStatus[doc.status] === name) return "active";
  return "pending";
}

function cyberTownStationSummary(name: string, run: RagIngestionRun | null) {
  const recorded = run?.steps.find((step) => step.name === name);
  if (recorded) return agentStepSummary(recorded);
  return "等待上一站数据流入";
}

function townAgentIndex(name: string) {
  return Math.max(0, expectedRagAgentSteps.findIndex((station) => station.name === name));
}

function townAgentSpeech(name: string, run: RagIngestionRun | null, doc: KnowledgeDocumentView) {
  const step = run?.steps.find((item) => item.name === name);
  if (step) {
    if (step.status === "WARNING") return `我完成了这一站，但发现需要关注：${agentStepSummary(step)}`;
    return `我已经完成：${agentStepSummary(step)}`;
  }
  if (activeStepByDocumentStatus[doc.status] === name) return "我正在处理这一站，完成后会把结果交给下一位智能体。";
  if (doc.status === "UPLOADED") return "文件还在小镇入口外，点击处理入库后我会开始工作。";
  return "我在等上游智能体把资料交过来。";
}

function fileIconClass(fileType: string) {
  if (fileType === "PDF") return "pdf";
  if (fileType === "DOCX") return "docx";
  if (fileType === "TXT") return "txt";
  return "md";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileTypeFromName(filename: string) {
  const ext = filename.split(".").pop()?.toUpperCase();
  if (ext === "PDF" || ext === "DOCX" || ext === "TXT" || ext === "MD" || ext === "PPTX") return ext;
  return "TXT";
}

function normalizeDocumentStatus(status: string): DocumentStatus {
  const value = status.toUpperCase();
  if (value === "CLEANING") return "NORMALIZING";
  if (value === "DELETED") return "FAILED";
  if (
    value === "UPLOADED" ||
    value === "QUEUED" ||
    value === "PARSING" ||
    value === "NORMALIZING" ||
    value === "CHUNKING" ||
    value === "EMBEDDING" ||
    value === "INDEXING" ||
    value === "READY" ||
    value === "FAILED" ||
    value === "QUEUE_FAILED"
  ) {
    return value;
  }
  return "FAILED";
}

function mapBase(item: RagKnowledgeBaseListItem): KnowledgeBaseView {
  return {
    id: item.id,
    title: item.name,
    status: item.status === "active" ? "DRAFT" : "FAILED",
    documentCount: item.document_count,
    chunkCount: item.chunk_count
  };
}

function mapDocument(item: RagKnowledgeDocument): KnowledgeDocumentView {
  return {
    id: item.id,
    title: item.title || item.filename,
    filename: item.filename,
    fileType: fileTypeFromName(item.filename),
    size: formatFileSize(item.size_bytes),
    status: normalizeDocumentStatus(item.status),
    progress: item.progress,
    chunkCount: item.chunk_count,
    uploadedAt: new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date(item.created_at)),
    errorMessage: item.error?.message
  };
}

export default function StudentKnowledgeBase() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseView[]>([]);
  const [documentsByBase, setDocumentsByBase] = useState<Record<string, KnowledgeDocumentView[]>>({});
  const [chunksByDocument, setChunksByDocument] = useState<Record<string, RagKnowledgeChunk[]>>({});
  const [runsByDocument, setRunsByDocument] = useState<Record<string, RagIngestionRun | null>>({});
  const [activeBaseId, setActiveBaseId] = useState("");
  const [activeDocumentId, setActiveDocumentId] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [traceView, setTraceView] = useState<TraceViewMode>("timeline");
  const [selectedTownAgent, setSelectedTownAgent] = useState("");
  const [townPlaybackActive, setTownPlaybackActive] = useState(false);
  const [townPlaybackIndex, setTownPlaybackIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingDeleteDocumentId, setPendingDeleteDocumentId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadKnowledgeBases(preferredId?: string) {
    const result = await api.listRagKnowledgeBases();
    const views = result.items.map(mapBase);
    setKnowledgeBases(views);
    const nextActive = preferredId || activeBaseId || views[0]?.id || "";
    setActiveBaseId(nextActive);
    if (nextActive) await loadDocuments(nextActive);
    return nextActive;
  }

  async function loadDocuments(kbId: string) {
    const result = await api.listRagDocuments(kbId);
    const docs = result.items.map(mapDocument);
    setDocumentsByBase((current) => ({ ...current, [kbId]: docs }));
    setKnowledgeBases((current) => current.map((item) => item.id === kbId ? {
      ...item,
      status: deriveBaseStatus(docs),
      documentCount: docs.length,
      chunkCount: docs.reduce((sum, doc) => sum + (doc.status === "READY" ? doc.chunkCount : 0), 0)
    } : item));
    setActiveDocumentId((current) => docs.some((doc) => doc.id === current) ? current : docs[0]?.id ?? "");
    return docs;
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setMessage(null);
    api.listRagKnowledgeBases()
      .then(async (result) => {
        if (!alive) return;
        if (!result.items.length) {
          const created = await api.createRagKnowledgeBase("期末自整理资料", "上传后确认处理入库的个人知识库");
          if (!alive) return;
          await loadKnowledgeBases(created.id);
          return;
        }
        const views = result.items.map(mapBase);
        setKnowledgeBases(views);
        const firstId = views[0]?.id ?? "";
        setActiveBaseId(firstId);
        if (firstId) await loadDocuments(firstId);
      })
      .catch((error) => {
        if (alive) setMessage(error instanceof Error ? error.message : "知识库加载失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!activeBaseId) return undefined;
    const docs = documentsByBase[activeBaseId] ?? [];
    if (!docs.some((doc) => isProcessing(doc.status))) return undefined;
    const timer = window.setInterval(() => {
      loadDocuments(activeBaseId)
        .then((nextDocs) => {
          if (drawerOpen && activeDocumentId && nextDocs.some((doc) => doc.id === activeDocumentId)) {
            void loadIngestionRun(activeDocumentId);
          }
        })
        .catch((error) => setMessage(error instanceof Error ? error.message : "文档状态刷新失败"));
    }, 1500);
    return () => window.clearInterval(timer);
  }, [activeBaseId, activeDocumentId, documentsByBase, drawerOpen]);

  useEffect(() => {
    if (!drawerOpen || !activeDocumentId) return;
    void loadIngestionRun(activeDocumentId);
  }, [drawerOpen, activeDocumentId, documentsByBase]);

  useEffect(() => {
    document.body.classList.toggle("kb-preview-drawer-open", drawerOpen);
    return () => {
      document.body.classList.remove("kb-preview-drawer-open");
    };
  }, [drawerOpen]);

  useEffect(() => {
    setSelectedTownAgent("");
    setTownPlaybackActive(false);
    setTownPlaybackIndex(0);
  }, [activeDocumentId]);

  useEffect(() => {
    if (traceView !== "town") {
      setTownPlaybackActive(false);
    }
  }, [traceView]);

  useEffect(() => {
    if (!townPlaybackActive) return undefined;
    if (townPlaybackIndex >= expectedRagAgentSteps.length - 1) {
      const doneTimer = window.setTimeout(() => setTownPlaybackActive(false), 900);
      return () => window.clearTimeout(doneTimer);
    }
    const timer = window.setTimeout(() => {
      setTownPlaybackIndex((current) => Math.min(current + 1, expectedRagAgentSteps.length - 1));
    }, 1050);
    return () => window.clearTimeout(timer);
  }, [townPlaybackActive, townPlaybackIndex]);

  const activeBase = knowledgeBases.find((item) => item.id === activeBaseId) ?? knowledgeBases[0];
  const documents = activeBase ? documentsByBase[activeBase.id] ?? [] : [];
  const activeDocument = documents.find((item) => item.id === activeDocumentId) ?? documents[0];
  const activeDocumentChunks = activeDocument ? chunksByDocument[activeDocument.id] ?? [] : [];
  const activeIngestionRun = activeDocument ? runsByDocument[activeDocument.id] ?? null : null;
  const currentTownAgentName = activeDocument ? activeTownAgentName(activeIngestionRun, activeDocument) : "file_intake_agent";
  const playbackTownAgentName = townPlaybackActive ? expectedRagAgentSteps[townPlaybackIndex]?.name ?? "" : "";
  const focusedTownAgentName = selectedTownAgent || playbackTownAgentName || currentTownAgentName;
  const focusedTownAgent = expectedRagAgentSteps.find((station) => station.name === focusedTownAgentName) ?? expectedRagAgentSteps[0];
  const courierAgentIndex = townPlaybackActive ? townPlaybackIndex : townAgentIndex(currentTownAgentName);
  const pendingDeleteDocument = documents.find((item) => item.id === pendingDeleteDocumentId);

  const visibleKnowledgeBases = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return knowledgeBases;
    return knowledgeBases.filter((item) => item.title.toLowerCase().includes(normalized));
  }, [knowledgeBases, query]);

  const deleteConfirmDialog = pendingDeleteDocument ? (
    <div className="kb-confirm-shell" role="dialog" aria-modal="true" aria-label="确认删除资料">
      <button className="kb-confirm-mask" type="button" aria-label="取消删除" onClick={() => setPendingDeleteDocumentId("")} />
      <section className="kb-confirm-panel">
        <span className="kb-confirm-icon">
          <Trash2 size={20} />
        </span>
        <h2>删除这份资料？</h2>
        <p>
          {pendingDeleteDocument.filename} 将从当前知识库移除；如果已经处理入库，相关切片和检索索引也会失效。
        </p>
        <div className="kb-confirm-actions">
          <button type="button" onClick={() => setPendingDeleteDocumentId("")}>取消</button>
          <button type="button" className="danger" onClick={confirmDeleteDocument}>确认删除</button>
        </div>
      </section>
    </div>
  ) : null;

  async function selectBase(id: string) {
    setActiveBaseId(id);
    setDrawerOpen(false);
    setMessage(null);
    try {
      await loadDocuments(id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "文档列表加载失败");
    }
  }

  async function openChunkDrawer(documentId: string) {
    setActiveDocumentId(documentId);
    setDrawerOpen(true);
    await loadIngestionRun(documentId);
    try {
      const result = await api.listRagChunks(documentId);
      setChunksByDocument((current) => ({ ...current, [documentId]: result.items }));
    } catch (error) {
      setChunksByDocument((current) => ({ ...current, [documentId]: [] }));
      setMessage(error instanceof Error ? error.message : "切片加载失败");
    }
  }

  async function loadIngestionRun(documentId: string) {
    try {
      const result = await api.getRagIngestionRun(documentId);
      setRunsByDocument((current) => ({ ...current, [documentId]: result.run }));
    } catch {
      setRunsByDocument((current) => ({ ...current, [documentId]: null }));
    }
  }

  function replayTownWorkflow() {
    setSelectedTownAgent("");
    setTownPlaybackIndex(0);
    setTownPlaybackActive(true);
  }

  async function createKnowledgeBase() {
    const name = window.prompt("知识库名称", "新建知识库")?.trim();
    if (!name) return;
    setMessage(null);
    try {
      const created = await api.createRagKnowledgeBase(name, "");
      await loadKnowledgeBases(created.id);
      setDrawerOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "知识库创建失败");
    }
  }

  async function stagePastedText() {
    if (!activeBase) return;
    const title = window.prompt("资料标题", "pasted-text")?.trim();
    if (!title) return;
    const content = window.prompt("粘贴文本内容", "文档中的核心概念是什么？")?.trim();
    if (!content) return;
    setMessage(null);
    try {
      const created = await api.createRagTextDocument(activeBase.id, title, content);
      await loadDocuments(activeBase.id);
      setActiveDocumentId(created.document_id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "粘贴文本保存失败");
    }
  }

  async function handleFileSelected(files: FileList | null) {
    const file = files?.[0];
    if (!file || !activeBase) return;
    setMessage(null);
    try {
      const created = await api.uploadRagDocument(activeBase.id, file);
      await loadDocuments(activeBase.id);
      setActiveDocumentId(created.document_id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "文件上传失败");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function processDocument(documentId: string) {
    if (!activeBase) return;
    setMessage(null);
    setActiveDocumentId(documentId);
    setDrawerOpen(true);
    try {
      await api.processRagDocument(documentId);
      await loadIngestionRun(documentId);
      setChunksByDocument((current) => {
        const next = { ...current };
        delete next[documentId];
        return next;
      });
      await loadDocuments(activeBase.id);
      if (drawerOpen && activeDocumentId === documentId) {
        await loadIngestionRun(documentId);
        const result = await api.listRagChunks(documentId);
        setChunksByDocument((current) => ({ ...current, [documentId]: result.items }));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "处理入库失败，请确认 worker / Docker 服务是否已启动");
      await loadDocuments(activeBase.id).catch(() => undefined);
    }
  }

  function requestDeleteDocument(documentId: string) {
    setPendingDeleteDocumentId(documentId);
  }

  async function confirmDeleteDocument() {
    const documentId = pendingDeleteDocumentId;
    if (!activeBase) return;
    setMessage(null);
    try {
      await api.deleteRagDocument(documentId);
      setPendingDeleteDocumentId("");
      setChunksByDocument((current) => {
        const next = { ...current };
        delete next[documentId];
        return next;
      });
      await loadDocuments(activeBase.id);
      if (activeDocumentId === documentId) setDrawerOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败");
    }
  }

  return (
    <div className="knowledge-base-page">
      <header className="kb-design-head">
        <div>
          <h1>知识库</h1>
          <p>上传学习资料，构建可被 AI 引用的个人知识库</p>
        </div>
        <button type="button" className="kb-design-primary" onClick={createKnowledgeBase}>
          <Plus size={17} />
          新建知识库
        </button>
      </header>

      {message ? <p className="student-data-message">{message}</p> : null}

      <section className="kb-design-layout">
        <aside className="kb-design-sidebar">
          <h2>我的知识库</h2>
          <label className="kb-design-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索知识库" />
          </label>
          <div className="kb-design-base-list">
            {visibleKnowledgeBases.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === activeBase?.id ? "active" : ""}
                onClick={() => selectBase(item.id)}
              >
                <Folder size={28} />
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.documentCount}个文件 · {item.chunkCount}个切片</small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className="kb-design-main">
          <section className="kb-design-card kb-design-current">
            <div className="kb-design-current-head">
              <div>
                <h2>{activeBase?.title ?? "知识库"}</h2>
                <p>{loading ? "正在加载..." : `${activeBase?.documentCount ?? 0}个文件 · ${activeBase?.chunkCount ?? 0}个切片`}</p>
              </div>
              <button type="button" aria-label="更多操作">
                <MoreHorizontal size={20} />
              </button>
            </div>

            <div className="kb-design-upload">
              <UploadCloud size={42} />
              <strong>上传学习资料</strong>
              <p>先上传为待处理文件，确认无误后再处理入库<br />当前优先处理 TXT / MD</p>
              <div className="kb-upload-actions">
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!activeBase}>
                  <FileUp size={16} />
                  选择文件
                </button>
                <button type="button" onClick={stagePastedText} disabled={!activeBase}>
                  <Clipboard size={16} />
                  粘贴文本
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.txt,.pdf,.docx,.pptx"
                onChange={(event) => handleFileSelected(event.currentTarget.files)}
                hidden
              />
            </div>

            <div className="kb-design-documents">
              <div className="kb-design-documents-head">
                <h3>已上传资料</h3>
                <span>上传后可删除，确认后再处理到知识库</span>
              </div>
              {documents.map((doc) => {
                const processing = isProcessing(doc.status);
                return (
                  <article key={doc.id} className={doc.id === activeDocumentId ? "active" : ""}>
                    <button className="kb-doc-open" type="button" onClick={() => openChunkDrawer(doc.id)}>
                      <span className={`kb-design-file ${fileIconClass(doc.fileType)}`}>
                        <FileText size={20} />
                      </span>
                      <span className="kb-doc-copy">
                        <strong>{doc.title}</strong>
                        <small>{doc.filename} · {doc.fileType} · {doc.size}</small>
                      </span>
                    </button>
                    <span className={`kb-status-pill ${statusTone(doc.status)}`}>{statusText(doc.status)}</span>
                    <span className="kb-doc-workflow">
                      <i><b style={{ width: `${documentProgress(doc)}%` }} /></i>
                      <small>{workflowText(doc)}</small>
                    </span>
                    <span className="kb-doc-row-actions">
                      {doc.status === "READY" ? (
                        <>
                          <button type="button" onClick={() => openChunkDrawer(doc.id)}>
                            <FileText size={15} />
                            查看切片
                          </button>
                          <button type="button" onClick={() => processDocument(doc.id)}>
                            <RefreshCw size={15} />
                            重新切分
                          </button>
                        </>
                      ) : doc.status === "FAILED" || doc.status === "QUEUE_FAILED" ? (
                        <button type="button" onClick={() => processDocument(doc.id)}>
                          <RefreshCw size={15} />
                          重新处理
                        </button>
                      ) : (
                        <button type="button" className="primary" onClick={() => processDocument(doc.id)} disabled={processing}>
                          <PlayCircle size={15} />
                          {processing ? "处理中" : "处理入库"}
                        </button>
                      )}
                      <button type="button" className="danger" onClick={() => requestDeleteDocument(doc.id)} disabled={processing}>
                        <Trash2 size={15} />
                        删除
                      </button>
                    </span>
                  </article>
                );
              })}
              {!documents.length ? (
                <div className="kb-design-empty">
                  <FileUp size={28} />
                  <p>还没有上传资料。</p>
                </div>
              ) : null}
            </div>
          </section>
        </main>
      </section>

      {drawerOpen && activeDocument ? (
        <div className="kb-preview-drawer-shell" role="dialog" aria-label="切片预览">
          <button className="kb-preview-mask" type="button" aria-label="关闭切片预览" onClick={() => setDrawerOpen(false)} />
          <aside className="kb-preview-drawer">
            <header>
              <div>
                <h2>切片预览</h2>
                <p>{activeDocument.title}</p>
              </div>
              <button type="button" aria-label="关闭" onClick={() => setDrawerOpen(false)}>
                <X size={18} />
              </button>
            </header>

            <section className="kb-preview-doc">
              <span className={`kb-design-file ${fileIconClass(activeDocument.fileType)}`}>
                <FileText size={20} />
              </span>
              <div>
                <strong>{activeDocument.filename}</strong>
                <small>{activeDocument.chunkCount}个切片</small>
              </div>
            </section>

            <section className="kb-agent-trace">
              <div className="kb-agent-trace-head">
                <div>
                  <strong>协同处理轨迹</strong>
                  <small>{activeIngestionRun ? `${activeIngestionRun.steps.length} 个代理步骤 · ${agentRunDuration(activeIngestionRun)}` : "等待处理任务启动"}</small>
                </div>
                <div className="kb-agent-trace-tools">
                  <span className={`kb-agent-run-status ${activeIngestionRun?.status.toLowerCase() || "pending"}`}>
                    {activeIngestionRun?.status === "SUCCEEDED" ? "已完成" : activeIngestionRun?.status === "FAILED" ? "失败" : "运行中"}
                  </span>
                  <span className="kb-trace-toggle" role="group" aria-label="切换处理轨迹呈现方式">
                    <button type="button" className={traceView === "timeline" ? "active" : ""} onClick={() => setTraceView("timeline")}>
                      <ListChecks size={14} />
                      列表
                    </button>
                    <button type="button" className={traceView === "town" ? "active" : ""} onClick={() => setTraceView("town")}>
                      <Map size={14} />
                      小镇
                    </button>
                  </span>
                </div>
              </div>
              {traceView === "timeline" ? (
                <div className="kb-agent-step-list">
                  {activeIngestionRun?.steps.length ? activeIngestionRun.steps.map((step) => (
                    <article key={step.id} className={step.status.toLowerCase()}>
                      <span>{String(step.order).padStart(2, "0")}</span>
                      <div>
                        <strong>{agentStepText(step.name)}</strong>
                        <small>{agentStepSummary(step)}</small>
                      </div>
                    </article>
                  )) : (
                    <article className="pending">
                      <span>00</span>
                      <div>
                        <strong>{activeDocument.status === "UPLOADED" ? "尚未开始" : "任务排队中"}</strong>
                        <small>{activeDocument.status === "UPLOADED" ? "确认处理后会展示解析、清洗、切分、向量化和索引步骤" : "后台任务启动后会持续刷新处理轨迹"}</small>
                      </div>
                    </article>
                  )}
                </div>
              ) : (
                <div className={`kb-cyber-town ${isProcessing(activeDocument.status) ? "running" : ""} ${townPlaybackActive ? "replaying" : ""}`} aria-label="赛博小镇处理视图">
                  <div className="kb-town-titlebar">
                    <div>
                      <strong>斯坦福式 AI 小镇 · RAG 入库沙盒</strong>
                      <small>{focusedTownAgent.agent} 正在负责 {focusedTownAgent.zone}</small>
                    </div>
                    <button type="button" className="kb-town-replay" onClick={replayTownWorkflow} disabled={!activeIngestionRun?.steps.length && activeDocument.status === "UPLOADED"}>
                      <PlayCircle size={14} />
                      {townPlaybackActive ? "播放中" : "回放协作"}
                    </button>
                  </div>
                  <div className="kb-town-skyline" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="kb-town-road primary" />
                  <div className="kb-town-road secondary" />
                  <div className="kb-town-road ring" />
                  <div className="kb-town-core">
                    <Network size={22} />
                    <strong>RAG 中枢</strong>
                    <small>{activeDocument.status === "READY" ? "知识已接入检索网络" : workflowText(activeDocument)}</small>
                  </div>
                  <div className={`kb-town-courier route-${courierAgentIndex + 1} ${townPlaybackActive || isProcessing(activeDocument.status) ? "active" : ""}`} aria-hidden="true">
                    <i className="head" />
                    <i className="body" />
                    <i className="pack" />
                  </div>
                  <div className="kb-town-stations">
                    {expectedRagAgentSteps.map((station, index) => {
                      const Icon = station.icon;
                      const state = cyberTownStationState(station.name, activeIngestionRun, activeDocument);
                      const isFocused = station.name === focusedTownAgentName;
                      const isCurrent = station.name === currentTownAgentName;
                      const isPlayback = station.name === playbackTownAgentName;
                      const wasPlayed = townPlaybackActive && index < townPlaybackIndex;
                      return (
                        <button
                          key={station.name}
                          type="button"
                          className={`kb-town-station station-${index + 1} ${state} ${isFocused ? "focused" : ""} ${isCurrent ? "current" : ""} ${isPlayback ? "handoff" : ""} ${wasPlayed ? "played" : ""}`}
                          onClick={() => {
                            setTownPlaybackActive(false);
                            setSelectedTownAgent(station.name);
                          }}
                        >
                          <span className="kb-town-building">
                            <Icon size={17} />
                            <i />
                          </span>
                          <span className="kb-town-agent" aria-hidden="true">
                            <i className="head" />
                            <i className="body" />
                            <i className="leg left" />
                            <i className="leg right" />
                          </span>
                          <div>
                            <strong>{station.zone}</strong>
                            <small>{agentStepText(station.name)}</small>
                          </div>
                          <b>{station.badge}</b>
                          <em>{cyberTownStationSummary(station.name, activeIngestionRun)}</em>
                          <small className="kb-town-agent-name">{station.agent}</small>
                        </button>
                      );
                    })}
                  </div>
                  <div className="kb-town-dialogue">
                    <span className="kb-dialogue-avatar" aria-hidden="true">
                      <i className="head" />
                      <i className="body" />
                    </span>
                    <div>
                      <strong>{focusedTownAgent.agent} · {focusedTownAgent.zone}</strong>
                      <p>{townAgentSpeech(focusedTownAgent.name, activeIngestionRun, activeDocument)}</p>
                    </div>
                  </div>
                  <div className="kb-town-chat-lines" aria-hidden="true">
                    <span className="line-1" />
                    <span className="line-2" />
                    <span className="line-3" />
                    <span className="line-4" />
                  </div>
                  <div className="kb-town-packets" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              )}
            </section>

            <div className="kb-preview-list">
              {activeDocumentChunks.length ? activeDocumentChunks.map((chunk) => (
                <article key={chunk.chunk_id}>
                  <span>切片 {String(chunk.chunk_index + 1).padStart(2, "0")}</span>
                  <p>{chunk.content_preview}</p>
                  <small>约 {chunk.char_count} 字</small>
                </article>
              )) : (
                <article>
                  <span>暂无切片</span>
                  <p>文档处理完成后会在这里展示数据库中的真实切片内容。</p>
                </article>
              )}
            </div>

            {activeDocument.status === "FAILED" || activeDocument.status === "QUEUE_FAILED" ? (
              <section className="kb-preview-warning">
                <AlertTriangle size={18} />
                <p>{activeDocument.errorMessage}</p>
              </section>
            ) : activeDocument.status === "READY" ? (
              <section className="kb-preview-ready">
                <CheckCircle2 size={18} />
                <p>该资料已完成处理，可作为 AI 引用依据。</p>
              </section>
            ) : activeDocument.status === "UPLOADED" ? (
              <section className="kb-preview-processing">
                <FileUp size={18} />
                <p>资料已上传但尚未处理。确认文件无误后，在文件列表点击“处理入库”。</p>
              </section>
            ) : (
              <section className="kb-preview-processing">
                <Clock3 size={18} />
                <p>{statusText(activeDocument.status)}，稍后可查看完整切片。</p>
              </section>
            )}
          </aside>
        </div>
      ) : null}

      {deleteConfirmDialog ? createPortal(deleteConfirmDialog, document.body) : null}
    </div>
  );
}
