import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookMarked,
  Bot,
  Check,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  History,
  Layers,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  copyTeacherResource,
  createTeacherResource,
  deleteTeacherResource,
  getResourceReferences,
  getTeacherResource,
  getTeacherResources,
  getTeacherTeachingAssignments,
  updateTeacherResource,
  uploadTeacherResource,
} from "../../teacherApi";
import type {
  ResourceAuthorityLevel,
  ResourceReferences,
  ResourceShareScope,
  ResourceSourceType,
  ResourceStatus,
  TeacherResource,
  TeacherResourceDetail,
  TeacherResourceListData,
} from "../../teacherTypes";
import {
  AUTHORITY_SHORT,
  AUTHORITY_TEXT,
  SHARE_SCOPE_TEXT,
  SOURCE_TYPE_OPTIONS,
  STATUS_EFFECT,
  STATUS_TEXT,
  formatDateTime,
  formatFileSize,
  sourceTypeText,
  statusBadgeClass,
} from "./resourceLabels";

/**
 * 资料中心（开发方案 §七）
 *
 * 资料既是学生自主学习的来源，也是 AI 导师和 AI 诊断的检索来源，所以「状态」
 * 「学生可见」「AI 检索」是三个互相独立的开关，页面上必须能分别看到和分别改。
 *
 * 几个页面行为直接对应后端边界，改动前先看 `api/teacher_resources.py`：
 * - 停用资料会被后端强制退出 AI 检索，历史 AI 诊断里的引用不受影响（§7.4）
 * - 上传件在解析出正文之前是 PARSE_PENDING 且开不了 AI 检索（§7.4 第一版不做切片）
 * - 引用次数 > 0 的资料删不掉，只能停用；这里直接把删除按钮换成提示
 *
 * 控件样式沿用学生端那套手写卡片（.class-card / .class-stat / .class-tabs /
 * .class-empty / .review-head / .review-filters），不使用 antd 默认外观。
 */

type StatusTab = "ALL" | ResourceStatus;

const STATUS_TABS: Array<{ key: StatusTab; label: string }> = [
  { key: "ALL", label: "全部" },
  { key: "ACTIVE", label: "启用中" },
  { key: "DISABLED", label: "已停用" },
  { key: "PARSE_PENDING", label: "待解析" },
  { key: "PARSE_FAILED", label: "解析失败" },
];

const PAGE_SIZE = 20;

/** 编辑面板的表单状态。与 TeacherResource 分开，避免半途的输入污染列表数据 */
type EditorForm = {
  title: string;
  summary: string;
  content: string;
  source_type: ResourceSourceType;
  chapter: string;
  knowledgePointsText: string;
  authority_level: ResourceAuthorityLevel;
  version: string;
  student_visible: boolean;
  ai_retrievable: boolean;
  share_scope: ResourceShareScope;
  change_note: string;
};

const EMPTY_FORM: EditorForm = {
  title: "",
  summary: "",
  content: "",
  source_type: "TEACHER_NOTE",
  chapter: "",
  knowledgePointsText: "",
  authority_level: "MEDIUM",
  version: "v1.0",
  student_visible: true,
  ai_retrievable: true,
  share_scope: "COURSE",
  change_note: "",
};

function toForm(resource: TeacherResource): EditorForm {
  return {
    title: resource.title,
    summary: resource.summary,
    content: resource.content,
    source_type: resource.source_type,
    chapter: resource.chapter,
    knowledgePointsText: resource.knowledge_points.join("、"),
    authority_level: resource.authority_level,
    version: resource.version,
    student_visible: resource.student_visible,
    ai_retrievable: resource.ai_retrievable,
    share_scope: resource.share_scope,
    change_note: "",
  };
}

/** 知识点输入用「、」或英文逗号分隔，去空去重交给后端再兜一次 */
function parsePoints(text: string) {
  return text
    .split(/[、,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function ResourceCenter() {
  const [courses, setCourses] = useState<Array<{ course_id: string; title: string }>>([]);
  const [courseId, setCourseId] = useState("");

  const [statusTab, setStatusTab] = useState<StatusTab>("ALL");
  const [chapter, setChapter] = useState("");
  const [knowledgePoint, setKnowledgePoint] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<TeacherResourceListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // 编辑面板：mode=create 时 editing 为 null
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherResourceDetail | null>(null);
  const [form, setForm] = useState<EditorForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState("");

  const [references, setReferences] = useState<ResourceReferences | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TeacherResource | null>(null);
  const [busyId, setBusyId] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadTarget, setUploadTarget] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");

  /**
   * 课程下拉必须来自「教学安排」而不是 getTeacherCourses()。
   * 后者返回教师作为 owner / enrollment 关联的课程，包含没有生效教学安排的课；
   * 本页范围口径是 TeachingAssignment（§15.1），拿那种课去查会被后端直接 403。
   */
  useEffect(() => {
    let alive = true;
    getTeacherTeachingAssignments()
      .then((rows) => {
        if (!alive) return;
        const unique = new Map<string, { course_id: string; title: string }>();
        rows.forEach((row) => {
          if (!unique.has(row.course_id)) {
            unique.set(row.course_id, { course_id: row.course_id, title: row.title });
          }
        });
        const list = Array.from(unique.values());
        setCourses(list);
        setCourseId((current) => current || list[0]?.course_id || "");
        if (!list.length) {
          setLoading(false);
          setError("当前账号没有生效的教学安排，无法维护课程资料。请联系管理员分配授课关系。");
        }
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
        setError("课程列表加载失败。请确认已用教师账号登录，后端服务可用后重试。");
      });
    return () => {
      alive = false;
    };
  }, []);

  // 搜索框防抖，避免每敲一个字就打一次接口
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(() => {
    if (!courseId) return undefined;
    let alive = true;
    setLoading(true);
    setError("");
    getTeacherResources({
      courseId,
      status: statusTab === "ALL" ? "" : statusTab,
      chapter: chapter || undefined,
      knowledgePoint: knowledgePoint || undefined,
      sourceType: sourceType || undefined,
      keyword: searchQuery || undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((result) => {
        if (!alive) return;
        setData(result);
      })
      .catch((cause: Error) => {
        if (!alive) return;
        setData(null);
        setError(
          cause.message.includes("AUTH_FORBIDDEN")
            ? "当前教师在该课程没有生效的教学安排，无权查看这门课的资料。"
            : "资料列表加载失败。请确认已用教师账号登录，后端服务可用后重试。"
        );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [courseId, statusTab, chapter, knowledgePoint, sourceType, searchQuery, page]);

  useEffect(() => load(), [load]);

  const stats = data?.stats;
  const items = data?.items ?? [];
  const filters = data?.filters;
  const hasNextPage = items.length === PAGE_SIZE;

  const statCards = useMemo(
    () => [
      {
        key: "ALL" as StatusTab,
        title: "资料总数",
        value: stats?.total ?? 0,
        sub: "当前课程全部知识源",
        icon: <FolderOpen size={28} />,
        color: "indigo",
      },
      {
        key: "ACTIVE" as StatusTab,
        title: "启用中",
        value: stats?.active ?? 0,
        sub: "正常参与学习与检索",
        icon: <PlayCircle size={28} />,
        color: "green",
      },
      {
        key: "DISABLED" as StatusTab,
        title: "已停用",
        value: stats?.disabled ?? 0,
        sub: "退出新检索，历史引用保留",
        icon: <PauseCircle size={28} />,
        color: "orange",
      },
      {
        key: "ALL" as StatusTab,
        title: "参与 AI 检索",
        value: stats?.ai_retrievable ?? 0,
        sub: "AI 导师与诊断的知识来源",
        icon: <Bot size={28} />,
        color: "",
      },
      {
        key: "PARSE_PENDING" as StatusTab,
        title: "待解析",
        value: stats?.parse_pending ?? 0,
        sub: "上传件已存档，正文待补",
        icon: <Clock3 size={28} />,
        color: "orange",
      },
    ],
    [stats]
  );

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, chapter: chapter || "" });
    setReferences(null);
    setEditorError("");
    setEditorOpen(true);
  }

  function openEdit(resource: TeacherResource) {
    setEditorError("");
    setForm(toForm(resource));
    setEditorOpen(true);
    setBusyId(resource.resource_id);
    // 详情带版本记录和可复制的目标课程，列表接口里没有
    getTeacherResource(resource.resource_id)
      .then((detail) => {
        setEditing(detail);
        setForm(toForm(detail));
      })
      .catch(() => setEditorError("资料详情加载失败，版本记录暂时不可用。"))
      .finally(() => setBusyId(""));
    setReferences(null);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditing(null);
    setReferences(null);
    setEditorError("");
  }

  async function handleSave() {
    if (!form.title.trim()) {
      setEditorError("资料标题不能为空。");
      return;
    }
    if (!form.version.trim()) {
      setEditorError("版本号不能为空。");
      return;
    }
    setSaving(true);
    setEditorError("");
    try {
      if (editing) {
        const updated = await updateTeacherResource(editing.resource_id, {
          title: form.title,
          summary: form.summary,
          content: form.content,
          source_type: form.source_type,
          chapter: form.chapter,
          knowledge_points: parsePoints(form.knowledgePointsText),
          authority_level: form.authority_level,
          version: form.version,
          student_visible: form.student_visible,
          ai_retrievable: form.ai_retrievable,
          share_scope: form.share_scope,
          change_note: form.change_note,
        });
        setEditing(updated);
        setForm(toForm(updated));
        // 后端可能把 AI 检索强制关掉（停用或正文为空），如实说明而不是静默
        if (form.ai_retrievable && !updated.ai_retrievable) {
          flash("已保存。该资料当前不参与 AI 检索：停用状态或正文为空的资料不能进入检索。");
        } else {
          flash("资料已保存。");
        }
      } else {
        await createTeacherResource({
          course_id: courseId,
          title: form.title,
          summary: form.summary,
          content: form.content,
          source_type: form.source_type,
          chapter: form.chapter,
          knowledge_points: parsePoints(form.knowledgePointsText),
          authority_level: form.authority_level,
          version: form.version,
          student_visible: form.student_visible,
          ai_retrievable: form.ai_retrievable,
          share_scope: form.share_scope,
        });
        flash("文本资料已创建。");
        closeEditor();
      }
      load();
    } catch (cause) {
      setEditorError(`保存失败：${(cause as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(resource: TeacherResource) {
    const next: ResourceStatus = resource.status === "DISABLED" ? "ACTIVE" : "DISABLED";
    setBusyId(resource.resource_id);
    try {
      const updated = await updateTeacherResource(resource.resource_id, { status: next });
      flash(
        next === "DISABLED"
          ? "已停用。该资料不再参与新的 AI 检索，历史诊断里的引用保持不变。"
          : "已启用。如需参与 AI 检索，请确认正文非空并打开 AI 检索开关。"
      );
      if (editing?.resource_id === updated.resource_id) {
        setEditing(updated);
        setForm(toForm(updated));
      }
      load();
    } catch (cause) {
      setError(`状态切换失败：${(cause as Error).message}`);
    } finally {
      setBusyId("");
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setBusyId(target.resource_id);
    try {
      await deleteTeacherResource(target.resource_id);
      flash("资料已删除。");
      setPendingDelete(null);
      if (editing?.resource_id === target.resource_id) closeEditor();
      load();
    } catch (cause) {
      const message = (cause as Error).message;
      setPendingDelete(null);
      setError(
        message.includes("RESOURCE_IN_USE")
          ? "该资料已被历史 AI 诊断引用，不能删除。请改用停用，这样历史引用仍然可读。"
          : `删除失败：${message}`
      );
    } finally {
      setBusyId("");
    }
  }

  async function handleUpload() {
    if (!uploadTarget) return;
    setSaving(true);
    setEditorError("");
    try {
      await uploadTeacherResource(uploadTarget, {
        course_id: courseId,
        title: uploadTitle.trim() || uploadTarget.name,
        chapter: chapter || undefined,
        source_type: "COURSEWARE",
      });
      flash("文件已存档，状态为「待解析」。第一版不做自动切片，正文需要手动补充后才能参与 AI 检索。");
      setUploadTarget(null);
      setUploadTitle("");
      load();
    } catch (cause) {
      setEditorError(`上传失败：${(cause as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function loadReferences(resourceId: string) {
    try {
      setReferences(await getResourceReferences(resourceId));
    } catch {
      setEditorError("引用明细加载失败。");
    }
  }

  async function handleCopy(targetCourseId: string) {
    if (!editing || !targetCourseId) return;
    setSaving(true);
    try {
      await copyTeacherResource(editing.resource_id, targetCourseId);
      flash("已复制到目标课程，副本默认为停用状态，请在该课程里确认后再启用。");
    } catch (cause) {
      setEditorError(`复制失败：${(cause as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="resource-page">
      <header className="review-head">
        <div className="review-head-copy">
          <h1>资料中心</h1>
          <p>
            维护课程资料，并为学生自主学习、AI 导师和 AI 诊断提供可靠知识来源。「状态」「学生可见」
            「AI 检索」是三个独立开关：停用只让资料退出新的检索，历史 AI 诊断里的引用不会被抹除。
          </p>
        </div>
        <div className="review-head-actions">
          <button className="review-back" type="button" onClick={load} disabled={loading || !courseId}>
            <RefreshCw size={15} /> {loading ? "加载中" : "刷新"}
          </button>
          <button className="review-back" type="button" onClick={openCreate} disabled={!courseId}>
            <Plus size={15} /> 新建文本资料
          </button>
          <button
            className="review-back"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!courseId}
          >
            <Upload size={15} /> 上传资料
          </button>
          <input
            ref={fileInputRef}
            className="resource-file-input"
            type="file"
            aria-label="选择要上传的资料文件"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setUploadTarget(file);
              setUploadTitle(file ? file.name.replace(/\.[^.]+$/, "") : "");
              event.target.value = "";
            }}
          />
        </div>
      </header>

      <div className="resource-context">
        <label>
          <span>课程</span>
          <select
            className="review-select"
            value={courseId}
            onChange={(event) => {
              setCourseId(event.target.value);
              setChapter("");
              setKnowledgePoint("");
              setPage(1);
            }}
          >
            {courses.map((course) => (
              <option value={course.course_id} key={course.course_id}>
                {course.title}
              </option>
            ))}
          </select>
        </label>
        <p className="resource-context-note">
          <AlertTriangle size={13} /> 章节暂以文本维护：课程大纲（§六 6.2）还未开发，等章节与知识点建模落地后会换成结构化绑定。
        </p>
      </div>

      {error ? <p className="review-message error">{error}</p> : null}
      {notice ? <p className="review-message success">{notice}</p> : null}

      {uploadTarget ? (
        <section className="resource-upload-bar" aria-label="确认上传资料">
          <div>
            <strong>{uploadTarget.name}</strong>
            <em>{formatFileSize(uploadTarget.size)}</em>
            <p>
              第一版只存档文件与元数据，不做自动切片（§7.4）。上传后状态为「待解析」，
              在补上正文之前不会参与 AI 检索。
            </p>
          </div>
          <label>
            <span>资料标题</span>
            <input
              value={uploadTitle}
              onChange={(event) => setUploadTitle(event.target.value)}
              placeholder="默认取文件名"
            />
          </label>
          <div className="resource-upload-actions">
            <button className="primary" type="button" onClick={handleUpload} disabled={saving}>
              {saving ? "上传中..." : "确认上传"}
            </button>
            <button type="button" onClick={() => setUploadTarget(null)} disabled={saving}>
              取消
            </button>
          </div>
        </section>
      ) : null}

      <section className="review-stats" aria-label="资料概览">
        {statCards.map((card) => (
          <button
            className="class-card class-stat"
            type="button"
            key={card.title}
            aria-pressed={statusTab === card.key}
            onClick={() => {
              setStatusTab(card.key);
              setPage(1);
            }}
          >
            <span className={card.color}>{card.icon}</span>
            <p>{card.title}</p>
            <strong>
              {loading && !stats ? "..." : card.value}
              <small> 条</small>
            </strong>
            <em>{card.sub}</em>
          </button>
        ))}
      </section>

      <div className="review-filters">
        <div className="class-tabs" role="group" aria-label="资料状态筛选">
          {STATUS_TABS.map((tab) => (
            <button
              type="button"
              key={tab.key}
              className={statusTab === tab.key ? "active" : ""}
              aria-pressed={statusTab === tab.key}
              onClick={() => {
                setStatusTab(tab.key);
                setPage(1);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="review-filter-group">
          <select
            className="review-select"
            aria-label="章节筛选"
            value={chapter}
            onChange={(event) => {
              setChapter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">章节：全部</option>
            {(filters?.chapters ?? []).map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>

          <select
            className="review-select"
            aria-label="知识点筛选"
            value={knowledgePoint}
            onChange={(event) => {
              setKnowledgePoint(event.target.value);
              setPage(1);
            }}
          >
            <option value="">知识点：全部</option>
            {(filters?.knowledge_points ?? []).map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>

          <select
            className="review-select"
            aria-label="资料类型筛选"
            value={sourceType}
            onChange={(event) => {
              setSourceType(event.target.value);
              setPage(1);
            }}
          >
            <option value="">类型：全部</option>
            {(filters?.source_types ?? []).map((item) => (
              <option value={item} key={item}>
                {sourceTypeText(item)}
              </option>
            ))}
          </select>

          <div className="review-search">
            <Search size={15} />
            <input
              type="search"
              aria-label="按标题或摘要搜索资料"
              placeholder="搜索标题或摘要"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <section className="resource-list" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <article className="class-card resource-row skeleton-block" key={index} />
          ))}
        </section>
      ) : items.length === 0 ? (
        <div className="class-empty">
          <h2>当前筛选条件下没有资料</h2>
          <p>
            资料中心维护的是当前课程的知识源。可以先「新建文本资料」直接写入知识点讲解，
            或「上传资料」把课件与代码存档。文本资料写好即可参与 AI 检索，上传件要等正文补全。
          </p>
        </div>
      ) : (
        <section className="resource-list" aria-label="课程资料列表">
          {items.map((resource) => (
            <ResourceRow
              key={resource.resource_id}
              resource={resource}
              busy={busyId === resource.resource_id}
              onEdit={() => openEdit(resource)}
              onToggleStatus={() => toggleStatus(resource)}
              onDelete={() => setPendingDelete(resource)}
            />
          ))}
        </section>
      )}

      {!loading && (page > 1 || hasNextPage) ? (
        <div className="review-pagination">
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            上一页
          </button>
          <span>
            第 {page} 页 · 本页 {items.length} 条
          </span>
          <button type="button" disabled={!hasNextPage} onClick={() => setPage((value) => value + 1)}>
            下一页
          </button>
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="resource-confirm" role="alertdialog" aria-label="删除确认">
          <div className="resource-confirm-box">
            <h2>删除资料「{pendingDelete.title}」？</h2>
            {pendingDelete.reference_count > 0 ? (
              <p className="warn">
                该资料已被 {pendingDelete.reference_count} 条历史 AI 诊断引用，后端会拒绝删除。
                请改用停用：停用后不再参与新的检索，历史引用仍然可读。
              </p>
            ) : (
              <p>删除后该资料及其版本记录一并移除，此操作不可撤销。</p>
            )}
            <div className="resource-confirm-actions">
              <button
                className="danger"
                type="button"
                onClick={confirmDelete}
                disabled={busyId === pendingDelete.resource_id || pendingDelete.reference_count > 0}
              >
                确认删除
              </button>
              <button type="button" onClick={() => setPendingDelete(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editorOpen ? (
        <ResourceEditor
          editing={editing}
          form={form}
          setForm={setForm}
          saving={saving}
          error={editorError}
          chapters={filters?.chapters ?? []}
          knowledgePoints={filters?.knowledge_points ?? []}
          references={references}
          onLoadReferences={loadReferences}
          onCopy={handleCopy}
          onSave={handleSave}
          onClose={closeEditor}
        />
      ) : null}
    </div>
  );
}

function ResourceRow({
  resource,
  busy,
  onEdit,
  onToggleStatus,
  onDelete,
}: {
  resource: TeacherResource;
  busy: boolean;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  const disabled = resource.status === "DISABLED";
  return (
    <article className={`class-card resource-row${disabled ? " muted" : ""}`}>
      <span className={`resource-badge ${statusBadgeClass(resource.status)}`}>
        {STATUS_TEXT[resource.status]}
      </span>

      <div className="resource-row-main">
        <h2>
          <span>{resource.title}</span>
          <em className="resource-tag">{sourceTypeText(resource.source_type)}</em>
          <em className="resource-tag ghost">{AUTHORITY_SHORT[resource.authority_level]}</em>
        </h2>
        <p>{resource.summary || "（未填写摘要）"}</p>
        <div className="resource-tags">
          {resource.chapter ? (
            <span className="chapter">
              <Layers size={12} /> {resource.chapter}
            </span>
          ) : null}
          {resource.knowledge_points.map((point) => (
            <span key={point}>{point}</span>
          ))}
          {!resource.chapter && !resource.knowledge_points.length ? (
            <span className="ghost">未绑定章节与知识点</span>
          ) : null}
        </div>
        <div className="resource-row-meta">
          <span>版本 {resource.version}</span>
          <span>{SHARE_SCOPE_TEXT[resource.share_scope]}</span>
          {resource.has_file ? (
            <span>
              <FileText size={13} /> {resource.file_name} {formatFileSize(resource.file_size)}
            </span>
          ) : null}
          <span>
            <BookMarked size={13} /> 引用 {resource.reference_count}
          </span>
          <span>更新于 {formatDateTime(resource.updated_at)}</span>
        </div>
      </div>

      <div className="resource-flags">
        <span className={resource.student_visible ? "on" : ""}>
          {resource.student_visible ? <Eye size={13} /> : <EyeOff size={13} />}
          学生可见
        </span>
        <span className={resource.ai_retrievable ? "on" : ""}>
          <Bot size={13} />
          AI 检索
        </span>
        <em>{STATUS_EFFECT[resource.status]}</em>
      </div>

      <div className="resource-row-actions">
        <button className="primary" type="button" onClick={onEdit} disabled={busy}>
          编辑
        </button>
        <button type="button" onClick={onToggleStatus} disabled={busy}>
          {disabled ? "启用" : "停用"}
        </button>
        <button
          className="ghost"
          type="button"
          onClick={onDelete}
          disabled={busy}
          title={resource.reference_count > 0 ? "已被历史 AI 诊断引用，只能停用" : "删除资料"}
        >
          <Trash2 size={14} /> 删除
        </button>
      </div>
    </article>
  );
}

function ResourceEditor({
  editing,
  form,
  setForm,
  saving,
  error,
  chapters,
  knowledgePoints,
  references,
  onLoadReferences,
  onCopy,
  onSave,
  onClose,
}: {
  editing: TeacherResourceDetail | null;
  form: EditorForm;
  setForm: (updater: (current: EditorForm) => EditorForm) => void;
  saving: boolean;
  error: string;
  chapters: string[];
  knowledgePoints: string[];
  references: ResourceReferences | null;
  onLoadReferences: (resourceId: string) => void;
  onCopy: (targetCourseId: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const isEdit = Boolean(editing);
  // 正文为空的上传件后端会强制关掉 AI 检索，这里提前把开关说清楚而不是让它静默弹回
  const retrievalBlocked = Boolean(editing?.has_file) && !form.content.trim();
  const [copyTarget, setCopyTarget] = useState("");
  // 兜一层空值：少了任一数组就直接读 .length 的话，整块共享/版本记录面板会崩成空白
  const copyTargets = editing?.copy_targets ?? [];
  const revisions = editing?.revisions ?? [];

  function update<K extends keyof EditorForm>(key: K, value: EditorForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <aside className="resource-editor" aria-label={isEdit ? "编辑资料" : "新建文本资料"}>
      <header>
        <h2>{isEdit ? "编辑资料" : "新建文本资料"}</h2>
        <button type="button" onClick={onClose} aria-label="关闭编辑面板">
          <X size={18} />
        </button>
      </header>

      {error ? <p className="review-message error">{error}</p> : null}

      <div className="resource-editor-body">
        <label>
          <span>标题</span>
          <input
            value={form.title}
            onChange={(event) => update("title", event.target.value)}
            placeholder="例如：单链表删除的边界情况"
          />
        </label>

        <div className="resource-editor-grid">
          <label>
            <span>资料类型</span>
            <select
              className="review-select"
              value={form.source_type}
              onChange={(event) => update("source_type", event.target.value as ResourceSourceType)}
            >
              {SOURCE_TYPE_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>权威等级</span>
            <select
              className="review-select"
              value={form.authority_level}
              onChange={(event) =>
                update("authority_level", event.target.value as ResourceAuthorityLevel)
              }
            >
              {Object.entries(AUTHORITY_TEXT).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>版本号</span>
            <input value={form.version} onChange={(event) => update("version", event.target.value)} />
          </label>

          <label>
            <span>共享范围</span>
            <select
              className="review-select"
              value={form.share_scope}
              onChange={(event) => update("share_scope", event.target.value as ResourceShareScope)}
            >
              {Object.entries(SHARE_SCOPE_TEXT).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          <span>章节</span>
          <input
            value={form.chapter}
            onChange={(event) => update("chapter", event.target.value)}
            list="resource-chapter-options"
            placeholder="例如：第三章 线性表"
          />
          <datalist id="resource-chapter-options">
            {chapters.map((item) => (
              <option value={item} key={item} />
            ))}
          </datalist>
        </label>

        <label>
          <span>知识点</span>
          <input
            value={form.knowledgePointsText}
            onChange={(event) => update("knowledgePointsText", event.target.value)}
            list="resource-point-options"
            placeholder="多个知识点用「、」分隔"
          />
          <datalist id="resource-point-options">
            {knowledgePoints.map((item) => (
              <option value={item} key={item} />
            ))}
          </datalist>
          <em>知识点决定这条资料会被哪些任务、诊断和学习画像维度关联到。</em>
        </label>

        <label>
          <span>摘要</span>
          <textarea
            rows={2}
            value={form.summary}
            onChange={(event) => update("summary", event.target.value)}
            placeholder="一句话说明这条资料解决什么问题"
          />
        </label>

        <label>
          <span>正文</span>
          <textarea
            rows={8}
            value={form.content}
            onChange={(event) => update("content", event.target.value)}
            placeholder="AI 检索实际读取的内容。写清楚规则、步骤和常见错误。"
          />
          <em>正文是 AI 导师和 AI 诊断真正引用的内容，空正文的资料不会进入检索。</em>
        </label>

        <div className="resource-switches">
          <Switch
            label="学生可见"
            hint="控制学生能否在自主学习里直接查看这条资料"
            checked={form.student_visible}
            onChange={(value) => update("student_visible", value)}
          />
          <Switch
            label="AI 检索"
            hint={
              retrievalBlocked
                ? "该上传件正文为空，补上正文后才能参与检索"
                : "控制这条资料是否作为 AI 导师和 AI 诊断的知识来源"
            }
            checked={form.ai_retrievable && !retrievalBlocked}
            disabled={retrievalBlocked}
            onChange={(value) => update("ai_retrievable", value)}
          />
        </div>

        {isEdit ? (
          <label>
            <span>修改说明</span>
            <input
              value={form.change_note}
              onChange={(event) => update("change_note", event.target.value)}
              placeholder="填写这次改了什么，会记进版本记录"
            />
          </label>
        ) : null}
      </div>

      <div className="resource-editor-actions">
        <button className="primary" type="button" onClick={onSave} disabled={saving}>
          {saving ? "保存中..." : isEdit ? "保存修改" : "创建资料"}
        </button>
        <button type="button" onClick={onClose} disabled={saving}>
          取消
        </button>
      </div>

      {isEdit && editing ? (
        <>
          <section className="resource-share" aria-label="资料共享">
            <h3>
              <Copy size={15} /> 复制到课程
            </h3>
            {copyTargets.length ? (
              <div className="resource-share-row">
                <select
                  className="review-select"
                  aria-label="选择复制的目标课程"
                  value={copyTarget}
                  onChange={(event) => setCopyTarget(event.target.value)}
                >
                  <option value="">选择目标课程</option>
                  {copyTargets.map((target) => (
                    <option value={target} key={target}>
                      {target}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={saving || !copyTarget}
                  onClick={() => onCopy(copyTarget)}
                >
                  复制
                </button>
              </div>
            ) : (
              <p className="resource-note">
                当前账号只有这一门课有生效教学安排，没有可复制的目标课程。
              </p>
            )}
          </section>

          <section className="resource-references" aria-label="引用次数">
            <h3>
              <BookMarked size={15} /> 引用次数：{editing.reference_count}
            </h3>
            {editing.reference_count ? (
              references ? (
                <ul>
                  {references.items.slice(0, 8).map((item) => (
                    <li key={item.diagnosis_id}>
                      <strong>{item.task_title || item.task_id}</strong>
                      <span>
                        {item.student_name} · {formatDateTime(item.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <button type="button" onClick={() => onLoadReferences(editing.resource_id)}>
                  查看引用明细
                </button>
              )
            ) : (
              <p className="resource-note">还没有 AI 诊断引用过这条资料，当前可以删除。</p>
            )}
          </section>

          <section className="resource-revisions" aria-label="版本记录">
            <h3>
              <History size={15} /> 版本记录
            </h3>
            {revisions.length ? (
              <ul>
                {revisions.map((revision) => (
                  <li key={revision.revision_id}>
                    <strong>{revision.version}</strong>
                    <span>{revision.title}</span>
                    <em>
                      {revision.change_note || "未填写修改说明"} · {formatDateTime(revision.created_at)}
                    </em>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="resource-note">
                还没有历史版本。修改标题、摘要、正文或版本号时，改动前的内容会自动存成一个版本。
              </p>
            )}
          </section>
        </>
      ) : null}
    </aside>
  );
}

function Switch({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className={`resource-switch${disabled ? " disabled" : ""}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <i>{checked ? <Check size={12} /> : null}</i>
        <b>{label}</b>
      </button>
      <em>{hint}</em>
    </div>
  );
}
