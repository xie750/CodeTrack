import TeacherSubNav from "../../components/TeacherSubNav";
import TeacherModuleScaffold from "../../components/TeacherModuleScaffold";
import { monitorNav } from "./monitorNav";

/** 开发方案 §九 9.3 批改进度 */
export default function GradingProgress() {
  return (
    <TeacherModuleScaffold
      title="批改进度"
      description="处理需要人工介入的提交，支持批量反馈同类问题。AI 预评只是建议，最终评分和评语由教师发布。"
      docRef="§九 9.3 批改进度"
      extra={<TeacherSubNav items={monitorNav} ariaLabel="任务监控二级导航" />}
      pendingApis={[
        "GET /api/v1/teacher/grading-queue",
        "POST /api/v1/teacher/submissions/{submission_id}/grade",
        "POST /api/v1/teacher/feedback/batch",
      ]}
      boundaries={[
        "AI 不直接修改成绩，AI 预评只作为建议展示",
        "教师内部备注和批改草稿不得展示给学生",
        "所有评分写操作必须记录审计日志",
      ]}
      sections={[
        {
          title: "批改队列控件",
          controls: [
            { name: "待批改数量卡片", desc: "显示需要人工处理数量" },
            { name: "AI 预评结果", desc: "展示 AI 诊断或评分建议" },
            { name: "批改状态筛选器", desc: "筛选未处理、已批改和已反馈" },
            { name: "批量选择", desc: "选择多个学生" },
            { name: "批量反馈按钮", desc: "对同类问题发送反馈" },
          ],
        },
        {
          title: "评分与发布控件",
          controls: [
            { name: "教师评分输入框", desc: "输入人工评分" },
            { name: "教师评语编辑器", desc: "编写评语" },
            { name: "保存草稿按钮", desc: "暂存批改，学生不可见" },
            { name: "发布反馈按钮", desc: "向学生发布结果" },
          ],
        },
      ]}
    />
  );
}
