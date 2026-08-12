import { useMemo } from "react";
import { BookOpen, CheckCircle2, CircleDot, GitBranch, Layers3, Network, Route, TriangleAlert } from "lucide-react";
import { knowledgeSources, profileSummary } from "../data/constants";

type KnowledgeMapProps = {
  scope?: "course" | "self-study";
  courseName?: string;
};

const nodes = [
  {
    title: "链表",
    state: "需要复盘",
    mastery: 62,
    desc: "头节点删除、空链表和越界位置是当前主要证据。",
    icon: <GitBranch size={20} />,
    tone: "orange",
    sources: ["删除头节点时的链表起点更新", "用边界测试验证链表删除"]
  },
  {
    title: "栈与队列",
    state: "基本稳定",
    mastery: 78,
    desc: "能区分访问顺序，但括号匹配仍需要补一组边界练习。",
    icon: <Layers3 size={20} />,
    tone: "blue",
    sources: ["栈与队列的访问顺序"]
  },
  {
    title: "二叉树",
    state: "正在提升",
    mastery: 70,
    desc: "递归出口和遍历顺序已经建立，需要继续用小样例巩固。",
    icon: <Network size={20} />,
    tone: "green",
    sources: ["二叉树递归遍历"]
  }
];

export default function StudentKnowledgeMap({ scope = "course", courseName }: KnowledgeMapProps) {
  const sourceMap = useMemo(() => new Map(knowledgeSources.map((source) => [source.title, source])), []);
  const title = scope === "course" ? "课程知识图谱" : "自学知识图谱";
  const subtitle = scope === "course"
    ? `${courseName ?? profileSummary.courseName} 的知识点、任务证据和课程来源。`
    : "从自主学习入口查看知识点关系，并选择下一步生成内容。";

  return (
    <div className="student-map-page">
      <header className="student-map-head">
        <div>
          <span className="student-eyebrow">{scope === "course" ? "课程内模块" : "自主学习模块"}</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <button type="button">
          <Route size={17} />
          生成学习路径
        </button>
      </header>

      <section className="student-map-layout">
        <div className="student-map-canvas" aria-label="知识点关系图">
          {nodes.map((node, index) => (
            <article className={`student-map-node ${node.tone}`} key={node.title}>
              <span>{node.icon}</span>
              <div>
                <strong>{node.title}</strong>
                <small>{node.state} · 掌握度 {node.mastery}%</small>
              </div>
              {index < nodes.length - 1 ? <i aria-hidden="true" /> : null}
            </article>
          ))}
        </div>

        <aside className="student-map-side">
          <section className="student-panel">
            <h2>当前推荐</h2>
            <div className="map-advice">
              <span className="teacher-soft-icon orange"><TriangleAlert size={20} /></span>
              <div>
                <strong>优先复盘链表边界处理</strong>
                <p>建议先做头节点删除和空链表两个最小样例，再进入任务工作台重新提交。</p>
              </div>
            </div>
          </section>

          <section className="student-panel">
            <h2>课程来源</h2>
            <div className="map-source-list">
              {knowledgeSources.map((source) => (
                <article key={source.id}>
                  <span className={source.level === "HIGH" ? "green" : "blue"}>
                    {source.level === "HIGH" ? <CheckCircle2 size={16} /> : <CircleDot size={16} />}
                  </span>
                  <div>
                    <strong>{source.title}</strong>
                    <p>{source.summary}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </section>

      <section className="student-panel student-map-detail">
        <h2>知识点详情</h2>
        <div className="student-map-detail-grid">
          {nodes.map((node) => (
            <article key={node.title}>
              <span className={`teacher-soft-icon ${node.tone === "orange" ? "orange" : node.tone === "green" ? "green" : "blue"}`}>
                <BookOpen size={20} />
              </span>
              <strong>{node.title}</strong>
              <p>{node.desc}</p>
              <div>
                {node.sources.map((sourceTitle) => {
                  const source = sourceMap.get(sourceTitle);
                  return <small key={sourceTitle}>{source?.title ?? sourceTitle}</small>;
                })}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
