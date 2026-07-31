import type { ReactNode } from "react";
import { Alert, Card, Table, Tag } from "antd";

/**
 * 教师端模块框架组件
 *
 * 用途：把《CodeTrack 双端一体化开发方案》里每个页面的控件清单落成可见的开发框架，
 * 让后续接手的人知道这一页要做哪些控件、卡在哪个后端接口上，而不是留一句"功能开发中"。
 *
 * 注意：本组件只渲染控件清单，不生成任何假数据。页面接入真实接口后应逐步删掉对应的
 * section，直到整页不再需要 Scaffold。
 */

/** 控件实现状态 */
export type ControlStatus = "todo" | "partial" | "done";

export interface ScaffoldControl {
  /** 控件名，与开发方案表格第一列一致 */
  name: string;
  /** 控件功能，与开发方案表格第二列一致 */
  desc: string;
  /** 默认 todo */
  status?: ControlStatus;
}

export interface ScaffoldSection {
  title: string;
  /** 该分区的补充说明 */
  note?: string;
  controls: ScaffoldControl[];
}

interface Props {
  title: string;
  description: string;
  /** 对应开发方案章节，例如 "§八 8.1 任务列表" */
  docRef: string;
  sections: ScaffoldSection[];
  /** 开发方案里写明的开发边界，必须在页面上可见，避免后来人做超范围的事 */
  boundaries?: string[];
  /** 该页依赖但尚未提供的后端接口 */
  pendingApis?: string[];
  /** 已经能跑的真实内容放这里，渲染在控件清单上方 */
  children?: ReactNode;
  /** 页面标题右侧的额外内容，例如二级导航 */
  extra?: ReactNode;
  /**
   * page：独立路由页，带 page-grid / page-lead 外壳。
   * embedded：嵌在父页 Tabs 里的子页，不再套一层页面外壳和 h1。
   */
  variant?: "page" | "embedded";
}

const statusMeta: Record<ControlStatus, { color: string; text: string }> = {
  todo: { color: "default", text: "待开发" },
  partial: { color: "processing", text: "部分可用" },
  done: { color: "success", text: "已完成" },
};

const columns = [
  {
    title: "控件",
    dataIndex: "name",
    key: "name",
    width: 200,
  },
  {
    title: "功能",
    dataIndex: "desc",
    key: "desc",
  },
  {
    title: "状态",
    dataIndex: "status",
    key: "status",
    width: 110,
    render: (status: ControlStatus = "todo") => {
      const meta = statusMeta[status] ?? statusMeta.todo;
      return <Tag color={meta.color as never}>{meta.text}</Tag>;
    },
  },
];

export default function TeacherModuleScaffold({
  title,
  description,
  docRef,
  sections,
  boundaries,
  pendingApis,
  children,
  extra,
  variant = "page",
}: Props) {
  const body = (
    <>
      {variant === "embedded" && (
        <div style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <p style={{ color: "#64748b", margin: "4px 0 0" }}>{description}</p>
        </div>
      )}

      {extra}

      {children}

      <Alert
        type="info"
        showIcon
        message={`本页对应开发方案 ${docRef}`}
        description="以下是该页面需要实现的控件清单。控件接入真实接口后请把状态改为已完成，并从本清单移除。"
        style={{ marginBottom: 16 }}
      />

      {pendingApis && pendingApis.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message="依赖但尚未提供的后端接口"
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {pendingApis.map((item) => (
                <li key={item}>
                  <code>{item}</code>
                </li>
              ))}
            </ul>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {boundaries && boundaries.length > 0 && (
        <Alert
          type="error"
          showIcon
          message="开发边界（不得越界实现）"
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {boundaries.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {sections.map((section) => (
        <Card
          key={section.title}
          title={section.title}
          size="small"
          style={{ marginBottom: 16 }}
        >
          {section.note && <p style={{ color: "#64748b", marginTop: 0 }}>{section.note}</p>}
          <Table
            columns={columns}
            dataSource={section.controls}
            pagination={false}
            size="small"
            rowKey="name"
          />
        </Card>
      ))}
    </>
  );

  if (variant === "embedded") return body;

  return (
    <div className="page-grid">
      <div className="page-lead">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {body}
    </div>
  );
}
