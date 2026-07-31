import TeacherModuleScaffold from "../../components/TeacherModuleScaffold";

/** 开发方案 §十二 12.1 教学策略优化 */
export default function StrategyOptimization() {
  return (
    <TeacherModuleScaffold
      variant="embedded"
      title="教学策略优化"
      description="基于后端聚合后的班级统计生成教学建议。AI 接收的是聚合数据，不应一次性读取全班原始代码。"
      docRef="§十二 12.1 教学策略优化"
      pendingApis={[
        "GET /api/v1/teacher/improvement/summary",
        "POST /api/v1/teacher/improvement/suggestions",
        "POST /api/v1/teacher/improvement/suggestions/{id}/adopt",
      ]}
      boundaries={[
        "AI 接收后端聚合后的统计数据，不应一次性读取全班所有原始代码",
        "AI 建议必须由教师采纳后才转为教学计划",
      ]}
      sections={[
        {
          title: "学情汇总与建议控件",
          controls: [
            { name: "学情摘要卡片", desc: "汇总班级完成、成绩和错误" },
            { name: "AI 教学建议卡片", desc: "根据真实统计生成建议" },
            { name: "薄弱知识点排行", desc: "高亮班级薄弱环节" },
            { name: "高频错误排行", desc: "展示需要重新讲解的问题" },
            { name: "班级对比选择器", desc: "对比同课程不同班级" },
            { name: "时间对比选择器", desc: "对比不同阶段" },
          ],
        },
        {
          title: "建议处置控件",
          controls: [
            { name: "采纳建议按钮", desc: "将建议转为教学计划" },
            { name: "忽略建议按钮", desc: "标记不采用" },
            { name: "生成补充资料按钮", desc: "创建讲解或复习资料" },
            { name: "创建补救任务按钮", desc: "进入任务创建" },
          ],
        },
      ]}
    />
  );
}
