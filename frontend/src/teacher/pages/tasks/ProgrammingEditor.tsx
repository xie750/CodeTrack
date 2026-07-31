import { useParams } from "react-router-dom";
import { Descriptions } from "antd";
import TeacherModuleScaffold from "../../components/TeacherModuleScaffold";

/**
 * 开发方案 §八 8.4 编程任务编辑器
 * 重要边界：现有沙箱主要服务已有链表任务，第一版必须模板化，
 * 不承诺支持任意 C++ 编程题，也不在教师端第一版重构通用判题平台。
 */
export default function ProgrammingEditor() {
  const { taskId } = useParams<{ taskId: string }>();

  return (
    <TeacherModuleScaffold
      title="编程任务编辑器"
      description="基于系统支持的判题模板配置初始代码、测试用例和执行限制。教师可复制并调整模板，但不能修改沙箱底层驱动。"
      docRef="§八 8.4 编程任务编辑器"
      pendingApis={[
        "GET /api/v1/teacher/judge-templates",
        "GET /api/v1/teacher/tasks/{task_id}/test-cases",
        "PUT /api/v1/teacher/tasks/{task_id}/test-cases",
        "POST /api/v1/teacher/tasks/{task_id}/verify",
      ]}
      boundaries={[
        "第一版必须采用模板化编程任务，教师只能复制和调整已有模板",
        "教师不能任意修改沙箱底层驱动",
        "第一版不承诺支持任意 C++ 编程题，通用判题模板系统放到后续阶段",
        "所有测试用例发布前必须用参考答案验证通过",
      ]}
      sections={[
        {
          title: "模板与代码控件",
          controls: [
            { name: "判题模板选择器", desc: "选择系统支持的编程任务模板" },
            { name: "编程语言选择器", desc: "选择支持语言" },
            { name: "函数签名显示", desc: "显示模板要求" },
            { name: "初始代码编辑器", desc: "设置学生打开时的代码" },
            { name: "示例输入输出", desc: "展示任务示例" },
          ],
        },
        {
          title: "测试用例控件",
          note: "公开用例学生可见，隐藏用例的完整输入输出绝不能下发到学生端，见 §九 9.2。",
          controls: [
            { name: "测试用例表格", desc: "配置测试数据" },
            { name: "公开用例开关", desc: "决定学生能否看到" },
            { name: "隐藏用例标记", desc: "标识教师专用测试" },
            { name: "必通过开关", desc: "设置关键测试" },
            { name: "错误标签选择器", desc: "设置失败时的错误分类" },
            { name: "运行验证按钮", desc: "使用参考答案验证任务" },
          ],
        },
        {
          title: "执行限制与预览",
          controls: [
            { name: "时间限制输入框", desc: "设置执行时间限制" },
            { name: "内存限制输入框", desc: "设置内存限制" },
            { name: "学生视角预览按钮", desc: "查看学生工作台" },
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
