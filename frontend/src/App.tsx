import { useEffect, useState, type MouseEvent } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { Bell, BookOpen, ChartNoAxesColumnIncreasing, ChevronsLeft, ChevronsRight, ClipboardList, House, LogOut, Search, Star } from "lucide-react";
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

function AppContent({ authUser, onLogout }: { authUser: AuthUser; onLogout: () => void }) {
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
          {activeKey === "/profile" ? (
            <div className="profile-side-widgets" aria-label="学习画像侧栏摘要">
              <section>
                <div className="rank-mascot">码</div>
                <div>
                  <span>当前段位</span>
                  <strong>探索者 I</strong>
                  <div className="side-stars"><Star size={13} fill="currentColor" /><Star size={13} fill="currentColor" /><Star size={13} /><Star size={13} /><Star size={13} /></div>
                </div>
                <div className="side-meter"><b style={{ width: "40%" }} /></div>
                <em>320 / 800</em>
              </section>
              <section>
                <span>连续学习天数</span>
                <strong className="streak">21 <small>天</small></strong>
                <em>已连续学习</em>
                <div className="week-dots">{["一", "二", "三", "四", "五", "六", "日"].map((day, index) => <i className={index < 6 ? "done" : ""} key={day}>{day}</i>)}</div>
                <a href="#">查看学习日历</a>
              </section>
            </div>
          ) : null}
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
    </div >
  );
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
            element={authUser ? <Navigate to="/" replace /> : <LoginPage onLogin={(user) => setAuthUser(user)} />}
          />
          <Route
            path="/*"
            element={authUser ? <AppContent authUser={authUser} onLogout={handleLogout} /> : <Navigate to="/login" replace />}
          />
        </Routes>
      )}
    </ConfigProvider>
  );
}
