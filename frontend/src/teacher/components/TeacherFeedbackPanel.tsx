import { Alert, Drawer, Table, Tag } from "antd";

/**
 * 开发方案 §十三 教师反馈与通知
 *
 * 反馈面板是共享入口，可从任务监控（§九 9.2）、个体诊断（§十 10.2）和
 * AI 审核（§十一 11.2）三处调起，所以做成受控 Drawer 而不是独立路由页。
 */

export interface FeedbackContext {
  studentId?: string;
  studentName?: string;
  taskId?: string;
  taskTitle?: string;
  submissionId?: string;
  /** 从 AI 审核转入时带上原始诊断，供教师引用 */
  aiReviewId?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  context?: FeedbackContext;
}

const controls = [
  { name: "反馈对象", desc: "显示学生和任务" },
  { name: "关联提交版本", desc: "选择反馈对应版本" },
  { name: "反馈类型", desc: "选择总体评价、代码审查、错误纠正、鼓励或补救" },
  { name: "反馈编辑器", desc: "编写教师评语" },
  { name: "引用代码按钮", desc: "引用代码行" },
  { name: "引用测试按钮", desc: "引用测试结果" },
  { name: "引用 AI 诊断按钮", desc: "引用 AI 解释" },
  { name: "学生可见开关", desc: "控制学生是否可见" },
  { name: "保存草稿", desc: "暂存反馈，学生不可见" },
  { name: "预览", desc: "预览学生端效果" },
  { name: "发布反馈", desc: "发布给学生" },
  { name: "撤回反馈", desc: "撤回已发布内容" },
];

const columns = [
  { title: "控件", dataIndex: "name", key: "name", width: 180 },
  { title: "功能", dataIndex: "desc", key: "desc" },
  {
    title: "状态",
    key: "status",
    width: 100,
    render: () => <Tag>待开发</Tag>,
  },
];

export default function TeacherFeedbackPanel({ open, onClose, context }: Props) {
  return (
    <Drawer
      title="教师反馈"
      width={640}
      open={open}
      onClose={onClose}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        message="本面板对应开发方案 §十三 教师反馈与通知"
        description="反馈发布后进入学生任务详情、学生消息通知和学生学习时间线。草稿和教师内部备注不得展示给学生。"
        style={{ marginBottom: 16 }}
      />

      <Table
        size="small"
        pagination={false}
        rowKey="name"
        columns={columns}
        dataSource={controls}
        title={() =>
          context
            ? `反馈对象：${context.studentName ?? context.studentId ?? "未指定"}｜任务：${
                context.taskTitle ?? context.taskId ?? "未指定"
              }`
            : "尚未指定反馈对象"
        }
      />
    </Drawer>
  );
}
