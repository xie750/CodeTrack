import TeacherSubNav from "../../components/TeacherSubNav";
import TeacherModuleScaffold from "../../components/TeacherModuleScaffold";
import { taskCenterNav } from "./taskCenterNav";

/**
 * 开发方案 §八 8.1 任务列表
 * 注意任务内容状态（DRAFT/READY/PUBLISHED/CLOSED/ARCHIVED）与
 * 班级发布状态是两套独立枚举，见 §十四 14.1 和 14.2。
 */
export default function TaskList() {
  return (
    <TeacherModuleScaffold
      title="任务中心"
      description="管理编程任务、客观题、测验和补救任务。只有正式发布的任务才会进入学生端「班级任务」。"
      docRef="§八 8.1 任务列表"
      extra={<TeacherSubNav items={taskCenterNav} ariaLabel="任务中心二级导航" />}
      pendingApis={[
        "GET /api/v1/teacher/tasks",
        "POST /api/v1/teacher/tasks",
        "POST /api/v1/teacher/tasks/{task_id}/duplicate",
        "POST /api/v1/teacher/tasks/{task_id}/archive",
      ]}
      boundaries={[
        "任务内容状态与班级发布状态必须分开管理，不能合并成一个字段",
        "只有正式发布的任务才能进入学生端班级任务",
        "列表接口必须分页",
      ]}
      sections={[
        {
          title: "列表与筛选控件",
          controls: [
            { name: "新建任务按钮", desc: "创建新任务" },
            { name: "任务搜索框", desc: "按名称搜索" },
            { name: "任务类型筛选器", desc: "筛选编程任务、客观题、测验和补救任务" },
            { name: "状态筛选器", desc: "筛选草稿、可发布、已发布、已关闭和已归档" },
            { name: "任务表格", desc: "展示任务列表" },
          ],
        },
        {
          title: "行内操作控件",
          controls: [
            { name: "编辑按钮", desc: "按任务类型进入客观题或编程任务编辑器" },
            { name: "复制按钮", desc: "复制为新草稿" },
            { name: "学生视角预览按钮", desc: "查看学生端最终页面" },
            { name: "发布按钮", desc: "进入发布配置" },
            { name: "归档按钮", desc: "归档任务" },
            { name: "查看质量按钮", desc: "查看任务完成与错误情况" },
          ],
        },
      ]}
    />
  );
}
