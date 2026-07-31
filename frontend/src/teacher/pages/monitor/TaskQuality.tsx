import TeacherSubNav from "../../components/TeacherSubNav";
import TeacherModuleScaffold from "../../components/TeacherModuleScaffold";
import { monitorNav } from "./monitorNav";

/** 开发方案 §九 9.4 任务质量分析 */
export default function TaskQuality() {
  return (
    <TeacherModuleScaffold
      title="任务质量分析"
      description="判断任务本身是否合理：难度是否偏高、某个测试用例是否异常、任务能否区分掌握水平。分析结果可直接转入教学改进的任务调整。"
      docRef="§九 9.4 任务质量分析"
      extra={<TeacherSubNav items={monitorNav} ariaLabel="任务监控二级导航" />}
      pendingApis={[
        "GET /api/v1/teacher/tasks/{task_id}/quality",
        "GET /api/v1/teacher/tasks/{task_id}/test-case-stats",
      ]}
      boundaries={[
        "统计数字必须来自后端确定性计算，不能由 AI 生成",
        "调整任务必须复制为新任务或新版本，不得直接改已结束任务的历史内容",
      ]}
      sections={[
        {
          title: "质量指标控件",
          controls: [
            { name: "平均分卡片", desc: "展示任务平均得分" },
            { name: "通过率卡片", desc: "展示任务通过率" },
            { name: "平均提交次数", desc: "展示完成任务所需提交次数" },
            { name: "高频错误分布", desc: "展示任务最常见错误" },
            { name: "测试用例失败率", desc: "判断某个测试是否过难或异常" },
            { name: "提示使用分布", desc: "判断任务是否依赖高级提示" },
            { name: "题目区分度", desc: "判断任务是否能区分掌握水平" },
          ],
        },
        {
          title: "后续动作",
          controls: [{ name: "调整任务按钮", desc: "进入教学改进中的任务调整" }],
        },
      ]}
    />
  );
}
