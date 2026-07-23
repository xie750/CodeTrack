import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  List,
  Row,
  Select,
  Space,
  Tag,
  Typography
} from "antd";
import {
  artifacts
} from "../data/constants";

const { Text, Title, Paragraph } = Typography;

export default function LearningLibrary() {
  const [type, setType] = useState("全部");
  const [point, setPoint] = useState("全部");
  const filtered = artifacts.filter((item) => {
    const typeMatch = type === "全部" || item.type === type;
    const pointMatch = point === "全部" || item.knowledgePoints.includes(point);
    return typeMatch && pointMatch;
  });
  const selected = filtered[0] ?? artifacts[0];

  return (
    <div className="page-grid">
      <section className="page-lead">
        <div>
          <Text type="secondary">资料沉淀</Text>
          <Title level={2}>保存笔记、卡片、总结、思维导图和 PPT 大纲</Title>
          <Paragraph>资料库承接任务总结、AI 回答和自主学习生成内容，第一版先不做真实 PPT 文件导出。</Paragraph>
        </div>
        <Space wrap>
          <Select value={type} onChange={setType} options={["全部", "学习笔记", "知识卡片", "错题总结", "思维导图", "PPT 大纲"].map((value) => ({ value, label: value }))} />
          <Select value={point} onChange={setPoint} options={["全部", "链表", "指针", "栈与队列", "二叉树"].map((value) => ({ value, label: value }))} />
        </Space>
      </section>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={15}>
          <Card title="资料列表">
            <List
              dataSource={filtered}
              locale={{ emptyText: "暂无资料" }}
              renderItem={(item) => (
                <List.Item actions={[<Button key="ask" type="link">向 AI 追问</Button>, <Button key="practice" type="link">生成练习</Button>]}>
                  <List.Item.Meta
                    title={
                      <Space wrap>
                        <Text strong>{item.title}</Text>
                        <Tag>{item.type}</Tag>
                        {item.aiGenerated && <Tag color="purple">AI 生成</Tag>}
                      </Space>
                    }
                    description={`${item.source} · ${item.knowledgePoints.join("、")} · ${item.createdAt}`}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={9}>
          <Card title="资料预览">
            {selected ? (
              <Space direction="vertical" className="full">
                <Title level={4}>{selected.title}</Title>
                <Paragraph>{selected.content}</Paragraph>
                <Alert type="info" message="学生备注" description={selected.note} showIcon />
                <Space wrap>
                  {selected.citations.map((citation) => (
                    <Tag key={citation} color="blue">
                      {citation}
                    </Tag>
                  ))}
                </Space>
                <Button type="primary" block>
                  继续学习这份资料
                </Button>
              </Space>
            ) : (
              <Empty description="请选择资料" />
            )}
          </Card>
          <Card title="资料库约束">
            <List
              size="small"
              dataSource={["记录资料类型", "记录来源页面", "保留课程引用", "支持继续向 AI 提问", "支持从资料生成练习"]}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
