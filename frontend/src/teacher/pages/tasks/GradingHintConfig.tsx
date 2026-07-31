import { useParams } from "react-router-dom";
import { Descriptions } from "antd";
import TeacherModuleScaffold from "../../components/TeacherModuleScaffold";

/**
 * 开发方案 §八 8.5 评分与提示配置
 * 这一页的每个开关都直接决定学生端能看到什么，改动前先看 §八「学生端联动」。
 */
export default function GradingHintConfig() {
  const { taskId } = useParams<{ taskId: string }>();

  return (
    <TeacherModuleScaffold
      title="评分与提示配置"
      description="设置任务总分、各维度权重、AI 提示等级和参考答案开放规则。这些设置直接决定学生端可见的测试结果、提示等级和成绩。"
      docRef="§八 8.5 评分与提示配置"
      pendingApis={[
        "GET /api/v1/teacher/tasks/{task_id}/grading-config",
        "PUT /api/v1/teacher/tasks/{task_id}/grading-config",
        "PUT /api/v1/teacher/tasks/{task_id}/hint-config",
      ]}
      boundaries={[
        "四项权重之和必须为 100%，前端需做校验",
        "AI 不直接修改成绩，提示配置只影响学生可见范围",
        "参考答案和解析的开放时间不得早于任务截止时间之前的允许范围",
      ]}
      sections={[
        {
          title: "评分权重控件",
          controls: [
            { name: "总分输入框", desc: "设置任务总分" },
            { name: "功能正确性权重", desc: "设置测试通过占比" },
            { name: "代码规范权重", desc: "设置代码规范占比" },
            { name: "性能权重", desc: "设置运行性能占比" },
            { name: "报告完整性权重", desc: "设置实验报告占比" },
          ],
        },
        {
          title: "分层提示控件",
          note: "提示分三级：一级方向性、二级定位性、三级接近解法。",
          controls: [
            { name: "允许提示开关", desc: "决定是否开放 AI 提示" },
            { name: "最高提示等级", desc: "设置最高一级、二级或三级" },
            { name: "一级提示配置", desc: "设置方向性提示" },
            { name: "二级提示配置", desc: "设置定位性提示" },
            { name: "三级提示配置", desc: "设置接近解法的提示" },
          ],
        },
        {
          title: "答案开放规则",
          controls: [
            { name: "参考答案开放规则", desc: "设置何时可查看参考答案" },
            { name: "解析开放规则", desc: "设置何时可查看解析" },
          ],
        },
      ]}
    >
      <Descriptions size="small" bordered column={1} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="任务 ID">{taskId || "缺少任务 ID"}</Descriptions.Item>
      </Descriptions>
    </TeacherModuleScaffold>
  );
}
