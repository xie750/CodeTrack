import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Layers,
  Link2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import TeacherModuleScaffold from "../../components/TeacherModuleScaffold";
import TeacherSubNav from "../../components/TeacherSubNav";
import {
  createChapter,
  createKnowledgePoint,
  deleteChapter,
  deleteKnowledgePoint,
  getCourseSyllabus,
  getTeacherTeachingAssignments,
  reorderSyllabus,
  updateChapter,
  updateKnowledgePoint,
} from "../../teacherApi";
import type {
  CourseSyllabusData,
  KnowledgePointDifficulty,
  KnowledgePointType,
  SyllabusChapter,
  SyllabusKnowledgePoint,
} from "../../teacherTypes";
import { coursesNav } from "./coursesNav";
import {
  DIFFICULTY_OPTIONS,
  POINT_TYPE_OPTIONS,
  difficultyText,
  pointTypeText,
  syllabusStatusText,
  usageText,
} from "./courseLabels";

/**
 * 课程大纲（开发方案 §六 6.2）
 *
 * 章节—知识点是任务、资料和学习画像的共同锚点。第一版只做两层，不做知识图谱。
 *
 * 关键约束（后端 backend/app/api/teacher_courses.py 里强制执行，前端只负责解释清楚）：
 *
 * - 知识点在现有数据里一直是**名称**而不是外键（资料的 knowledge_points、题目的
 *   knowledge_points、画像的 learner_knowledge_states 都存名字），本轮不迁外键。
 *   所以名称在课程内唯一，而且**被引用的知识点既不能删也不能改名** —— 改了名那些
 *   历史引用会静默变成孤儿：教师看不出来，学生画像却会少一个维度。
 * - 删除按钮在有引用时禁用并用 title 说明原因，不渲染"能点但存不下去"的控件。
 *
 * 课程用页内选择器而不是路径参数，与资料中心 / 任务监控 / 学情诊断一致。
 *
 * 排序同时提供拖拽和上移/下移按钮：§7 可访问性要求点击区域和键盘可达，
 * 只有拖拽的话键盘用户没法调顺序。整层一次性提交，不逐个 PATCH。
 *
 * 控件样式沿用学生端那套 token：.review-page / .review-head / .class-card /
 * .class-stat / .class-tag-row / .class-badge / .review-select / .class-empty /
 * .skeleton-block，不使用 antd 默认外观。
 */

export default function CourseSyllabus() {
  const [courseOptions, setCourseOptions] = useState<Array<{ course_id: string; name: string }>>([]);
  const [courseId, setCourseId] = useState("");

  const [data, setData] = useState<CourseSyllabusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const [newChapterTitle, setNewChapterTitle] = useState("");
  const [editingChapterId, setEditingChapterId] = useState("");
  const [editingPointId, setEditingPointId] = useState("");
  const [addingPointChapterId, setAddingPointChapterId] = useState("");
  const [dragChapterId, setDragChapterId] = useState("");

  // 课程下拉用教学安排而不是 getTeacherCourses()：后者含没有生效教学安排的课程，
  // 选中后后端会 403（资料中心踩过同一个坑）
  useEffect(() => {
    let alive = true;
    getTeacherTeachingAssignments()
      .then((rows) => {
        if (!alive) return;
        const unique: Array<{ course_id: string; name: string }> = [];
        rows.forEach((row) => {
          if (!unique.some((item) => item.course_id === row.course_id)) {
            unique.push({ course_id: row.course_id, name: row.title });
          }
        });
        setCourseOptions(unique);
        setCourseId((current) => current || unique[0]?.course_id || "");
        if (unique.length === 0) setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError("课程列表加载失败。请确认已用教师账号登录。");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const load = useCallback(() => {
    if (!courseId) return undefined;
    let alive = true;
    setLoading(true);
    setError("");
    getCourseSyllabus(courseId)
      .then((result) => {
        if (!alive) return;
        setData(result);
      })
      .catch(() => {
        if (!alive) return;
        setData(null);
        setError("课程大纲加载失败。请确认该课程属于当前教师的教学安排。");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [courseId]);

  useEffect(load, [load]);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }

  /** 写操作统一入口：成功后用返回的整棵树或重新拉一次，失败把后端原因显示出来 */
  async function mutate(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      load();
      flash(successMessage);
      return true;
    } catch (caught) {
      setError(explain(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const chapters = data?.chapters ?? [];

  const chapterOptions = useMemo(
    () => chapters.map((chapter) => ({ value: chapter.chapter_id, label: chapter.title })),
    [chapters]
  );

  async function moveChapter(index: number, offset: number) {
    const next = [...chapters];
    const target = index + offset;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await mutate(
      () => reorderSyllabus(courseId, { chapters: next.map((item) => item.chapter_id) }),
      "章节顺序已保存。"
    );
  }

  async function dropChapter(targetId: string) {
    if (!dragChapterId || dragChapterId === targetId) return;
    const ids = chapters.map((item) => item.chapter_id);
    const from = ids.indexOf(dragChapterId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDragChapterId("");
    await mutate(() => reorderSyllabus(courseId, { chapters: ids }), "章节顺序已保存。");
  }

  async function movePoint(chapter: SyllabusChapter, index: number, offset: number) {
    const next = [...chapter.knowledge_points];
    const target = index + offset;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await mutate(
      () =>
        reorderSyllabus(courseId, {
          chapter_id: chapter.chapter_id,
          knowledge_points: next.map((item) => item.knowledge_point_id),
        }),
      "知识点顺序已保存。"
    );
  }

  return (
    <div className="review-page course-page syllabus-page">
      <header className="review-head">
        <div className="review-head-copy">
          <h1>课程大纲</h1>
          <p>
            编排课程章节与知识点，使任务、资料和学习画像绑定到同一套知识结构。
            第一版只做「章节 — 知识点」两层，不做知识图谱。
          </p>
        </div>
        <div className="review-head-actions">
          <button className="review-back" type="button" onClick={load} disabled={loading || busy}>
            <RefreshCw size={15} /> 刷新
          </button>
        </div>
      </header>

      <TeacherSubNav items={coursesNav} ariaLabel="课程教学二级导航" />

      {error ? <p className="review-message error">{error}</p> : null}
      {notice ? <p className="review-message success">{notice}</p> : null}

      <div className="diagnosis-context" aria-label="教学上下文">
        <label className="diagnosis-field">
          <span>课程</span>
          <select
            className="review-select"
            value={courseId}
            disabled={loading || courseOptions.length === 0}
            onChange={(event) => setCourseId(event.target.value)}
          >
            {courseOptions.length === 0 ? <option value="">暂无课程</option> : null}
            {courseOptions.map((option) => (
              <option value={option.course_id} key={option.course_id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {courseOptions.length === 0 && !loading ? (
        <div className="class-empty">
          <h2>暂时没有可编排的课程</h2>
          <p>
            当前账号还没有生效的教学安排。教学安排由管理员按「行政班 + 课程 + 教师」分配，
            分配后这里会自动出现。
          </p>
        </div>
      ) : null}

      {courseId ? (
        <>
          <section className="review-stats" aria-label="大纲概览">
            <StatCard
              icon={<Layers size={26} />}
              tone="blue"
              label="章节"
              value={loading && !data ? "…" : String(data?.stats.chapter_count ?? 0)}
              unit="个"
              note="按大纲顺序展示"
            />
            <StatCard
              icon={<BookOpen size={26} />}
              tone="indigo"
              label="知识点"
              value={loading && !data ? "…" : String(data?.stats.knowledge_point_count ?? 0)}
              unit="个"
              note="任务与画像的共同锚点"
            />
            <StatCard
              icon={<Lock size={26} />}
              tone="orange"
              label="已被引用"
              value={loading && !data ? "…" : String(data?.stats.bound_point_count ?? 0)}
              unit="个"
              note="被资料、题目或画像引用，不能删也不能改名"
            />
          </section>

          <div className="syllabus-create">
            <div className="review-search syllabus-create-input">
              <Plus size={15} />
              <input
                type="text"
                value={newChapterTitle}
                maxLength={120}
                placeholder="新章节名称，例如「第五章 树与二叉树」"
                disabled={busy || loading}
                onChange={(event) => setNewChapterTitle(event.target.value)}
              />
            </div>
            <button
              className="class-primary"
              type="button"
              disabled={busy || loading || !newChapterTitle.trim()}
              onClick={async () => {
                const ok = await mutate(
                  () => createChapter(courseId, { title: newChapterTitle.trim() }),
                  "章节已创建。"
                );
                if (ok) setNewChapterTitle("");
              }}
            >
              新建章节
            </button>
          </div>

          {loading && !data ? (
            <section className="review-list" aria-busy="true">
              {Array.from({ length: 3 }).map((_, index) => (
                <article className="class-card syllabus-chapter skeleton-block" key={index} />
              ))}
            </section>
          ) : chapters.length === 0 ? (
            <div className="class-empty">
              <h2>这门课还没有章节</h2>
              <p>
                先建立章节，再往章节下添加知识点。章节与知识点建立后，资料中心的章节筛选、
                任务的知识点绑定和学习画像的知识点维度才有统一口径。
              </p>
            </div>
          ) : (
            <section className="review-list syllabus-list" aria-label="章节与知识点">
              {chapters.map((chapter, chapterIndex) => (
                <ChapterCard
                  key={chapter.chapter_id}
                  chapter={chapter}
                  index={chapterIndex}
                  total={chapters.length}
                  busy={busy}
                  editing={editingChapterId === chapter.chapter_id}
                  addingPoint={addingPointChapterId === chapter.chapter_id}
                  editingPointId={editingPointId}
                  chapterOptions={chapterOptions}
                  onStartEditing={() => setEditingChapterId(chapter.chapter_id)}
                  onStopEditing={() => setEditingChapterId("")}
                  onStartAddingPoint={() => setAddingPointChapterId(chapter.chapter_id)}
                  onStopAddingPoint={() => setAddingPointChapterId("")}
                  onStartEditingPoint={(id) => setEditingPointId(id)}
                  onStopEditingPoint={() => setEditingPointId("")}
                  onMove={(offset) => moveChapter(chapterIndex, offset)}
                  onMovePoint={(index, offset) => movePoint(chapter, index, offset)}
                  onDragStart={() => setDragChapterId(chapter.chapter_id)}
                  onDrop={() => dropChapter(chapter.chapter_id)}
                  onSaveChapter={(payload) =>
                    mutate(() => updateChapter(chapter.chapter_id, payload), "章节已保存。")
                  }
                  onDeleteChapter={() =>
                    mutate(() => deleteChapter(chapter.chapter_id), "章节已删除。")
                  }
                  onCreatePoint={(payload) =>
                    mutate(
                      () => createKnowledgePoint(chapter.chapter_id, payload),
                      "知识点已创建。"
                    )
                  }
                  onSavePoint={(pointId, payload) =>
                    mutate(() => updateKnowledgePoint(pointId, payload), "知识点已保存。")
                  }
                  onDeletePoint={(pointId) =>
                    mutate(() => deleteKnowledgePoint(pointId), "知识点已删除。")
                  }
                />
              ))}
            </section>
          )}
        </>
      ) : null}

      {/* 还没落地的控件继续用 Scaffold 明示，不假装已经能用 */}
      <TeacherModuleScaffold
        variant="embedded"
        title="尚未开放的控件"
        description="以下能力本轮没有实现，原因写在旁边，避免误以为页面缺功能。"
        docRef="§六 6.2 课程大纲"
        pendingApis={["POST /api/v1/teacher/tasks/{task_id}/knowledge-points（待 §8.3 任务中心）"]}
        boundaries={[
          "已被正式任务使用的知识点不得直接删除（已实现：删除与改名都会被挡下）",
          "删除前必须检查任务、资料和画像关联（已实现：三处引用一起统计）",
          "第一版不做复杂知识图谱，只做章节—知识点两层结构",
        ]}
        sections={[
          {
            title: "待后续模块补齐",
            note: "这两项依赖其它模块的数据结构，不在本轮范围内。",
            controls: [
              {
                name: "关联任务按钮",
                desc: "tasks 表没有知识点列，题目级绑定属于 §8.3 客观题编辑器的知识点选择器。本页当前只读展示引用情况",
              },
              {
                name: "章节预览按钮",
                desc: "学生端课程结构页尚未开发，暂无可预览的学生视图",
              },
            ],
          },
          {
            title: "学生端联动（只读说明）",
            note: "课程大纲一旦改动，下列学生端内容同步变化，改动前需确认影响范围。",
            controls: [
              { name: "自主学习知识点列表", desc: "决定自主学习可选知识点", status: "partial" },
              { name: "AI 导师检索范围", desc: "决定 AI 可检索的知识范围", status: "partial" },
              { name: "学习画像知识点维度", desc: "决定画像的知识点坐标轴", status: "partial" },
              { name: "任务与错误的知识归属", desc: "决定错误统计挂在哪个知识点", status: "partial" },
            ],
          },
        ]}
      />
    </div>
  );
}

/** 把后端的错误码翻译成教师能行动的一句话 */
function explain(caught: unknown) {
  const message = caught instanceof Error ? caught.message : "";
  if (message.includes("KNOWLEDGE_POINT_IN_USE")) {
    return "该知识点已被资料、题目或画像引用，不能删除也不能改名。可以改为「停用」，或新建一个知识点再迁移引用。";
  }
  if (message.includes("KNOWLEDGE_POINT_NAME_DUPLICATED")) {
    return "同课程内已有同名知识点。知识点靠名称与资料、题目和画像对应，名称必须唯一。";
  }
  if (message.includes("CHAPTER_TITLE_DUPLICATED")) {
    return "同名章节已存在，请换一个章节名称。";
  }
  if (message.includes("CHAPTER_NOT_EMPTY")) {
    return "章节下还有生效知识点，先把知识点移到其它章节或停用后才能删除章节。";
  }
  if (message.includes("SYLLABUS_FIELD_INVALID")) {
    return "知识点类型或难度取值不合法，请重新选择。";
  }
  if (message.includes("AUTH_FORBIDDEN")) {
    return "当前教师在该课程没有生效的教学安排，无法编辑大纲。";
  }
  return "操作失败，请稍后重试。";
}

// --- 章节卡片 ---------------------------------------------------------------

function ChapterCard({
  chapter,
  index,
  total,
  busy,
  editing,
  addingPoint,
  editingPointId,
  chapterOptions,
  onStartEditing,
  onStopEditing,
  onStartAddingPoint,
  onStopAddingPoint,
  onStartEditingPoint,
  onStopEditingPoint,
  onMove,
  onMovePoint,
  onDragStart,
  onDrop,
  onSaveChapter,
  onDeleteChapter,
  onCreatePoint,
  onSavePoint,
  onDeletePoint,
}: {
  chapter: SyllabusChapter;
  index: number;
  total: number;
  busy: boolean;
  editing: boolean;
  addingPoint: boolean;
  editingPointId: string;
  chapterOptions: Array<{ value: string; label: string }>;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onStartAddingPoint: () => void;
  onStopAddingPoint: () => void;
  onStartEditingPoint: (id: string) => void;
  onStopEditingPoint: () => void;
  onMove: (offset: number) => void;
  onMovePoint: (index: number, offset: number) => void;
  onDragStart: () => void;
  onDrop: () => void;
  onSaveChapter: (payload: { title?: string; summary?: string }) => Promise<boolean>;
  onDeleteChapter: () => Promise<boolean>;
  onCreatePoint: (payload: {
    name: string;
    point_type: KnowledgePointType;
    difficulty: KnowledgePointDifficulty;
  }) => Promise<boolean>;
  onSavePoint: (pointId: string, payload: Record<string, unknown>) => Promise<boolean>;
  onDeletePoint: (pointId: string) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(chapter.title);
  const [summary, setSummary] = useState(chapter.summary);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setTitle(chapter.title);
    setSummary(chapter.summary);
  }, [chapter.title, chapter.summary]);

  return (
    <article
      className="class-card syllabus-chapter"
      draggable={!busy}
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <header className="syllabus-chapter-head">
        <div className="syllabus-chapter-title">
          <span className="syllabus-order" aria-hidden="true">
            {index + 1}
          </span>
          {editing ? (
            <input
              className="syllabus-input"
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
            />
          ) : (
            <h2>{chapter.title}</h2>
          )}
          {chapter.status !== "ACTIVE" ? (
            <span className="class-badge grey">{syllabusStatusText(chapter.status)}</span>
          ) : null}
        </div>

        <div className="syllabus-chapter-actions">
          {/* 拖拽之外必须给键盘可达的上移下移（§7 可访问性） */}
          <button
            className="review-back"
            type="button"
            title="上移章节"
            aria-label="上移章节"
            disabled={busy || index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp size={14} />
          </button>
          <button
            className="review-back"
            type="button"
            title="下移章节"
            aria-label="下移章节"
            disabled={busy || index === total - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown size={14} />
          </button>
          {editing ? (
            <>
              <button className="review-back" type="button" onClick={onStopEditing} disabled={busy}>
                取消
              </button>
              <button
                className="class-primary"
                type="button"
                disabled={busy || !title.trim()}
                onClick={async () => {
                  const ok = await onSaveChapter({ title: title.trim(), summary });
                  if (ok) onStopEditing();
                }}
              >
                保存
              </button>
            </>
          ) : (
            <>
              <button className="review-back" type="button" onClick={onStartEditing} disabled={busy}>
                <Pencil size={14} /> 编辑
              </button>
              <button
                className="review-back"
                type="button"
                disabled={busy || !chapter.deletable}
                title={chapter.blocked_reason ?? "删除章节"}
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 size={14} /> 删除
              </button>
            </>
          )}
        </div>
      </header>

      {editing ? (
        <textarea
          className="syllabus-textarea"
          value={summary}
          rows={3}
          maxLength={2000}
          placeholder="章节说明，用于向学生解释这一章要解决什么问题"
          onChange={(event) => setSummary(event.target.value)}
        />
      ) : chapter.summary ? (
        <p className="syllabus-chapter-summary">{chapter.summary}</p>
      ) : null}

      {confirmingDelete ? (
        <div className="syllabus-confirm">
          <p>确认删除「{chapter.title}」？该章节下的停用知识点会一并删除，此操作不可撤销。</p>
          <div className="syllabus-confirm-actions">
            <button
              className="review-back"
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={busy}
            >
              取消
            </button>
            <button
              className="class-primary syllabus-danger"
              type="button"
              disabled={busy}
              onClick={async () => {
                await onDeleteChapter();
                setConfirmingDelete(false);
              }}
            >
              确认删除
            </button>
          </div>
        </div>
      ) : null}

      <div className="syllabus-points">
        {chapter.knowledge_points.length === 0 ? (
          <div className="empty-panel compact">
            这一章还没有知识点。知识点是任务、资料和画像的绑定单位，建议按可评测的最小能力拆分。
          </div>
        ) : (
          chapter.knowledge_points.map((point, pointIndex) => (
            <PointRow
              key={point.knowledge_point_id}
              point={point}
              index={pointIndex}
              total={chapter.knowledge_points.length}
              busy={busy}
              editing={editingPointId === point.knowledge_point_id}
              chapterOptions={chapterOptions}
              onStartEditing={() => onStartEditingPoint(point.knowledge_point_id)}
              onStopEditing={onStopEditingPoint}
              onMove={(offset) => onMovePoint(pointIndex, offset)}
              onSave={(payload) => onSavePoint(point.knowledge_point_id, payload)}
              onDelete={() => onDeletePoint(point.knowledge_point_id)}
            />
          ))
        )}

        {addingPoint ? (
          <NewPointForm
            busy={busy}
            onCancel={onStopAddingPoint}
            onSubmit={async (payload) => {
              const ok = await onCreatePoint(payload);
              if (ok) onStopAddingPoint();
            }}
          />
        ) : (
          <button
            className="review-back syllabus-add-point"
            type="button"
            disabled={busy}
            onClick={onStartAddingPoint}
          >
            <Plus size={14} /> 新建知识点
          </button>
        )}
      </div>
    </article>
  );
}

// --- 知识点行 ---------------------------------------------------------------

function PointRow({
  point,
  index,
  total,
  busy,
  editing,
  chapterOptions,
  onStartEditing,
  onStopEditing,
  onMove,
  onSave,
  onDelete,
}: {
  point: SyllabusKnowledgePoint;
  index: number;
  total: number;
  busy: boolean;
  editing: boolean;
  chapterOptions: Array<{ value: string; label: string }>;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onMove: (offset: number) => void;
  onSave: (payload: Record<string, unknown>) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const [name, setName] = useState(point.name);
  const [summary, setSummary] = useState(point.summary);
  const [pointType, setPointType] = useState<KnowledgePointType>(point.point_type);
  const [difficulty, setDifficulty] = useState<KnowledgePointDifficulty>(point.difficulty);
  const [chapterId, setChapterId] = useState(point.chapter_id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setName(point.name);
    setSummary(point.summary);
    setPointType(point.point_type);
    setDifficulty(point.difficulty);
    setChapterId(point.chapter_id);
  }, [point]);

  const referenced = !point.deletable;

  if (editing) {
    return (
      <div className="syllabus-point syllabus-point-editing">
        <div className="syllabus-point-fields">
          <label>
            <span>名称</span>
            <input
              className="syllabus-input"
              value={name}
              maxLength={100}
              disabled={referenced}
              title={referenced ? point.blocked_reason ?? undefined : undefined}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            <span>类型</span>
            <select
              className="review-select"
              value={pointType}
              onChange={(event) => setPointType(event.target.value as KnowledgePointType)}
            >
              {POINT_TYPE_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>难度</span>
            <select
              className="review-select"
              value={difficulty}
              onChange={(event) =>
                setDifficulty(event.target.value as KnowledgePointDifficulty)
              }
            >
              {DIFFICULTY_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>所属章节</span>
            <select
              className="review-select"
              value={chapterId}
              onChange={(event) => setChapterId(event.target.value)}
            >
              {chapterOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <textarea
          className="syllabus-textarea"
          value={summary}
          rows={2}
          maxLength={2000}
          placeholder="知识点说明"
          onChange={(event) => setSummary(event.target.value)}
        />

        {referenced ? (
          <p className="syllabus-locked">
            <Lock size={13} /> {point.blocked_reason}
            ；名称已锁定，其它字段仍可修改。
          </p>
        ) : null}

        <div className="syllabus-point-actions">
          <button className="review-back" type="button" onClick={onStopEditing} disabled={busy}>
            取消
          </button>
          <button
            className="class-primary"
            type="button"
            disabled={busy || !name.trim()}
            onClick={async () => {
              const payload: Record<string, unknown> = {
                summary,
                point_type: pointType,
                difficulty,
              };
              // 被引用时名称锁定，别把原名再发一次触发无谓的 409 判断
              if (!referenced && name.trim() !== point.name) payload.name = name.trim();
              if (chapterId !== point.chapter_id) payload.chapter_id = chapterId;
              const ok = await onSave(payload);
              if (ok) onStopEditing();
            }}
          >
            保存
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="syllabus-point">
      <div className="syllabus-point-main">
        <strong>{point.name}</strong>
        <div className="class-tag-row">
          <span>{pointTypeText(point.point_type)}</span>
          <span>{difficultyText(point.difficulty)}</span>
          {point.status !== "ACTIVE" ? <span>{syllabusStatusText(point.status)}</span> : null}
        </div>
        {point.summary ? <p>{point.summary}</p> : null}
      </div>

      <div className="syllabus-point-usage" title={point.blocked_reason ?? "暂无引用，可以删除"}>
        <Link2 size={13} /> {usageText(point.usage)}
      </div>

      <div className="syllabus-point-actions">
        <button
          className="review-back"
          type="button"
          title="上移知识点"
          aria-label="上移知识点"
          disabled={busy || index === 0}
          onClick={() => onMove(-1)}
        >
          <ArrowUp size={14} />
        </button>
        <button
          className="review-back"
          type="button"
          title="下移知识点"
          aria-label="下移知识点"
          disabled={busy || index === total - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown size={14} />
        </button>
        <button className="review-back" type="button" onClick={onStartEditing} disabled={busy}>
          <Pencil size={14} /> 编辑
        </button>
        <button
          className="review-back"
          type="button"
          disabled={busy || referenced}
          title={point.blocked_reason ?? "删除知识点"}
          onClick={() => setConfirmingDelete(true)}
        >
          <Trash2 size={14} /> 删除
        </button>
      </div>

      {confirmingDelete ? (
        <div className="syllabus-confirm">
          <p>确认删除知识点「{point.name}」？此操作不可撤销。</p>
          <div className="syllabus-confirm-actions">
            <button
              className="review-back"
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={busy}
            >
              取消
            </button>
            <button
              className="class-primary syllabus-danger"
              type="button"
              disabled={busy}
              onClick={async () => {
                await onDelete();
                setConfirmingDelete(false);
              }}
            >
              确认删除
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NewPointForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (payload: {
    name: string;
    point_type: KnowledgePointType;
    difficulty: KnowledgePointDifficulty;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [pointType, setPointType] = useState<KnowledgePointType>("CONCEPT");
  const [difficulty, setDifficulty] = useState<KnowledgePointDifficulty>("BASIC");

  return (
    <div className="syllabus-point syllabus-point-editing">
      <div className="syllabus-point-fields">
        <label>
          <span>名称</span>
          <input
            className="syllabus-input"
            value={name}
            maxLength={100}
            placeholder="例如「循环队列判空与判满」"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          <span>类型</span>
          <select
            className="review-select"
            value={pointType}
            onChange={(event) => setPointType(event.target.value as KnowledgePointType)}
          >
            {POINT_TYPE_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>难度</span>
          <select
            className="review-select"
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value as KnowledgePointDifficulty)}
          >
            {DIFFICULTY_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="syllabus-locked">
        <Lock size={13} /> 名称在课程内必须唯一，且被引用后不能再改 —— 资料、题目和画像都靠名称对应。
      </p>
      <div className="syllabus-point-actions">
        <button className="review-back" type="button" onClick={onCancel} disabled={busy}>
          <X size={14} /> 取消
        </button>
        <button
          className="class-primary"
          type="button"
          disabled={busy || !name.trim()}
          onClick={() => onSubmit({ name: name.trim(), point_type: pointType, difficulty })}
        >
          创建知识点
        </button>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  tone,
  label,
  value,
  unit,
  note,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: string;
  unit?: string;
  note: string;
}) {
  return (
    <article className="class-card class-stat">
      <span className={tone}>{icon}</span>
      <p>{label}</p>
      <strong>
        {value}
        {unit ? <small> {unit}</small> : null}
      </strong>
      <em>{note}</em>
    </article>
  );
}
