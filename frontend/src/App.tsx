import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import LearningHome from "./pages/LearningHome";
import StudentEntryPortal from "./pages/StudentEntryPortal";
import CourseHub from "./pages/CourseHub";
import CourseTasks from "./pages/CourseTasks";
import TaskWorkspace from "./pages/TaskWorkspace";
import QuestionWorkspace from "./pages/QuestionWorkspace";
import SelfStudyHub from "./pages/SelfStudyHub";
import ProjectPractice from "./pages/ProjectPractice";
import LoginPage from "./pages/LoginPage";
import AICompanion from "./components/AICompanion";
import AccountMenu from "./components/AccountMenu";
import AdminApp from "./admin/App";
import TeacherDevelopApp from "./teacherDevelop/exact/ExactApp";
import { setCurrentUser as setTeacherDevelopUser } from "./teacherDevelop/api";
import { api, apiCache } from "./api";
import { clearAccessToken, getAccessToken, type AuthUser } from "./authSession";

export type TaskOpenTarget = {
  taskId?: string;
  assignmentId?: string;
  courseId?: string;
  workspaceType?: string;
  taskType?: string;
};

const routeOrder = ["/", "/courses", "/workspace", "/question-workspace", "/self-study", "/project-practice"];
const APP_FONT_FAMILY =
  "'Inter Variable', 'MiSans', 'HarmonyOS Sans SC', 'PingFang SC', 'Noto Sans SC Variable', 'Noto Sans SC', 'Microsoft YaHei', system-ui, sans-serif";

function routeGroup(pathname: string) {
  if (pathname.startsWith("/workspace")) return "/workspace";
  if (pathname.startsWith("/question-workspace")) return "/question-workspace";
  if (pathname.startsWith("/courses")) return "/courses";
  if (pathname.startsWith("/tasks")) return "/tasks";
  if (pathname.startsWith("/self-study")) return "/self-study";
  if (pathname.startsWith("/project-practice")) return "/project-practice";
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

function homePathForRole(role: string) {
  if (role === "TEACHER") return "/teacher";
  if (role === "STUDENT") return "/";
  return "/unauthorized";
}

function StudentAppTopbar({
  authUser,
  onLogout,
  onNavigate,
  centerSlot
}: {
  authUser: AuthUser;
  onLogout: () => void;
  onNavigate: (path: string) => void;
  centerSlot?: ReactNode;
}) {
  return (
    <header className="student-app-topbar">
      <button className="student-app-brand" type="button" onClick={() => onNavigate("/")} aria-label="返回 CodeTrack 学生端入口">
        <span className="student-app-logo-mark" aria-hidden="true" />
        <span>
          <strong>CodeTrack</strong>
          <small>学生助学空间</small>
        </span>
      </button>
      {centerSlot}
      <AccountMenu authUser={authUser} onLogout={onLogout} onNavigate={onNavigate} />
    </header>
  );
}

function StudentAppContent({ authUser, onLogout }: { authUser: AuthUser; onLogout: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isWorkspace = location.pathname.startsWith("/workspace") || location.pathname.startsWith("/question-workspace");
  const activeRouteGroup = routeGroup(location.pathname);

  function transitionTo(to: string, state?: unknown) {
    if (to === location.pathname) return;

    const motion = routeMotion(location.pathname, to);
    document.documentElement.dataset.routeMotion = motion;
    navigate(to, state === undefined ? undefined : { state });
  }

  function openTask(target: TaskOpenTarget | string | undefined) {
    if (typeof target === "string" || !target) {
      transitionTo(`/workspace/${target ?? "task_linked_list_delete_001"}`);
      return;
    }
    if (target.workspaceType === "QUESTION_SET" || target.taskType === "QUIZ" || target.taskType === "EXAM") {
      transitionTo(`/question-workspace/${target.assignmentId}`, target.courseId ? { fromCourseId: target.courseId } : undefined);
      return;
    }
    const query = target.assignmentId ? `?assignment_id=${encodeURIComponent(target.assignmentId)}` : "";
    transitionTo(`/workspace/${target.taskId ?? "task_linked_list_delete_001"}${query}`, target.courseId ? { fromCourseId: target.courseId } : undefined);
  }

  const workspaceState = location.state as { fromCourseId?: string; fromPath?: string } | null;
  const workspaceBackPath = workspaceState?.fromPath ?? (workspaceState?.fromCourseId ? `/courses/${workspaceState.fromCourseId}/tasks` : "/");

  function handleNavigate(page: string) {
    const aliases: Record<string, string> = {
      selfStudy: "/self-study",
      aiTutor: "/self-study/ai",
      library: "/self-study/library",
      tasks: "/courses",
      profile: "/self-study/profile",
      projectPractice: "/project-practice"
    };
    transitionTo(aliases[page] ?? page);
  }

  if (isWorkspace) {
    return (
      <>
        <div className="workspace-route-stage" key={location.pathname}>
          <Routes location={location}>
            <Route path="/workspace/:taskId" element={<TaskWorkspaceWrapper onBack={() => transitionTo(workspaceBackPath)} />} />
            <Route path="/question-workspace/:assignmentId" element={<QuestionWorkspaceWrapper onBack={() => transitionTo(workspaceBackPath)} />} />
          </Routes>
        </div>
        <AICompanion routePath={location.pathname} routeGroup={activeRouteGroup} />
      </>
    );
  }

  if (location.pathname === "/" || location.pathname === "") {
    return <StudentEntryPortal authUser={authUser} accountSlot={<AccountMenu authUser={authUser} onLogout={onLogout} onNavigate={transitionTo} />} />;
  }

  return (
    <>
      <div className="student-direct-window" data-route={activeRouteGroup}>
        <StudentAppTopbar
          authUser={authUser}
          onLogout={onLogout}
          onNavigate={transitionTo}
          centerSlot={activeRouteGroup === "/project-practice" ? (
            <nav className="project-practice-top-tabs" aria-label="科研项目实践页面导航">
              <button type="button" className={location.pathname === "/project-practice" ? "active" : ""} onClick={() => transitionTo("/project-practice")}>
                助研首页
              </button>
              <button
                type="button"
                className={location.pathname.startsWith("/project-practice/projects") ? "active" : ""}
                onClick={() => transitionTo(location.pathname.startsWith("/project-practice/projects") ? location.pathname : "/project-practice")}
              >
                课题工作台
              </button>
            </nav>
          ) : undefined}
        />
        <div className="route-stage" key={activeRouteGroup}>
          <Routes location={location}>
            <Route path="/learning-home" element={<LearningHome onNavigate={handleNavigate} onOpenWorkspace={openTask} />} />
            <Route path="/courses" element={<Navigate to="/" replace />} />
            <Route path="/courses/:courseId/*" element={<CourseHub onOpenWorkspace={openTask} />} />
            <Route path="/tasks" element={<Navigate to="/courses" replace />} />
            <Route path="/tasks-legacy" element={<CourseTasks onOpenWorkspace={openTask} />} />
            <Route path="/workspace/:taskId" element={<TaskWorkspaceWrapper onBack={() => transitionTo(workspaceBackPath)} />} />
            <Route path="/question-workspace/:assignmentId" element={<QuestionWorkspaceWrapper onBack={() => transitionTo(workspaceBackPath)} />} />
            <Route path="/self-study/*" element={<SelfStudyHub />} />
            <Route path="/project-practice" element={<ProjectPractice />} />
            <Route path="/project-practice/projects/:projectId" element={<ProjectPractice />} />
            <Route path="/ai-tutor" element={<Navigate to="/self-study/ai" replace />} />
            <Route path="/library" element={<Navigate to="/self-study/library" replace />} />
            <Route path="/profile" element={<Navigate to="/self-study/profile" replace />} />
          </Routes>
        </div>
      </div>
      <AICompanion routePath={location.pathname} routeGroup={activeRouteGroup} />
    </>
  );
}

function TeacherDevelopRoute({ authUser, onLogout }: { authUser: AuthUser; onLogout: () => void }) {
  useEffect(() => {
    const teacherBackendId = authUser.id === "user_teacher_001" || authUser.username === "teacher_wang"
      ? "teacher-01"
      : authUser.id === "user_teacher_002" || authUser.username === "teacher_li"
        ? "teacher-02"
        : authUser.id;
    setTeacherDevelopUser(teacherBackendId, authUser.display_name || "王老师");
  }, [authUser.display_name, authUser.id, authUser.username]);

  return (
    <TeacherDevelopApp
      authUser={authUser}
      loggedIn
      onLogin={(userId, name) => setTeacherDevelopUser(userId, name)}
      onLogout={onLogout}
    />
  );
}

function TaskWorkspaceWrapper({ onBack }: { onBack: () => void }) {
  const { taskId } = useParams<{ taskId: string }>();
  const [searchParams] = useSearchParams();
  if (!taskId) {
    return (
      <div className="page-grid">
        <p>缺少任务 ID</p>
      </div>
    );
  }
  return <TaskWorkspace taskId={taskId} assignmentId={searchParams.get("assignment_id") ?? undefined} onBack={onBack} />;
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
          fontFamily: APP_FONT_FAMILY
        }
      }}
    >
      {checkingAuth ? (
        <div className="auth-loading">正在恢复登录状态...</div>
      ) : (
        <Routes>
          <Route path="admin/*" element={<AdminApp />} />
          <Route
            path="/login"
            element={authUser ? <Navigate to={homePathForRole(authUser.role)} replace /> : <LoginPage onLogin={(user) => setAuthUser(user)} />}
          />
          <Route
            path="/teacher/*"
            element={authUser?.role === "TEACHER" ? <TeacherDevelopRoute authUser={authUser} onLogout={handleLogout} /> : <Navigate to={authUser ? homePathForRole(authUser.role) : "/login"} replace />}
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
