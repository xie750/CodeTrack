import { Descriptions } from "antd";
import TeacherModuleScaffold from "../../components/TeacherModuleScaffold";

interface Props {
  courseId?: string;
  classId?: string;
  taskId?: string;
}

/** 开发方案 §十 10.1 班级学情总览 */
export default function ClassOverview({ courseId, classId, taskId }: Props) {
  return (
    <TeacherModuleScaffold
      variant="embedded"
      title="班级学情总览"
      description="展示班级综合能力、成绩趋势、知识点掌握与错误分布，所有图表都必须能下钻到任务或学生。"
      docRef="§十 10.1 班级学情总览"
      pendingApis={[
        "GET /api/v1/teacher/classes/{class_id}/analytics",
        "GET /api/v1/teacher/classes/{class_id}/knowledge-mastery",
        "GET /api/v1/teacher/classes/{class_id}/error-distribution",
      ]}
      boundaries={[
        "原始指标由后端计算，AI 只负责解释和总结",
        "不得由 AI 凭空生成成绩或掌握度",
        "所有图表必须能下钻到具体任务或学生",
      ]}
      sections={[
        {
          title: "筛选与图表控件",
          controls: [
            { name: "任务筛选器", desc: "查看全部任务或指定任务" },
            { name: "时间范围选择器", desc: "设置统计时间" },
            { name: "班级能力仪表盘", desc: "展示班级综合能力" },
            { name: "成绩趋势图", desc: "展示历次任务得分变化" },
            { name: "知识点掌握热力图", desc: "展示学生与知识点掌握情况" },
            { name: "错误分布图谱", desc: "按编译、逻辑、风格、超时等统计" },
            { name: "提示等级分布", desc: "展示提示使用情况" },
            { name: "查看学生明细", desc: "下钻到具体学生" },
            { name: "导出分析报告", desc: "导出当前统计，导出同样要做权限校验" },
          ],
        },
      ]}
    >
      <Descriptions size="small" bordered column={3} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="课程">{courseId || "未选择"}</Descriptions.Item>
        <Descriptions.Item label="班级">{classId || "全部"}</Descriptions.Item>
        <Descriptions.Item label="任务">{taskId || "全部"}</Descriptions.Item>
      </Descriptions>
    </TeacherModuleScaffold>
  );
}
