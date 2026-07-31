import { useEffect, useState, type MouseEvent } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { Activity, Bell, BookOpen, ChartNoAxesColumnIncreasing, ChevronsLeft, ChevronsRight, ClipboardList, FolderOpen, House, LayoutDashboard, LogOut, Search, ShieldCheck, Star, TrendingUp } from "lucide-react";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import LearningHome from "./pages/LearningHome";
import CourseTasks from "./pages/CourseTasks";
import TaskWorkspace from "./pages/TaskWorkspace";
import QuestionWorkspace from "./pages/QuestionWorkspace";
import SelfStudy from "./pages/SelfStudy";
import AiTutor from "./pages/AiTutor";
import LearningLibrary from "./pages/LearningLibrary";
import LearningProfile from "./pages/LearningProfile";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./teacher/pages/Dashboard";
import CourseList from "./teacher/pages/CourseList";
import CourseSyllabus from "./teacher/pages/courses/CourseSyllabus";
import ResourceCenter from "./teacher/pages/resources/ResourceCenter";
import TaskList from "./teacher/pages/tasks/TaskList";
import TaskCreate from "./teacher/pages/tasks/TaskCreate";
import QuestionEditor from "./teacher/pages/tasks/QuestionEditor";
import ProgrammingEditor from "./teacher/pages/tasks/ProgrammingEditor";
import GradingHintConfig from "./teacher/pages/tasks/GradingHintConfig";
import TaskPublish from "./teacher/pages/tasks/TaskPublish";
import MonitorHome from "./teacher/pages/monitor/MonitorHome";
import GradingProgress from "./teacher/pages/monitor/GradingProgress";
import TaskQuality from "./teacher/pages/monitor/TaskQuality";
import TaskMonitor from "./teacher/pages/TaskMonitor";
import GradingWorkspace from "./teacher/pages/GradingWorkspace";
import DiagnosisSummary from "./teacher/pages/DiagnosisSummary";
import AiReviewList from "./teacher/pages/aiReview/AiReviewList";
import AiReviewDetail from "./teacher/pages/aiReview/AiReviewDetail";
import TeachingImprovement from "./teacher/pages/improvement/TeachingImprovement";
import avatarImg from "./assets/ui-home/avatar.png";
import { api, apiCache } from "./api";
import { clearAccessToken, getAccessToken, type AuthUser } from "./authSession";

const navItems = [
  { key: "/", label: "学习首页", icon: <House size={22} strokeWidth={2.4} /> },
  { key: "/tasks", label: "班级任务", icon: <ClipboardList size={22} strokeWidth={2.1} /> },
  { key: "/library", label: "收藏夹", icon: <Star size={22} strokeWidth={2.1} /> },
  { key: "/profile", label: "学习画像", icon: <ChartNoAxesColumnIncreasing size={22} strokeWidth={2.1} /> }
];

export type TaskOpenTarget = {
  taskId?: string;
  assignmentId?: string;
  workspaceType?: string;
  taskType?: string;
};

const routeOrder = ["/", "/tasks", "/workspace", "/question-workspace", "/self-study", "/ai-tutor", "/library", "/profile"];

function selectedKey(pathname: string) {
  if (pathname.startsWith("/workspace")) return "/tasks";
  if (pathname.startsWith("/question-workspace")) return "/tasks";
  if (pathname.startsWith("/tasks")) return "/tasks";
  if (pathname.startsWith("/library")) return "/library";
  if (pathname.startsWith("/profile")) return "/profile";
  return "/";
}

function routeGroup(pathname: string) {
  if (pathname.startsWith("/workspace")) return "/workspace";
  if (pathname.startsWith("/question-workspace")) return "/question-workspace";
  if (pathname.startsWith("/tasks")) return "/tasks";
  if (pathname.startsWith("/self-study")) return "/self-study";
  if (pathname.startsWith("/ai-tutor")) return "/ai-tutor";
  if (pathname.startsWith("/library")) return "/library";
  if (pathname.startsWith("/profile")) return "/profile";
  return "/";
}

function routeMotion(from: string, to: string) {
  const fromIndex = routeOrder.indexOf(routeGroup(from));
  const toIndex = routeOrder.indexOf(routeGroup(to));
  if (routeGroup(to) === "/workspace" || routeGroup(to) === "/question-workspace") return "deeper";
  if (routeGroup(from) === "/workspace" || routeGroup(from) === "/question-workspace") return "back";
  if (fromIndex === toIndex) return "replace";
  return toIndex > fromIndex ? "forward" : "back";
}

function shouldUseNativeNavigation(event: MouseEvent<HTMLAnchorElement>) {
  return event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey;
}

function homePathForRole(role: string) {
  if (role === "TEACHER") return "/teacher/dashboard";
  if (role === "STUDENT") return "/";
  return "/unauthorized";
}

function StudentAppContent({ authUser, onLogout }: { authUser: AuthUser; onLogout: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const activeKey = selectedKey(location.pathname);
  const isWorkspace = location.pathname.startsWith("/workspace") || location.pathname.startsWith("/question-workspace");
  const activeRouteGroup = routeGroup(location.pathname);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  function transitionTo(to: string) {
    if (to === location.pathname) return;

    const motion = routeMotion(location.pathname, to);
    document.documentElement.dataset.routeMotion = motion;
    navigate(to);
  }

  function openTask(target: TaskOpenTarget | string | undefined) {
    if (typeof target === "string" || !target) {
      transitionTo(`/workspace/${target ?? "task_linked_list_delete_001"}`);
      return;
    }
    if (target.workspaceType === "QUESTION_SET" || target.taskType === "QUIZ" || target.taskType === "EXAM") {
      transitionTo(`/question-workspace/${target.assignmentId}`);
      return;
    }
    transitionTo(`/workspace/${target.taskId ?? "task_linked_list_delete_001"}`);
  }

  function handleNavigate(page: string) {
    const aliases: Record<string, string> = {
      selfStudy: "/self-study",
      aiTutor: "/ai-tutor",
      library: "/library",
      tasks: "/tasks",
      profile: "/profile"
    };
    transitionTo(aliases[page] ?? page);
  }

  function handleNavClick(event: MouseEvent<HTMLAnchorElement>, to: string) {
    if (shouldUseNativeNavigation(event)) return;
    event.preventDefault();
    transitionTo(to);
  }

  if (isWorkspace) {
    return (
      <div className="workspace-route-stage" key={location.pathname}>
        <Routes location={location}>
          <Route path="/workspace/:taskId" element={<TaskWorkspaceWrapper onBack={() => transitionTo("/tasks")} />} />
          <Route path="/question-workspace/:assignmentId" element={<QuestionWorkspaceWrapper onBack={() => transitionTo("/tasks")} />} />
        </Routes>
      </div>
    );
  }

  return (
    <div className="replica-shell">
      <header className="replica-topbar">
        <NavLink to="/" className="logo-link" aria-label="返回学习首页" onClick={(event) => handleNavClick(event, "/")}>
          <span className="ct-brand-mark" aria-hidden="true" />
          <span className="ct-brand-word">
            Code<span>Track</span>
          </span>
        </NavLink>
        <div className="top-actions" aria-label="顶部工具栏">
          <button className="top-icon" type="button" aria-label="搜索">
            <Search size={26} strokeWidth={2.1} />
          </button>
          <button className="top-icon notification" type="button" aria-label="通知">
            <Bell size={25} strokeWidth={2.1} />
            <span className="notification-badge">3</span>
          </button>
          <div className="top-user authed-user">
            <img className="avatar" src={avatarImg} alt={authUser.display_name} />
            <span className="authed-user-copy">
              <strong>{authUser.display_name}</strong>
              <small>{authUser.role === "STUDENT" ? "学生账号" : "教师账号"}</small>
            </span>
            <button type="button" className="logout-btn" onClick={onLogout} aria-label="退出登录">
              <LogOut size={17} />
              退出
            </button>
          </div>
        </div>
      </header>

      <div className={`replica-app${sidebarCollapsed ? " collapsed" : ""}`}>
        <aside className={`replica-sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
          <nav className="replica-side-nav" aria-label="学生端导航">
            {navItems.map((item) => (
              <NavLink
                key={item.key}
                to={item.key}
                end={item.key === "/"}
                className={activeKey === item.key ? "side-link active" : "side-link"}
                onClick={(event) => handleNavClick(event, item.key)}
              >
                <span className="side-icon">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <button className="collapse-btn" type="button" onClick={() => setSidebarCollapsed((prev) => !prev)}>
            {sidebarCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
            {sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
          </button>
        </aside>

        {sidebarCollapsed && (
          <button className="sidebar-expand-float" type="button" onClick={() => setSidebarCollapsed(false)} aria-label="展开侧栏">
            <ChevronsRight size={20} />
          </button>
        )}

        <main className="app-content" data-route={activeRouteGroup}>
          <div className="route-stage" key={activeRouteGroup}>
            <Routes location={location}>
            <Route path="/" element={<LearningHome onNavigate={handleNavigate} onOpenWorkspace={openTask} />} />
            <Route path="/tasks" element={<CourseTasks onOpenWorkspace={openTask} />} />
            <Route path="/workspace/:taskId" element={<TaskWorkspaceWrapper onBack={() => transitionTo("/tasks")} />} />
            <Route path="/question-workspace/:assignmentId" element={<QuestionWorkspaceWrapper onBack={() => transitionTo("/tasks")} />} />
            <Route path="/self-study" element={<SelfStudy />} />
            <Route path="/ai-tutor" element={<AiTutor />} />
            <Route path="/library" element={<LearningLibrary />} />
            <Route path="/profile" element={<LearningProfile />} />
            </Routes>
          </div>
        </main>
      </div>

      <nav className="mobile-nav" aria-label="移动端导航">
        {navItems.map((item) => (
          <NavLink
            key={item.key}
            to={item.key}
            end={item.key === "/"}
            className={({ isActive }) => (isActive ? "active" : "")}
            onClick={(event) => handleNavClick(event, item.key)}
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
        <NavLink to="/self-study" onClick={(event) => handleNavClick(event, "/self-study")}>
          <BookOpen size={22} />
          <span>自学</span>
        </NavLink>
      </nav>
    </div>
  );
}

// 教师端导航，对应开发方案 §四 教师端总体导航的 8 个模块
const teacherNavItems = [
  { key: "/teacher/dashboard", label: "教学首页", icon: <LayoutDashboard size={22} strokeWidth={2.4} /> },
  { key: "/teacher/courses", label: "课程教学", icon: <BookOpen size={22} strokeWidth={2.1} /> },
  { key: "/teacher/resources", label: "资料中心", icon: <FolderOpen size={22} strokeWidth={2.1} /> },
  { key: "/teacher/tasks", label: "任务中心", icon: <ClipboardList size={22} strokeWidth={2.1} /> },
  { key: "/teacher/monitor", label: "任务监控", icon: <Activity size={22} strokeWidth={2.1} /> },
  { key: "/teacher/diagnosis", label: "学情诊断", icon: <ChartNoAxesColumnIncreasing size={22} strokeWidth={2.1} /> },
  { key: "/teacher/ai-review", label: "AI 审核", icon: <ShieldCheck size={22} strokeWidth={2.1} /> },
  { key: "/teacher/improvement", label: "教学改进", icon: <TrendingUp size={22} strokeWidth={2.1} /> },
];

function TeacherAppContent({ authUser, onLogout }: { authUser: AuthUser; onLogout: () => void }) {
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  function handleNavClick(event: MouseEvent<HTMLAnchorElement>, to: string) {
    if (shouldUseNativeNavigation(event)) return;
    event.preventDefault();
    navigate(to);
  }

  return (
    <div className="replica-shell">
      <header className="replica-topbar">
        <NavLink to="/" className="logo-link" aria-label="返回学习首页" onClick={(event) => handleNavClick(event, "/")}>
          <span className="ct-brand-mark" aria-hidden="true" />
          <span className="ct-brand-word">
            Code<span>Track</span>
          </span>
        </NavLink>
        <div className="top-actions" aria-label="顶部工具栏">
          <div className="top-user authed-user">
            <img className="avatar" src={avatarImg} alt={authUser.display_name} />
            <span className="authed-user-copy">
              <strong>{authUser.display_name}</strong>
              <small>教师账号</small>
            </span>
            <button type="button" className="logout-btn" onClick={onLogout} aria-label="退出登录">
              <LogOut size={17} />
              退出
            </button>
          </div>
        </div>
      </header>

      <div className={`replica-app${sidebarCollapsed ? " collapsed" : ""}`}>
        <aside className={`replica-sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
          <nav className="replica-side-nav" aria-label="教师端导航">
            {teacherNavItems.map((item) => (
              <NavLink
                key={item.key}
                to={item.key}
                end={item.key === "/teacher/dashboard"}
                className={({ isActive }) => isActive ? "side-link active" : "side-link"}
                onClick={(event) => handleNavClick(event, item.key)}
              >
                <span className="side-icon">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <button className="collapse-btn" type="button" onClick={() => setSidebarCollapsed((prev) => !prev)}>
            {sidebarCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
            {sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
          </button>
        </aside>

        {sidebarCollapsed && (
          <button className="sidebar-expand-float" type="button" onClick={() => setSidebarCollapsed(false)} aria-label="展开侧栏">
            <ChevronsRight size={20} />
          </button>
        )}

        <main className="app-content">
          {/*
            注意：外层是 <Route path="/teacher/*">，这里属于 descendant routes，
            路径必须相对于 /teacher 书写。写成 /teacher/xxx 会导致全部不匹配、内容区空白。
          */}
          <Routes>
            <Route index element={<Navigate to="dashboard" replace />} />

            {/* 模块一 教学首页 */}
            <Route path="dashboard" element={<Dashboard />} />

            {/* 模块二 课程教学 */}
            <Route path="courses" element={<CourseList />} />
            <Route path="courses/:courseId" element={<CourseList />} />
            <Route path="courses/:courseId/syllabus" element={<CourseSyllabus />} />

            {/* 模块三 资料中心 */}
            <Route path="resources" element={<ResourceCenter />} />

            {/* 模块四 任务中心 */}
            <Route path="tasks" element={<TaskList />} />
            <Route path="tasks/new" element={<TaskCreate />} />
            <Route path="tasks/:taskId/questions" element={<QuestionEditor />} />
            <Route path="tasks/:taskId/programming" element={<ProgrammingEditor />} />
            <Route path="tasks/:taskId/grading" element={<GradingHintConfig />} />
            <Route path="tasks/:taskId/publish" element={<TaskPublish />} />

            {/* 模块五 任务监控 */}
            <Route path="monitor" element={<MonitorHome />} />
            <Route path="monitor/grading" element={<GradingProgress />} />
            <Route path="monitor/quality" element={<TaskQuality />} />
            <Route path="monitor/tasks/:taskId" element={<TaskMonitor />} />
            <Route path="submissions/:submissionId/grade" element={<GradingWorkspace />} />
            {/* 旧路径保留重定向，避免历史链接失效 */}
            <Route path="tasks/:taskId/monitor" element={<TaskMonitorRedirect />} />

            {/* 模块六 学情诊断 */}
            <Route path="diagnosis" element={<DiagnosisSummary />} />

            {/* 模块七 AI 审核 */}
            <Route path="ai-review" element={<AiReviewList />} />
            <Route path="ai-review/:reviewId" element={<AiReviewDetail />} />

            {/* 模块八 教学改进 */}
            <Route path="improvement" element={<TeachingImprovement />} />

            <Route path="*" element={<Navigate to="dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

/** 任务监控旧路径 /teacher/tasks/:taskId/monitor 已迁到 /teacher/monitor/tasks/:taskId */
function TaskMonitorRedirect() {
  const { taskId } = useParams<{ taskId: string }>();
  return <Navigate to={taskId ? `/teacher/monitor/tasks/${taskId}` : "/teacher/monitor"} replace />;
}

function TaskWorkspaceWrapper({ onBack }: { onBack: () => void }) {
  const { taskId } = useParams<{ taskId: string }>();
  if (!taskId) {
    return (
      <div className="page-grid">
        <p>缺少任务 ID</p>
      </div>
    );
  }
  return <TaskWorkspace taskId={taskId} onBack={onBack} />;
}

function QuestionWorkspaceWrapper({ onBack }: { onBack: () => void }) {
  const { assignmentId } = useParams();
  if (!assignmentId) {
    return <Navigate to="/tasks" replace />;
  }
  return <QuestionWorkspace assignmentId={assignmentId} onBack={onBack} />;
}

export default function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let alive = true;
    const token = getAccessToken();
    if (!token) {
      setCheckingAuth(false);
      return;
    }
    api.me()
      .then((user) => {
        if (alive) setAuthUser(user);
      })
      .catch(() => {
        apiCache.clear();
        clearAccessToken();
        if (alive) setAuthUser(null);
      })
      .finally(() => {
        if (alive) setCheckingAuth(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  function handleLogout() {
    api.logout().catch(() => undefined);
    apiCache.clear();
    clearAccessToken();
    setAuthUser(null);
  }

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#176cf5",
          borderRadius: 8,
          fontFamily: "Inter, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif"
        }
      }}
    >
      {checkingAuth ? (
        <div className="auth-loading">正在恢复登录状态...</div>
      ) : (
        <Routes>
          <Route
            path="/login"
            element={authUser ? <Navigate to={homePathForRole(authUser.role)} replace /> : <LoginPage onLogin={(user) => setAuthUser(user)} />}
          />
          <Route
            path="/teacher/*"
            element={authUser?.role === "TEACHER" ? <TeacherAppContent authUser={authUser} onLogout={handleLogout} /> : <Navigate to={authUser ? homePathForRole(authUser.role) : "/login"} replace />}
          />
          <Route
            path="/*"
            element={authUser?.role === "STUDENT" ? <StudentAppContent authUser={authUser} onLogout={handleLogout} /> : <Navigate to={authUser ? homePathForRole(authUser.role) : "/login"} replace />}
          />
        </Routes>
      )}
    </ConfigProvider>
  );
}
