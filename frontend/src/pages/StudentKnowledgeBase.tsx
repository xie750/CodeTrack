import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  Database,
  FileText,
  FileUp,
  Layers3,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UploadCloud
} from "lucide-react";

type KnowledgeBaseStatus = "READY" | "PROCESSING" | "FAILED" | "DRAFT";
type DocumentStatus = "READY" | "PARSING" | "CHUNKING" | "INDEXING" | "FAILED";

type KnowledgeChunk = {
  id: string;
  documentId: string;
  index: number;
  title: string;
  preview: string;
  tags: string[];
  score?: number;
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
  tags: string[];
  errorMessage?: string;
};

type StudentKnowledgeBaseItem = {
  id: string;
  title: string;
  description: string;
  status: KnowledgeBaseStatus;
  documentCount: number;
  chunkCount: number;
  updatedAt: string;
  tags: string[];
};

const initialKnowledgeBases: StudentKnowledgeBaseItem[] = [
  {
    id: "skb_linked_list_review",
    title: "链表复习资料库",
    description: "保存自己整理的链表边界、头节点删除和指针遍历资料。",
    status: "READY",
    documentCount: 3,
    chunkCount: 28,
    updatedAt: "今天 14:20",
    tags: ["链表", "错题", "复习"]
  },
  {
    id: "skb_exam_notes",
    title: "期末自整理资料",
    description: "考试前整理的概念对照、常见错误和课堂补充说明。",
    status: "PROCESSING",
    documentCount: 2,
    chunkCount: 11,
    updatedAt: "昨天 21:08",
    tags: ["期末", "概念"]
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
      uploadedAt: "今天 14:12",
      tags: ["链表", "头节点"]
    },
    {
      id: "doc_pointer_walk",
      title: "指针遍历笔记",
      filename: "pointer-walk.txt",
      fileType: "TXT",
      size: "9 KB",
      status: "READY",
      chunkCount: 6,
      uploadedAt: "今天 13:48",
      tags: ["指针", "遍历"]
    },
    {
      id: "doc_pdf_failed",
      title: "扫描版讲义",
      filename: "linked-list-scan.pdf",
      fileType: "PDF",
      size: "2.4 MB",
      status: "FAILED",
      chunkCount: 0,
      uploadedAt: "昨天 20:15",
      tags: ["讲义"],
      errorMessage: "PDF 当前无法提取有效文本，可重新上传文本版资料。"
    }
  ],
  skb_exam_notes: [
    {
      id: "doc_exam_mix",
      title: "期末概念混淆点",
      filename: "exam-notes.md",
      fileType: "MD",
      size: "26 KB",
      status: "CHUNKING",
      chunkCount: 5,
      uploadedAt: "昨天 21:08",
      tags: ["期末", "概念"]
    }
  ]
};

const initialChunks: KnowledgeChunk[] = [
  {
    id: "chunk_head_001",
    documentId: "doc_head_node",
    index: 1,
    title: "头节点删除返回值",
    preview: "删除头节点时，函数返回值必须指向新的头节点。如果仍返回原 head，调用方会继续持有已经被删除的节点。",
    tags: ["链表", "头节点"],
    score: 0.91
  },
  {
    id: "chunk_head_002",
    documentId: "doc_head_node",
    index: 2,
    title: "空链表和单节点链表",
    preview: "空链表需要先判断 head == nullptr；单节点链表删除后应返回 nullptr，并避免继续访问 next。",
    tags: ["链表", "边界"],
    score: 0.84
  },
  {
    id: "chunk_pointer_001",
    documentId: "doc_pointer_walk",
    index: 1,
    title: "指针遍历停止条件",
    preview: "遍历链表时要区分当前节点和前驱节点，删除操作通常需要维护 prev 与 cur 两个指针。",
    tags: ["指针", "遍历"],
    score: 0.76
  }
];

function statusText(status: KnowledgeBaseStatus | DocumentStatus) {
  const map: Record<string, string> = {
    READY: "可检索",
    PROCESSING: "处理中",
    FAILED: "处理失败",
    DRAFT: "草稿",
    PARSING: "解析中",
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

function documentProgress(status: DocumentStatus) {
  const steps = ["UPLOADED", "PARSING", "CLEANING", "CHUNKING", "INDEXING", "READY"];
  if (status === "FAILED") return 64;
  const index = status === "PARSING" ? 1 : status === "CHUNKING" ? 3 : status === "INDEXING" ? 4 : status === "READY" ? 5 : 0;
  return Math.round(((index + 1) / steps.length) * 100);
}

function nowLabel() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
}

export default function StudentKnowledgeBase() {
  const [knowledgeBases, setKnowledgeBases] = useState(initialKnowledgeBases);
  const [documentsByBase, setDocumentsByBase] = useState(initialDocuments);
  const [chunks, setChunks] = useState(initialChunks);
  const [activeBaseId, setActiveBaseId] = useState(initialKnowledgeBases[0].id);
  const [activeDocumentId, setActiveDocumentId] = useState(initialDocuments[initialKnowledgeBases[0].id][0].id);
  const [query, setQuery] = useState("删除头节点为什么要返回新的头指针");
  const [newBaseTitle, setNewBaseTitle] = useState("");
  const [newBaseDescription, setNewBaseDescription] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadText, setUploadText] = useState("");

  const activeBase = knowledgeBases.find((item) => item.id === activeBaseId) ?? knowledgeBases[0];
  const documents = documentsByBase[activeBase.id] ?? [];
  const activeDocument = documents.find((item) => item.id === activeDocumentId) ?? documents[0];
  const activeDocumentChunks = chunks.filter((chunk) => chunk.documentId === activeDocument?.id);

  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const activeDocumentIds = new Set(documents.filter((doc) => doc.status === "READY").map((doc) => doc.id));
    return chunks
      .filter((chunk) => activeDocumentIds.has(chunk.documentId))
      .map((chunk) => {
        const haystack = `${chunk.title} ${chunk.preview} ${chunk.tags.join(" ")}`.toLowerCase();
        const hit = !normalized || normalized.split(/\s+/).some((part) => part && haystack.includes(part));
        const cnHit = !normalized || Array.from(normalized).some((part) => part.trim() && haystack.includes(part));
        return hit || cnHit ? chunk : null;
      })
      .filter(Boolean)
      .slice(0, 5) as KnowledgeChunk[];
  }, [chunks, documents, query]);

  function createKnowledgeBase() {
    const title = newBaseTitle.trim();
    if (!title) return;
    const id = `skb_${Date.now()}`;
    const item: StudentKnowledgeBaseItem = {
      id,
      title,
      description: newBaseDescription.trim() || "学生自建知识库，用于沉淀可被 AI 检索引用的资料。",
      status: "DRAFT",
      documentCount: 0,
      chunkCount: 0,
      updatedAt: `今天 ${nowLabel()}`,
      tags: ["自建"]
    };
    setKnowledgeBases((current) => [item, ...current]);
    setDocumentsByBase((current) => ({ ...current, [id]: [] }));
    setActiveBaseId(id);
    setActiveDocumentId("");
    setNewBaseTitle("");
    setNewBaseDescription("");
  }

  function simulateUpload(source: "file" | "text") {
    const title = uploadTitle.trim() || (source === "file" ? "新上传资料" : "粘贴文本资料");
    const documentId = `doc_${Date.now()}`;
    const document: KnowledgeDocument = {
      id: documentId,
      title,
      filename: source === "file" ? `${title}.md` : "pasted-text.txt",
      fileType: source === "file" ? "MD" : "TXT",
      size: source === "file" ? "12 KB" : `${Math.max(uploadText.length, 240)} 字`,
      status: "CHUNKING",
      chunkCount: 0,
      uploadedAt: `今天 ${nowLabel()}`,
      tags: ["自建", "待索引"]
    };
    setDocumentsByBase((current) => ({
      ...current,
      [activeBase.id]: [document, ...(current[activeBase.id] ?? [])]
    }));
    setKnowledgeBases((current) => current.map((item) => item.id === activeBase.id ? {
      ...item,
      status: "PROCESSING",
      documentCount: item.documentCount + 1,
      updatedAt: `今天 ${nowLabel()}`
    } : item));
    setActiveDocumentId(documentId);
    setUploadTitle("");
    setUploadText("");

    window.setTimeout(() => {
      const generatedChunks: KnowledgeChunk[] = [
        {
          id: `${documentId}_chunk_001`,
          documentId,
          index: 1,
          title: `${title} · 核心片段`,
          preview: uploadText.trim() || "系统已从资料中提取出一段可检索内容，后续 AI 回答会把它作为我的知识库引用来源。",
          tags: ["自建", "可引用"],
          score: 0.82
        },
        {
          id: `${documentId}_chunk_002`,
          documentId,
          index: 2,
          title: `${title} · 补充说明`,
          preview: "切片会保留文档、标题、序号和标签，便于检索命中后展示可信来源。",
          tags: ["处理流程"],
          score: 0.74
        }
      ];
      setDocumentsByBase((current) => ({
        ...current,
        [activeBase.id]: (current[activeBase.id] ?? []).map((doc) => doc.id === documentId ? { ...doc, status: "READY", chunkCount: generatedChunks.length } : doc)
      }));
      setChunks((current) => [...generatedChunks, ...current]);
      setKnowledgeBases((current) => current.map((item) => item.id === activeBase.id ? {
        ...item,
        status: "READY",
        chunkCount: item.chunkCount + generatedChunks.length,
        updatedAt: `今天 ${nowLabel()}`
      } : item));
    }, 1000);
  }

  function reprocessDocument(documentId: string) {
    setDocumentsByBase((current) => ({
      ...current,
      [activeBase.id]: (current[activeBase.id] ?? []).map((doc) => doc.id === documentId ? { ...doc, status: "CHUNKING", errorMessage: undefined } : doc)
    }));
    window.setTimeout(() => {
      setDocumentsByBase((current) => ({
        ...current,
        [activeBase.id]: (current[activeBase.id] ?? []).map((doc) => doc.id === documentId ? { ...doc, status: "READY", chunkCount: Math.max(doc.chunkCount, 2) } : doc)
      }));
    }, 900);
  }

  function deleteDocument(documentId: string) {
    setDocumentsByBase((current) => ({
      ...current,
      [activeBase.id]: (current[activeBase.id] ?? []).filter((doc) => doc.id !== documentId)
    }));
    setChunks((current) => current.filter((chunk) => chunk.documentId !== documentId));
    if (activeDocumentId === documentId) {
      const next = documents.find((doc) => doc.id !== documentId);
      setActiveDocumentId(next?.id ?? "");
    }
  }

  return (
    <div className="knowledge-base-page">
      <header className="kb-page-head">
        <div>
          <span className="student-eyebrow">学生知识库</span>
          <h1>构建我的可信资料库</h1>
          <p>上传自己整理的资料，系统完成解析、清洗、切片和索引后，AI 可以在回答中引用这些内容。</p>
        </div>
        <div className="kb-head-actions">
          <button type="button" className="kb-secondary-btn">
            <SlidersHorizontal size={17} />
            处理设置
          </button>
          <button type="button" className="kb-primary-btn" onClick={createKnowledgeBase}>
            <Plus size={17} />
            新建知识库
          </button>
        </div>
      </header>

      <section className="kb-stats" aria-label="知识库统计">
        <article>
          <span><Database size={20} /></span>
          <small>知识库</small>
          <strong>{knowledgeBases.length}</strong>
        </article>
        <article>
          <span><FileText size={20} /></span>
          <small>文档</small>
          <strong>{knowledgeBases.reduce((sum, item) => sum + item.documentCount, 0)}</strong>
        </article>
        <article>
          <span><Layers3 size={20} /></span>
          <small>切片</small>
          <strong>{knowledgeBases.reduce((sum, item) => sum + item.chunkCount, 0)}</strong>
        </article>
        <article>
          <span><ShieldCheck size={20} /></span>
          <small>AI 引用</small>
          <strong>已启用</strong>
        </article>
      </section>

      <section className="kb-layout">
        <aside className="kb-sidebar">
          <section className="kb-panel kb-create-panel">
            <h2>新建知识库</h2>
            <label>
              名称
              <input value={newBaseTitle} onChange={(event) => setNewBaseTitle(event.target.value)} placeholder="例如：链表复习资料库" />
            </label>
            <label>
              说明
              <textarea value={newBaseDescription} onChange={(event) => setNewBaseDescription(event.target.value)} placeholder="这批资料主要解决什么问题" />
            </label>
            <button type="button" onClick={createKnowledgeBase}>
              <Plus size={16} />
              创建
            </button>
          </section>

          <section className="kb-panel">
            <div className="kb-panel-head">
              <h2>我的知识库</h2>
              <span>{knowledgeBases.length} 个</span>
            </div>
            <div className="kb-list">
              {knowledgeBases.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === activeBase.id ? "active" : ""}
                  onClick={() => {
                    setActiveBaseId(item.id);
                    setActiveDocumentId((documentsByBase[item.id] ?? [])[0]?.id ?? "");
                  }}
                >
                  <span className={`kb-status-dot ${statusTone(item.status)}`} />
                  <strong>{item.title}</strong>
                  <small>{item.documentCount} 文档 · {item.chunkCount} 切片</small>
                  <em>{statusText(item.status)}</em>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <main className="kb-main">
          <section className="kb-panel kb-base-overview">
            <div>
              <span className={`kb-status-pill ${statusTone(activeBase.status)}`}>{statusText(activeBase.status)}</span>
              <h2>{activeBase.title}</h2>
              <p>{activeBase.description}</p>
              <div className="kb-tags">{activeBase.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
            </div>
            <div className="kb-base-metrics">
              <span><b>{activeBase.documentCount}</b> 文档</span>
              <span><b>{activeBase.chunkCount}</b> 切片</span>
              <span>更新于 {activeBase.updatedAt}</span>
            </div>
          </section>

          <section className="kb-panel kb-upload-panel">
            <div className="kb-panel-head">
              <div>
                <h2>上传资料</h2>
                <p>首版支持 Markdown / TXT，PDF 和 DOCX 作为后续解析能力接入。</p>
              </div>
              <UploadCloud size={22} />
            </div>
            <div className="kb-upload-grid">
              <label>
                资料标题
                <input value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder="例如：头节点删除错题整理" />
              </label>
              <label>
                粘贴文本
                <textarea value={uploadText} onChange={(event) => setUploadText(event.target.value)} placeholder="可以粘贴笔记、错题说明或资料片段" />
              </label>
            </div>
            <div className="kb-upload-actions">
              <button type="button" className="kb-primary-btn" onClick={() => simulateUpload("file")}>
                <FileUp size={16} />
                模拟上传文件
              </button>
              <button type="button" className="kb-secondary-btn" onClick={() => simulateUpload("text")}>
                <FileText size={16} />
                从粘贴文本入库
              </button>
            </div>
          </section>

          <section className="kb-panel">
            <div className="kb-panel-head">
              <div>
                <h2>文档处理状态</h2>
                <p>每份资料都会经历解析、清洗、切片、索引，处理完成后才可被 AI 引用。</p>
              </div>
              <span>{documents.length} 份资料</span>
            </div>
            <div className="kb-document-table">
              {documents.length ? documents.map((doc) => (
                <article key={doc.id} className={doc.id === activeDocument?.id ? "active" : ""} onClick={() => setActiveDocumentId(doc.id)}>
                  <div className="kb-doc-title">
                    <span className={`kb-doc-icon ${statusTone(doc.status)}`}>
                      {doc.status === "READY" ? <CheckCircle2 size={17} /> : doc.status === "FAILED" ? <AlertTriangle size={17} /> : <Clock3 size={17} />}
                    </span>
                    <div>
                      <strong>{doc.title}</strong>
                      <small>{doc.filename} · {doc.fileType} · {doc.size}</small>
                    </div>
                  </div>
                  <span className={`kb-status-pill ${statusTone(doc.status)}`}>{statusText(doc.status)}</span>
                  <div className="kb-doc-progress" aria-label={`${doc.title}处理进度`}>
                    <i><b style={{ width: `${documentProgress(doc.status)}%` }} /></i>
                    <small>{doc.chunkCount} 切片</small>
                  </div>
                  <div className="kb-doc-actions">
                    <button type="button" onClick={(event) => { event.stopPropagation(); reprocessDocument(doc.id); }}>
                      <RefreshCw size={15} />
                    </button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); deleteDocument(doc.id); }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {doc.errorMessage ? <p className="kb-doc-error">{doc.errorMessage}</p> : null}
                </article>
              )) : (
                <div className="kb-empty">
                  <Database size={28} />
                  <h3>这个知识库还没有资料</h3>
                  <p>上传 Markdown、TXT 或粘贴文本后，系统会生成可检索切片。</p>
                </div>
              )}
            </div>
          </section>

          <section className="kb-panel kb-search-panel">
            <div className="kb-panel-head">
              <div>
                <h2>检索测试</h2>
                <p>模拟 AI 在我的知识库中检索引用依据。</p>
              </div>
              <Search size={21} />
            </div>
            <label className="kb-search-input">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入问题或关键词" />
              <Search size={18} />
            </label>
            <div className="kb-search-results">
              {searchResults.length ? searchResults.map((chunk) => (
                <article key={chunk.id}>
                  <div>
                    <strong>{chunk.title}</strong>
                    <span>chunk #{chunk.index} · 匹配 {Math.round((chunk.score ?? 0.72) * 100)}%</span>
                  </div>
                  <p>{chunk.preview}</p>
                  <div className="kb-tags">{chunk.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                </article>
              )) : (
                <div className="kb-empty compact">
                  <Search size={24} />
                  <p>没有命中可检索切片，可以换个关键词或上传更多资料。</p>
                </div>
              )}
            </div>
          </section>
        </main>

        <aside className="kb-detail">
          <section className="kb-panel">
            <div className="kb-panel-head">
              <h2>文档详情</h2>
              <span>{activeDocument ? statusText(activeDocument.status) : "未选择"}</span>
            </div>
            {activeDocument ? (
              <>
                <div className="kb-detail-file">
                  <FileText size={22} />
                  <div>
                    <strong>{activeDocument.title}</strong>
                    <small>{activeDocument.filename}</small>
                  </div>
                </div>
                <div className="kb-detail-meta">
                  <span>上传时间 <b>{activeDocument.uploadedAt}</b></span>
                  <span>切片数量 <b>{activeDocument.chunkCount}</b></span>
                  <span>处理状态 <b>{statusText(activeDocument.status)}</b></span>
                </div>
                <div className="kb-tags">{activeDocument.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              </>
            ) : (
              <p className="kb-muted">选择一个文档查看处理细节。</p>
            )}
          </section>

          <section className="kb-panel">
            <div className="kb-panel-head">
              <h2>切片预览</h2>
              <span>{activeDocumentChunks.length} 条</span>
            </div>
            <div className="kb-chunk-list">
              {activeDocumentChunks.length ? activeDocumentChunks.map((chunk) => (
                <article key={chunk.id}>
                  <strong>{chunk.title}</strong>
                  <p>{chunk.preview}</p>
                  <small>chunk #{chunk.index}</small>
                </article>
              )) : (
                <p className="kb-muted">文档处理完成后会在这里显示切片。</p>
              )}
            </div>
          </section>

          <section className="kb-panel kb-ai-card">
            <Bot size={24} />
            <h2>AI 引用方式</h2>
            <p>AI 回答时会标识“我的知识库”，并展示文档标题、切片位置和引用片段。教师资料可以作为底层可信来源参与检索，但不在此页面管理。</p>
          </section>
        </aside>
      </section>
    </div>
  );
}
