import TeacherSubNav from "../../components/TeacherSubNav";
import TeacherModuleScaffold from "../../components/TeacherModuleScaffold";
import { taskCenterNav } from "./taskCenterNav";

/**
 * 开发方案 §八 8.2 任务创建
 * 这一步只收集任务通用信息，保存草稿后再按任务类型跳到对应编辑器。
 */
export default function TaskCreate() {
  return (
    <TeacherModuleScaffold
      title="新建任务"
      description="填写任务通用信息并保存为草稿，再按任务类型进入客观题编辑器或编程任务编辑器。"
      docRef="§八 8.2 任务创建"
      extra={<TeacherSubNav items={taskCenterNav} ariaLabel="任务中心二级导航" />}
      pendingApis={["POST /api/v1/teacher/tasks", "GET /api/v1/teacher/courses/{course_id}/knowledge-points"]}
      boundaries={[
        "不允许前端写死课程 ID、班级 ID 或学生 ID，章节和知识点必须从接口读取",
        "新建任务初始状态为 DRAFT，验证通过后才能变为 READY",
      ]}
      sections={[
        {
          title: "通用控件",
          controls: [
            { name: "任务类型选择卡片", desc: "选择编程、客观题、测验或补救任务" },
            { name: "任务标题输入框", desc: "设置标题" },
            { name: "任务描述编辑器", desc: "设置任务要求" },
            { name: "章节选择器", desc: "绑定课程章节" },
            { name: "知识点选择器", desc: "绑定知识点" },
            { name: "难度选择器", desc: "设置难度" },
            { name: "截止建议", desc: "设置默认完成时间建议" },
            { name: "保存草稿按钮", desc: "保存未完成任务" },
            { name: "下一步按钮", desc: "进入对应编辑器" },
          ],
        },
      ]}
    />
  );
}
