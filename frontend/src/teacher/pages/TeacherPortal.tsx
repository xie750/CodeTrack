import { type PointerEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, BookOpenCheck, CheckCircle2, FlaskConical, LockKeyhole, Microscope, ShieldCheck, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { AuthUser } from "../../authSession";

type TeacherPortalProps = {
  authUser: AuthUser;
  accountSlot: ReactNode;
};

function teacherName(user: AuthUser) {
  return user.display_name || user.username || "老师";
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

function PortalTopbar({ accountSlot }: { accountSlot: ReactNode }) {
  return (
    <header className="teacher-entry-topbar">
      <button className="teacher-entry-brand" type="button" aria-label="CodeTrack Teacher">
        <span className="teacher-entry-logo" aria-hidden="true" />
        <strong>CodeTrack Teacher</strong>
      </button>
      <div className="teacher-entry-userline">
        <span className="teacher-entry-status">
          <i aria-hidden="true" />
          课程知识库已连接
        </span>
        {accountSlot}
      </div>
    </header>
  );
}

function WorkbenchIllustration() {
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

function ResearchIllustration() {
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

export function TeacherEntryPortal({ authUser, accountSlot }: TeacherPortalProps) {
  const navigate = useNavigate();

  return (
    <main className="teacher-entry-page">
      <PortalTopbar accountSlot={accountSlot} />

      <section className="teacher-entry-hero" aria-labelledby="teacher-entry-title">
        <div className="teacher-entry-orbit" aria-hidden="true">
          <Sparkles size={54} strokeWidth={1.6} />
        </div>
        <h1 id="teacher-entry-title">你好，{teacherName(authUser)}</h1>
        <p>欢迎进入 CodeTrack 教师端，智能助力教学管理与科研协作。</p>

        <div className="teacher-entry-cards">
          <article className="teacher-entry-card" onPointerMove={handleCardPointerMove} onPointerLeave={resetCardTilt}>
            <WorkbenchIllustration />
            <h2>教学工作台</h2>
            <p>进入课程管理、班级组织、任务发布与学情分析</p>
            <button type="button" onClick={() => navigate("/teacher/dashboard")}>
              进入工作台
              <ArrowRight size={24} strokeWidth={2.2} />
            </button>
          </article>

          <article className="teacher-entry-card" onPointerMove={handleCardPointerMove} onPointerLeave={resetCardTilt}>
            <ResearchIllustration />
            <h2>科研入口</h2>
            <p>进入科研资料整理、课题协作与研究辅助空间</p>
            <button type="button" onClick={() => navigate("/teacher/research")}>
              进入科研
              <ArrowRight size={24} strokeWidth={2.2} />
            </button>
          </article>
        </div>
      </section>

      <footer className="teacher-entry-footer">
        <LockKeyhole size={18} strokeWidth={1.8} />
        数据安全保障中，您的隐私与内容安全受保护
      </footer>
    </main>
  );
}

export function TeacherResearchShowcase({ authUser, accountSlot }: TeacherPortalProps) {
  const navigate = useNavigate();

  return (
    <main className="teacher-entry-page research-showcase-page">
      <PortalTopbar accountSlot={accountSlot} />

      <section className="research-showcase" aria-labelledby="research-title">
        <button className="research-back" type="button" onClick={() => navigate("/teacher")}>
          <ArrowLeft size={18} strokeWidth={2.2} />
          返回入口
        </button>
        <div className="research-showcase-visual" aria-hidden="true">
          <ResearchIllustration />
        </div>
        <div className="research-showcase-copy">
          <span>科研入口展示</span>
          <h1 id="research-title">你好，{teacherName(authUser)}，科研空间正在准备中</h1>
          <p>当前版本先保留科研入口的展示位，后续可接入资料整理、课题协作、文献追踪和研究辅助工作流。</p>
        </div>
        <div className="research-showcase-grid">
          {[
            { title: "科研资料整理", desc: "论文、项目材料与课堂研究数据的统一归档展示。", icon: <BookOpenCheck size={22} /> },
            { title: "课题协作空间", desc: "面向团队课题的成员分工、进展同步与讨论入口。", icon: <CheckCircle2 size={22} /> },
            { title: "研究辅助能力", desc: "预留文献梳理、实验记录和报告草稿生成能力。", icon: <ShieldCheck size={22} /> }
          ].map((item) => (
            <article key={item.title}>
              <span>{item.icon}</span>
              <h2>{item.title}</h2>
              <p>{item.desc}</p>
              <em>展示占位</em>
            </article>
          ))}
        </div>
        <button className="research-workbench-link" type="button" onClick={() => navigate("/teacher/dashboard")}>
          进入教学工作台
          <ArrowRight size={20} strokeWidth={2.2} />
        </button>
      </section>
    </main>
  );
}
