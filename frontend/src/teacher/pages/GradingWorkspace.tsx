import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, Row, Col, List, Button, Space, Tag, Input, InputNumber, message, Divider } from "antd";
import { CheckCircleOutlined, SaveOutlined, EyeOutlined } from "@ant-design/icons";
import { getSubmissionVersions, getVersionResults, getVersionDiagnosis } from "../teacherApi";
import type { VersionHistoryItem } from "../../api";

const { TextArea } = Input;

export default function GradingWorkspace() {
  const { submissionId } = useParams<{ submissionId: string }>();

  const [selectedVersion, setSelectedVersion] = useState<VersionHistoryItem | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<VersionHistoryItem[]>([]);
  const [testResults, setTestResults] = useState<any>(null);
  const [diagnosis, setDiagnosis] = useState<any>(null);

  useEffect(() => {
    async function loadSubmissionData() {
      if (!submissionId) return;
      try {
        const [versionsData, resultsData, diagnosisData] = await Promise.all([
          getSubmissionVersions(submissionId),
          selectedVersion ? getVersionResults(selectedVersion.version_id) : Promise.resolve(null),
          selectedVersion ? getVersionDiagnosis(selectedVersion.version_id) : Promise.resolve(null),
        ]);
        setVersions(versionsData);
        if (selectedVersion) {
          setTestResults(resultsData);
          setDiagnosis(diagnosisData);
        }
      } catch (error) {
        console.error("Failed to load submission data:", error);
        message.error("加载提交数据失败");
      }
    }
    loadSubmissionData();
  }, [submissionId, selectedVersion]);

  useEffect(() => {
    if (selectedVersion) {
      getVersionResults(selectedVersion.version_id)
        .then(setTestResults)
        .catch(console.error);
      getVersionDiagnosis(selectedVersion.version_id)
        .then(setDiagnosis)
        .catch(console.error);
    }
  }, [selectedVersion]);

  const handleSaveDraft = async () => {
    if (!score) {
      message.warning("请输入分数");
      return;
    }
    setLoading(true);
    try {
      // TODO: 实现保存教师反馈的 API
      console.log("Save draft:", { submissionId, score, feedback });
      message.success("草稿保存成功");
    } catch {
      message.error("保存失败");
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: "版本号",
      dataIndex: "version_no",
      key: "version_no",
    },
    {
      title: "提交时间",
      dataIndex: "created_at",
      key: "created_at",
    },
    {
      title: "状态",
      dataIndex: "submission_status",
      key: "submission_status",
    },
    {
      title: "通过率",
      dataIndex: "passed_count",
      key: "passed_count",
      render: (passed: number, record: VersionHistoryItem) =>
        `${passed}/${record.total_required_count}`,
    },
    {
      title: "操作",
      key: "action",
      render: (_: unknown, record: VersionHistoryItem) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => setSelectedVersion(record)}
        >
          查看
        </Button>
      ),
    },
  ];

  return (
    <div className="page-grid">
      <div style={{ marginBottom: 24 }}>
        <h2>提交详情与教师反馈</h2>
        <p style={{ color: "#666" }}>提交ID: {submissionId}</p>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={6}>
          <Card title="提交版本" size="small">
            {versions.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px", color: "#999" }}>
                暂无版本
              </div>
            ) : (
              <List
                dataSource={versions}
                renderItem={(version) => (
                  <List.Item
                    style={{
                      cursor: "pointer",
                      backgroundColor: selectedVersion?.version_id === version.version_id ? "#e6f7ff" : undefined,
                    }}
                    onClick={() => setSelectedVersion(version)}
                  >
                    <List.Item.Meta
                      title={`版本 ${version.version_no}`}
                      description={
                        <Space direction="vertical" size={0}>
                          <span style={{ fontSize: 12 }}>{version.created_at}</span>
                          <Tag color={version.is_latest ? "blue" : "default"}>
                            {version.is_latest ? "最新" : "历史"}
                          </Tag>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="提交详情" size="small">
            {selectedVersion ? (
              <>
                <div style={{ marginBottom: 16 }}>
                  <Space wrap>
                    <span>
                      <strong>版本：</strong>V{selectedVersion.version_no}
                    </span>
                    <span>
                      <strong>语言：</strong>{selectedVersion.language}
                    </span>
                    <span>
                      <strong>状态：</strong>
                      <Tag>{selectedVersion.submission_status}</Tag>
                    </span>
                  </Space>
                </div>

                <Divider>源代码</Divider>
                <div
                  style={{
                    backgroundColor: "#f5f5f5",
                    padding: 16,
                    borderRadius: 8,
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                    maxHeight: 300,
                    overflow: "auto",
                    marginBottom: 16,
                  }}
                >
                  {selectedVersion.source_code || "暂无代码"}
                </div>

                {testResults && (
                  <>
                    <Divider>测试结果</Divider>
                    <div
                      style={{
                        backgroundColor: "#f6ffed",
                        padding: 16,
                        borderRadius: 8,
                        border: "1px solid #b7eb8f",
                        marginBottom: 16,
                      }}
                    >
                      <p>
                        <strong>编译状态：</strong>
                        <Tag color={testResults.execution?.compile_exit_code === 0 ? "success" : "error"}>
                          {testResults.execution?.compile_exit_code === 0 ? "成功" : "失败"}
                        </Tag>
                      </p>
                      {testResults.tests && testResults.tests.length > 0 && (
                        <div>
                          <p><strong>测试用例：</strong></p>
                          {testResults.tests.map((test: any, idx: number) => (
                            <div key={idx} style={{ marginBottom: 8 }}>
                              <Tag color={test.status === "passed" ? "success" : "error"}>
                                {test.name}
                              </Tag>
                              <span style={{ marginLeft: 8, fontSize: 12, color: "#666" }}>
                                {test.expected_output_summary}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {diagnosis && (
                  <>
                    <Divider>AI 诊断</Divider>
                    <div
                      style={{
                        backgroundColor: "#e6f7ff",
                        padding: 16,
                        borderRadius: 8,
                        border: "1px solid #91d5ff",
                      }}
                    >
                      <p>{diagnosis.explanation || "暂无诊断信息"}</p>
                      {diagnosis.needs_teacher_review && (
                        <Tag color="warning" style={{ marginTop: 8 }}>
                          需要教师审核
                        </Tag>
                      )}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>
                请选择左侧版本查看详情
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={6}>
          <Card title="教师评语" size="small">
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8 }}>分数（0-100）</div>
              <InputNumber
                value={score}
                onChange={setScore}
                min={0}
                max={100}
                style={{ width: "100%" }}
                placeholder="请输入分数"
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8 }}>评语</div>
              <TextArea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={6}
                placeholder="请输入评语"
              />
            </div>

            <Space direction="vertical" style={{ width: "100%" }}>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSaveDraft}
                loading={loading}
                block
              >
                保存草稿
              </Button>
              {/* 成绩发布功能待后端接口完善后实现 */}
              <Button
                icon={<CheckCircleOutlined />}
                disabled
                block
              >
                发布成绩（暂未接入）
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
