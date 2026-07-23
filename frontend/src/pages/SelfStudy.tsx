import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  List,
  Row,
  Segmented,
  Space,
  Tag,
  Typography
} from "antd";
import { FileText } from "lucide-react";
import {
  knowledgeSources,
  profileSummary,
  selfStudyOutputs
} from "../data/constants";

const { Text, Title, Paragraph } = Typography;

export default function SelfStudy() {
  const [point, setPoint] = useState("链表");
  const [outputType, setOutputType] = useState("复习笔记");
  const [saved, setSaved] = useState(false);
  const content = selfStudyOutputs[point][outputType];

  useEffect(() => {
    setSaved(false);
  }, [point, outputType]);

  return (
    <div className="page-grid">
      <section className="page-lead">
        <div>
          <Text type="secondary">自主学习链路</Text>
          <Title level={2}>按知识点生成讲解、练习和资料</Title>
          <Paragraph>第一版开放链表、栈与队列、二叉树；生成结果使用规则 harness，保留后续接入 Artifact Generator Agent 的结构。</Paragraph>
        </div>
        <Button type="primary" icon={<FileText size={16} />} onClick={() => setSaved(true)}>
          保存到我的资料
        </Button>
      </section>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={6}>
          <Card title="知识地图">
            <List
              dataSource={["链表", "栈与队列", "二叉树"]}
              renderItem={(item) => (
                <List.Item className={point === item ? "selected-row" : "clickable-row"} onClick={() => setPoint(item)}>
                  <Text strong={point === item}>{item}</Text>
                  {point === item && <Tag color="blue">当前</Tag>}
                </List.Item>
              )}
            />
          </Card>
          <Card title="画像提醒">
            <Alert type="warning" message="适配建议" description={`你最近在${profileSummary.weakPoints[0]}上出错较多，建议优先生成复习笔记。`} showIcon />
          </Card>
        </Col>
        <Col xs={24} lg={11}>
          <Card title={`${point}学习路径`}>
            <List
              dataSource={["先复习概念", "看一个分步例题", "做一道练习", "整理成资料", "完成巩固题"]}
              renderItem={(item, index) => (
                <List.Item>
                  <Badge count={index + 1} />
                  <Text>{item}</Text>
                </List.Item>
              )}
            />
          </Card>
          <Card title="生成结果">
            <Space direction="vertical" className="full">
              <Segmented
                value={outputType}
                onChange={(value) => setOutputType(String(value))}
                options={["概念讲解", "练习题", "复习笔记", "知识卡片", "思维导图", "PPT 大纲"]}
              />
              <Alert type="info" message={`${point} · ${outputType}`} description={content} showIcon />
              <Space wrap>
                <Tag color="purple">AI 生成内容</Tag>
                <Tag color="green">置信度 84%</Tag>
                <Tag color="blue">可保存为资料</Tag>
              </Space>
              {saved && <Alert type="success" message="已保存到我的资料演示列表" showIcon />}
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={7}>
          <Card title="引用来源">
            <List
              dataSource={knowledgeSources.filter((source) => source.title.includes(point.replace("与", "")) || source.summary.includes(point[0]) || point === "链表")}
              renderItem={(source) => (
                <List.Item>
                  <List.Item.Meta title={source.title} description={source.summary} />
                  <Tag color={source.level === "HIGH" ? "green" : "blue"}>{source.level}</Tag>
                </List.Item>
              )}
            />
          </Card>
          <Card title="下一步动作">
            <Space direction="vertical" className="full">
              <Button block>生成 5 道练习</Button>
              <Button block>整理成知识卡片</Button>
              <Button block>加入复习计划</Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
