import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Alert, Card, Table, Button, Space, Statistic, Row, Col, Progress } from "antd";
import { EyeOutlined, CheckCircleOutlined, ClockCircleOutlined, TeamOutlined } from "@ant-design/icons";
import { getTaskMonitor } from "../teacherApi";
import type { TaskMonitorData, TaskMonitorRow } from "../teacherTypes";
import TeacherEmptyState from "../components/TeacherEmptyState";
import TeacherStatusTag from "../components/TeacherStatusTag";

export default function TaskMonitor() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [monitor, setMonitor] = useState<TaskMonitorData | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!taskId) {
      setLoadError("缺少任务 ID");
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setLoadError("");
    getTaskMonitor(taskId)
      .then((data) => {
        if (active) setMonitor(data);
      })
      .catch(() => {
        if (active) setLoadError("无法读取该任务的监控数据，请确认任务归属和后端服务。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [taskId]);

  const submissionRate = monitor && monitor.total_students > 0
    ? Math.round((monitor.submitted_count / monitor.total_students) * 100)
    : 0;

  const columns = [
    {
      title: "学生姓名",
      dataIndex: "student_name",
      key: "student_name",
    },
    {
      title: "学号",
      dataIndex: "student_id",
      key: "student_id",
    },
    {
      title: "最后提交",
      dataIndex: "last_submitted_at",
      key: "last_submitted_at",
      render: (text: string | null) => text || "-",
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
      title: "提示等级",
      dataIndex: "highest_hint_level",
      key: "highest_hint_level",
      render: (level: number) => (level > 0 ? `Level ${level}` : "-"),
    },
    {
      title: "操作",
      key: "action",
      render: (_: unknown, record: TaskMonitorRow) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            disabled={!record.submission_id}
            onClick={() => navigate(`/teacher/submissions/${record.submission_id}/grade`)}
          >
            查看
          </Button>
        </Space>
      ),
    },
  ];

  if (loading) {
    return <div className="page-grid">加载中...</div>;
  }

  if (loadError || !monitor) {
    return (
      <div className="page-grid">
        <Alert type="error" showIcon message={loadError || "暂无监控数据"} />
      </div>
    );
  }

  return (
    <div className="page-grid">
      <div style={{ marginBottom: 24 }}>
        <h2>任务监控</h2>
        <p style={{ color: "#666" }}>
          {monitor.course_name} · {monitor.task_title}
        </p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="总学生数" value={monitor.total_students} prefix={<TeamOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="已提交"
              value={monitor.submitted_count}
              valueStyle={{ color: "#52c41a" }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="未开始"
              value={monitor.not_started_count}
              valueStyle={{ color: "#faad14" }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div style={{ textAlign: "center" }}>
              <div style={{ marginBottom: 8 }}>提交率</div>
              <Progress type="circle" percent={submissionRate} size={80} />
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="提交列表" extra={<Button>导出数据</Button>}>
        {monitor.submissions.length === 0 ? (
          <TeacherEmptyState description="该任务还没有在册学生" />
        ) : (
          <Table columns={columns} dataSource={monitor.submissions} rowKey="student_id" />
        )}
      </Card>
    </div>
  );
}
