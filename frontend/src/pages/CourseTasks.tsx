import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  List,
  Row,
  Segmented,
  Space,
  Spin,
  Tag,
  Typography
} from "antd";
import { ChevronRight } from "lucide-react";
import { api, TaskListItem } from "../api";
import {
  buildTaskCards,
  demoTasks,
  progressLabel,
  statusColor
} from "../data/constants";

const { Text, Title, Paragraph } = Typography;

type PageProps = {
  onOpenWorkspace: (taskId?: string) => void;
};

export default function CourseTasks({ onOpenWorkspace }: PageProps) {
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("全部");

  useEffect(() => {
    api
      .listTasks()
      .then(setTasks)
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, []);

  const cards = buildTaskCards(tasks);
  const filtered = cards.filter((task) => {
    if (filter === "全部") return true;
    if (filter === "未开始") return task.progress_status === "NOT_STARTED";
    if (filter === "进行中") return task.progress_status === "IN_PROGRESS";
    if (filter === "需要复习") return task.progress_status === "REVIEW_REQUIRED" || task.progress_status === "FAILED";
    return true;
  });

  return (
    <div className="page-grid">
      <section className="page-lead">
        <div>
          <Text type="secondary">教师任务学习</Text>
          <Title level={2}>从任务进入诊断、提示和学习总结</Title>
          <Paragraph>本页只展示学生侧任务完成链路，教师分发作为输入来源，不展开教师端后台。</Paragraph>
        </div>
        <Segmented value={filter} onChange={(value) => setFilter(String(value))} options={["全部", "未开始", "进行中", "需要复习"]} />
      </section>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={17}>
          <Spin spinning={loading}>
            <div className="task-card-list">
              {filtered.map((task) => (
                <Card key={task.task_id}>
                  <div className="task-card">
                    <div>
                      <Space wrap>
                        <Tag color={statusColor(task.progress_status)}>{progressLabel(task.progress_status)}</Tag>
                        <Tag>{task.difficulty}</Tag>
                        {task.real ? <Tag color="green">真实提交链路</Tag> : <Tag color="default">演示占位</Tag>}
                      </Space>
                      <Title level={4}>{task.title}</Title>
                      <Text type="secondary">{task.course_name} · 截止 {task.deadline}</Text>
                      <div className="tag-row">
                        {task.knowledge_points.map((point) => (
                          <Tag key={point} color="blue">
                            {point}
                          </Tag>
                        ))}
                      </div>
                      <Paragraph>{task.latest_summary}</Paragraph>
                    </div>
                    <Button
                      type={task.real ? "primary" : "default"}
                      icon={<ChevronRight size={16} />}
                      disabled={!task.real}
                      onClick={() => onOpenWorkspace(task.task_id)}
                    >
                      {task.real ? "进入工作台" : "待接入"}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </Spin>
        </Col>
        <Col xs={24} xl={7}>
          <Card title="截止与复习提醒">
            <Space direction="vertical" className="full">
              <Alert type="warning" message="单链表任务即将截止" description="建议今天完成一次修正提交，并查看诊断来源。" showIcon />
              <Alert type="info" message="二叉树需要复习" description="画像显示递归出口仍不稳定，适合进入自主学习生成例题。" showIcon />
            </Space>
          </Card>
          <Card title="任务页约束">
            <List
              size="small"
              dataSource={["状态必须明确", "知识点必须可见", "进入工作台动作必须清晰", "演示占位不能伪装成真实接口"]}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
