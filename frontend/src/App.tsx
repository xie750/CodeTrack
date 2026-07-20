import Editor from "@monaco-editor/react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Collapse,
  Empty,
  Layout,
  List,
  Row,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography
} from "antd";
import { ClipboardPaste, Play, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  api,
  Diagnosis,
  ExecutionStatus,
  Hint,
  Summary,
  TaskDetail,
  TaskListItem,
  TeacherSubmission,
  TeacherTimeline,
  VersionHistoryItem,
  VersionResult
} from "./api";

const { Header, Content } = Layout;
const { Text, Title } = Typography;

const wrongHeadUpdateCode = `ListNode* deleteAt(ListNode* head, int position) {
    if (head == nullptr || position < 0) {
        return head;
    }

    ListNode* prev = nullptr;
    ListNode* cur = head;
    int index = 0;

    while (cur != nullptr && index < position) {
        prev = cur;
        cur = cur->next;
        index++;
    }

    if (cur == nullptr) {
        return head;
    }

    if (prev != nullptr) {
        prev->next = cur->next;
    }

    return head;
}`;

const terminalStatuses = new Set([
  "SUCCEEDED",
  "COMPILE_ERROR",
  "RUNTIME_ERROR",
  "TIMEOUT",
  "RESOURCE_LIMIT",
  "SECURITY_REJECTED",
  "INFRASTRUCTURE_ERROR"
]);

function statusColor(status: string) {
  if (status === "PASSED" || status === "SUCCEEDED") return "success";
  if (status === "FAILED" || status === "COMPILE_ERROR" || status === "TIMEOUT") return "error";
  if (status === "FEEDBACK_READY" || status === "REVIEW_REQUIRED") return "warning";
  return "processing";
}

export default function App() {
  return (
    <Layout className="app-shell">
      <Header className="topbar">
        <div>
          <Title level={3}>CodeTrack</Title>
          <Text>数据结构 · 单链表删除 Demo V0.1</Text>
        </div>
        <Badge status="processing" text="本地开发环境" />
      </Header>
      <Content className="content">
        <Tabs
          defaultActiveKey="student"
          items={[
            { key: "student", label: "学生工作台", children: <StudentWorkspace /> },
            { key: "teacher", label: "教师查看", children: <TeacherView /> }
          ]}
        />
      </Content>
    </Layout>
  );
}

function StudentWorkspace() {
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [code, setCode] = useState("");
  const [execution, setExecution] = useState<ExecutionStatus | null>(null);
  const [result, setResult] = useState<VersionResult | null>(null);
  const [versions, setVersions] = useState<VersionHistoryItem[]>([]);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [hints, setHints] = useState<Hint[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadInitial() {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listTasks();
      setTasks(list);
      if (list[0]) {
        const detail = await api.getTask(list[0].task_id);
        setTask(detail);
        setCode((current) => current || detail.interface_spec.student_template);
        if (detail.current_progress.latest_version_id) {
          await loadVersion(detail.current_progress.latest_version_id, detail.current_progress.submission_id);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadVersion(versionId: string, submissionId: string | null) {
    const loaded = await api.getResults(versionId);
    setResult(loaded);
    setDiagnosis(null);
    setHints([]);
    if (loaded.diagnosis.status === "READY") {
      const loadedDiagnosis = await api.getDiagnosis(versionId);
      setDiagnosis(loadedDiagnosis);
      if (loadedDiagnosis.hint) {
        setHints([
          {
            hint_id: `${loadedDiagnosis.diagnosis_id}_level_${loadedDiagnosis.hint_level ?? 1}`,
            diagnosis_id: loadedDiagnosis.diagnosis_id,
            level: loadedDiagnosis.hint_level ?? 1,
            content: loadedDiagnosis.hint,
            unlocked: true,
            unlock_reason: "AUTO_LEVEL_1",
            generated_at: "",
            viewed_at: ""
          }
        ]);
      }
    }
    if (submissionId) {
      setVersions(await api.getVersions(submissionId));
      if (loaded.submission_status === "PASSED") {
        setSummary(await api.getSummary(submissionId));
      }
    }
  }

  async function submit() {
    if (!task) return;
    setSubmitting(true);
    setError(null);
    setExecution(null);
    setResult(null);
    try {
      const submitted = await api.submitCode(task.task_id, code);
      let next = await api.getExecution(submitted.execution_id);
      setExecution(next);
      for (let i = 0; i < 10 && !terminalStatuses.has(next.status); i++) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        next = await api.getExecution(submitted.execution_id);
        setExecution(next);
      }
      await loadVersion(submitted.version_id, submitted.submission_id);
      const detail = await api.getTask(task.task_id);
      setTask(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function requestHint(level: number) {
    if (!diagnosis) return;
    setError(null);
    try {
      const nextHint = await api.requestHint(diagnosis.diagnosis_id, level);
      setHints((current) => {
        const withoutSame = current.filter((item) => item.level !== nextHint.level);
        return [...withoutSame, nextHint].sort((a, b) => a.level - b.level);
      });
      if (result) {
        setResult({
          ...result,
          hint_access: {
            ...result.hint_access,
            highest_viewed_level: Math.max(result.hint_access.highest_viewed_level, level),
            available_levels: level >= 2 ? [1, 2, 3] : result.hint_access.available_levels
          }
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "提示申请失败");
    }
  }

  useEffect(() => {
    loadInitial();
  }, []);

  const activeTask = tasks[0];
  const passedCount = result?.tests.filter((test) => test.status === "PASSED").length ?? 0;
  const failedCount = result?.tests.filter((test) => test.status === "FAILED").length ?? 0;

  if (loading) return <Spin />;

  return (
    <div className="workspace">
      {error && <Alert type="error" message={error} showIcon />}
      {!activeTask || !task ? (
        <Empty description="暂无开放任务" />
      ) : (
        <>
          <section className="task-strip">
            <div>
              <Text type="secondary">{activeTask.course_name}</Text>
              <Title level={2}>{task.title}</Title>
            </div>
            <Space wrap>
              <Tag color="cyan">{task.language}</Tag>
              <Tag color={statusColor(activeTask.progress_status)}>{activeTask.progress_status}</Tag>
            </Space>
          </section>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={9}>
              <Card title="任务说明">
                <Text>{task.description}</Text>
                <div className="signature">{task.interface_spec.function_signature}</div>
                <List
                  size="small"
                  dataSource={task.interface_spec.rules}
                  renderItem={(item) => <List.Item>{item}</List.Item>}
                />
              </Card>
              <Card title="公开测试">
                <List
                  size="small"
                  dataSource={task.public_tests}
                  renderItem={(item) => (
                    <List.Item>
                      <Space direction="vertical" size={2}>
                        <Text strong>{item.name}</Text>
                        <Text type="secondary">
                          {JSON.stringify(item.input_summary)} → {item.expected_output_summary}
                        </Text>
                      </Space>
                    </List.Item>
                  )}
                />
              </Card>
            </Col>

            <Col xs={24} lg={15}>
              <Card
                title="代码编辑"
                extra={
                  <Space>
                    <Button icon={<ClipboardPaste size={16} />} onClick={() => setCode(wrongHeadUpdateCode)}>
                      填入错误示例
                    </Button>
                    <Button icon={<RefreshCw size={16} />} onClick={() => setCode(task.interface_spec.student_template)}>
                      恢复模板
                    </Button>
                    <Button type="primary" icon={<Play size={16} />} loading={submitting} onClick={submit}>
                      提交
                    </Button>
                  </Space>
                }
              >
                <Editor
                  height="360px"
                  language="cpp"
                  theme="vs"
                  value={code}
                  options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false }}
                  onChange={(value) => setCode(value ?? "")}
                />
              </Card>

              <Row gutter={[16, 16]}>
                <Col xs={24} xl={12}>
                  <Card title="系统验证">
                    {execution || result ? (
                      <Space direction="vertical" className="full">
                        <Space wrap>
                          <Tag color={statusColor(execution?.status ?? result?.execution.status ?? "PENDING")}>
                            {execution?.status ?? result?.execution.status}
                          </Tag>
                          <Text>通过 {passedCount} 项</Text>
                          <Text>失败 {failedCount} 项</Text>
                        </Space>
                        {result?.execution.compiler_stderr && (
                          <pre className="stderr">{result.execution.compiler_stderr}</pre>
                        )}
                        <Table
                          size="small"
                          rowKey="test_case_id"
                          pagination={false}
                          dataSource={result?.tests ?? []}
                          columns={[
                            { title: "测试", dataIndex: "name" },
                            {
                              title: "状态",
                              dataIndex: "status",
                              render: (value: string) => <Tag color={statusColor(value)}>{value}</Tag>
                            },
                            { title: "实际输出", dataIndex: "actual_output" }
                          ]}
                        />
                      </Space>
                    ) : (
                      <Empty description="尚未执行" />
                    )}
                  </Card>
                </Col>
                <Col xs={24} xl={12}>
                  <Card title="课程来源与 AI 分析">
                    {diagnosis ? (
                      <Space direction="vertical" className="full">
                        <Alert
                          type={diagnosis.needs_teacher_review ? "warning" : "info"}
                          showIcon
                          message={diagnosis.diagnosis_type}
                          description={diagnosis.explanation}
                        />
                        <Space wrap>
                          <Tag color="gold">置信度 {Math.round(diagnosis.confidence * 100)}%</Tag>
                          <Tag color={diagnosis.model_provider === "RULE_FALLBACK" ? "orange" : "blue"}>
                            {diagnosis.model_provider}
                          </Tag>
                          {diagnosis.needs_teacher_review && <Tag color="red">需教师复核</Tag>}
                        </Space>
                      </Space>
                    ) : (
                      <Alert
                        type="info"
                        showIcon
                        message="诊断状态"
                        description={result ? result.diagnosis.status : "提交后展示诊断状态。"}
                      />
                    )}
                    {result && (
                      <Collapse
                        className="section-collapse"
                        items={[
                          {
                            key: "facts",
                            label: "工具事实",
                            children: (
                              <Text>
                                执行状态 {result.execution.status}，提交状态 {result.submission_status}。
                              </Text>
                            )
                          },
                          {
                            key: "diagnosis",
                            label: "AI 分析",
                            children: diagnosis ? (
                              <Space direction="vertical">
                                <Text>{diagnosis.explanation}</Text>
                                <Text type="secondary">证据：{diagnosis.verified_evidence_ids.join(", ")}</Text>
                              </Space>
                            ) : (
                              <Text>{result.diagnosis.status}</Text>
                            )
                          },
                          {
                            key: "sources",
                            label: "课程来源",
                            children: diagnosis ? (
                              diagnosis.knowledge_sources.length > 0 ? (
                                <List
                                  size="small"
                                  dataSource={diagnosis.knowledge_sources}
                                  renderItem={(source) => (
                                    <List.Item>
                                      <Space direction="vertical" size={2}>
                                        <Space wrap>
                                          <Text strong>{source.title}</Text>
                                          <Tag>{source.source_id}</Tag>
                                          <Tag color="blue">{source.version}</Tag>
                                          <Tag color="green">{source.authority_level}</Tag>
                                        </Space>
                                        <Text type="secondary">{source.summary}</Text>
                                      </Space>
                                    </List.Item>
                                  )}
                                />
                              ) : (
                                <Text type="secondary">暂无可打开的课程来源</Text>
                              )
                            ) : (
                              <Text>暂无来源</Text>
                            )
                          },
                          {
                            key: "hints",
                            label: "渐进提示",
                            children: (
                              <Space direction="vertical" className="full">
                                {hints.length === 0 ? (
                                  <Text type="secondary">暂无提示</Text>
                                ) : (
                                  hints.map((hint) => (
                                    <Alert
                                      key={`${hint.diagnosis_id}_${hint.level}`}
                                      type="success"
                                      showIcon
                                      message={`第 ${hint.level} 级提示`}
                                      description={hint.content}
                                    />
                                  ))
                                )}
                                {diagnosis && (
                                  <Space wrap>
                                    <Button
                                      disabled={hints.some((hint) => hint.level === 2)}
                                      onClick={() => requestHint(2)}
                                    >
                                      申请二级提示
                                    </Button>
                                    <Button
                                      disabled={
                                        !hints.some((hint) => hint.level === 2) ||
                                        hints.some((hint) => hint.level === 3)
                                      }
                                      onClick={() => requestHint(3)}
                                    >
                                      申请三级提示
                                    </Button>
                                  </Space>
                                )}
                              </Space>
                            )
                          }
                        ]}
                      />
                    )}
                  </Card>
                </Col>
              </Row>

              <Row gutter={[16, 16]}>
                <Col xs={24} xl={12}>
                  <Card title="版本历史">
                    <List
                      dataSource={versions}
                      locale={{ emptyText: "暂无版本" }}
                      renderItem={(item) => (
                        <List.Item>
                          <Space wrap>
                            <Text strong>第 {item.version_no} 版</Text>
                            <Tag color={statusColor(item.submission_status)}>{item.submission_status}</Tag>
                            <Text>{item.passed_count}/{item.total_required_count}</Text>
                            {item.is_latest && <Tag>最新</Tag>}
                          </Space>
                        </List.Item>
                      )}
                    />
                  </Card>
                </Col>
                <Col xs={24} xl={12}>
                  <Card title="完成总结">
                    {summary ? (
                      <Space direction="vertical" className="full">
                        <Tag color={statusColor(summary.final_status)}>{summary.final_status}</Tag>
                        <Text>提交次数：{summary.version_count}</Text>
                        <Text>
                          总耗时：
                          {summary.total_duration_ms === null
                            ? "未完成"
                            : `${Math.max(1, Math.round(summary.total_duration_ms / 1000))} 秒`}
                        </Text>
                        <Alert type="info" message="下一步建议" description={summary.next_step_suggestion} showIcon />
                        {summary.capability_evidence && (
                          <Alert
                            type="success"
                            message={summary.capability_evidence.capability_code}
                            description={summary.capability_evidence.explanation}
                            showIcon
                          />
                        )}
                      </Space>
                    ) : (
                      <Empty description="通过后生成" />
                    )}
                  </Card>
                </Col>
              </Row>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}

function TeacherView() {
  const [submissions, setSubmissions] = useState<TeacherSubmission[]>([]);
  const [selected, setSelected] = useState<TeacherTimeline | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listTeacherSubmissions();
      setSubmissions(list);
      if (list[0]) {
        setSelected(await api.getTeacherTimeline(list[0].submission_id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const timelineItems = useMemo(
    () =>
      selected?.events.map((event) => ({
        key: event.event_id,
        children: (
          <Space direction="vertical" size={2}>
            <Text strong>{event.type}</Text>
            <Text>{event.summary}</Text>
            <Text type="secondary">{event.occurred_at}</Text>
          </Space>
        )
      })) ?? [],
    [selected]
  );

  return (
    <div className="workspace">
      {error && <Alert type="error" message={error} showIcon />}
      <Card
        title="提交列表"
        extra={
          <Button icon={<RefreshCw size={16} />} onClick={load} loading={loading}>
            刷新
          </Button>
        }
      >
        <Table
          rowKey="submission_id"
          dataSource={submissions}
          pagination={false}
          onRow={(record) => ({
            onClick: async () => setSelected(await api.getTeacherTimeline(record.submission_id))
          })}
          columns={[
            { title: "学生", dataIndex: "student_name" },
            { title: "任务", dataIndex: "task_title" },
            { title: "提交次数", dataIndex: "version_count" },
            {
              title: "状态",
              dataIndex: "status",
              render: (value: string) => <Tag color={statusColor(value)}>{value}</Tag>
            },
            { title: "错因标签", dataIndex: "latest_diagnosis_type" }
          ]}
        />
      </Card>
      <Card title="过程时间线">
        {selected ? <Timeline items={timelineItems} /> : <Empty description="暂无提交记录" />}
      </Card>
    </div>
  );
}
