import { useEffect, useState } from "react";
import { Alert, Card, Row, Col, Statistic, Table, Space, Button } from "antd";
import {
  BookOutlined,
  TeamOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  BarChartOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { getTeacherDashboard } from "../teacherApi";
import type { TeacherDashboardData } from "../teacherTypes";
import TeacherEmptyState from "../components/TeacherEmptyState";
import TeacherStatusTag from "../components/TeacherStatusTag";

interface StatItem {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}

type RecentSubmission = TeacherDashboardData["recent_submissions"][number];

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<TeacherDashboardData | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    getTeacherDashboard()
      .then((data) => {
        if (active) setDashboard(data);
      })
      .catch(() => {
        if (active) setLoadError("无法读取教学首页数据，请确认教师身份和后端服务。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const stats: StatItem[] = [
    {
      title: "我的课程",
      value: dashboard?.stats.course_count ?? 0,
      icon: <BookOutlined />,
      color: "#1890ff",
    },
    {
      title: "在册学生",
      value: dashboard?.stats.student_count ?? 0,
      icon: <TeamOutlined />,
      color: "#52c41a",
    },
    {
      title: "待人工复核",
      value: dashboard?.stats.pending_review_count ?? 0,
      icon: <FileTextOutlined />,
      color: "#faad14",
    },
    {
      title: "已通过",
      value: dashboard?.stats.graded_count ?? 0,
      icon: <CheckCircleOutlined />,
      color: "#52c41a",
    },
  ];

  const columns = [
    {
      title: "任务名称",
      dataIndex: "task_title",
      key: "task_title",
    },
    {
      title: "所属课程",
      dataIndex: "course_name",
      key: "course_name",
    },
    {
      title: "学生",
      dataIndex: "student_name",
      key: "student_name",
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (status: string) => <TeacherStatusTag status={status} type="submission" />,
    },
    {
      title: "版本数",
      dataIndex: "version_count",
      key: "version_count",
    },
    {
      title: "操作",
      key: "action",
      render: (_: unknown, record: RecentSubmission) => (
        <Space>
          <Button type="link" onClick={() => navigate(`/teacher/submissions/${record.submission_id}/grade`)}>
            查看详情
          </Button>
        </Space>
      ),
    },
  ];

  if (loading) {
    return <div className="page-grid">加载中...</div>;
  }

  const recentSubmissions = dashboard?.recent_submissions ?? [];

  return (
    <div className="page-grid">
      <div className="page-lead">
        <h1>教学首页</h1>
        <p>欢迎回来，查看您的教学任务和学生学习进度。</p>
      </div>

      {loadError && <Alert type="error" showIcon message={loadError} style={{ marginBottom: 16 }} />}

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {stats.map((stat) => (
          <Col xs={24} sm={12} lg={6} key={stat.title}>
            <Card>
              <Statistic
                title={stat.title}
                value={stat.value}
                prefix={stat.icon}
                valueStyle={{ color: stat.color }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Card title="最近提交" extra={<Button type="link" onClick={() => navigate("/teacher/courses")}>查看全部</Button>}>
        {recentSubmissions.length === 0 ? (
          <TeacherEmptyState description="暂无提交数据" />
        ) : (
          <Table columns={columns} dataSource={recentSubmissions} pagination={false} rowKey="submission_id" />
        )}
      </Card>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={12}>
          <Card title="学情概览">
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <BarChartOutlined style={{ fontSize: 48, color: "#1890ff" }} />
              <p>学情诊断图表将在此处显示</p>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="待办事项">
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <ClockCircleOutlined style={{ fontSize: 48, color: "#faad14" }} />
              <p>待办事项列表将在此处显示</p>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
