import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  List,
  Row,
  Space,
  Tag,
  Typography
} from "antd";
import { Sparkles } from "lucide-react";
import {
  knowledgeSources,
  profileSummary
} from "../data/constants";

const { Text, Title, Paragraph } = Typography;

export default function AiTutor() {
  return (
    <div className="page-grid">
      <section className="page-lead">
        <div>
          <Text type="secondary">Concept Tutor Agent · Citation Guard Agent</Text>
          <Title level={2}>结合页面上下文、学习画像和课程知识库回答</Title>
          <Paragraph>这里不是通用聊天框，回答必须显示画像适配、引用来源、置信度和下一步动作。</Paragraph>
        </div>
        <Button type="primary" icon={<Sparkles size={16} />}>
          生成复习笔记
        </Button>
      </section>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={15}>
          <Card title="对话区">
            <div className="chat-flow">
              <div className="chat-bubble user">
                <Text strong>学生提问</Text>
                <Paragraph>为什么链表删除头节点容易出错？请结合我最近的提交解释。</Paragraph>
              </div>
              <div className="chat-bubble ai">
                <Space direction="vertical" className="full">
                  <Space wrap>
                    <Tag color="purple">AI 生成内容</Tag>
                    <Tag color="green">置信度 88%</Tag>
                    <Tag color="blue">已结合画像</Tag>
                  </Space>
                  <Paragraph>
                    头节点删除容易出错，是因为普通节点可以通过前驱节点改 `prev-&gt;next`，但头节点没有前驱节点。你最近的提交已经能删除中间节点，
                    但在 `position == 0` 时仍返回旧 head，所以公开样例中的头节点删除会失败。
                  </Paragraph>
                  <Paragraph>
                    下一步建议：先单独写出 `position == 0` 分支，返回 `head-&gt;next`；再用空链表、头节点、尾节点和越界位置四组样例验证。
                  </Paragraph>
                </Space>
              </div>
            </div>
            <Input.TextArea rows={4} placeholder="继续追问，例如：帮我把这段诊断整理成复习笔记" />
            <Space wrap className="action-bar">
              <Button>继续追问</Button>
              <Button>生成练习</Button>
              <Button>生成知识卡片</Button>
              <Button type="primary">保存到资料</Button>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={9}>
          <Card title="当前上下文">
            <List
              size="small"
              dataSource={["页面：任务工作台", "任务：单链表指定位置节点删除", "画像：链表边界处理薄弱", "风险：不能直接给完整答案"]}
              renderItem={(item) => <List.Item>{item}</List.Item>}
            />
          </Card>
          <Card title="引用来源">
            <List
              dataSource={knowledgeSources.slice(0, 2)}
              renderItem={(source) => (
                <List.Item>
                  <List.Item.Meta title={source.title} description={source.summary} />
                </List.Item>
              )}
            />
          </Card>
          <Card title="可执行下一步">
            <Space direction="vertical" className="full">
              <Button block>跳转相关任务</Button>
              <Button block>整理成笔记</Button>
              <Button block>更新复习计划</Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
