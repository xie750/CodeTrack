import TeacherModuleScaffold from "../../components/TeacherModuleScaffold";

/** 开发方案 §十二 12.2 任务调整 */
export default function TaskAdjustment() {
  return (
    <TeacherModuleScaffold
      variant="embedded"
      title="任务调整"
      description="基于任务质量分析调整下一次任务的难度和知识点覆盖。调整一律复制为新任务或新版本，不改历史内容。"
      docRef="§十二 12.2 任务调整"
      pendingApis={[
        "GET /api/v1/teacher/tasks/{task_id}/adjustment-advice",
        "POST /api/v1/teacher/tasks/{task_id}/duplicate-with-changes",
      ]}
      boundaries={[
        "已结束任务不得直接修改历史内容",
        "调整应复制为新任务或新版本",
        "学生历史提交和成绩必须保留",
        "A/B 第一版只做分组下发和结果对比，不做复杂实验平台",
      ]}
      sections={[
        {
          title: "调整配置控件",
          controls: [
            { name: "原任务选择器", desc: "选择需要调整的任务" },
            { name: "难度建议", desc: "展示系统或 AI 建议" },
            { name: "难度调节器", desc: "调整下一次任务难度" },
            { name: "任务模板推荐", desc: "推荐适合的任务模板" },
            { name: "复制并调整按钮", desc: "从原任务创建新版本" },
            { name: "知识点补充选择器", desc: "添加需要强化的知识点" },
          ],
        },
        {
          title: "下发范围控件",
          controls: [
            { name: "目标学生选择器", desc: "选择全班或部分学生" },
            { name: "A/B 方案开关", desc: "创建两个教学方案" },
            { name: "发布新任务按钮", desc: "发布调整后的任务" },
          ],
        },
      ]}
    />
  );
}
