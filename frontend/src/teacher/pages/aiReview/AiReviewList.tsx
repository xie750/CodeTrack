import TeacherModuleScaffold from "../../components/TeacherModuleScaffold";

/** 开发方案 §十一 11.2 A 审核列表 */
export default function AiReviewList() {
  return (
    <TeacherModuleScaffold
      title="AI 审核"
      description="审核低置信度、规则兜底、引用不足或被学生质疑的 AI 诊断。教师审核结果单独保存，不覆盖原始 AI 输出。"
      docRef="§十一 11.2 A 审核列表"
      pendingApis={[
        "GET /api/v1/teacher/ai-reviews",
        "GET /api/v1/teacher/ai-reviews/{review_id}",
      ]}
      boundaries={[
        "低置信度结果必须自动进入审核队列",
        "原始 AI 输出不能覆盖，教师审核单独保存",
        "AI 不直接修改成绩，也不直接修改学习画像分数",
      ]}
      sections={[
        {
          title: "审核列表控件",
          note: "审核状态枚举 PENDING / ACCEPTED / MODIFIED / REJECTED，见 §十四 14.4。",
          controls: [
            { name: "审核状态筛选器", desc: "筛选待审核、已接受、已修改和已驳回" },
            { name: "置信度筛选器", desc: "筛选低置信度结果" },
            { name: "诊断类型筛选器", desc: "按错误类型筛选" },
            { name: "学生搜索框", desc: "按学生搜索" },
            { name: "待审核表格", desc: "展示审核任务，需分页" },
            { name: "查看审核按钮", desc: "进入审核详情" },
          ],
        },
      ]}
    />
  );
}
