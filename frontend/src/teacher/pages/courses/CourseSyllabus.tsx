import { useParams } from "react-router-dom";
import { Descriptions } from "antd";
import TeacherModuleScaffold from "../../components/TeacherModuleScaffold";

/**
 * 开发方案 §六 6.2 课程大纲
 * 章节—知识点结构是任务、资料和画像的共同锚点，第一版只做两层，不做知识图谱。
 */
export default function CourseSyllabus() {
  const { courseId } = useParams<{ courseId: string }>();

  return (
    <TeacherModuleScaffold
      title="课程大纲"
      description="编排课程章节、知识点和实验任务顺序，使任务、资料和画像都绑定到统一知识结构。"
      docRef="§六 6.2 课程大纲"
      pendingApis={[
        "GET /api/v1/teacher/courses/{course_id}/chapters",
        "POST /api/v1/teacher/courses/{course_id}/chapters",
        "PATCH /api/v1/teacher/chapters/{chapter_id}",
        "POST /api/v1/teacher/chapters/{chapter_id}/knowledge-points",
        "GET /api/v1/teacher/knowledge-points/{kp_id}/usage",
      ]}
      boundaries={[
        "已被正式任务使用的知识点不得直接删除",
        "删除前必须检查任务、资料和画像关联",
        "第一版不做复杂知识图谱，只做章节—知识点两层结构",
      ]}
      sections={[
        {
          title: "章节编排控件",
          controls: [
            { name: "章节树", desc: "展示课程章节层级" },
            { name: "新建章节按钮", desc: "创建课程章节" },
            { name: "编辑章节按钮", desc: "修改章节名称和说明" },
            { name: "拖拽排序", desc: "调整章节顺序" },
          ],
        },
        {
          title: "知识点控件",
          controls: [
            { name: "知识点列表", desc: "展示章节下知识点" },
            { name: "新建知识点按钮", desc: "创建知识点" },
            { name: "知识点标签", desc: "标识知识点类型和难度" },
            { name: "关联资料按钮", desc: "将资料关联到知识点" },
            { name: "关联任务按钮", desc: "将任务关联到知识点" },
            { name: "章节预览按钮", desc: "预览学生端课程结构" },
          ],
        },
        {
          title: "学生端联动（只读说明）",
          note: "课程大纲一旦改动，下列学生端内容同步变化，改动前需确认影响范围。",
          controls: [
            { name: "学生端课程章节结构", desc: "决定学生看到的章节层级" },
            { name: "自主学习知识点列表", desc: "决定自主学习可选知识点" },
            { name: "AI 导师检索范围", desc: "决定 AI 可检索的知识范围" },
            { name: "学习画像知识点维度", desc: "决定画像的知识点坐标轴" },
            { name: "任务与错误的知识归属", desc: "决定错误统计挂在哪个知识点" },
          ],
        },
      ]}
    >
      <Descriptions size="small" bordered column={1} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="当前课程">{courseId || "未选择"}</Descriptions.Item>
      </Descriptions>
    </TeacherModuleScaffold>
  );
}
