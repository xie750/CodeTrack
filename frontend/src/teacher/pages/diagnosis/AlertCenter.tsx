import { Card, Descriptions, Tag } from "antd";
import TeacherModuleScaffold from "../../components/TeacherModuleScaffold";

interface Props {
  courseId?: string;
  classId?: string;
}

/** 开发方案 §十 10.3 预警中心第一版规则 */
const firstVersionRules = [
  "连续两个任务未完成",
  "任务逾期",
  "同一错误连续出现三次",
  "长期依赖三级提示",
  "最近七天没有学习行为",
  "成绩明显下降",
  "多次提交仍未通过",
];

/** 开发方案 §十 10.3 预警中心 */
export default function AlertCenter({ courseId, classId }: Props) {
  return (
    <TeacherModuleScaffold
      variant="embedded"
      title="预警中心"
      description="按规则命中情况列出风险学生，并提供提醒、干预和标记已处理的闭环操作。"
      docRef="§十 10.3 预警中心"
      pendingApis={[
        "GET /api/v1/teacher/alerts",
        "POST /api/v1/teacher/alerts/{alert_id}/resolve",
        "POST /api/v1/teacher/students/{student_id}/reminders",
      ]}
      boundaries={[
        "系统只能标记「高相似风险」，不能直接认定抄袭",
        "代码相似度只作提示，必须由教师人工确认",
        "风险规则内部评分不得展示给学生端",
      ]}
      sections={[
        {
          title: "预警列表控件",
          controls: [
            { name: "预警等级筛选器", desc: "筛选提醒、关注和高风险" },
            { name: "预警类型筛选器", desc: "筛选未登录、未提交、成绩骤降和重复错误" },
            { name: "风险学生表格", desc: "展示风险学生" },
            { name: "风险原因列表", desc: "显示命中的规则" },
          ],
        },
        {
          title: "处理动作控件",
          controls: [
            { name: "查看学生按钮", desc: "进入个体诊断" },
            { name: "发送提醒按钮", desc: "向学生发送站内提醒" },
            { name: "下发干预按钮", desc: "发布反馈、资料或补救任务" },
            { name: "标记已处理按钮", desc: "完成预警处理" },
          ],
        },
      ]}
    >
      <Descriptions size="small" bordered column={2} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="课程">{courseId || "未选择"}</Descriptions.Item>
        <Descriptions.Item label="班级">{classId || "全部"}</Descriptions.Item>
      </Descriptions>

      <Card size="small" title="第一版预警规则" style={{ marginBottom: 16 }}>
        {firstVersionRules.map((rule) => (
          <Tag key={rule} style={{ marginBottom: 8 }}>
            {rule}
          </Tag>
        ))}
      </Card>
    </TeacherModuleScaffold>
  );
}
