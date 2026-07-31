import TeacherModuleScaffold from "../../components/TeacherModuleScaffold";

/** 开发方案 §十二 12.3 教学效果评估 */
export default function EffectEvaluation() {
  return (
    <TeacherModuleScaffold
      variant="embedded"
      title="教学效果评估"
      description="对比改进前后的成绩、知识点掌握和错误分布，生成阶段教学报告。报告里的数字必须来自系统统计。"
      docRef="§十二 12.3 教学效果评估"
      pendingApis={[
        "GET /api/v1/teacher/improvement/effect",
        "POST /api/v1/teacher/reports/stage",
        "POST /api/v1/teacher/reports/semester",
      ]}
      boundaries={[
        "报告中的数字必须来自系统统计，AI 只负责组织语言和解释",
        "报告生成后必须允许教师编辑",
        "自动总结不得作为正式评价直接发布",
      ]}
      sections={[
        {
          title: "对比指标控件",
          controls: [
            { name: "改进前后选择器", desc: "选择对比时间或任务" },
            { name: "成绩对比图", desc: "展示改进前后成绩" },
            { name: "知识点提升率", desc: "展示知识点掌握变化" },
            { name: "错误下降率", desc: "展示高频错误变化" },
            { name: "提示依赖变化", desc: "展示高级提示使用变化" },
            { name: "任务完成率变化", desc: "展示完成情况变化" },
          ],
        },
        {
          title: "报告输出控件",
          controls: [
            { name: "AI 教学效果总结", desc: "基于统计生成总结草稿" },
            { name: "导出教学报告按钮", desc: "导出阶段报告" },
            { name: "生成学期总结按钮", desc: "生成学期总结草稿" },
          ],
        },
      ]}
    />
  );
}
