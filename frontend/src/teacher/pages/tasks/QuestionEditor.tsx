import { useParams } from "react-router-dom";
import { Descriptions } from "antd";
import TeacherModuleScaffold from "../../components/TeacherModuleScaffold";

/** 开发方案 §八 8.3 客观题编辑器 */
export default function QuestionEditor() {
  const { taskId } = useParams<{ taskId: string }>();

  return (
    <TeacherModuleScaffold
      title="客观题编辑器"
      description="编写单选、多选和判断题，配置答案、分值和解析。AI 只能生成草稿，必须教师确认后才可发布。"
      docRef="§八 8.3 客观题编辑器"
      pendingApis={[
        "GET /api/v1/teacher/tasks/{task_id}/questions",
        "PUT /api/v1/teacher/tasks/{task_id}/questions",
        "POST /api/v1/teacher/tasks/{task_id}/questions/ai-draft",
        "POST /api/v1/teacher/tasks/{task_id}/questions/ai-check",
      ]}
      boundaries={[
        "AI 只能生成草稿，教师确认后才可发布",
        "已发布题目修改必须受限或生成新版本",
        "单选题只能有一个正确答案",
        "多选题必须有完整答案集合",
      ]}
      sections={[
        {
          title: "题目编辑控件",
          controls: [
            { name: "题型选择器", desc: "选择单选、多选或判断" },
            { name: "题干编辑器", desc: "编写题目" },
            { name: "选项编辑器", desc: "添加和编辑选项" },
            { name: "正确答案控件", desc: "设置答案" },
            { name: "分值输入框", desc: "设置题目分值" },
            { name: "难度选择器", desc: "设置题目难度" },
            { name: "知识点选择器", desc: "绑定知识点" },
            { name: "解析编辑器", desc: "编写答案解析" },
          ],
        },
        {
          title: "AI 辅助与预览控件",
          note: "AI 输出必须保存模型名称、提示词版本和置信度，见 §十五 15.3。",
          controls: [
            { name: "AI 生成草稿按钮", desc: "根据知识点生成候选题" },
            { name: "AI 检查按钮", desc: "检查歧义、答案和难度" },
            { name: "题目排序控件", desc: "调整题目顺序" },
            { name: "测验预览按钮", desc: "预览学生作答界面" },
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
