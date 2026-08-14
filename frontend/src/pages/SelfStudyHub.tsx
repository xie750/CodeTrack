import { type ReactNode } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Bot, BookOpen, ChartNoAxesColumnIncreasing, Database, FolderOpen, Network, Route as RouteIcon } from "lucide-react";
import StudentRouteBreadcrumb from "../components/StudentRouteBreadcrumb";
import SelfStudy from "./SelfStudy";
import LearningProfile from "./LearningProfile";
import AiTutor from "./AiTutor";
import StudentKnowledgeMap from "./StudentKnowledgeMap";
import StudentResourceCenter from "./StudentResourceCenter";
import StudentKnowledgeBase from "./StudentKnowledgeBase";

const selfStudyTabs = [
  { path: "", label: "学习主页", icon: <BookOpen size={18} /> },
  { path: "profile", label: "个人画像", icon: <ChartNoAxesColumnIncreasing size={18} /> },
  { path: "knowledge-base", label: "知识库", icon: <Database size={18} /> },
  { path: "library", label: "资源中心", icon: <FolderOpen size={18} /> },
  { path: "knowledge-map", label: "知识图谱", icon: <Network size={18} /> },
  { path: "ai", label: "AI 助手", icon: <Bot size={18} /> }
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
  const activePath = location.pathname.replace(/^\/self-study\/?/, "");
  const activeTab = selfStudyTabs.find((item) => item.path === activePath) ?? selfStudyTabs[0];

  return (
    <div className="student-work-window self-study-window">
      <aside className="student-window-sidebar">
        <button className="student-window-back" type="button" onClick={() => navigate("/")}>
          <ArrowLeft size={17} />
          返回入口
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
            <NavLink key={item.label} to={selfStudyPath(item.path)} end={item.path === ""}>
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="student-window-content">
        <StudentRouteBreadcrumb
          items={[
            { label: "学习入口", to: "/" },
            { label: "自主学习", to: "/self-study" },
            { label: activeTab.label }
          ]}
        />
        {children}
      </main>
    </div>
  );
}
