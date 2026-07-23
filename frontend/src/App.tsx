import { NavLink, useNavigate } from "react-router-dom";
import {
  Bot,
  GraduationCap,
  Library,
  Map,
  Search
} from "lucide-react";
import { ConfigProvider, Layout, Menu, Progress, Typography } from "antd";
import zhCN from "antd/locale/zh_CN";
import {
  Route,
  Routes,
  useParams
} from "react-router-dom";
import LearningHome from "./pages/LearningHome";
import CourseTasks from "./pages/CourseTasks";
import TaskWorkspace from "./pages/TaskWorkspace";
import SelfStudy from "./pages/SelfStudy";
import AiTutor from "./pages/AiTutor";
import LearningLibrary from "./pages/LearningLibrary";
import {
  profileSummary
} from "./data/constants";

const { Sider, Header, Content } = Layout;
const { Text, Title } = Typography;

const navItems = [
  { key: "/", label: "学习首页", icon: <GraduationCap size={18} /> },
  { key: "/tasks", label: "课程任务", icon: <Search size={18} /> },
  { key: "/self-study", label: "自主学习", icon: <Map size={18} /> },
  { key: "/ai-tutor", label: "AI 助学", icon: <Bot size={18} /> },
  { key: "/library", label: "我的资料", icon: <Library size={18} /> }
];

function getPageTitle(pathname: string): string {
  if (pathname.startsWith("/workspace")) return "任务工作台";
  return navItems.find((item) => item.key === pathname)?.label ?? "";
}

function AppContent() {
  const navigate = useNavigate();
  const { taskId } = useParams<{ taskId: string }>();

  function openWorkspace(id?: string) {
    navigate(`/workspace/${id ?? "task_linked_list_delete_001"}`);
  }

  function handleNavigate(page: string) {
    navigate(page);
  }

  return (
    <Layout className="student-app">
      <Sider width={232} className="side-nav" breakpoint="lg" collapsedWidth={0}>
        <div className="brand">
          <div className="brand-mark">CT</div>
          <div>
            <Title level={4}>CodeTrack</Title>
            <Text>学生助学 harness</Text>
          </div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[taskId ? "/tasks" : location.pathname]}
          items={navItems}
          onClick={(event) => navigate(event.key)}
        />
        <div className="nav-profile">
          <Text type="secondary">当前画像</Text>
          <Text strong>{profileSummary.studentName}</Text>
          <Progress percent={profileSummary.progress} size="small" />
        </div>
      </Sider>
      <Layout className="main-layout">
        <Header className="topbar">
          <div>
            <Text type="secondary">{profileSummary.courseName}</Text>
            <Title level={3}>{getPageTitle(location.pathname)}</Title>
          </div>
        </Header>
        <Content className="content">
          <Routes>
            <Route path="/" element={<LearningHome onNavigate={handleNavigate} onOpenWorkspace={openWorkspace} />} />
            <Route path="/tasks" element={<CourseTasks onOpenWorkspace={openWorkspace} />} />
            <Route path="/workspace/:taskId" element={<TaskWorkspaceWrapper onBack={() => navigate("/tasks")} />} />
            <Route path="/self-study" element={<SelfStudy />} />
            <Route path="/ai-tutor" element={<AiTutor />} />
            <Route path="/library" element={<LearningLibrary />} />
          </Routes>
        </Content>
      </Layout>
      <div className="mobile-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.key}
            to={item.key}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </Layout>
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
          colorPrimary: "#256f77",
          borderRadius: 8,
          fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        }
      }}
    >
      <AppContent />
    </ConfigProvider>
  );
}
