import { useEffect, useState, type MouseEvent } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { Activity, Bell, BookOpen, ChartNoAxesColumnIncreasing, ChevronDown, ChevronsLeft, ChevronsRight, ClipboardList, FolderOpen, House, LayoutDashboard, LogOut, Search, Settings, ShieldCheck, Star, TrendingUp, UserRound } from "lucide-react";
import { ConfigProvider, Dropdown, type MenuProps } from "antd";
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
import AICompanion from "./components/AICompanion";
import Dashboard from "./teacher/pages/Dashboard";
import CourseClasses from "./teacher/pages/courses/CourseClasses";
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
import GradingWorkspace from "./teacher/pages/GradingWorkspace";
import DiagnosisSummary from "./teacher/pages/DiagnosisSummary";
import AiReviewList from "./teacher/pages/aiReview/AiReviewList";
import AiReviewDetail from "./teacher/pages/aiReview/AiReviewDetail";
import StrategyOptimization from "./teacher/pages/improvement/StrategyOptimization";
import TaskAdjustment from "./teacher/pages/improvement/TaskAdjustment";
import EffectEvaluation from "./teacher/pages/improvement/EffectEvaluation";
import { TeacherEntryPortal, TeacherResearchShowcase } from "./teacher/pages/TeacherPortal";
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
  if (role === "TEACHER") return "/teacher";
  if (role === "STUDENT") return "/";
  return "/unauthorized";
}

function avatarInitial(user: AuthUser) {
  const source = (user.display_name || user.username || "").trim();
  const [firstChar] = Array.from(source);
  return firstChar?.toLocaleUpperCase("zh-CN") ?? "用";
}

function AccountMenu({
  authUser,
  onLogout,
  onNavigate
}: {
  authUser: AuthUser;
  onLogout: () => void;
  onNavigate: (path: string) => void;
}) {
  const roleLabel = authUser.role === "STUDENT" ? "学生账号" : authUser.role === "TEACHER" ? "教师账号" : "账号";
  const isStudent = authUser.role === "STUDENT";
  const menuItems: MenuProps["items"] = isStudent
    ? [
        { key: "/profile", label: "学习者画像", icon: <ChartNoAxesColumnIncreasing size={16} strokeWidth={2.2} /> },
        { key: "/library", label: "我的资料", icon: <FolderOpen size={16} strokeWidth={2.2} /> },
        { key: "account", label: "账号信息", icon: <UserRound size={16} strokeWidth={2.2} />, disabled: true },
        { type: "divider" },
        { key: "logout", label: "退出登录", icon: <LogOut size={16} strokeWidth={2.2} />, danger: true }
      ]
    : [
        { key: "/teacher/dashboard", label: "教学首页", icon: <LayoutDashboard size={16} strokeWidth={2.2} /> },
        { key: "/teacher/resources", label: "资料中心", icon: <FolderOpen size={16} strokeWidth={2.2} /> },
        { key: "account", label: "账号信息", icon: <UserRound size={16} strokeWidth={2.2} />, disabled: true },
        { type: "divider" },
        { key: "logout", label: "退出登录", icon: <LogOut size={16} strokeWidth={2.2} />, danger: true }
      ];

  function handleMenuClick({ key }: { key: string }) {
    if (key === "logout") {
      onLogout();
      return;
    }
    if (key.startsWith("/")) onNavigate(key);
  }

  return (
    <Dropdown menu={{ items: menuItems, onClick: handleMenuClick }} trigger={["click"]} placement="bottomRight" overlayClassName="account-dropdown-overlay">
      <button type="button" className="top-user account-trigger" aria-label={`${authUser.display_name}账号菜单`}>
        <span className="account-avatar" aria-hidden="true">{avatarInitial(authUser)}</span>
        <span className="account-trigger-copy">
          <strong>{authUser.display_name}</strong>
          <small>{roleLabel}</small>
        </span>
        <ChevronDown className="account-chevron" size={16} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </Dropdown>
  );
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
      <>
        <div className="workspace-route-stage" key={location.pathname}>
          <Routes location={location}>
            <Route path="/workspace/:taskId" element={<TaskWorkspaceWrapper onBack={() => transitionTo("/tasks")} />} />
            <Route path="/question-workspace/:assignmentId" element={<QuestionWorkspaceWrapper onBack={() => transitionTo("/tasks")} />} />
          </Routes>
        </div>
        <AICompanion routePath={location.pathname} routeGroup={activeRouteGroup} />
      </>
    );
  }

  return (
    <>
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
            <AccountMenu authUser={authUser} onLogout={onLogout} onNavigate={transitionTo} />
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
      <AICompanion routePath={location.pathname} routeGroup={activeRouteGroup} />
    </>
  );
}

const teacherNavItems = [
  { key: "/teacher/dashboard", label: "工作台首页", icon: <House size={22} strokeWidth={2.2} /> },
  { key: "/teacher/courses", label: "我的课程", icon: <BookOpen size={22} strokeWidth={2.1} /> },
  { key: "/teacher/settings", label: "个人设置", icon: <Settings size={22} strokeWidth={2.1} /> },
];

function TeacherAppContent({ authUser, onLogout }: { authUser: AuthUser; onLogout: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  function handleNavClick(event: MouseEvent<HTMLAnchorElement>, to: string) {
    if (shouldUseNativeNavigation(event)) return;
    event.preventDefault();
    navigate(to);
  }

  if (location.pathname === "/teacher" || location.pathname === "/teacher/") {
    return <TeacherEntryPortal authUser={authUser} accountSlot={<AccountMenu authUser={authUser} onLogout={onLogout} onNavigate={navigate} />} />;
  }

  if (location.pathname === "/teacher/research") {
    return <TeacherResearchShowcase authUser={authUser} accountSlot={<AccountMenu authUser={authUser} onLogout={onLogout} onNavigate={navigate} />} />;
  }

  return (
    <div className="teacher-workbench-shell">
      <header className="teacher-workbench-topbar">
        <NavLink to="/teacher" className="teacher-workbench-logo" aria-label="返回教师端入口" onClick={(event) => handleNavClick(event, "/teacher")}>
          <span className="teacher-workbench-logo-mark" aria-hidden="true" />
          <strong>CodeTrack Teacher</strong>
        </NavLink>
        <div className="teacher-workbench-actions" aria-label="教师端顶部工具栏">
          <span className="teacher-workbench-status">
            <i aria-hidden="true" />
            课程知识库已连接
          </span>
          <button className="teacher-notification" type="button" aria-label="通知">
            <Bell size={22} strokeWidth={2} />
            <span>3</span>
          </button>
          <AccountMenu authUser={authUser} onLogout={onLogout} onNavigate={navigate} />
        </div>
      </header>

      <div className={`teacher-workbench-app${sidebarCollapsed ? " collapsed" : ""}`}>
        <aside className={`teacher-workbench-sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
          <nav className="teacher-workbench-nav" aria-label="教师工作台导航">
            {teacherNavItems.map((item) => (
              <NavLink
                key={item.key}
                to={item.key}
                end={item.key === "/teacher/dashboard"}
                className={({ isActive }) => isActive ? "teacher-workbench-nav-link active" : "teacher-workbench-nav-link"}
                onClick={(event) => handleNavClick(event, item.key)}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <button className="teacher-ai-entry" type="button">
            <span aria-hidden="true">AI</span>
            <strong>AI 助教</strong>
            <small>智能备课与答疑</small>
            <ChevronDown size={18} strokeWidth={2.2} />
          </button>
          <button className="collapse-btn teacher-collapse" type="button" onClick={() => setSidebarCollapsed((prev) => !prev)}>
            {sidebarCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
            {sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
          </button>
        </aside>

        {sidebarCollapsed && (
          <button className="sidebar-expand-float" type="button" onClick={() => setSidebarCollapsed(false)} aria-label="展开侧栏">
            <ChevronsRight size={20} />
          </button>
        )}

        <main className="teacher-workbench-content">
          {/*
            注意：外层是 <Route path="/teacher/*">，这里属于 descendant routes，
            路径必须相对于 /teacher 书写。写成 /teacher/xxx 会导致全部不匹配、内容区空白。
          */}
          <Routes>
            <Route index element={<Navigate to="dashboard" replace />} />

            {/* 模块一 教学首页 */}
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="settings" element={<TeacherSettingsPlaceholder />} />

            {/* 模块二 课程教学 */}
            <Route path="courses" element={<CourseClasses />} />
            <Route path="courses/syllabus" element={<CourseSyllabus />} />
            {/*
              旧路径保留重定向：课程大纲改用页内课程选择器（与资料中心、任务监控一致），
              不再用 :courseId 路径参数。`courses/:courseId` 原来渲染的还是列表本身、
              组件也从不读 useParams，是条死链，一并收敛到模块根页。
            */}
            <Route path="courses/:courseId/syllabus" element={<Navigate to="/teacher/courses/syllabus" replace />} />
            <Route path="courses/:courseId" element={<Navigate to="/teacher/courses" replace />} />

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
            {/*
              带 taskId 的深链落到同一个看板，由页面把该任务预选中。
              §9.1 的看板本身就带任务选择器，另开一个只看单任务的页面会变成第二套口径。
            */}
            <Route path="monitor/tasks/:taskId" element={<MonitorHome />} />
            <Route path="submissions/:submissionId/grade" element={<GradingWorkspace />} />
            {/* 旧路径保留重定向，避免历史链接失效 */}
            <Route path="tasks/:taskId/monitor" element={<TaskMonitorRedirect />} />

            {/* 模块六 学情诊断 */}
            <Route path="diagnosis" element={<DiagnosisSummary />} />

            {/* 模块七 AI 审核 */}
            <Route path="ai-review" element={<AiReviewList />} />
            <Route path="ai-review/:reviewId" element={<AiReviewDetail />} />

            {/* 模块八 教学改进。三个子页各自一条路由，刷新和直接输网址都能落到对应子页 */}
            <Route path="improvement" element={<StrategyOptimization />} />
            <Route path="improvement/adjustment" element={<TaskAdjustment />} />
            <Route path="improvement/effect" element={<EffectEvaluation />} />

            <Route path="*" element={<Navigate to="dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function TeacherSettingsPlaceholder() {
  return (
    <section className="teacher-settings-placeholder">
      <span><Settings size={30} strokeWidth={2.1} /></span>
      <h1>个人设置</h1>
      <p>个人设置页面暂未开放，当前先保留入口，后续可接入账号资料、通知偏好和课程知识库连接配置。</p>
    </section>
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
