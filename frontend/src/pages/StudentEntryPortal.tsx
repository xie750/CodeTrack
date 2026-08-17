import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ArrowRight, BookOpenCheck, CalendarClock, CheckCircle2, FlaskConical, Loader2, LockKeyhole, Microscope, Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, apiCache, type LearningContext, type StudentTaskCard } from "../api";
import type { AuthUser } from "../authSession";

type StudentEntryTheme = "starmap" | "cloud";

const STUDENT_ENTRY_THEME_KEY = "codetrack.student.entry.theme";

type StudentEntryPortalProps = {
  authUser: AuthUser;
  accountSlot: ReactNode;
};

type MotionParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ox: number;
  oy: number;
  size: number;
  alpha: number;
  color: string;
  twinkle: number;
  twinkleSpeed: number;
};

function readStoredEntryTheme(): StudentEntryTheme {
  if (typeof window === "undefined") return "starmap";
  return window.localStorage.getItem(STUDENT_ENTRY_THEME_KEY) === "cloud" ? "cloud" : "starmap";
}

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

function particlePalette(theme: StudentEntryTheme) {
  return theme === "cloud"
    ? ["23,108,245", "22,182,160", "73,145,230", "255,255,255"]
    : ["255,255,255", "78,202,255", "85,224,180", "128,166,255"];
}

function StudentEntryMotionBackdrop({ theme }: { theme: StudentEntryTheme }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return undefined;
    const drawingCanvas = canvas;
    const drawingContext = ctx;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const mouse = { x: -9999, y: -9999, active: false };
    const particles: MotionParticle[] = [];
    const colors = particlePalette(theme);
    let width = 0;
    let height = 0;
    let frameId = 0;

    function makeParticle(index = 0): MotionParticle {
      const color = colors[Math.floor(Math.random() * colors.length)] ?? colors[0];
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.18,
        vy: 0.05 + Math.random() * 0.22,
        ox: 0,
        oy: 0,
        size: 0.8 + Math.random() * 2.2,
        alpha: 0.28 + Math.random() * 0.48,
        color,
        twinkle: index * 0.47 + Math.random() * Math.PI * 2,
        twinkleSpeed: 0.6 + Math.random() * 1.6
      };
    }

    function resize() {
      const rect = drawingCanvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      drawingCanvas.width = Math.floor(width * dpr);
      drawingCanvas.height = Math.floor(height * dpr);
      drawingContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles.length = 0;
      const count = reduceMotion ? 0 : Math.min(150, Math.max(72, Math.floor((width * height) / 9800)));
      for (let index = 0; index < count; index += 1) particles.push(makeParticle(index));
    }

    function updatePointer(event: globalThis.PointerEvent) {
      const rect = drawingCanvas.getBoundingClientRect();
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
      mouse.active = true;
    }

    function leavePointer() {
      mouse.active = false;
    }

    function draw(timestamp: number) {
      drawingContext.clearRect(0, 0, width, height);
      const time = timestamp * 0.001;
      const repelRadius = 118;

      for (let i = 0; i < particles.length; i += 1) {
        const point = particles[i];
        point.x += point.vx;
        point.y += point.vy;

        if (point.y > height + 24) {
          point.y = -16;
          point.x = Math.random() * width;
        }
        if (point.x < -24) point.x = width + 24;
        if (point.x > width + 24) point.x = -24;

        let drawX = point.x + point.ox;
        let drawY = point.y + point.oy;
        const dx = drawX - mouse.x;
        const dy = drawY - mouse.y;
        const distanceSq = dx * dx + dy * dy;

        if (mouse.active && distanceSq < repelRadius * repelRadius && distanceSq > 0.01) {
          const distance = Math.sqrt(distanceSq);
          const force = (repelRadius - distance) / repelRadius;
          point.ox += (dx / distance) * force * 18;
          point.oy += (dy / distance) * force * 18;
        }

        point.ox *= 0.84;
        point.oy *= 0.84;
        drawX = point.x + point.ox;
        drawY = point.y + point.oy;

        const pulse = 0.72 + 0.28 * Math.sin(time * point.twinkleSpeed + point.twinkle);
        drawingContext.globalAlpha = point.alpha * pulse;
        drawingContext.fillStyle = `rgb(${point.color})`;
        drawingContext.beginPath();
        drawingContext.arc(drawX, drawY, point.size, 0, Math.PI * 2);
        drawingContext.fill();

        for (let j = i + 1; j < particles.length; j += 1) {
          const next = particles[j];
          const nextX = next.x + next.ox;
          const nextY = next.y + next.oy;
          const lineDx = drawX - nextX;
          const lineDy = drawY - nextY;
          const lineDistanceSq = lineDx * lineDx + lineDy * lineDy;
          if (lineDistanceSq < 98 * 98) {
            const lineAlpha = (1 - Math.sqrt(lineDistanceSq) / 98) * (theme === "cloud" ? 0.12 : 0.18);
            drawingContext.globalAlpha = lineAlpha;
            drawingContext.strokeStyle = theme === "cloud" ? "rgb(23,108,245)" : "rgb(78,202,255)";
            drawingContext.lineWidth = 1;
            drawingContext.beginPath();
            drawingContext.moveTo(drawX, drawY);
            drawingContext.lineTo(nextX, nextY);
            drawingContext.stroke();
          }
        }
      }

      drawingContext.globalAlpha = 1;
      frameId = window.requestAnimationFrame(draw);
    }

    resize();
    if (!reduceMotion) frameId = window.requestAnimationFrame(draw);

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", updatePointer);
    window.addEventListener("pointerleave", leavePointer);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", updatePointer);
      window.removeEventListener("pointerleave", leavePointer);
    };
  }, [theme]);

  return <canvas className="student-entry-particle-canvas" ref={canvasRef} aria-hidden="true" />;
}

function StudentPortalTopbar({
  accountSlot,
  theme,
  onThemeChange
}: {
  accountSlot: ReactNode;
  theme: StudentEntryTheme;
  onThemeChange: (theme: StudentEntryTheme) => void;
}) {
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
        <div className="student-entry-theme-toggle" aria-label="入口背景风格切换">
          <button type="button" className={theme === "starmap" ? "active" : ""} aria-pressed={theme === "starmap"} onClick={() => onThemeChange("starmap")}>
            星图
          </button>
          <button type="button" className={theme === "cloud" ? "active" : ""} aria-pressed={theme === "cloud"} onClick={() => onThemeChange("cloud")}>
            云图
          </button>
        </div>
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
  const [entryTheme, setEntryTheme] = useState<StudentEntryTheme>(readStoredEntryTheme);

  function changeEntryTheme(nextTheme: StudentEntryTheme) {
    setEntryTheme(nextTheme);
    window.localStorage.setItem(STUDENT_ENTRY_THEME_KEY, nextTheme);
  }

  return (
    <main className="teacher-entry-page student-entry-page" data-entry-theme={entryTheme}>
      <div className="student-entry-backdrop" aria-hidden="true">
        <StudentEntryMotionBackdrop theme={entryTheme} />
        <span className="student-entry-grid" />
        <span className="student-entry-stream stream-a" />
        <span className="student-entry-stream stream-b" />
      </div>
      <StudentPortalTopbar accountSlot={accountSlot} theme={entryTheme} onThemeChange={changeEntryTheme} />

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
