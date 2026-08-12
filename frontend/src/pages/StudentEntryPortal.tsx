import { useEffect, useMemo, useState, type PointerEvent, type ReactNode } from "react";
import { ArrowRight, BookOpenCheck, CalendarClock, CheckCircle2, FlaskConical, Loader2, LockKeyhole, Microscope, Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, apiCache, type LearningContext, type StudentTaskCard } from "../api";
import type { AuthUser } from "../authSession";

type StudentEntryPortalProps = {
  authUser: AuthUser;
  accountSlot: ReactNode;
};

function studentName(user: AuthUser) {
  return user.display_name || user.username || "同学";
}

function handleCardPointerMove(event: PointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width - 0.5) * 10;
  const y = ((event.clientY - rect.top) / rect.height - 0.5) * -10;
  event.currentTarget.style.setProperty("--tilt-x", `${y.toFixed(2)}deg`);
  event.currentTarget.style.setProperty("--tilt-y", `${x.toFixed(2)}deg`);
}

function resetCardTilt(event: PointerEvent<HTMLElement>) {
  event.currentTarget.style.setProperty("--tilt-x", "0deg");
  event.currentTarget.style.setProperty("--tilt-y", "0deg");
}

function StudentPortalTopbar({ accountSlot }: { accountSlot: ReactNode }) {
  return (
    <header className="teacher-entry-topbar">
      <button className="teacher-entry-brand" type="button" aria-label="CodeTrack Student">
        <span className="teacher-entry-logo" aria-hidden="true" />
        <strong>CodeTrack Student</strong>
      </button>
      <div className="teacher-entry-userline">
        <span className="teacher-entry-status">
          <i aria-hidden="true" />
          学生助学空间已连接
        </span>
        {accountSlot}
      </div>
    </header>
  );
}

function CourseIllustration() {
  return (
    <div className="teacher-card-visual workbench-visual" aria-hidden="true">
      <span className="visual-window">
        <i />
        <i />
        <i />
        <b />
        <em />
      </span>
      <span className="visual-profile">
        <BookOpenCheck size={34} strokeWidth={2.1} />
      </span>
      <span className="visual-dot dot-a" />
      <span className="visual-dot dot-b" />
    </div>
  );
}

function SelfStudyIllustration() {
  return (
    <div className="teacher-card-visual research-visual" aria-hidden="true">
      <span className="visual-microscope">
        <Microscope size={98} strokeWidth={1.45} />
      </span>
      <span className="visual-flask">
        <FlaskConical size={42} strokeWidth={1.6} />
      </span>
      <span className="visual-dot dot-a" />
      <span className="visual-dot dot-b" />
    </div>
  );
}

function latestTaskLabel(tasks: StudentTaskCard[]) {
  const task = tasks.find((item) => item.status !== "COMPLETED") ?? tasks[0];
  return task?.title ?? "等待教师下发课程任务";
}

function CourseDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const cachedContext = apiCache.peekLearningContext();
  const cachedTasks = apiCache.peekStudentTasks();
  const [context, setContext] = useState<LearningContext | null>(cachedContext);
  const [tasks, setTasks] = useState<StudentTaskCard[]>(cachedTasks ?? []);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;

    async function loadCourses() {
      setLoading(!context);
      setMessage(null);
      try {
        const data = await api.getLearningContext();
        const taskData = await api.listStudentTasks();
        if (!alive) return;
        setContext(data);
        setTasks(taskData);
      } catch {
        if (alive) setMessage("课程数据加载失败，请稍后重试。");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadCourses();
    return () => {
      alive = false;
    };
  }, [open]);

  const courseCards = useMemo(() => {
    return (context?.courses ?? []).map((course) => {
      const courseTasks = tasks.filter((task) => task.course_id === course.course_id);
      const completed = courseTasks.filter((task) => task.status === "COMPLETED").length;
      const progress = course.task_count ? Math.round(((course.task_count - course.unfinished_count) / course.task_count) * 100) : 0;
      return {
        ...course,
        completed,
        progress,
        latestTask: latestTaskLabel(courseTasks)
      };
    });
  }, [context, tasks]);

  function enterCourse(courseId: string) {
    onClose();
    navigate(`/courses/${courseId}`);
  }

  return (
    <div className={`student-course-drawer-layer${open ? " open" : ""}`} aria-hidden={!open}>
      <button className="student-course-drawer-scrim" type="button" tabIndex={open ? 0 : -1} aria-label="关闭课程选择" onClick={onClose} />
      <aside className="student-course-drawer" aria-label="我的课程" aria-modal={open} role="dialog">
        <header>
          <div>
            <span>我的课程</span>
            <h2>选择要进入的课程</h2>
            <p>从这里进入课程工作台、班级任务、学习画像和知识图谱。</p>
          </div>
          <button type="button" aria-label="关闭课程选择" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        {message ? <p className="student-course-drawer-message">{message}</p> : null}

        <section className="student-course-drawer-list">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => <article className="student-course-drawer-card skeleton-block" key={index} />)
          ) : courseCards.length ? (
            courseCards.map((course) => (
              <article className="student-course-drawer-card" key={course.course_id}>
                <div className="student-course-drawer-card-head">
                  <span className="teacher-soft-icon blue"><BookOpenCheck size={22} /></span>
                  <div>
                    <strong>{course.course_name}</strong>
                    <small>授课教师：{course.teacher_name} · 所在班级：{context?.student.class_name ?? "当前班级"}</small>
                  </div>
                </div>
                <div className="student-course-drawer-meta">
                  <p><CalendarClock size={15} /> 待完成 {course.unfinished_count} 项</p>
                  <p><CheckCircle2 size={15} /> 已完成 {course.completed} 项</p>
                </div>
                <div className="student-course-drawer-progress">
                  <span>学习进度</span>
                  <strong>{course.progress}%</strong>
                  <i><b style={{ width: `${Math.max(6, course.progress)}%` }} /></i>
                </div>
                <p className="student-course-drawer-next">{course.latestTask}</p>
                <button type="button" onClick={() => enterCourse(course.course_id)}>
                  进入课程
                  <ArrowRight size={17} />
                </button>
              </article>
            ))
          ) : (
            <div className="student-course-drawer-empty">
              <Loader2 size={24} />
              <strong>当前账号还没有加入课程</strong>
              <p>加入课程后，会在这里选择并进入课程工作台。</p>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}

export default function StudentEntryPortal({ authUser, accountSlot }: StudentEntryPortalProps) {
  const navigate = useNavigate();
  const [courseDrawerOpen, setCourseDrawerOpen] = useState(false);

  return (
    <main className="teacher-entry-page">
      <StudentPortalTopbar accountSlot={accountSlot} />

      <section className="teacher-entry-hero" aria-labelledby="student-entry-title">
        <div className="teacher-entry-orbit" aria-hidden="true">
          <Sparkles size={54} strokeWidth={1.6} />
        </div>
        <h1 id="student-entry-title">你好，{studentName(authUser)}</h1>
        <p>欢迎进入 CodeTrack 学生端，选择课程任务学习或自主学习空间。</p>

        <div className="teacher-entry-cards">
          <article className="teacher-entry-card" onPointerMove={handleCardPointerMove} onPointerLeave={resetCardTilt}>
            <CourseIllustration />
            <h2>我的课程</h2>
            <p>进入已加入课程、课程工作台、课程任务、学习画像与知识图谱</p>
            <button type="button" onClick={() => setCourseDrawerOpen(true)}>
              进入课程
              <ArrowRight size={24} strokeWidth={2.2} />
            </button>
          </article>

          <article className="teacher-entry-card" onPointerMove={handleCardPointerMove} onPointerLeave={resetCardTilt}>
            <SelfStudyIllustration />
            <h2>自主学习</h2>
            <p>进入知识点学习、个人画像、资源中心、知识图谱与 AI 助手</p>
            <button type="button" onClick={() => navigate("/self-study")}>
              进入自学
              <ArrowRight size={24} strokeWidth={2.2} />
            </button>
          </article>
        </div>
      </section>

      <footer className="teacher-entry-footer">
        <LockKeyhole size={18} strokeWidth={1.8} />
        数据安全保障中，您的学习记录与个人画像受保护
      </footer>
      <CourseDrawer open={courseDrawerOpen} onClose={() => setCourseDrawerOpen(false)} />
    </main>
  );
}
