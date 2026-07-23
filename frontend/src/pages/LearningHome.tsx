import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  List,
  Progress,
  Row,
  Space,
  Tag,
  Typography
} from "antd";
import {
  ChevronRight,
  Play,
  Sparkles
} from "lucide-react";
import { api, TaskListItem } from "../api";
import {
  artifacts,
  buildTaskCards,
  demoTasks,
  knowledgeSources,
  profileSummary,
  progressLabel,
  statusColor
} from "../data/constants";

const { Text, Title, Paragraph } = Typography;

type PageProps = {
  onNavigate: (page: string) => void;
  onOpenWorkspace: (taskId?: string) => void;
};

export default function LearningHome({ onNavigate, onOpenWorkspace }: PageProps) {
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listTasks()
      .then(setTasks)
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, []);

  const cards = buildTaskCards(tasks);
  const todayTask = cards[0];

  return (
    <div className="page-grid">
      <section className="page-lead">
        <div>
          <Text type="secondary">今天优先处理</Text>
          <Title level={2}>{todayTask.title}</Title>
          <Paragraph>{todayTask.latest_summary}</Paragraph>
        </div>
        <Space wrap>
          <Button type="primary" icon={<Play size={16} />} onClick={() => onOpenWorkspace(todayTask.task_id)}>
            进入任务工作台
          </Button>
          <Button icon={<Sparkles size={16} />} onClick={() => onNavigate("selfStudy")}>
            复习薄弱点
          </Button>
        </Space>
      </section>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title="今日任务" loading={loading}>
            <Space direction="vertical" className="full">
              {cards.slice(0, 3).map((task) => (
                <div className="compact-row" key={task.task_id}>
                  <div>
                    <Text strong>{task.title}</Text>
                    <div>
                      <Text type="secondary">{task.deadline}</Text>
                    </div>
                  </div>
                  <Tag color={statusColor(task.progress_status)}>{progressLabel(task.progress_status)}</Tag>
                </div>
              ))}
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="学习进度">
            <Progress percent={profileSummary.progress} />
            <div className="metric-grid">
              <div>
                <Text type="secondary">提示依赖</Text>
                <Text strong>{profileSummary.hintDependency}</Text>
              </div>
              <div>
                <Text type="secondary">高频错因</Text>
                <Text strong>{profileSummary.frequentErrors[0]}</Text>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="薄弱知识点">
            <Space wrap>
              {profileSummary.weakPoints.map((point) => (
                <Tag key={point} color="orange">
                  {point}
                </Tag>
              ))}
            </Space>
            <Alert className="inline-alert" type="info" message="画像由任务提交、提示使用和资料保存记录更新。" showIcon />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card title="推荐下一步">
            <List
              dataSource={[
                "提交单链表删除任务，先验证头节点删除。",
                "生成链表边界处理复习笔记并保存到资料库。",
                "完成一组栈与队列对比练习。"
              ]}
              renderItem={(item, index) => (
                <List.Item actions={[<Button key="act" type="link" onClick={() => (index === 0 ? onOpenWorkspace() : onNavigate("selfStudy"))}>开始</Button>]}>
                  <List.Item.Meta title={item} description={index === 0 ? "Learning Navigator Agent 推荐" : "规则 harness 推荐"} />
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={7}>
          <Card title="最近资料">
            <List
              dataSource={artifacts.slice(0, 3)}
              renderItem={(item) => (
                <List.Item onClick={() => onNavigate("library")} className="clickable-row">
                  <List.Item.Meta title={item.title} description={`${item.type} · ${item.knowledgePoints.join("、")}`} />
                  <ChevronRight size={16} />
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={7}>
          <Card title="AI 助学建议">
            <Space direction="vertical" className="full">
              <Alert
                type="success"
                showIcon
                message="建议问题"
                description="为什么链表删除头节点容易出错？请结合我最近的提交解释。"
              />
              <Space wrap>
                <Tag color="blue">结合画像</Tag>
                <Tag color="gold">引用课程知识</Tag>
                <Tag color="green">置信度 86%</Tag>
              </Space>
              <Button block icon={<Sparkles size={16} />} onClick={() => onNavigate("aiTutor")}>
                打开 AI 助学
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
