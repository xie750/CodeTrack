import { useState, type ReactNode } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Bot, BookOpen, ChartNoAxesColumnIncreasing, ChevronsLeft, ChevronsRight, Database, Flame, FolderOpen, Network, Route as RouteIcon } from "lucide-react";
import StudentRouteBreadcrumb from "../components/StudentRouteBreadcrumb";
import SelfStudy from "./SelfStudy";
import LearningProfile from "./LearningProfile";
import AiTutor from "./AiTutor";
import StudentKnowledgeMap from "./StudentKnowledgeMap";
import StudentResourceCenter from "./StudentResourceCenter";
import StudentKnowledgeBase from "./StudentKnowledgeBase";
import GeneratedPracticeWorkspace from "./GeneratedPracticeWorkspace";

const selfStudyTabs = [
  { path: "", label: "学习主页", icon: <BookOpen size={18} /> },
  { path: "profile", label: "个人画像", icon: <ChartNoAxesColumnIncreasing size={18} /> },
  { path: "knowledge-base", label: "知识库", icon: <Database size={18} /> },
  { path: "library", label: "资源中心", icon: <FolderOpen size={18} /> },
  { path: "knowledge-map", label: "知识图谱", icon: <Network size={18} /> },
  { path: "ai", label: "AI 助学", icon: <Bot size={18} /> }
];

function selfStudyPath(path = "") {
  return path ? `/self-study/${path}` : "/self-study";
}

export default function SelfStudyHub() {
  return (
    <SelfStudyShell>
      <Routes>
        <Route index element={<SelfStudy />} />
        <Route path="profile" element={<LearningProfile />} />
        <Route path="knowledge-base" element={<StudentKnowledgeBase />} />
        <Route path="library" element={<StudentResourceCenter />} />
        <Route path="library/practice/:resourceId" element={<GeneratedPracticeRoute />} />
        <Route path="resources" element={<Navigate to="/self-study/library" replace />} />
        <Route path="knowledge-map" element={<StudentKnowledgeMap scope="self-study" />} />
        <Route path="ai" element={<AiTutor />} />
        <Route path="*" element={<Navigate to="/self-study" replace />} />
      </Routes>
    </SelfStudyShell>
  );
}

function SelfStudyShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const activePath = location.pathname.replace(/^\/self-study\/?/, "");
  const activeTab = selfStudyTabs.find((item) => item.path === activePath || (item.path && activePath.startsWith(`${item.path}/`))) ?? selfStudyTabs[0];

  return (
    <div className={`student-work-window self-study-window${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside className="student-window-sidebar">
        <button className="student-window-back" type="button" onClick={() => navigate("/")} title="返回入口">
          <ArrowLeft size={17} />
          <span>返回入口</span>
        </button>
        <div className="student-window-title">
          <span className="teacher-soft-icon green"><RouteIcon size={22} /></span>
          <div>
            <strong>自主学习</strong>
            <small>个人学习空间 · 资源检索与 AI 助学</small>
          </div>
        </div>
        <nav className="student-window-nav" aria-label="自主学习导航">
          {selfStudyTabs.map((item) => (
            <NavLink key={item.label} to={selfStudyPath(item.path)} end={item.path === ""} title={item.label}>
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="student-window-streak">
          <span><Flame size={17} /></span>
          <div>
            <strong>连续学习 7 天</strong>
            <small>很棒哦，保持学习节奏！</small>
          </div>
        </div>
        <button
          className="student-window-rail-toggle"
          type="button"
          onClick={() => setSidebarCollapsed((current) => !current)}
          aria-label={sidebarCollapsed ? "展开自主学习导航" : "收起自主学习导航"}
          title={sidebarCollapsed ? "展开导航" : "收起导航"}
        >
          <span className="student-window-grip" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {sidebarCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </aside>
      <main className="student-window-content">
        {activePath ? (
          <StudentRouteBreadcrumb
            items={[
              { label: "学习入口", to: "/" },
              { label: "自主学习", to: "/self-study" },
              { label: activeTab.label }
            ]}
          />
        ) : null}
        {children}
      </main>
    </div>
  );
}

function GeneratedPracticeRoute() {
  const navigate = useNavigate();
  const { resourceId } = useParams<{ resourceId: string }>();
  if (!resourceId) return <Navigate to="/self-study/library" replace />;
  return <GeneratedPracticeWorkspace resourceId={resourceId} onBack={() => navigate("/self-study/library")} />;
}
