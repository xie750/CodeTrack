import { Descriptions } from "antd";
import TeacherModuleScaffold from "../../components/TeacherModuleScaffold";

interface Props {
  courseId?: string;
  studentId?: string;
  classId?: string;
}

/** 开发方案 §十 10.2 个体诊断 */
export default function StudentDiagnosis({ courseId, studentId, classId }: Props) {
  return (
    <TeacherModuleScaffold
      variant="embedded"
      title="个体诊断"
      description="定位单个学生的能力短板、常见错误和提示依赖，并作为发送反馈、下发补救任务的入口。与学生端学习画像共用同一套数据。"
      docRef="§十 10.2 个体诊断"
      pendingApis={[
        "GET /api/v1/teacher/students/{student_id}/profile",
        "GET /api/v1/teacher/students/{student_id}/evidence",
        "GET /api/v1/teacher/students/{student_id}/timeline",
        "POST /api/v1/teacher/students/{student_id}/watchlist",
      ]}
      boundaries={[
        "教师端与学生端学习画像共用同一套数据，不另算一套",
        "教师不能直接修改系统掌握分数",
        "教师意见作为独立人工证据保存，不覆盖系统计算结果",
        "学生端只看自己的画像和建议，看不到班级对比和内部证据",
      ]}
      sections={[
        {
          title: "诊断展示控件",
          controls: [
            { name: "学生搜索选择器", desc: "选择学生" },
            { name: "学生能力雷达图", desc: "展示编码、调试、算法和规范等能力" },
            { name: "知识短板列表", desc: "定位未掌握知识点" },
            { name: "高频错误排行", desc: "展示常见错误" },
            { name: "提示使用分析", desc: "展示提示次数、类型和等级" },
            { name: "行为轨迹时间线", desc: "回放接收任务到提交全过程" },
            { name: "查看证据按钮", desc: "查看能力分数来源" },
          ],
        },
        {
          title: "教学干预控件",
          note: "这些控件会产生写操作，必须记录审计日志。",
          controls: [
            { name: "发送教师反馈按钮", desc: "进入教师反馈" },
            { name: "下发补救任务按钮", desc: "选择或创建补救任务" },
            { name: "推荐学习资料按钮", desc: "向学生推荐课程资料" },
            { name: "重点关注开关", desc: "加入重点关注名单" },
          ],
        },
      ]}
    >
      <Descriptions size="small" bordered column={3} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="课程">{courseId || "未选择"}</Descriptions.Item>
        <Descriptions.Item label="班级">{classId || "全部"}</Descriptions.Item>
        <Descriptions.Item label="学生">{studentId || "未选择"}</Descriptions.Item>
      </Descriptions>
    </TeacherModuleScaffold>
  );
}
