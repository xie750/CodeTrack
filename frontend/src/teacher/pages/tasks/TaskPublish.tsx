import { useParams } from "react-router-dom";
import { Descriptions } from "antd";
import TeacherModuleScaffold from "../../components/TeacherModuleScaffold";

/**
 * 开发方案 §八 8.6 任务发布
 * 发布是全流程里唯一会批量写学生数据的动作：
 * 发布后必须初始化班级所有学生的任务进度。
 */
export default function TaskPublish() {
  const { taskId } = useParams<{ taskId: string }>();

  return (
    <TeacherModuleScaffold
      title="任务发布"
      description="选择班级、设置发布与截止时间和提交规则，确认后正式下发到学生端。发布后会初始化班级所有学生的任务进度。"
      docRef="§八 8.6 任务发布"
      pendingApis={[
        "POST /api/v1/teacher/tasks/{task_id}/publish",
        "POST /api/v1/teacher/assignments/{assignment_id}/pause",
        "POST /api/v1/teacher/assignments/{assignment_id}/withdraw",
        "POST /api/v1/teacher/assignments/{assignment_id}/close",
      ]}
      boundaries={[
        "未验证完成的任务不能发布",
        "截止时间不得早于发布时间",
        "发布后必须初始化所有学生任务进度",
        "暂停后学生不能继续提交",
        "关闭任务不得删除历史提交",
        "任务内容与班级发布状态必须分开管理",
      ]}
      sections={[
        {
          title: "发布配置控件",
          controls: [
            { name: "班级选择器", desc: "选择一个或多个班级" },
            { name: "任务模式选择器", desc: "设置练习、测验、考试或补救" },
            { name: "发布时间选择器", desc: "立即或定时发布" },
            { name: "截止时间选择器", desc: "设置截止时间" },
            { name: "允许迟交开关", desc: "控制截止后提交" },
            { name: "最大提交次数", desc: "限制提交次数" },
            { name: "是否计分开关", desc: "决定是否进入成绩" },
            { name: "解析开放时间", desc: "控制解析显示" },
            { name: "参考答案开放时间", desc: "控制答案显示" },
          ],
        },
        {
          title: "发布与生命周期控件",
          note: "对应班级任务发布状态 DRAFT / SCHEDULED / PUBLISHED / PAUSED / CLOSED，见 §十四 14.2。",
          controls: [
            { name: "发布预览", desc: "汇总发布规则" },
            { name: "确认发布按钮", desc: "正式发布，需二次确认弹窗" },
            { name: "撤回按钮", desc: "撤回尚未开始或允许撤回的任务" },
            { name: "暂停按钮", desc: "暂停学生继续提交" },
            { name: "关闭按钮", desc: "结束任务并保留历史数据" },
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
