import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCode2,
  FileQuestion,
  FileText,
  Folder,
  FolderArchive,
  Github,
  GraduationCap,
  Grid2X2,
  LibraryBig,
  List,
  MoreVertical,
  MoveRight,
  Network,
  Presentation,
  Search,
  Settings2,
  Tag,
  Waypoints,
  Wrench
} from "lucide-react";
import { api, type GeneratedResource } from "../api";
import { authHeaders } from "../authSession";
import GeneratedResourcePreviewModal from "../components/GeneratedResourcePreviewModal";
import { StudentInlineNotice, studentErrorDetail, studentErrorMessage } from "../components/StudentState";

type ResourceType = "官方文档" | "外部文章" | "视频教程" | "工具网站" | "知识卡片" | "AI 生成";
type ResourceFolder = "全部收藏" | "课程资料" | "外部文章" | "视频教程" | "工具网站" | "知识卡片" | "已归档";
type ResourceSource = "全部" | "官方" | "社区" | "视频平台" | "AI 生成";
type SortMode = "收藏时间" | "标题";
type SortOrder = "降序" | "升序";
type PageMarker = number | "ellipsis-left" | "ellipsis-right";

type ExternalResourceItem = {
  kind: "external";
  id: string;
  type: Exclude<ResourceType, "AI 生成">;
  folder: Exclude<ResourceFolder, "全部收藏">;
  title: string;
  source: Exclude<ResourceSource, "全部" | "AI 生成">;
  domain: string;
  url: string;
  summary: string;
  collectedAt: string;
  tags: string[];
  tone: "python" | "pytorch" | "article" | "video" | "sklearn" | "tool";
};

type GeneratedResourceItem = {
  kind: "generated";
  id: string;
  type: "AI 生成";
  folder: "知识卡片";
  title: string;
  source: "AI 生成";
  domain: string;
  summary: string;
  collectedAt: string;
  tags: string[];
  resource: GeneratedResource;
};

type ResourceListItem = ExternalResourceItem | GeneratedResourceItem;

const folderOptions: ResourceFolder[] = ["全部收藏", "课程资料", "外部文章", "视频教程", "工具网站", "知识卡片", "已归档"];
const resourceTypeOptions: Array<"全部" | ResourceType> = ["全部", "官方文档", "外部文章", "视频教程", "工具网站", "知识卡片", "AI 生成"];
const sourceOptions: ResourceSource[] = ["全部", "官方", "社区", "视频平台", "AI 生成"];
const sortModeOptions: SortMode[] = ["收藏时间", "标题"];
const sortOrderOptions: SortOrder[] = ["降序", "升序"];
const pageSizeOptions = [6, 12, 24];

const externalResources: ExternalResourceItem[] = [
  {
    kind: "external",
    id: "python-docs-312",
    type: "官方文档",
    folder: "课程资料",
    title: "Python 官方文档（3.12）",
    source: "官方",
    domain: "docs.python.org",
    url: "https://docs.python.org/3.12/",
    summary: "Python 3.12.2 官方文档，包含完整的语言参考与标准库说明。",
    collectedAt: "2024-05-18",
    tags: ["Python", "官方文档", "参考手册"],
    tone: "python"
  },
  {
    kind: "external",
    id: "pytorch-tutorials",
    type: "官方文档",
    folder: "课程资料",
    title: "PyTorch 官方教程",
    source: "官方",
    domain: "pytorch.org",
    url: "https://pytorch.org/tutorials/",
    summary: "PyTorch 官方提供的深度学习入门与进阶教程，覆盖张量、训练循环和模型部署。",
    collectedAt: "2024-05-16",
    tags: ["深度学习", "PyTorch", "教程"],
    tone: "pytorch"
  },
  {
    kind: "external",
    id: "transformer-intro",
    type: "外部文章",
    folder: "外部文章",
    title: "A Gentle Introduction to Transformers",
    source: "社区",
    domain: "medium.com",
    url: "https://medium.com/",
    summary: "一篇通俗介绍 Transformer 介绍文章，适合初学者理解注意力机制和编码器结构。",
    collectedAt: "2024-05-15",
    tags: ["NLP", "Transformer", "深度学习"],
    tone: "article"
  },
  {
    kind: "external",
    id: "machine-learning-video",
    type: "视频教程",
    folder: "视频教程",
    title: "机器学习入门（李宏毅）",
    source: "视频平台",
    domain: "youtube.com",
    url: "https://www.youtube.com/",
    summary: "台湾大学李宏毅教授的机器学习课程视频，适合作为机器学习核心课补充材料。",
    collectedAt: "2024-05-14",
    tags: ["机器学习", "视频课程", "李宏毅"],
    tone: "video"
  },
  {
    kind: "external",
    id: "sklearn-guide",
    type: "官方文档",
    folder: "工具网站",
    title: "scikit-learn 用户指南",
    source: "官方",
    domain: "scikit-learn.org",
    url: "https://scikit-learn.org/stable/user_guide.html",
    summary: "scikit-learn 用户指南，覆盖常用算法、模型评估与使用示例。",
    collectedAt: "2024-05-12",
    tags: ["机器学习", "Scikit-learn", "官方文档"],
    tone: "sklearn"
  },
  {
    kind: "external",
    id: "tableau-learning",
    type: "工具网站",
    folder: "工具网站",
    title: "Tableau 官方学习资源",
    source: "官方",
    domain: "tableau.com",
    url: "https://www.tableau.com/learn/training",
    summary: "Tableau 官方教程与学习路径，帮助快速掌握数据可视化分析。",
    collectedAt: "2024-05-10",
    tags: ["数据可视化", "Tableau", "教程"],
    tone: "tool"
  }
];

function externalResourceIcon(item: ExternalResourceItem) {
  if (item.tone === "python") return <CodePythonMark />;
  if (item.tone === "pytorch") return <Network size={30} />;
  if (item.tone === "article") return <FileText size={30} />;
  if (item.tone === "video") return <BookOpen size={30} />;
  if (item.tone === "sklearn") return <Wrench size={30} />;
  return <Grid2X2 size={30} />;
}

function generatedResourceIcon(resource: GeneratedResource) {
  if (resource.resource_type === "PPT") return <Presentation size={24} />;
  if (resource.resource_type === "MIND_MAP") return <Waypoints size={24} />;
  if (resource.resource_type === "PRACTICE_SET") return <FileQuestion size={24} />;
  if (resource.resource_type === "KNOWLEDGE_CARD") return <LibraryBig size={24} />;
  return <FileText size={24} />;
}

function generatedResourceMetric(resource: GeneratedResource) {
  if (resource.resource_type === "PPT") return { value: resource.slide_count || resource.item_count, label: "页 PPT" };
  if (resource.resource_type === "MIND_MAP") return { value: resource.item_count, label: "个节点" };
  if (resource.resource_type === "PRACTICE_SET") return { value: resource.item_count, label: "道练习" };
  if (resource.resource_type === "KNOWLEDGE_CARD") return { value: resource.item_count, label: "张卡片" };
  return { value: resource.item_count || 1, label: "节内容" };
}

function generatedToResource(resource: GeneratedResource): GeneratedResourceItem {
  return {
    kind: "generated",
    id: resource.id,
    type: "AI 生成",
    folder: "知识卡片",
    title: resource.title,
    source: "AI 生成",
    domain: "AI 助学",
    summary: resource.summary,
    collectedAt: resource.saved_at || resource.created_at || "",
    tags: [
      resource.resource_type_label ?? resource.resource_type,
      resource.knowledge_point || "自主学习",
      `引用 ${(resource.citations ?? []).length} 条`
    ],
    resource
  };
}

function formatDate(value: string) {
  if (!value) return "刚刚";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function itemSearchText(item: ResourceListItem) {
  return [item.title, item.summary, item.type, item.source, item.domain, item.tags.join(" ")].join(" ").toLowerCase();
}

function pageMarkers(currentPage: number, totalPages: number): PageMarker[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }

  const normalizedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  return normalizedPages.reduce<PageMarker[]>((markers, page, index) => {
    const previous = normalizedPages[index - 1];
    if (previous && page - previous > 1) {
      markers.push(previous === 1 ? "ellipsis-left" : "ellipsis-right");
    }
    markers.push(page);
    return markers;
  }, []);
}

export default function StudentResourceCenter() {
  const [activeFolder, setActiveFolder] = useState<ResourceFolder>("全部收藏");
  const [resourceType, setResourceType] = useState<"全部" | ResourceType>("全部");
  const [source, setSource] = useState<ResourceSource>("全部");
  const [tag, setTag] = useState("全部");
  const [sortMode, setSortMode] = useState<SortMode>("收藏时间");
  const [sortOrder, setSortOrder] = useState<SortOrder>("降序");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [jumpPage, setJumpPage] = useState("1");
  const [folderOverrides, setFolderOverrides] = useState<Record<string, ResourceFolder>>({});
  const [generatedResources, setGeneratedResources] = useState<GeneratedResource[]>([]);
  const [generatedError, setGeneratedError] = useState<string | null>(null);
  const [generatedErrorDetail, setGeneratedErrorDetail] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [previewResource, setPreviewResource] = useState<GeneratedResource | null>(null);
  const [previewExternal, setPreviewExternal] = useState<ExternalResourceItem | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setGeneratedError(null);
    setGeneratedErrorDetail(null);
    api.listGeneratedResources()
      .then((result) => {
        if (alive) setGeneratedResources(Array.isArray(result.items) ? result.items : []);
      })
      .catch((err) => {
        if (!alive) return;
        setGeneratedError(studentErrorMessage(err, "AI 生成资源接口暂时不可用，当前先展示外部资源占位数据。"));
        setGeneratedErrorDetail(studentErrorDetail(err));
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const generatedItems = useMemo(() => generatedResources.map(generatedToResource), [generatedResources]);

  const allItems = useMemo<ResourceListItem[]>(() => {
    const externalItems = externalResources.map((item) => ({
      ...item,
      folder: (folderOverrides[item.id] ?? item.folder) as ExternalResourceItem["folder"]
    }));
    return [...generatedItems, ...externalItems];
  }, [folderOverrides, generatedItems]);

  const allTags = useMemo(() => {
    return ["全部", ...Array.from(new Set(allItems.flatMap((item) => item.tags))).slice(0, 10)];
  }, [allItems]);

  const folderCounts = useMemo(() => {
    return folderOptions.map((folder) => ({
      folder,
      count: folder === "全部收藏" ? allItems.length : allItems.filter((item) => item.folder === folder).length
    }));
  }, [allItems]);

  const tagCounts = useMemo(() => {
    return allTags.slice(1, 7).map((item) => ({
      label: item,
      count: allItems.filter((resource) => resource.tags.includes(item)).length
    }));
  }, [allItems, allTags]);

  const visibleItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const filtered = allItems.filter((item) => {
      const folderMatched = activeFolder === "全部收藏" || item.folder === activeFolder;
      const typeMatched = resourceType === "全部" || item.type === resourceType;
      const sourceMatched = source === "全部" || item.source === source;
      const tagMatched = tag === "全部" || item.tags.includes(tag);
      const queryMatched = !keyword || itemSearchText(item).includes(keyword);
      return folderMatched && typeMatched && sourceMatched && tagMatched && queryMatched;
    });
    return filtered.sort((a, b) => {
      const direction = sortOrder === "降序" ? -1 : 1;
      if (sortMode === "标题") return a.title.localeCompare(b.title, "zh-CN") * direction;
      return (new Date(a.collectedAt).getTime() - new Date(b.collectedAt).getTime()) * direction;
    });
  }, [activeFolder, allItems, query, resourceType, sortMode, sortOrder, source, tag]);

  const totalPages = Math.max(1, Math.ceil(visibleItems.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedItems = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return visibleItems.slice(start, start + pageSize);
  }, [pageSize, safeCurrentPage, visibleItems]);
  const paginationMarkers = useMemo(() => pageMarkers(safeCurrentPage, totalPages), [safeCurrentPage, totalPages]);
  const totalStorageGb = Math.max(1.2, allItems.length * 0.18).toFixed(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFolder, query, resourceType, sortMode, sortOrder, source, tag]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    setJumpPage(String(safeCurrentPage));
  }, [safeCurrentPage]);

  function resetFilters() {
    setActiveFolder("全部收藏");
    setResourceType("全部");
    setSource("全部");
    setTag("全部");
    setSortMode("收藏时间");
    setSortOrder("降序");
    setQuery("");
    setCurrentPage(1);
    setActionNotice("筛选条件已清空。");
  }

  function goToPage(page: number) {
    setCurrentPage(Math.min(Math.max(page, 1), totalPages));
  }

  function submitJumpPage() {
    const parsed = Number.parseInt(jumpPage, 10);
    if (Number.isNaN(parsed)) {
      setJumpPage(String(safeCurrentPage));
      return;
    }
    goToPage(parsed);
  }

  function moveResource(item: ResourceListItem, folder: ResourceFolder) {
    if (folder === "全部收藏") return;
    if (item.kind === "generated") {
      setActionNotice("AI 生成资源的移动接口暂未接入，当前保持在知识卡片分类中。");
      return;
    }
    setFolderOverrides((current) => ({ ...current, [item.id]: folder }));
    setActionNotice(`已临时移动到“${folder}”，后端分类保存接口接入后会持久化。`);
  }

  async function copyResourceLink(item: ResourceListItem) {
    const text = item.kind === "external" ? item.url : `${window.location.origin}/self-study/library?resource=${encodeURIComponent(item.id)}`;
    try {
      await navigator.clipboard.writeText(text);
      setActionNotice("资源链接已复制。");
    } catch {
      setActionNotice("复制接口不可用，请在打开资源后从浏览器地址栏复制。");
    }
  }

  function openExternalResource(item: ExternalResourceItem) {
    window.open(item.url, "_blank", "noopener,noreferrer");
  }

  async function downloadGeneratedResource(resource: GeneratedResource) {
    try {
      const response = await fetch(api.generatedResourceDownloadUrl(resource.id), {
        headers: authHeaders()
      });
      if (!response.ok) {
        setGeneratedError("资源导出失败，请稍后再试。");
        setGeneratedErrorDetail(`HTTP ${response.status} ${response.statusText}`);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${resource.title}.${(resource.file_format || "PPTX").toLowerCase()}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setGeneratedError(studentErrorMessage(err, "资源导出失败，请稍后再试。"));
      setGeneratedErrorDetail(studentErrorDetail(err));
    }
  }

  return (
    <div className="student-resource-page">
      <header className="student-resource-header">
        <div>
          <h1>资源中心</h1>
          <p>管理你收藏的外部资源与生成内容，便于整理、查找与复习。</p>
        </div>
        <section className="student-resource-summary" aria-label="资源统计">
          <span>共收纳 <b>{allItems.length}</b> 个资源</span>
          <small>占用空间 {totalStorageGb} GB</small>
        </section>
      </header>

      <section className="student-resource-search" aria-label="资源搜索">
        <label>
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索我的收藏资源（支持标题、描述、标签、来源）" />
        </label>
        <button type="button" onClick={() => setActionNotice("搜索已按当前关键词刷新。")}>搜索</button>
        <button type="button" className="student-resource-advanced" onClick={() => setAdvancedOpen((current) => !current)}>
          <Settings2 size={16} />
          高级搜索
        </button>
      </section>

      {advancedOpen ? (
        <section className="student-resource-advanced-panel" aria-label="高级搜索条件">
          <span>高级搜索后端接口暂未接入，当前先复用本页筛选条件。</span>
          <button type="button" onClick={() => setQuery("机器学习")}>机器学习</button>
          <button type="button" onClick={() => setQuery("Python")}>Python</button>
          <button type="button" onClick={() => setQuery("Transformer")}>Transformer</button>
        </section>
      ) : null}

      <div className="student-resource-layout">
        <aside className="student-resource-types" aria-label="资源分类">
          <section>
            <header>
              <h2>我的资源</h2>
              <div>
                <button type="button" aria-label="新增资源" onClick={() => setActionNotice("新增外部资源接口暂未接入，入口已预留。")}>
                  <Folder size={16} />
                </button>
                <button type="button" aria-label="分类设置" onClick={() => setActionNotice("分类设置接口暂未接入，入口已预留。")}>
                  <Settings2 size={16} />
                </button>
              </div>
            </header>
            {folderCounts.map((item) => (
              <button
                type="button"
                key={item.folder}
                className={activeFolder === item.folder ? "active" : ""}
                onClick={() => setActiveFolder(item.folder)}
              >
                <span>
                  {item.folder === "已归档" ? <FolderArchive size={16} /> : <Folder size={16} />}
                  {item.folder}
                </span>
                <b>{item.count}</b>
              </button>
            ))}
          </section>

          <section className="student-resource-tag-panel">
            <header>
              <h2>标签</h2>
              <button type="button" aria-label="新增标签" onClick={() => setActionNotice("新增标签接口暂未接入，入口已预留。")}>
                <Tag size={15} />
              </button>
            </header>
            {tagCounts.map((item) => (
              <button key={item.label} type="button" className={tag === item.label ? "active" : ""} onClick={() => setTag(item.label)}>
                <span>{item.label}</span>
                <b>{item.count}</b>
              </button>
            ))}
          </section>
        </aside>

        <main className="student-resource-results">
          <section className="student-resource-filters" aria-label="筛选条件">
            <FilterSelect label="资源类型" value={resourceType} options={resourceTypeOptions} onChange={(value) => setResourceType(value as "全部" | ResourceType)} />
            <FilterSelect label="标签" value={tag} options={allTags} onChange={setTag} />
            <FilterSelect label="来源" value={source} options={sourceOptions} onChange={(value) => setSource(value as ResourceSource)} />
            <FilterSelect label="时间" value={sortMode} options={sortModeOptions} onChange={(value) => setSortMode(value as SortMode)} />
            <FilterSelect label="排序" value={sortOrder} options={sortOrderOptions} onChange={(value) => setSortOrder(value as SortOrder)} />
            <div className="student-resource-view-toggle" aria-label="视图切换">
              <button type="button" className={viewMode === "grid" ? "active" : ""} aria-label="网格视图" onClick={() => setViewMode("grid")}>
                <Grid2X2 size={17} />
              </button>
              <button type="button" className={viewMode === "list" ? "active" : ""} aria-label="列表视图" onClick={() => setViewMode("list")}>
                <List size={18} />
              </button>
            </div>
          </section>

          {generatedError ? (
            <StudentInlineNotice
              kind="degraded"
              title="AI 生成资源暂未完整同步"
              description={generatedError}
              detail={generatedErrorDetail}
              actions={[{ label: "重试", variant: "primary", onClick: () => setReloadKey((value) => value + 1) }]}
            />
          ) : null}
          {actionNotice ? <p className="student-resource-notice">{actionNotice}</p> : null}

          <section className={`student-resource-grid ${viewMode === "list" ? "list" : ""}`} aria-label="资源列表">
            {visibleItems.length ? pagedItems.map((item) => (
              <article className={`student-resource-card ${item.kind}`} key={`${item.kind}-${item.id}`}>
                <button
                  type="button"
                  className={`student-resource-thumb ${item.kind === "external" ? item.tone : "generated"}`}
                  onClick={() => item.kind === "external" ? setPreviewExternal(item) : setPreviewResource(item.resource)}
                  aria-label={`预览 ${item.title}`}
                >
                  <span>{item.kind === "external" ? externalResourceIcon(item) : generatedResourceIcon(item.resource)}</span>
                  {item.kind === "generated" ? (
                    <em>{generatedResourceMetric(item.resource).value}{generatedResourceMetric(item.resource).label}</em>
                  ) : null}
                </button>

                <div className="student-resource-card-body">
                  <header>
                    <div>
                      <h2>{item.title}</h2>
                      <p>{item.summary}</p>
                    </div>
                  </header>
                  <div className="student-resource-tags">
                    {item.tags.map((itemTag) => <span key={itemTag}>{itemTag}</span>)}
                  </div>
                  <div className="student-resource-meta">
                    <span>{item.kind === "external" && item.domain.includes("github") ? <Github size={14} /> : <GraduationCap size={14} />} {item.domain}</span>
                    <span><CalendarDays size={14} /> 收藏于 {formatDate(item.collectedAt)}</span>
                    <span><Archive size={14} /> {item.folder}</span>
                  </div>
                  <div className="student-resource-actions">
                    {item.kind === "external" ? (
                      <button type="button" className="primary" onClick={() => openExternalResource(item)}>
                        打开原文 <ExternalLink size={15} />
                      </button>
                    ) : (
                      <button type="button" className="primary" onClick={() => setPreviewResource(item.resource)}>
                        <Eye size={15} /> 预览
                      </button>
                    )}
                    {item.kind === "external" ? (
                      <button type="button" onClick={() => setPreviewExternal(item)}>
                        <Eye size={15} /> 预览
                      </button>
                    ) : (
                      <button type="button" onClick={() => downloadGeneratedResource(item.resource)} disabled={!item.resource.download_available}>
                        <Download size={15} /> 导出
                      </button>
                    )}
                    <label className="student-resource-move">
                      <MoveRight size={15} />
                      <select value={item.folder} onChange={(event) => moveResource(item, event.target.value as ResourceFolder)} aria-label={`移动 ${item.title}`}>
                        {folderOptions.filter((folder) => folder !== "全部收藏").map((folder) => (
                          <option key={folder} value={folder}>{folder}</option>
                        ))}
                      </select>
                    </label>
                    <button type="button" className="icon" aria-label={`更多操作 ${item.title}`} onClick={() => copyResourceLink(item)}>
                      <MoreVertical size={17} />
                    </button>
                  </div>
                </div>
              </article>
            )) : (
              <article className="student-resource-empty">
                <LibraryBig size={28} />
                <h2>没有匹配的资源</h2>
                <p>可以调整关键词、资源类型或标签筛选。外部资源新增和高级搜索接口接入后会在这里继续补齐。</p>
                <button type="button" onClick={resetFilters}>清空筛选</button>
              </article>
            )}
          </section>

          <footer className="student-resource-pagination">
            <span className="student-resource-total">共 {visibleItems.length} 条</span>
            <button type="button" aria-label="上一页" disabled={safeCurrentPage <= 1} onClick={() => goToPage(safeCurrentPage - 1)}><ChevronLeft size={16} /></button>
            {paginationMarkers.map((marker) => (
              typeof marker === "number" ? (
                <button
                  type="button"
                  key={marker}
                  className={safeCurrentPage === marker ? "active" : ""}
                  aria-current={safeCurrentPage === marker ? "page" : undefined}
                  onClick={() => goToPage(marker)}
                >
                  {marker}
                </button>
              ) : (
                <span key={marker} className="student-resource-page-ellipsis">...</span>
              )
            ))}
            <button type="button" aria-label="下一页" disabled={safeCurrentPage >= totalPages} onClick={() => goToPage(safeCurrentPage + 1)}><ChevronRight size={16} /></button>
            <label className="student-resource-page-size">
              每页显示：
              <select value={pageSize} onChange={(event) => {
                setPageSize(Number(event.target.value));
                setCurrentPage(1);
              }}>
                {pageSizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <ChevronDown size={15} />
            </label>
            <label className="student-resource-jump">
              跳至
              <input
                value={jumpPage}
                inputMode="numeric"
                aria-label="跳转页码"
                onChange={(event) => setJumpPage(event.target.value.replace(/\D/g, ""))}
                onBlur={submitJumpPage}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitJumpPage();
                }}
              />
              / {totalPages} 页
            </label>
          </footer>
        </main>
      </div>

      {previewExternal ? (
        <div className="student-resource-preview" role="dialog" aria-modal="true" aria-label="外部资源预览">
          <button type="button" className="student-resource-preview-mask" aria-label="关闭预览" onClick={() => setPreviewExternal(null)} />
          <section>
            <header>
              <div>
                <small>{previewExternal.type} · {previewExternal.domain}</small>
                <h2>{previewExternal.title}</h2>
              </div>
              <button type="button" aria-label="关闭预览" onClick={() => setPreviewExternal(null)}>×</button>
            </header>
            <p>{previewExternal.summary}</p>
            <div className="student-resource-tags">
              {previewExternal.tags.map((item) => <span key={item}>{item}</span>)}
            </div>
            <footer>
              <button type="button" className="primary" onClick={() => openExternalResource(previewExternal)}>
                打开原文 <ExternalLink size={15} />
              </button>
              <button type="button" onClick={() => copyResourceLink(previewExternal)}>
                <Copy size={15} /> 复制链接
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      <GeneratedResourcePreviewModal
        resource={previewResource}
        onClose={() => setPreviewResource(null)}
        onDownload={downloadGeneratedResource}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="student-resource-filter-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function CodePythonMark() {
  return (
    <strong className="student-python-mark" aria-hidden="true">
      Py
    </strong>
  );
}
