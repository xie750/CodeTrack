import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  Brain,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  FileText,
  Gauge,
  GitBranch,
  Layers3,
  Library,
  ListChecks,
  Network,
  NotebookText,
  PanelRight,
  PlayCircle,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TriangleAlert
} from "lucide-react";
import { api, StudentProfile } from "../api";
import { knowledgeSources, selfStudyOutputs } from "../data/constants";

const knowledgePoints = [
  {
    name: "链表",
    desc: "指针、头节点、边界删除",
    level: "重点复盘",
    tone: "orange",
    icon: <GitBranch size={18} />
  },
  {
    name: "栈与队列",
    desc: "访问顺序、括号匹配、层序",
    level: "稳定推进",
    tone: "blue",
    icon: <Layers3 size={18} />
  },
  {
    name: "二叉树",
    desc: "递归出口、遍历顺序、调用栈",
    level: "待验证",
    tone: "green",
    icon: <Network size={18} />
  }
];

const outputTypes = [
  { key: "概念讲解", label: "讲解", icon: <BookOpenCheck size={16} /> },
  { key: "练习题", label: "练习", icon: <ListChecks size={16} /> },
  { key: "复习笔记", label: "笔记", icon: <NotebookText size={16} /> },
  { key: "知识卡片", label: "卡片", icon: <Library size={16} /> },
  { key: "思维导图", label: "导图", icon: <Route size={16} /> },
  { key: "PPT 大纲", label: "大纲", icon: <PanelRight size={16} /> }
];

const studySteps = [
  { title: "概念校准", desc: "先确认定义、结构和适用场景", status: "done" },
  { title: "例题拆解", desc: "跟随一步完整推理路径", status: "active" },
  { title: "专项练习", desc: "完成一组可验证题目", status: "next" },
  { title: "资料沉淀", desc: "保存笔记、卡片或导图", status: "next" },
  { title: "迁移验证", desc: "换需求或换题型再验证一次", status: "locked" }
];

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hintDependencyText(value?: string) {
  const map: Record<string, string> = {
    LOW: "低依赖",
    MEDIUM: "中等依赖",
    HIGH: "高依赖"
  };
  return value ? map[value] ?? value : "待生成";
}

function stateLabel(value?: string) {
  const map: Record<string, string> = {
    STRONG: "掌握良好",
    STABLE: "基本稳定",
    WEAK: "需要巩固",
    DEVELOPING: "正在提升"
  };
  return value ? map[value] ?? value : "暂无状态";
}

function confidenceFor(profile: StudentProfile | null, point: string) {
  const state = profile?.knowledge_states.find((item) => item.knowledge_point.includes(point) || point.includes(item.knowledge_point));
  if (!state) return 72;
  return clamp(64 + state.evidence_count * 6);
}

export default function SelfStudy() {
  const [point, setPoint] = useState("链表");
  const [outputType, setOutputType] = useState("复习笔记");
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    setSaved(false);
  }, [point, outputType]);

  useEffect(() => {
    let alive = true;
    setLoadingProfile(true);
    api.getLearningContext()
      .then((context) => {
        const courseId = context.courses[0]?.course_id;
        if (!courseId) return null;
        return api.getStudentProfile(courseId);
      })
      .then((data) => {
        if (alive && data) setProfile(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoadingProfile(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const selectedPoint = knowledgePoints.find((item) => item.name === point) ?? knowledgePoints[0];
  const content = selfStudyOutputs[point][outputType];
  const pointState = profile?.knowledge_states.find((item) => item.knowledge_point.includes(point) || point.includes(item.knowledge_point));
  const weakPoint = profile?.knowledge_states.find((item) => item.state === "WEAK") ?? profile?.knowledge_states[0];
  const primaryError = profile?.frequent_errors[0];
  const recommendation = profile?.recommendations[0];
  const mastery = clamp(pointState?.mastery_score ?? (point === "链表" ? 58 : point === "栈与队列" ? 74 : 66));
  const evidenceCount = pointState?.evidence_count ?? 2;
  const confidence = confidenceFor(profile, point);
  const filteredSources = useMemo(() => {
    const keyword = point.replace("与", "");
    return knowledgeSources.filter((source) => source.title.includes(point) || source.summary.includes(point[0]) || source.title.includes(keyword[0]) || point === "链表").slice(0, 3);
  }, [point]);

  return (
    <div className="self-study-workbench">
      <section className="self-study-topbar">
        <div>
          <span className="student-eyebrow">自主学习工作台</span>
          <h1>按画像推荐生成学习内容</h1>
          <p>系统根据知识掌握、错因、提示依赖和证据强度，推荐更合适的讲解、练习和资料沉淀方式。</p>
        </div>
        <div className="self-study-search" role="search">
          <Search size={16} />
          <span>搜索知识点、错因或资料</span>
        </div>
      </section>

      <section className="self-study-metrics" aria-label="自主学习画像指标">
        <article>
          <span><Gauge size={18} /></span>
          <small>当前掌握度</small>
          <strong>{mastery}%</strong>
        </article>
        <article>
          <span><ShieldCheck size={18} /></span>
          <small>证据数量</small>
          <strong>{evidenceCount} 条</strong>
        </article>
        <article>
          <span><Brain size={18} /></span>
          <small>提示依赖</small>
          <strong>{hintDependencyText(profile?.overview.hint_dependency_level)}</strong>
        </article>
        <article>
          <span><Target size={18} /></span>
          <small>推荐方向</small>
          <strong>{weakPoint ? `复盘${weakPoint.knowledge_point}` : "完成巩固题"}</strong>
        </article>
      </section>

      <section className="self-study-layout">
        <aside className="self-study-panel knowledge-panel">
          <div className="panel-head">
            <div>
              <h2>知识点</h2>
              <p>第一版聚焦数据结构核心主题</p>
            </div>
          </div>
          <div className="knowledge-list">
            {knowledgePoints.map((item) => (
              <button
                key={item.name}
                className={item.name === point ? "active" : ""}
                type="button"
                onClick={() => setPoint(item.name)}
              >
                <span className={`knowledge-dot ${item.tone}`}>{item.icon}</span>
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.desc}</small>
                </span>
                <em>{item.level}</em>
              </button>
            ))}
          </div>

          <div className="self-study-callout">
            <TriangleAlert size={17} />
            <div>
              <strong>画像提醒</strong>
              <p>
                {loadingProfile
                  ? "正在读取课程画像，稍后会同步推荐依据。"
                  : weakPoint
                  ? `最近薄弱点集中在${weakPoint.knowledge_point}，优先选择练习或复习笔记。`
                  : "完成练习后会更新知识点掌握和推荐路径。"}
              </p>
            </div>
          </div>
        </aside>

        <main className="self-study-panel study-main-panel">
          <div className="study-main-head">
            <div>
              <span className={`knowledge-pill ${selectedPoint.tone}`}>{selectedPoint.icon}{selectedPoint.name}</span>
              <h2>{point}学习路径</h2>
              <p>{pointState?.last_evidence ?? "根据课程知识库、任务表现和自学记录生成当前路径。"}</p>
            </div>
            <button className="self-study-primary" type="button">
              <PlayCircle size={17} />
              开始练习
            </button>
          </div>

          <div className="study-path">
            {studySteps.map((step, index) => (
              <article className={step.status} key={step.title}>
                <span>{step.status === "done" ? <CheckCircle2 size={18} /> : <CircleDot size={18} />}</span>
                <div>
                  <strong>{index + 1}. {step.title}</strong>
                  <small>{step.desc}</small>
                </div>
              </article>
            ))}
          </div>

          <div className="generator-card">
            <div className="panel-head">
              <div>
                <h2>生成器</h2>
                <p>输出会保留 AI 标识、引用来源和可保存动作</p>
              </div>
              <span className="confidence-badge">置信度 {confidence}%</span>
            </div>

            <div className="output-tabs" role="tablist" aria-label="生成类型">
              {outputTypes.map((item) => (
                <button
                  key={item.key}
                  className={item.key === outputType ? "active" : ""}
                  type="button"
                  onClick={() => setOutputType(item.key)}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>

            <article className="generated-result">
              <div>
                <span><Sparkles size={16} /> AI 生成内容</span>
                <strong>{point} · {outputType}</strong>
              </div>
              <p>{content}</p>
            </article>

            <div className="generator-actions">
              <button className="self-study-primary" type="button" onClick={() => setSaved(true)}>
                <FileText size={16} />
                保存到我的资料
              </button>
              <button type="button">
                生成同类练习
                <ArrowRight size={15} />
              </button>
              <button type="button">
                加入复习计划
                <ArrowRight size={15} />
              </button>
            </div>
            {saved && <div className="save-toast">已保存为学习资料，画像事件会记录为 ARTIFACT_SAVED。</div>}
          </div>
        </main>

        <aside className="self-study-panel evidence-panel">
          <div className="panel-head">
            <div>
              <h2>画像依据</h2>
              <p>学生端只展示可解释、可行动的依据</p>
            </div>
          </div>

          <div className="evidence-stack">
            <article>
              <span className="blue"><Gauge size={17} /></span>
              <div>
                <strong>{stateLabel(pointState?.state)}</strong>
                <p>{pointState?.last_evidence ?? `${point}当前主要依据来自自主学习和演示任务。`}</p>
              </div>
            </article>
            <article>
              <span className="orange"><TriangleAlert size={17} /></span>
              <div>
                <strong>{primaryError?.label ?? "暂无高频错因"}</strong>
                <p>{primaryError ? `${primaryError.count} 次出现，关联 ${primaryError.related_knowledge_points.join(" / ")}` : "提交和练习积累后会显示错因。"} </p>
              </div>
            </article>
            <article>
              <span className="green"><Target size={17} /></span>
              <div>
                <strong>{recommendation?.title ?? "完成一次巩固练习"}</strong>
                <p>{recommendation?.reason ?? "当前推荐以补齐证据为主，不直接判断岗位能力。"}</p>
              </div>
            </article>
          </div>

          <div className="source-box">
            <h3>引用来源</h3>
            {filteredSources.map((source) => (
              <div className="source-row" key={source.id}>
                <div>
                  <strong>{source.title}</strong>
                  <p>{source.summary}</p>
                </div>
                <span>{source.level}</span>
              </div>
            ))}
          </div>

          <div className="next-actions">
            <h3>下一步动作</h3>
            <button type="button">打开专项练习 <ChevronRight size={15} /></button>
            <button type="button">整理知识卡片 <ChevronRight size={15} /></button>
            <button type="button">查看画像详情 <ChevronRight size={15} /></button>
          </div>
        </aside>
      </section>
    </div>
  );
}
