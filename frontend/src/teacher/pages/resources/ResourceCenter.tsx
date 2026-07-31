import TeacherModuleScaffold from "../../components/TeacherModuleScaffold";

/**
 * 开发方案 §七 资料中心
 * 资料既是学生自主学习的来源，也是 AI 导师和 AI 诊断的检索来源，
 * 所以启用状态、学生可见和 AI 检索是三个互相独立的开关。
 */
export default function ResourceCenter() {
  return (
    <TeacherModuleScaffold
      title="资料中心"
      description="维护课程资料，并为学生自主学习、AI 导师和 AI 诊断提供可靠知识来源。"
      docRef="§七 资料中心"
      pendingApis={[
        "GET /api/v1/teacher/resources",
        "POST /api/v1/teacher/resources",
        "POST /api/v1/teacher/resources/upload",
        "PATCH /api/v1/teacher/resources/{resource_id}",
        "GET /api/v1/teacher/resources/{resource_id}/references",
      ]}
      boundaries={[
        "停用资料不参与新的 AI 检索，但历史 AI 诊断中的引用不能被抹除",
        "删除资料前必须检查历史引用",
        "第一版先做文本资料和元数据管理，文件自动切片放到后续阶段",
      ]}
      sections={[
        {
          title: "A. 资料列表",
          controls: [
            { name: "上传资料按钮", desc: "上传 PDF、PPT、文档或代码资料" },
            { name: "新建文本资料按钮", desc: "直接创建文本知识源" },
            { name: "资料搜索框", desc: "按标题搜索" },
            { name: "章节筛选器", desc: "按课程章节筛选" },
            { name: "知识点筛选器", desc: "按知识点筛选" },
            { name: "资料类型筛选器", desc: "筛选课件、代码、数据集和技术文档" },
            { name: "状态筛选器", desc: "筛选启用、停用、解析中和失败" },
            { name: "资料表格", desc: "展示资料信息，需分页" },
            { name: "编辑按钮", desc: "修改资料信息" },
            { name: "停用按钮", desc: "停止资料参与新的 AI 检索" },
            { name: "删除按钮", desc: "删除未被使用的资料" },
          ],
        },
        {
          title: "B. 资料编辑",
          controls: [
            { name: "标题输入框", desc: "设置资料名称" },
            { name: "资料类型选择器", desc: "设置课件、代码、数据集或文档类型" },
            { name: "章节选择器", desc: "绑定课程章节" },
            { name: "知识点选择器", desc: "绑定一个或多个知识点" },
            { name: "摘要输入框", desc: "填写内容摘要" },
            { name: "权威等级选择器", desc: "设置资料可信等级" },
            { name: "学生可见开关", desc: "控制学生是否可直接查看" },
            { name: "AI 检索开关", desc: "控制资料是否参与 AI 检索" },
            { name: "版本号输入框", desc: "管理资料版本" },
            { name: "保存按钮", desc: "保存资料配置" },
          ],
        },
        {
          title: "C. 资料共享",
          controls: [
            { name: "共享范围选择器", desc: "设置仅当前班级、当前课程或教师复用" },
            { name: "复制到课程按钮", desc: "将资料复制到其他课程" },
            { name: "版本记录", desc: "查看资料历史版本" },
            { name: "引用次数", desc: "查看 AI 和任务使用次数" },
          ],
        },
      ]}
    />
  );
}
