import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Clock3,
  FileText,
  FileUp,
  Folder,
  MoreHorizontal,
  Plus,
  PlayCircle,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";

type KnowledgeBaseStatus = "READY" | "PARTIAL_READY" | "PROCESSING" | "FAILED" | "DRAFT";
type DocumentStatus = "UPLOADED" | "PARSING" | "CLEANING" | "CHUNKING" | "INDEXING" | "READY" | "FAILED";

type KnowledgeChunk = {
  id: string;
  documentId: string;
  index: number;
  title: string;
  preview: string;
  words: number;
};

type KnowledgeDocument = {
  id: string;
  title: string;
  filename: string;
  fileType: string;
  size: string;
  status: DocumentStatus;
  chunkCount: number;
  uploadedAt: string;
  errorMessage?: string;
};

type StudentKnowledgeBaseItem = {
  id: string;
  title: string;
  status: KnowledgeBaseStatus;
  documentCount: number;
  chunkCount: number;
};

const initialKnowledgeBases: StudentKnowledgeBaseItem[] = [
  {
    id: "skb_linked_list_review",
    title: "链表复习资料库",
    status: "READY",
    documentCount: 3,
    chunkCount: 28
  },
  {
    id: "skb_exam_notes",
    title: "期末自整理资料",
    status: "PROCESSING",
    documentCount: 4,
    chunkCount: 15
  },
  {
    id: "skb_algorithm_notes",
    title: "算法学习资料",
    status: "READY",
    documentCount: 2,
    chunkCount: 9
  }
];

const initialDocuments: Record<string, KnowledgeDocument[]> = {
  skb_linked_list_review: [
    {
      id: "doc_head_node",
      title: "头节点删除错题整理",
      filename: "linked-list-head-delete.md",
      fileType: "MD",
      size: "18 KB",
      status: "READY",
      chunkCount: 9,
      uploadedAt: "今天 14:12"
    },
    {
      id: "doc_pointer_walk",
      title: "指针遍历笔记",
      filename: "pointer-walk.txt",
      fileType: "TXT",
      size: "9 KB",
      status: "READY",
      chunkCount: 6,
      uploadedAt: "今天 13:48"
    },
    {
      id: "doc_pdf_failed",
      title: "链表错题整理",
      filename: "linked-list-review.pdf",
      fileType: "PDF",
      size: "1.8 MB",
      status: "FAILED",
      chunkCount: 7,
      uploadedAt: "昨天 20:15",
      errorMessage: "PDF 当前无法提取有效文本，可重新上传文本版资料。"
    }
  ],
  skb_exam_notes: [
    {
      id: "doc_data_structure",
      title: "数据结构期末复习",
      filename: "数据结构期末复习.md",
      fileType: "MD",
      size: "26 KB",
      status: "READY",
      chunkCount: 5,
      uploadedAt: "昨天 21:08"
    },
    {
      id: "doc_pasted_text",
      title: "pasted-text",
      filename: "pasted-text.txt",
      fileType: "TXT",
      size: "240 字",
      status: "READY",
      chunkCount: 2,
      uploadedAt: "昨天 20:46"
    },
    {
      id: "doc_exam_notes",
      title: "exam-notes",
      filename: "exam-notes.md",
      fileType: "MD",
      size: "18 KB",
      status: "UPLOADED",
      chunkCount: 0,
      uploadedAt: "昨天 19:30"
    }
  ],
  skb_algorithm_notes: [
    {
      id: "doc_sorting",
      title: "排序算法对照",
      filename: "sorting-notes.md",
      fileType: "MD",
      size: "14 KB",
      status: "READY",
      chunkCount: 4,
      uploadedAt: "周一 10:18"
    }
  ]
};

const initialChunks: KnowledgeChunk[] = [
  {
    id: "chunk_data_001",
    documentId: "doc_data_structure",
    index: 1,
    title: "切片 01",
    preview: "线性表是具有相同特性的数据元素的一个有限序列。其逻辑结构有两种基本形式：线性结构和非线性结构。线性表是最基本的线性结构。",
    words: 112
  },
  {
    id: "chunk_data_002",
    documentId: "doc_data_structure",
    index: 2,
    title: "切片 02",
    preview: "链表是一种典型的线性表的存储结构。链表中的节点由数据域和指针域组成，指针指向下一个节点的存储地址。",
    words: 98
  },
  {
    id: "chunk_data_003",
    documentId: "doc_data_structure",
    index: 3,
    title: "切片 03",
    preview: "单链表的基本操作包括：1. 初始化 2. 插入 3. 删除 4. 查找 5. 遍历。这些操作是链表应用的基础。",
    words: 105
  },
  {
    id: "chunk_head_001",
    documentId: "doc_head_node",
    index: 1,
    title: "切片 01",
    preview: "删除头节点时，函数返回值必须指向新的头节点。如果仍返回原 head，调用方会继续持有已经被删除的节点。",
    words: 91
  },
  {
    id: "chunk_head_002",
    documentId: "doc_head_node",
    index: 2,
    title: "切片 02",
    preview: "空链表需要先判断 head == nullptr；单节点链表删除后应返回 nullptr，并避免继续访问 next。",
    words: 84
  }
];

function statusText(status: KnowledgeBaseStatus | DocumentStatus) {
  const map: Record<string, string> = {
    READY: "可检索",
    PROCESSING: "处理中",
    PARTIAL_READY: "部分可检索",
    FAILED: "处理失败",
    DRAFT: "草稿",
    UPLOADED: "待处理",
    PARSING: "解析中",
    CLEANING: "清洗中",
    CHUNKING: "切片中",
    INDEXING: "索引中"
  };
  return map[status] ?? status;
}

function statusTone(status: KnowledgeBaseStatus | DocumentStatus) {
  if (status === "READY") return "ready";
  if (status === "FAILED") return "failed";
  if (status === "DRAFT") return "draft";
  return "processing";
}

const processingStatuses = new Set<DocumentStatus>(["PARSING", "CLEANING", "CHUNKING", "INDEXING"]);

function isProcessing(status: DocumentStatus) {
  return processingStatuses.has(status);
}

function deriveBaseStatus(documents: KnowledgeDocument[]): KnowledgeBaseStatus {
  if (!documents.length) return "DRAFT";
  if (documents.some((doc) => isProcessing(doc.status))) return "PROCESSING";
  const readyCount = documents.filter((doc) => doc.status === "READY").length;
  if (readyCount === documents.length) return "READY";
  if (readyCount > 0) return "PARTIAL_READY";
  if (documents.some((doc) => doc.status === "FAILED")) return "FAILED";
  return "DRAFT";
}

function documentProgress(status: DocumentStatus) {
  const progressMap: Record<DocumentStatus, number> = {
    UPLOADED: 8,
    PARSING: 22,
    CLEANING: 42,
    CHUNKING: 64,
    INDEXING: 86,
    READY: 100,
    FAILED: 100
  };
  return progressMap[status];
}

function workflowText(doc: KnowledgeDocument) {
  if (doc.status === "UPLOADED") return "已上传，待确认后处理入库";
  if (doc.status === "READY") return `${doc.chunkCount} 个切片已入库`;
  if (doc.status === "FAILED") return "处理失败，可删除或重新处理";
  return `${statusText(doc.status)}，正在生成可引用知识切片`;
}

function nowLabel() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
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
  if (ext === "PDF" || ext === "DOCX" || ext === "TXT" || ext === "MD") return ext;
  return "TXT";
}

export default function StudentKnowledgeBase() {
  const [knowledgeBases, setKnowledgeBases] = useState(initialKnowledgeBases);
  const [documentsByBase, setDocumentsByBase] = useState(initialDocuments);
  const [chunks, setChunks] = useState(initialChunks);
  const [activeBaseId, setActiveBaseId] = useState("skb_exam_notes");
  const [activeDocumentId, setActiveDocumentId] = useState("doc_data_structure");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const knowledgeBaseViews = useMemo(() => knowledgeBases.map((item) => {
    const documents = documentsByBase[item.id] ?? [];
    return {
      ...item,
      status: deriveBaseStatus(documents),
      documentCount: documents.length,
      chunkCount: documents.reduce((sum, doc) => sum + (doc.status === "READY" ? doc.chunkCount : 0), 0)
    };
  }), [documentsByBase, knowledgeBases]);

  const activeBase = knowledgeBaseViews.find((item) => item.id === activeBaseId) ?? knowledgeBaseViews[0];
  const documents = documentsByBase[activeBase.id] ?? [];
  const activeDocument = documents.find((item) => item.id === activeDocumentId) ?? documents[0];
  const activeDocumentChunks = chunks.filter((chunk) => chunk.documentId === activeDocument?.id);

  const visibleKnowledgeBases = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return knowledgeBaseViews;
    return knowledgeBaseViews.filter((item) => item.title.toLowerCase().includes(normalized));
  }, [knowledgeBaseViews, query]);

  function selectBase(id: string) {
    setActiveBaseId(id);
    const firstDocument = documentsByBase[id]?.[0];
    setActiveDocumentId(firstDocument?.id ?? "");
    setDrawerOpen(false);
  }

  function openChunkDrawer(documentId: string) {
    setActiveDocumentId(documentId);
    setDrawerOpen(true);
  }

  function createKnowledgeBase() {
    const id = `skb_${Date.now()}`;
    const item: StudentKnowledgeBaseItem = {
      id,
      title: "新建知识库",
      status: "DRAFT",
      documentCount: 0,
      chunkCount: 0
    };
    setKnowledgeBases((current) => [item, ...current]);
    setDocumentsByBase((current) => ({ ...current, [id]: [] }));
    setActiveBaseId(id);
    setActiveDocumentId("");
    setDrawerOpen(false);
  }

  function stageDocument(document: KnowledgeDocument) {
    setDocumentsByBase((current) => ({
      ...current,
      [activeBase.id]: [document, ...(current[activeBase.id] ?? [])]
    }));
    setActiveDocumentId(document.id);
    setDrawerOpen(false);
  }

  function stagePastedText() {
    const documentId = `doc_${Date.now()}`;
    stageDocument({
      id: documentId,
      title: "粘贴文本资料",
      filename: "pasted-text.txt",
      fileType: "TXT",
      size: "240 字",
      status: "UPLOADED",
      chunkCount: 0,
      uploadedAt: `今天 ${nowLabel()}`
    });
  }

  function handleFileSelected(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const documentId = `doc_${Date.now()}`;
    const fileType = fileTypeFromName(file.name);
    stageDocument({
      id: documentId,
      title: file.name.replace(/\.[^.]+$/, "") || "新上传资料",
      filename: file.name,
      fileType,
      size: formatFileSize(file.size),
      status: "UPLOADED",
      chunkCount: 0,
      uploadedAt: `今天 ${nowLabel()}`
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function processDocument(documentId: string) {
    const target = (documentsByBase[activeBase.id] ?? []).find((doc) => doc.id === documentId);
    if (!target || isProcessing(target.status)) return;

    setActiveDocumentId(documentId);
    setDocumentsByBase((current) => ({
      ...current,
      [activeBase.id]: (current[activeBase.id] ?? []).map((doc) => doc.id === documentId ? { ...doc, status: "PARSING", errorMessage: undefined, chunkCount: 0 } : doc)
    }));
    setChunks((current) => current.filter((chunk) => chunk.documentId !== documentId));

    const timeline: Array<[number, DocumentStatus]> = [
      [520, "CLEANING"],
      [1040, "CHUNKING"],
      [1560, "INDEXING"]
    ];
    timeline.forEach(([delay, status]) => {
      window.setTimeout(() => {
        setDocumentsByBase((current) => ({
          ...current,
          [activeBase.id]: (current[activeBase.id] ?? []).map((doc) => doc.id === documentId ? { ...doc, status } : doc)
        }));
      }, delay);
    });

    window.setTimeout(() => {
      if (target.fileType === "PDF" || target.fileType === "DOCX") {
        setDocumentsByBase((current) => ({
          ...current,
          [activeBase.id]: (current[activeBase.id] ?? []).map((doc) => doc.id === documentId ? {
            ...doc,
            status: "FAILED",
            errorMessage: "当前解析器还不能稳定提取该格式文本，请删除后上传 TXT 或 MD 版本，或后续接入文档解析服务后重试。"
          } : doc)
        }));
        return;
      }

      const generatedChunks: KnowledgeChunk[] = [
        {
          id: `${documentId}_chunk_001`,
          documentId,
          index: 1,
          title: "切片 01",
          preview: `系统已从《${target.title}》中提取出一段可检索内容，后续 AI 回答会把它作为我的知识库引用来源。`,
          words: 86
        },
        {
          id: `${documentId}_chunk_002`,
          documentId,
          index: 2,
          title: "切片 02",
          preview: "切片会保留文档、标题、序号和标签，便于检索命中后展示可信来源。",
          words: 72
        }
      ];
      setDocumentsByBase((current) => ({
        ...current,
        [activeBase.id]: (current[activeBase.id] ?? []).map((doc) => doc.id === documentId ? { ...doc, status: "READY", chunkCount: generatedChunks.length } : doc)
      }));
      setChunks((current) => [...generatedChunks, ...current]);
    }, 2140);
  }

  function deleteDocument(documentId: string) {
    const nextDocuments = documents.filter((doc) => doc.id !== documentId);
    setDocumentsByBase((current) => ({
      ...current,
      [activeBase.id]: nextDocuments
    }));
    setChunks((current) => current.filter((chunk) => chunk.documentId !== documentId));
    if (activeDocumentId === documentId) {
      setActiveDocumentId(nextDocuments[0]?.id ?? "");
      setDrawerOpen(false);
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
                className={item.id === activeBase.id ? "active" : ""}
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
                <h2>{activeBase.title}</h2>
                <p>{activeBase.documentCount}个文件 · {activeBase.chunkCount}个切片</p>
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
                <button type="button" onClick={() => fileInputRef.current?.click()}>
                  <FileUp size={16} />
                  选择文件
                </button>
                <button type="button" onClick={stagePastedText}>
                  <Clipboard size={16} />
                  粘贴文本
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.txt,.pdf,.docx"
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
                <article
                  key={doc.id}
                  className={doc.id === activeDocumentId ? "active" : ""}
                >
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
                    <i><b style={{ width: `${documentProgress(doc.status)}%` }} /></i>
                    <small>{workflowText(doc)}</small>
                  </span>
                  <span className="kb-doc-row-actions">
                    {doc.status === "READY" ? (
                      <button type="button" onClick={() => openChunkDrawer(doc.id)}>
                        <FileText size={15} />
                        查看切片
                      </button>
                    ) : doc.status === "FAILED" ? (
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
                    <button type="button" className="danger" onClick={() => deleteDocument(doc.id)} disabled={processing}>
                      <Trash2 size={15} />
                      删除
                    </button>
                  </span>
                </article>
              );})}
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

            <div className="kb-preview-list">
              {activeDocumentChunks.length ? activeDocumentChunks.map((chunk) => (
                <article key={chunk.id}>
                  <span>{chunk.title}</span>
                  <p>{chunk.preview}</p>
                  <small>约 {chunk.words} 字</small>
                </article>
              )) : (
                <article>
                  <span>暂无切片</span>
                  <p>文档处理完成后会在这里展示切片内容。</p>
                </article>
              )}
            </div>

            {activeDocument.status === "FAILED" ? (
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
    </div>
  );
}
