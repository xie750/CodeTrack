import { useEffect, useMemo, useState } from "react";
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
import { api, LearningContext, StudentProfile } from "../api";
import { knowledgeSources } from "../data/constants";

const { Text, Title, Paragraph } = Typography;

export default function AiTutor() {
  const [context, setContext] = useState<LearningContext | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setContext(null);
    setProfile(null);
    api.getLearningContext().then((data) => {
      if (!alive) return;
      setContext(data);
      const courseId = data.courses[0]?.course_id;
      if (courseId) {
        api.getStudentProfile(courseId).then((profileData) => alive && setProfile(profileData)).catch(() => {
          if (alive) setError("学习画像数据暂时不可用，AI 导师将等待画像后再展示个性化回答。");
        }).finally(() => {
          if (alive) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    }).catch(() => {
      if (!alive) return;
      setError("AI 导师上下文加载失败，请稍后刷新。");
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const weakestPoint = useMemo(() => {
    return profile?.knowledge_states.find((item) => item.state === "WEAK") ?? profile?.knowledge_states[0];
  }, [profile]);
  const frequentError = profile?.frequent_errors[0];
  const studentName = context?.student.name;
  const courseName = profile?.course.name ?? context?.courses[0]?.course_name;

  return (
    <div className="page-grid">
      <section className="page-lead">
        <div>
          <Text type="secondary">Concept Tutor Agent · Citation Guard Agent</Text>
          <Title level={2}>结合页面上下文、学习画像和课程知识库回答</Title>
          <Paragraph>
            {loading
              ? "正在读取当前学生的学习上下文..."
              : studentName
                ? `这里不是通用聊天框，回答必须显示画像适配、引用来源、置信度和下一步动作。当前已绑定 ${studentName} 的学习上下文。`
                : error ?? "暂时没有可用的学习上下文。"}
          </Paragraph>
        </div>
        <Button type="primary" icon={<Sparkles size={16} />} disabled={loading || !profile}>
          生成复习笔记
        </Button>
      </section>

      {error ? <Alert type="warning" message={error} showIcon /> : null}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={15}>
          <Card title="对话区">
            {loading ? <div className="chat-flow skeleton-block" /> : profile ? <div className="chat-flow">
              <div className="chat-bubble user">
                <Text strong>学生提问</Text>
                <Paragraph>
                  为什么{weakestPoint?.knowledge_point ?? "当前薄弱知识点"}容易出错？请结合我最近的提交解释。
                </Paragraph>
              </div>
              <div className="chat-bubble ai">
                <Space direction="vertical" className="full">
                  <Space wrap>
                    <Tag color="purple">AI 生成内容</Tag>
                    <Tag color="green">置信度 88%</Tag>
                    <Tag color="blue">已结合画像</Tag>
                  </Space>
                  <Paragraph>
                    {weakestPoint?.knowledge_point ?? "头节点删除"}是当前画像里需要重点复盘的内容。系统结合 {courseName} 的任务进度、
                    高频错因{frequentError ? `“${frequentError.label}”` : "和最近提交"}后，建议先定位最小失败场景，再补充对应边界用例。
                  </Paragraph>
                  <Paragraph>
                    下一步建议：先按课程知识源复述规则，再写 2 组最小样例验证；如果这是考核任务，只请求一级或二级提示，不直接索要完整答案。
                  </Paragraph>
                </Space>
              </div>
            </div> : <div className="empty-panel">画像数据加载后，这里会展示个性化 AI 导师回答。</div>}
            <Input.TextArea rows={4} placeholder="继续追问，例如：帮我把这段诊断整理成复习笔记" disabled={loading || !profile} />
            <Space wrap className="action-bar">
              <Button disabled={loading || !profile}>继续追问</Button>
              <Button disabled={loading || !profile}>生成练习</Button>
              <Button disabled={loading || !profile}>生成知识卡片</Button>
              <Button type="primary" disabled={loading || !profile}>保存到资料</Button>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={9}>
          <Card title="当前上下文">
            <List
              size="small"
              dataSource={[
                `学生：${studentName ?? "加载中"}`,
                `班级：${context?.student.class_name ?? "加载中"}`,
                `课程：${courseName ?? "加载中"}`,
                `画像：${weakestPoint ? `${weakestPoint.knowledge_point} · ${weakestPoint.mastery_score}%` : "等待画像数据"}`,
                "风险：不能直接给完整答案"
              ]}
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
