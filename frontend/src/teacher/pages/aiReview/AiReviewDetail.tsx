import { useParams } from "react-router-dom";
import { Descriptions } from "antd";
import TeacherModuleScaffold from "../../components/TeacherModuleScaffold";

/** 开发方案 §十一 11.2 B 审核详情 */
export default function AiReviewDetail() {
  const { reviewId } = useParams<{ reviewId: string }>();

  return (
    <TeacherModuleScaffold
      title="AI 审核详情"
      description="对照学生代码和失败测试审核 AI 诊断。审核结果决定学生端显示「AI 建议」「教师已确认」还是「教师已修改」。"
      docRef="§十一 11.2 B 审核详情"
      pendingApis={[
        "GET /api/v1/teacher/ai-reviews/{review_id}",
        "POST /api/v1/teacher/ai-reviews/{review_id}/accept",
        "POST /api/v1/teacher/ai-reviews/{review_id}/modify",
        "POST /api/v1/teacher/ai-reviews/{review_id}/reject",
        "POST /api/v1/teacher/ai-reviews/{review_id}/regenerate",
      ]}
      boundaries={[
        "原始 AI 输出必须原样保留，教师修订作为新记录保存",
        "AI 回答必须保存模型、提示词版本和引用",
        "隐藏测试内容不得发送给学生端",
        "学生代码和个人数据必须按课程和权限范围调用",
      ]}
      sections={[
        {
          title: "审核依据（只读）",
          controls: [
            { name: "学生代码查看器", desc: "查看对应代码" },
            { name: "测试结果面板", desc: "查看失败测试" },
            { name: "原始 AI 诊断", desc: "保留原始内容，不可编辑" },
            { name: "AI 置信度", desc: "显示可信程度" },
            { name: "知识引用列表", desc: "查看引用资料" },
          ],
        },
        {
          title: "审核动作控件",
          note: "学生端会据此显示三种状态：AI 建议 / 教师已确认 / 教师已修改。",
          controls: [
            { name: "教师修改编辑器", desc: "编辑最终解释" },
            { name: "审核备注", desc: "填写审核原因" },
            { name: "接受按钮", desc: "接受原始诊断" },
            { name: "修改后接受按钮", desc: "发布教师修订结果" },
            { name: "驳回按钮", desc: "驳回错误诊断" },
            { name: "重新生成按钮", desc: "再次调用模型" },
            { name: "转为教师反馈", desc: "将内容转到教师反馈" },
          ],
        },
      ]}
    >
      <Descriptions size="small" bordered column={1} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="审核记录 ID">{reviewId || "缺少审核记录 ID"}</Descriptions.Item>
      </Descriptions>
    </TeacherModuleScaffold>
  );
}
