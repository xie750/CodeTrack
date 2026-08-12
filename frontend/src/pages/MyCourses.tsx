import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, CalendarClock, CheckCircle2, ClipboardList, GraduationCap, Loader2, Network, UserRound } from "lucide-react";
import { api, apiCache, LearningContext, StudentTaskCard } from "../api";

function courseVisualType(index: number) {
  return ["panel", "code", "db", "cube"][index % 4];
}

function formatCourseMeta(course: LearningContext["courses"][number]) {
  return `${course.teacher_name} · ${course.task_count} 个课程任务`;
}

function latestTaskLabel(tasks: StudentTaskCard[]) {
  const task = tasks.find((item) => item.status !== "COMPLETED") ?? tasks[0];
  if (!task) return "等待教师下发课程任务";
  return task.title;
}

export default function MyCourses() {
  const navigate = useNavigate();
  const cachedContext = apiCache.peekLearningContext();
  const cachedTasks = apiCache.peekStudentTasks();
  const [context, setContext] = useState<LearningContext | null>(cachedContext);
  const [tasks, setTasks] = useState<StudentTaskCard[]>(cachedTasks ?? []);
  const [loading, setLoading] = useState(!cachedContext);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadCourses() {
      setLoading(!context);
      setMessage(null);
      try {
        const data = await api.getLearningContext();
        if (!alive) return;
        setContext(data);
        const taskResult = await api.listStudentTasks();
        if (!alive) return;
        setTasks(taskResult);
      } catch {
        if (!alive) return;
        setMessage("我的课程数据加载失败，请稍后刷新。");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadCourses();
    return () => {
      alive = false;
    };
  }, []);

  const courseCards = useMemo(() => {
    return (context?.courses ?? []).map((course, index) => {
      const courseTasks = tasks.filter((task) => task.course_id === course.course_id);
      const completed = courseTasks.filter((task) => task.status === "COMPLETED").length;
      const progress = course.task_count ? Math.round(((course.task_count - course.unfinished_count) / course.task_count) * 100) : 0;
      return {
        ...course,
        visual: courseVisualType(index),
        progress,
        completed,
        latestTask: latestTaskLabel(courseTasks)
      };
    });
  }, [context, tasks]);

  const unfinishedTotal = courseCards.reduce((sum, course) => sum + course.unfinished_count, 0);
  const taskTotal = courseCards.reduce((sum, course) => sum + course.task_count, 0);
  const completedTotal = Math.max(taskTotal - unfinishedTotal, 0);

  return (
    <div className="student-courses-page">
      <section className="student-courses-main">
        <header className="student-page-hero">
          <div>
            <span className="student-eyebrow">学生端 · 第一层窗口</span>
            <h1>我的课程</h1>
            <p>
              {context
                ? `${context.student.name} 已加入 ${context.courses.length} 门课程。点击任一课程进入课程工作台、课程任务、学习画像和知识图谱。`
                : "正在读取学生加入的课程。"}
            </p>
          </div>
          <button type="button" onClick={() => navigate("/")}>
            返回入口
            <ArrowRight size={17} />
          </button>
        </header>

        <section className="student-stat-strip">
          <article className="teacher-v2-stat">
            <span className="teacher-soft-icon green"><BookOpen size={25} /></span>
            <div><em>已加入课程</em><strong>{loading ? "..." : courseCards.length}</strong><small>当前账号绑定</small></div>
          </article>
          <article className="teacher-v2-stat">
            <span className="teacher-soft-icon blue"><ClipboardList size={25} /></span>
            <div><em>课程任务</em><strong>{loading ? "..." : taskTotal}</strong><small>教师下发</small></div>
          </article>
          <article className="teacher-v2-stat">
            <span className="teacher-soft-icon orange"><CalendarClock size={25} /></span>
            <div><em>待完成</em><strong>{loading ? "..." : unfinishedTotal}</strong><small>优先进入工作台</small></div>
          </article>
          <article className="teacher-v2-stat">
            <span className="teacher-soft-icon purple"><CheckCircle2 size={25} /></span>
            <div><em>已完成</em><strong>{loading ? "..." : completedTotal}</strong><small>同步学习画像</small></div>
          </article>
        </section>

        {message ? <p className="student-data-message">{message}</p> : null}

        <section className="student-course-grid" aria-label="学生加入课程">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => <article className="teacher-course-card-v2 student-course-card skeleton-block" key={index} />)
          ) : courseCards.length ? (
            courseCards.map((course) => (
              <article className="teacher-course-card-v2 student-course-card" key={course.course_id}>
                <span className={course.unfinished_count > 0 ? "course-status active" : "course-status"}>{course.unfinished_count > 0 ? "进行中" : "已完成"}</span>
                <CourseVisual type={course.visual} />
                <h3>{course.course_name}</h3>
                <p>{formatCourseMeta(course)}</p>
                <small>{context?.student.class_name ?? "当前班级"} · 教学班已绑定</small>
                <div className="course-progress-line">
                  <span>学习进度</span>
                  <strong>{course.progress}%</strong>
                  <i><b style={{ width: `${course.progress}%` }} /></i>
                </div>
                <dl>
                  <dt>下一步</dt>
                  <dd>{course.latestTask}<span>{course.unfinished_count} 个待完成</span></dd>
                </dl>
                <footer>
                  <button type="button" onClick={() => navigate(`/courses/${course.course_id}`)}>进入课程</button>
                  <button type="button" onClick={() => navigate(`/courses/${course.course_id}/tasks`)}>课程任务</button>
                  <button type="button" aria-label={`查看 ${course.course_name} 知识图谱`} onClick={() => navigate(`/courses/${course.course_id}/knowledge-map`)}>
                    <Network size={18} />
                  </button>
                </footer>
              </article>
            ))
          ) : (
            <article className="student-empty-panel">
              <Loader2 size={24} />
              <h2>当前账号还没有加入课程</h2>
              <p>这里仅展示学生已加入课程，不提供教师端的创建、发布或管理入口。</p>
            </article>
          )}
        </section>
      </section>

      <aside className="student-courses-aside">
        <section className="student-panel">
          <h2>课程进入逻辑</h2>
          <div className="student-flow-list">
            <p><span className="teacher-soft-icon blue"><GraduationCap size={18} /></span>登录后先进入学习首页</p>
            <p><span className="teacher-soft-icon green"><BookOpen size={18} /></span>点击我的课程查看已加入课程</p>
            <p><span className="teacher-soft-icon orange"><UserRound size={18} /></span>进入课程后按课程维度查看任务和画像</p>
          </div>
        </section>
        <section className="student-panel">
          <h2>当前边界</h2>
          <p className="student-panel-copy">学生端只做查看、进入任务和学习辅助，不出现教师端的课程创建、任务发布、班级管理控件。</p>
        </section>
      </aside>
    </div>
  );
}

function CourseVisual({ type }: { type: string }) {
  return (
    <div className={`course-visual ${type}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}
