import type { MouseEvent } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { Bell, BookOpen, ChartNoAxesColumnIncreasing, ChevronDown, ChevronsLeft, ClipboardList, House, Search, Star } from "lucide-react";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import LearningHome from "./pages/LearningHome";
import CourseTasks from "./pages/CourseTasks";
import TaskWorkspace from "./pages/TaskWorkspace";
import SelfStudy from "./pages/SelfStudy";
import AiTutor from "./pages/AiTutor";
import LearningLibrary from "./pages/LearningLibrary";
import LearningProfile from "./pages/LearningProfile";
import logoImg from "./assets/ui-home/logo-img.png";
import avatarImg from "./assets/ui-home/avatar.png";
import { profileSummary } from "./data/constants";

const navItems = [
  { key: "/", label: "学习首页", icon: <House size={22} strokeWidth={2.4} /> },
  { key: "/tasks", label: "班级任务", icon: <ClipboardList size={22} strokeWidth={2.1} /> },
  { key: "/library", label: "收藏夹", icon: <Star size={22} strokeWidth={2.1} /> },
  { key: "/profile", label: "学习画像", icon: <ChartNoAxesColumnIncreasing size={22} strokeWidth={2.1} /> }
];

const routeOrder = ["/", "/tasks", "/workspace", "/self-study", "/ai-tutor", "/library", "/profile"];

function selectedKey(pathname: string) {
  if (pathname.startsWith("/workspace")) return "/tasks";
  if (pathname.startsWith("/tasks")) return "/tasks";
  if (pathname.startsWith("/library")) return "/library";
  if (pathname.startsWith("/profile")) return "/profile";
  return "/";
}

function routeGroup(pathname: string) {
  if (pathname.startsWith("/workspace")) return "/workspace";
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
  if (routeGroup(to) === "/workspace") return "deeper";
  if (routeGroup(from) === "/workspace") return "back";
  if (fromIndex === toIndex) return "replace";
  return toIndex > fromIndex ? "forward" : "back";
}

function shouldUseNativeNavigation(event: MouseEvent<HTMLAnchorElement>) {
  return event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey;
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeKey = selectedKey(location.pathname);
  const isWorkspace = location.pathname.startsWith("/workspace");
  const activeRouteGroup = routeGroup(location.pathname);

  function transitionTo(to: string) {
    if (to === location.pathname) return;

    const motion = routeMotion(location.pathname, to);
    document.documentElement.dataset.routeMotion = motion;
    navigate(to);
  }

  function openWorkspace(id?: string) {
    transitionTo(`/workspace/${id ?? "task_linked_list_delete_001"}`);
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
        </Routes>
      </div>
    );
  }

  return (
    <div className="replica-shell">
      <header className="replica-topbar">
        <NavLink to="/" className="logo-link" aria-label="返回学习首页" onClick={(event) => handleNavClick(event, "/")}>
          <img className="logo-img" src={logoImg} alt="CodeTrack" />
        </NavLink>
        <div className="top-actions" aria-label="顶部工具栏">
          <button className="top-icon" type="button" aria-label="搜索">
            <Search size={26} strokeWidth={2.1} />
          </button>
          <button className="top-icon notification" type="button" aria-label="通知">
            <Bell size={25} strokeWidth={2.1} />
            <span className="notification-badge">3</span>
          </button>
          <div className="top-user">
            <img className="avatar" src={avatarImg} alt={profileSummary.studentName} />
            <strong>{profileSummary.studentName}</strong>
            <ChevronDown size={18} />
          </div>
        </div>
      </header>

      <div className="replica-app">
        <aside className="replica-sidebar">
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
          <button className="collapse-btn" type="button">
            <ChevronsLeft size={18} />
            收起侧栏
          </button>
        </aside>

        <main className="app-content" data-route={activeRouteGroup}>
          <div className="route-stage" key={activeRouteGroup}>
            <Routes location={location}>
            <Route path="/" element={<LearningHome onNavigate={handleNavigate} onOpenWorkspace={openWorkspace} />} />
            <Route path="/tasks" element={<CourseTasks onOpenWorkspace={openWorkspace} />} />
            <Route path="/workspace/:taskId" element={<TaskWorkspaceWrapper onBack={() => transitionTo("/tasks")} />} />
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

export default function App() {
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
      <AppContent />
    </ConfigProvider>
  );
}
