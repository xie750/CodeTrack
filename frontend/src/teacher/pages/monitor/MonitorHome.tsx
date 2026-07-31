import TeacherSubNav from "../../components/TeacherSubNav";
import TeacherModuleScaffold from "../../components/TeacherModuleScaffold";
import { monitorNav } from "./monitorNav";

/**
 * 开发方案 §九 9.1 提交进度看板
 * 本页只读学生端产生的数据，不直接修改学生数据。
 * 选中某个任务后进入 /teacher/tasks/:taskId/monitor 查看该任务明细。
 */
export default function MonitorHome() {
  return (
    <TeacherModuleScaffold
      title="任务监控"
      description="按任务查看班级提交进度、成绩分布和逾期情况。本页只读取学生端产生的数据，不直接修改学生数据。"
      docRef="§九 9.1 提交进度看板"
      extra={<TeacherSubNav items={monitorNav} ariaLabel="任务监控二级导航" />}
      pendingApis={[
        "GET /api/v1/teacher/monitor/tasks",
        "GET /api/v1/teacher/tasks/{task_id}/monitor（已有，需补筛选与分页参数）",
        "GET /api/v1/teacher/tasks/{task_id}/monitor/export",
      ]}
      boundaries={[
        "本页只读学生端数据，任何写操作都应走教师反馈或批改进度页",
        "导出必须执行权限校验，教师不能导出其他教师班级的学生数据",
      ]}
      sections={[
        {
          title: "概览卡片",
          note: "所有卡片点击后应下钻到对应筛选结果。",
          controls: [
            { name: "任务选择器", desc: "选择需要查看的任务" },
            { name: "总人数卡片", desc: "显示覆盖学生数" },
            { name: "已完成卡片", desc: "显示已完成人数" },
            { name: "进行中卡片", desc: "显示进行中人数" },
            { name: "未开始卡片", desc: "显示未开始人数" },
            { name: "逾期卡片", desc: "显示逾期人数" },
            { name: "平均成绩卡片", desc: "显示平均得分" },
          ],
        },
        {
          title: "学生明细控件",
          controls: [
            { name: "学生搜索框", desc: "搜索学生" },
            { name: "状态筛选器", desc: "按任务状态筛选" },
            { name: "提示筛选器", desc: "按提示等级筛选" },
            { name: "错误类型筛选器", desc: "按错误类型筛选" },
            { name: "学生任务表格", desc: "展示学生完成明细", status: "partial" },
            { name: "导出按钮", desc: "导出当前筛选结果" },
          ],
        },
      ]}
    />
  );
}
