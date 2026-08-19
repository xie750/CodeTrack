import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  BookmarkCheck,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Download,
  Eye,
  FileCode2,
  FileQuestion,
  FileText,
  Github,
  GraduationCap,
  LibraryBig,
  Network,
  Presentation,
  Podcast,
  RefreshCw,
  Search,
  Star,
  ThumbsUp,
  UserRound,
  Waypoints
} from "lucide-react";
import { api, type GeneratedResource } from "../api";
import { authHeaders } from "../authSession";
import GeneratedResourcePreviewModal from "../components/GeneratedResourcePreviewModal";

type ResourceType = "视频教程" | "代码项目" | "文章文档" | "电子书" | "学习路线";
type ResourceFolder = "全部" | "资源生成" | ResourceType;
type Difficulty = "全部" | "入门" | "初级" | "中级" | "高级";

type ResourceItem = {
  id: string;
  type: ResourceType;
  title: string;
  author: string;
  platform: string;
  summary: string;
  difficulty: Exclude<Difficulty, "全部">;
  tags: string[];
  views: string;
  likes: string;
  date: string;
  imageTone: "python" | "github" | "doc" | "book" | "algo" | "route";
  duration?: string;
};

const difficultyOptions: Difficulty[] = ["全部", "入门", "初级", "中级", "高级"];
const hotSearches = ["Python基础", "数据结构", "Flask实战", "爬虫", "Pandas", "机器学习", "可视化"];

const resources: ResourceItem[] = [
  {
    id: "python-video-2024",
    type: "视频教程",
    title: "Python零基础入门到精通（2024最新版）",
    author: "黑马程序员",
    platform: "B站",
    summary: "从环境搭建到项目实战，适合 Python 初学者的系统课程",
    difficulty: "入门",
    tags: ["入门", "Python基础", "环境搭建"],
    views: "12.3万",
    likes: "1.2万",
    date: "2024-03-15",
    imageTone: "python",
    duration: "12:45:30"
  },
  {
    id: "awesome-python",
    type: "代码项目",
    title: "awesome-python",
    author: "vinta / awesome-python",
    platform: "GitHub",
    summary: "精选的 Python 资源列表，包含框架、库、工具和学习资料",
    difficulty: "中级",
    tags: ["资源整合", "工具库", "GitHub"],
    views: "8.7k",
    likes: "16.2k",
    date: "2024-05-10",
    imageTone: "github"
  },
  {
    id: "python-function-doc",
    type: "文章文档",
    title: "Python 函数详解：定义、参数与返回值",
    author: "菜鸟教程",
    platform: "CSDN",
    summary: "详细讲解 Python 函数的定义方式、参数类型和返回值的使用",
    difficulty: "入门",
    tags: ["函数", "基础语法", "参数"],
    views: "2.1万",
    likes: "326",
    date: "2024-04-02",
    imageTone: "doc"
  },
  {
    id: "python-algo-video",
    type: "视频教程",
    title: "数据结构与算法 - Python实现",
    author: "小甲鱼",
    platform: "B站",
    summary: "使用 Python 实现常见的数据结构与算法，含大量案例",
    difficulty: "中级",
    tags: ["数据结构", "算法", "Python实现"],
    views: "6.8万",
    likes: "6256",
    date: "2024-02-20",
    imageTone: "algo",
    duration: "08:32:16"
  },
  {
    id: "python-crash-course",
    type: "电子书",
    title: "Python编程：从入门到实践（第3版）",
    author: "埃里克·马瑟斯",
    platform: "电子书",
    summary: "经典 Python 入门书籍，项目驱动学习，适合初学者",
    difficulty: "入门",
    tags: ["项目实战", "经典书籍", "入门"],
    views: "3.4万",
    likes: "1.2万",
    date: "2023-12-01",
    imageTone: "book"
  },
  {
    id: "python-roadmap-2024",
    type: "学习路线",
    title: "Python学习路线图（2024版）",
    author: "程序员小灰",
    platform: "B站",
    summary: "从零基础到就业工程师的完整学习路径规划",
    difficulty: "入门",
    tags: ["学习路线", "职业发展", "路径规划"],
    views: "1.8万",
    likes: "892",
    date: "2024-01-18",
    imageTone: "route"
  }
];

function resourceIcon(type: ResourceType) {
  if (type === "视频教程") return <BookOpen size={18} />;
  if (type === "代码项目") return <FileCode2 size={18} />;
  if (type === "文章文档") return <FileText size={18} />;
  if (type === "电子书") return <LibraryBig size={18} />;
  return <Network size={18} />;
}

function generatedResourceIcon(resource: GeneratedResource) {
  if (resource.resource_type === "PPT") return <Presentation size={24} />;
  if (resource.resource_type === "DOCUMENT") return <FileText size={24} />;
  if (resource.resource_type === "MIND_MAP") return <Waypoints size={24} />;
  if (resource.resource_type === "PRACTICE_SET") return <FileQuestion size={24} />;
  if (resource.resource_type === "PODCAST_SCRIPT") return <Podcast size={24} />;
  return <FileText size={24} />;
}

function generatedResourceMetric(resource: GeneratedResource) {
  if (resource.resource_type === "PPT") return { value: resource.slide_count || resource.item_count, label: "页 PPT" };
  if (resource.resource_type === "DOCUMENT") return { value: resource.item_count, label: "节文档" };
  if (resource.resource_type === "MIND_MAP") return { value: resource.item_count, label: "个节点" };
  if (resource.resource_type === "PRACTICE_SET") return { value: resource.item_count, label: "道练习" };
  if (resource.resource_type === "PODCAST_SCRIPT") return { value: resource.item_count, label: "段播客" };
  return { value: resource.item_count || 1, label: "个资源" };
}

export default function StudentResourceCenter() {
  const [activeType, setActiveType] = useState<ResourceFolder>("全部");
  const [difficulty, setDifficulty] = useState<Difficulty>("全部");
  const [query, setQuery] = useState("");
  const [savedIds, setSavedIds] = useState(() => new Set(["python-video-2024", "python-crash-course"]));
  const [generatedResources, setGeneratedResources] = useState<GeneratedResource[]>([]);
  const [generatedError, setGeneratedError] = useState<string | null>(null);
  const [previewResource, setPreviewResource] = useState<GeneratedResource | null>(null);

  useEffect(() => {
    let alive = true;
    api.listGeneratedResources()
      .then((result) => {
        if (alive) setGeneratedResources(Array.isArray(result.items) ? result.items : []);
      })
      .catch(() => {
        if (alive) setGeneratedError("AI 生成资源暂时加载失败。");
      });
    return () => {
      alive = false;
    };
  }, []);

  const generatedVisibleResources = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return generatedResources.filter((item) => (
      !keyword ||
      item.title.toLowerCase().includes(keyword) ||
      item.summary.toLowerCase().includes(keyword) ||
      item.knowledge_point.toLowerCase().includes(keyword) ||
      (item.resource_type_label ?? item.resource_type).toLowerCase().includes(keyword)
    ));
  }, [generatedResources, query]);

  const resourceTypes = useMemo<Array<{ label: ResourceFolder; count: number }>>(() => {
    const typeCount = (type: ResourceType) => resources.filter((item) => item.type === type).length;
    return [
      { label: "全部", count: resources.length + generatedResources.length },
      { label: "资源生成", count: generatedResources.length },
      { label: "视频教程", count: typeCount("视频教程") },
      { label: "代码项目", count: typeCount("代码项目") },
      { label: "文章文档", count: typeCount("文章文档") },
      { label: "电子书", count: typeCount("电子书") },
      { label: "学习路线", count: typeCount("学习路线") }
    ];
  }, [generatedResources.length]);

  const visibleResources = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return resources.filter((item) => {
      const typeMatched = activeType === "全部" || item.type === activeType;
      const difficultyMatched = difficulty === "全部" || item.difficulty === difficulty;
      const queryMatched =
        !keyword ||
        item.title.toLowerCase().includes(keyword) ||
        item.summary.toLowerCase().includes(keyword) ||
        item.tags.some((tag) => tag.toLowerCase().includes(keyword));
      return typeMatched && difficultyMatched && queryMatched;
    });
  }, [activeType, difficulty, query]);
  const showGeneratedResources = activeType === "全部" || activeType === "资源生成";
  const showExternalResources = activeType !== "资源生成";
  const totalVisibleCount = (showGeneratedResources ? generatedVisibleResources.length : 0) + (showExternalResources ? visibleResources.length : 0);

  function toggleSaved(id: string) {
    setSavedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function downloadGeneratedResource(resource: GeneratedResource) {
    const response = await fetch(api.generatedResourceDownloadUrl(resource.id), {
      headers: authHeaders()
    });
    if (!response.ok) {
      setGeneratedError("资源导出失败，请稍后再试。");
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
  }

  return (
    <div className="student-resource-page">
      <header className="student-resource-header">
        <h1>资源中心</h1>
        <p>搜索和发现优质学习资源，助力高效学习</p>
      </header>

      <section className="student-resource-search" aria-label="资源搜索">
        <label>
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入关键词查找学习资料，如：Python函数、数据结构、爬虫、机器学习等" />
        </label>
        <button type="button">搜索</button>
      </section>

      <section className="student-resource-hot" aria-label="热门搜索">
        <strong>热门搜索：</strong>
        {hotSearches.map((item) => (
          <button type="button" key={item} onClick={() => setQuery(item)}>
            {item}
          </button>
        ))}
      </section>

      <div className="student-resource-layout">
        <aside className="student-resource-types" aria-label="资源类型">
          <h2>资源类型</h2>
          {resourceTypes.map((item) => (
            <button
              type="button"
              key={item.label}
              className={activeType === item.label ? "active" : ""}
              onClick={() => setActiveType(item.label)}
            >
              <span>{item.label}</span>
              <b>{item.count}</b>
            </button>
          ))}
        </aside>

        <main className="student-resource-results">
          <section className="student-resource-filters" aria-label="筛选条件">
            <div>
              <h2>难度等级</h2>
              <div className="student-resource-segments">
                {difficultyOptions.map((item) => (
                  <button type="button" key={item} className={difficulty === item ? "active" : ""} onClick={() => setDifficulty(item)}>
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="student-resource-time">
              <h2>时间范围</h2>
              <button type="button">
                不限时间
                <ChevronDown size={16} />
              </button>
            </div>
            <button type="button" className="student-resource-clear" onClick={() => {
              setActiveType("全部");
              setDifficulty("全部");
              setQuery("");
            }}>
              <RefreshCw size={16} />
              清空筛选
            </button>
          </section>

          <div className="student-resource-count">找到 {totalVisibleCount} 条相关结果</div>

          {showGeneratedResources ? (
            <section className="student-generated-resources" aria-label="AI 生成资源">
              <header>
                <div>
                  <h2>资源生成</h2>
                  <p>从 AI 助学中加入资源中心的学习产物，可在这里预览、打开和导出</p>
                </div>
                <span>{generatedVisibleResources.length} 个资源</span>
              </header>
              {generatedError ? <p className="student-generated-error">{generatedError}</p> : null}
              {generatedVisibleResources.length ? (
                <div className="student-generated-grid">
                  {generatedVisibleResources.map((resource) => {
                    const metric = generatedResourceMetric(resource);
                    return (
                      <article className="student-generated-card" key={resource.id}>
                        <button type="button" className="student-generated-thumb" onClick={() => setPreviewResource(resource)} aria-label={`预览 ${resource.title}`}>
                          {generatedResourceIcon(resource)}
                          <strong>{metric.value}</strong>
                          <span>{metric.label}</span>
                        </button>
                        <div className="student-generated-body">
                          <h3>{resource.title}</h3>
                          <p>{resource.summary}</p>
                          <div className="student-generated-tags">
                            <span><BookmarkCheck size={14} /> 已加入资源中心</span>
                            <span>{resource.resource_type_label ?? resource.resource_type}</span>
                            <span>{resource.knowledge_point || "自主学习"}</span>
                            <span>{resource.file_format}</span>
                            <span>引用 {(resource.citations ?? []).length} 条</span>
                          </div>
                        </div>
                        <div className="student-generated-actions">
                          <button type="button" className="primary" onClick={() => setPreviewResource(resource)}>
                            <Eye size={16} />
                            预览
                          </button>
                          <button type="button" onClick={() => downloadGeneratedResource(resource)} disabled={!resource.download_available}>
                            <Download size={16} />
                            导出
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="student-generated-empty">还没有加入资源中心的 AI 生成资源。可以在 AI 助学中生成学习产物后点击书签保存。</p>
              )}
            </section>
          ) : null}

          {showExternalResources ? (
            <section className="student-resource-grid" aria-label="资源列表">
              {visibleResources.map((item) => (
                <article className="student-resource-card" key={item.id}>
                  <div className={`student-resource-thumb ${item.imageTone}`}>
                    <span>{resourceIcon(item.type)}</span>
                    {item.duration ? <em>{item.duration}</em> : null}
                  </div>
                  <div className="student-resource-card-body">
                    <header>
                      <h2>{item.title}</h2>
                      <button type="button" onClick={() => toggleSaved(item.id)} aria-label={`${savedIds.has(item.id) ? "取消收藏" : "收藏"} ${item.title}`}>
                        <span>{savedIds.has(item.id) ? "已收藏" : "收藏"}</span>
                        <Star size={17} fill={savedIds.has(item.id) ? "currentColor" : "none"} />
                      </button>
                    </header>
                    <div className="student-resource-author">
                      <span><UserRound size={14} /> {item.author}</span>
                      <span>{item.platform === "GitHub" ? <Github size={14} /> : <GraduationCap size={14} />} {item.platform}</span>
                    </div>
                    <p>{item.summary}</p>
                    <div className="student-resource-tags">
                      {item.tags.map((tag) => <span key={tag}>{tag}</span>)}
                    </div>
                    <footer>
                      <span><Eye size={14} /> {item.views}</span>
                      <span><ThumbsUp size={14} /> {item.likes}</span>
                      <span><CalendarDays size={14} /> {item.date}</span>
                    </footer>
                  </div>
                </article>
              ))}
            </section>
          ) : null}

          <footer className="student-resource-pagination">
            <span>共 {totalVisibleCount} 条</span>
            <div>
              <button type="button" aria-label="上一页"><ChevronLeft size={16} /></button>
              <button type="button" className="active">1</button>
              <button type="button">2</button>
              <button type="button">3</button>
              <span>...</span>
              <button type="button">13</button>
              <button type="button" aria-label="下一页"><ChevronRight size={16} /></button>
            </div>
            <button type="button" className="student-resource-page-size">
              10 条/页
              <ChevronDown size={15} />
            </button>
          </footer>
        </main>
      </div>
      <GeneratedResourcePreviewModal
        resource={previewResource}
        onClose={() => setPreviewResource(null)}
        onDownload={downloadGeneratedResource}
      />
    </div>
  );
}
