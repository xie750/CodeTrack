import { useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  CalendarDays,
  Check,
  Circle,
  ClipboardCheck,
  FileCheck2,
  FunctionSquare,
  Goal,
  GraduationCap,
  Medal,
  NotebookTabs,
  RefreshCw,
  Sparkles,
  Star,
  Triangle,
  UserRound
} from "lucide-react";
import { api, LearningContext, StudentProfile } from "../api";
import heroArt from "../assets/ui-home/hero-art.png";

const defaultRecords = [
  { icon: <Check size={16} />, title: "完成练习　循环结构综合练习", meta: "正确率 82%", time: "05-17 09:45", done: true },
  { icon: <ClipboardCheck size={16} />, title: "完成测验　函数与参数配置测验", meta: "得分 86/100", time: "05-16 21:10" },
  { icon: <Circle size={16} />, title: "观看课程　Python 函数进阶（第 3 课）", meta: "观看时长 42 分钟", time: "05-16 19:30" },
  { icon: <FileCheck2 size={16} />, title: "完成任务　阶段任务：流程控制实战", meta: "进度 100%", time: "05-15 16:20" }
];

const knowledgeIcons = [<Medal size={19} />, <FunctionSquare size={19} />, <Triangle size={19} />, <RefreshCw size={19} />, <NotebookTabs size={19} />, <Sparkles size={19} />];
const knowledgeColors = ["blue", "green", "blue", "purple", "green", "orange"];

function stateText(state: string) {
  const map: Record<string, string> = {
    STABLE: "基本稳定",
    WEAK: "需要复习",
    IMPROVING: "正在提升",
    MASTERED: "掌握良好"
  };
  return map[state] ?? state;
}

function formatTime(value?: string) {
  if (!value) return "刚刚更新";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

export default function LearningProfile() {
  const [context, setContext] = useState<LearningContext | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [profile, setProfile] = useState<StudentProfile | null>(null);

  useEffect(() => {
    let alive = true;
    api.getLearningContext().then((data) => {
      if (!alive) return;
      setContext(data);
      setSelectedCourseId(data.courses[0]?.course_id ?? "");
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedCourseId) return;
    let alive = true;
    api.getStudentProfile(selectedCourseId).then((data) => {
      if (alive) setProfile(data);
    }).catch(() => {
      if (alive) setProfile(null);
    });
    return () => {
      alive = false;
    };
  }, [selectedCourseId]);

  const currentCourse = useMemo(
    () => context?.courses.find((course) => course.course_id === selectedCourseId),
    [context, selectedCourseId]
  );

  const overview = profile?.overview;
  const knowledgeCards = (profile?.knowledge_states ?? []).map((item, index) => ({
    icon: knowledgeIcons[index % knowledgeIcons.length],
    title: item.knowledge_point,
    score: item.mastery_score,
    state: stateText(item.state),
    color: knowledgeColors[index % knowledgeColors.length],
    warn: item.state === "WEAK",
    evidence: item.last_evidence
  }));
  const weakItems = (profile?.knowledge_states ?? [])
    .filter((item) => item.state === "WEAK" || item.mastery_score < 70)
    .map((item) => ({
      title: item.knowledge_point,
      rate: `掌握度 ${item.mastery_score}%`,
      desc: item.last_evidence || `证据 ${item.evidence_count} 条，建议结合最近任务复盘。`
    }));
  const adviceItems = (profile?.recommendations ?? []).map((item, index) => ({
    icon: index === 0 ? <CalendarDays size={21} /> : index === 1 ? <Goal size={21} /> : <BookOpenCheck size={21} />,
    title: item.title,
    desc: item.reason,
    action: item.suggested_action || "去完成",
    color: index === 0 ? "blue" : index === 1 ? "green" : "orange"
  }));
  const records = [
    ...(profile?.frequent_errors ?? []).slice(0, 2).map((item) => ({
      icon: <ClipboardCheck size={16} />,
      title: `高频错因　${item.label}`,
      meta: `${item.count} 次 · ${item.related_knowledge_points.join(" / ")}`,
      time: formatTime(overview?.updated_at)
    })),
    ...defaultRecords
  ].slice(0, 4);
  const progress = overview?.overall_progress ?? 68;
  const compileRate = overview?.compile_error_rate ?? 18;
  const logicRate = overview?.logic_error_rate ?? 42;
  const completion = overview?.recent_task_completion ?? 76;

  return (
    <div className="profile-page">
      <section className="profile-hero">
        <div>
          <h1>早上好，{context?.student.name ?? "小码同学"}！</h1>
          <p>{overview?.summary ?? "这是你的学习画像与成长分析，继续朝目标前进吧。"}</p>
        </div>
        <img src={heroArt} alt="学生使用电脑学习" />
      </section>

      <section className="profile-top-grid">
        <article className="profile-card profile-pad">
          <h2>当前学习目标与进度</h2>
          <div className="goal-table">
            <span>当前班级</span><strong>{context?.student.class_name ?? "软件工程 1 班"}</strong>
            <span>当前课程</span><strong>{currentCourse?.course_name ?? profile?.course.name ?? "数据结构与程序设计基础"}</strong>
            <span>任课教师</span><strong>{currentCourse?.teacher_name ?? profile?.course.teacher_name ?? "王老师"}</strong>
            <span>总体进度</span>
            <div className="profile-progress-line">
              <div className="profile-track"><i style={{ width: `${progress}%` }} /></div>
              <b>{progress}%</b>
            </div>
            <span>当前阶段</span><strong>{overview?.hint_dependency_level ? `提示依赖：${overview.hint_dependency_level}` : "课程任务进行中"}</strong>
            <span>下一步计划</span><strong>{overview?.recommendation ?? "完成当前课程任务并复盘薄弱知识点"}</strong>
          </div>
          <div className="profile-action">
            {(context?.courses ?? []).map((course) => (
              <button
                key={course.course_id}
                type="button"
                onClick={() => setSelectedCourseId(course.course_id)}
                style={course.course_id === selectedCourseId ? { background: "#176cf5", color: "#fff" } : undefined}
              >
                {course.course_name}
              </button>
            ))}
          </div>
        </article>

        <article className="profile-card profile-pad">
          <h2>能力维度画像</h2>
          <div className="profile-radar-wrap">
            <svg className="profile-radar" viewBox="0 0 330 250" aria-label="能力维度画像雷达图">
              <g transform="translate(158,120)" fill="none" stroke="#d5dfef">
                <polygon points="0,-90 78,-45 78,45 0,90 -78,45 -78,-45" />
                <polygon points="0,-60 52,-30 52,30 0,60 -52,30 -52,-30" />
                <polygon points="0,-30 26,-15 26,15 0,30 -26,15 -26,-15" />
                <line x1="0" y1="0" x2="0" y2="-96" />
                <line x1="0" y1="0" x2="84" y2="-48" />
                <line x1="0" y1="0" x2="84" y2="48" />
                <line x1="0" y1="0" x2="0" y2="96" />
                <line x1="0" y1="0" x2="-84" y2="48" />
                <line x1="0" y1="0" x2="-84" y2="-48" />
              </g>
              <polygon points="158,39 222,84 215,160 158,188 94,160 91,88" fill="rgba(35,116,245,.18)" stroke="#176cf5" strokeWidth="4" />
              {[["158", "39"], ["222", "84"], ["215", "160"], ["158", "188"], ["94", "160"], ["91", "88"]].map(([cx, cy]) => (
                <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" fill="#176cf5" />
              ))}
              <text x="158" y="16" textAnchor="middle">整体进度</text>
              <text x="158" y="32" textAnchor="middle">{progress}</text>
              <text x="258" y="86">任务完成</text>
              <text x="258" y="103">{completion}</text>
              <text x="247" y="178">调试能力</text>
              <text x="247" y="195">{100 - compileRate}</text>
              <text x="158" y="228" textAnchor="middle">逻辑稳定</text>
              <text x="158" y="244" textAnchor="middle">{100 - logicRate}</text>
              <text x="37" y="178">知识掌握</text>
              <text x="57" y="195">{knowledgeCards[0]?.score ?? 76}</text>
              <text x="27" y="86">提示控制</text>
              <text x="57" y="103">{overview?.hint_dependency_level === "HIGH" ? 55 : 75}</text>
            </svg>
            <div className="profile-legend">
              <span><i className="green" />80分及以上　优秀</span>
              <span><i className="blue" />60-79分　良好</span>
              <span><i className="orange" />40-59分　待提升</span>
              <span><i className="red" />40分以下　需加强</span>
            </div>
          </div>
        </article>
      </section>

      <section className="profile-card profile-pad knowledge-section">
        <div className="profile-section-head"><h2>知识掌握画像</h2><a href="#">查看详情 ›</a></div>
        <div className="knowledge-grid">
          {(knowledgeCards.length ? knowledgeCards : [
            { icon: <Medal size={19} />, title: "基础语法", score: 85, state: "良好", color: "blue", warn: false },
            { icon: <FunctionSquare size={19} />, title: "函数与表达式", score: 78, state: "良好", color: "green", warn: false },
            { icon: <Triangle size={19} />, title: "条件判断", score: 72, state: "良好", color: "blue", warn: false },
            { icon: <RefreshCw size={19} />, title: "循环结构", score: 68, state: "待提升", color: "purple", warn: true }
          ]).map((item) => (
            <article className="knowledge-card" key={item.title}>
              <div className="knowledge-top"><span className={item.color}>{item.icon}</span>{item.title}</div>
              <strong>{item.score}% <em className={item.warn ? "warn" : ""}>{item.state}</em></strong>
              <div className="profile-track"><i className={item.warn ? "orange" : ""} style={{ width: `${item.score}%` }} /></div>
            </article>
          ))}
        </div>
      </section>

      <section className="profile-mid-grid">
        <article className="profile-card profile-pad">
          <div className="profile-section-head"><h2>薄弱项诊断</h2></div>
          <div className="weak-list">
            {(weakItems.length ? weakItems : [{ title: "暂无明显薄弱项", rate: "持续观察", desc: "当前课程画像数据较稳定，继续完成任务后会更新诊断。" }]).map((item, index) => (
              <div className="weak-row" key={item.title}>
                <span className="rank">{index + 1}</span>
                <div className="weak-name"><strong>{item.title}</strong><span>{item.rate}</span></div>
                <p>{item.desc}</p>
                <button type="button">去练习</button>
              </div>
            ))}
          </div>
          <a className="profile-more" href="#">查看全部薄弱项 ›</a>
        </article>

        <article className="profile-card profile-pad">
          <div className="profile-section-head"><h2>个性化学习建议</h2></div>
          <div className="advice-list">
            {(adviceItems.length ? adviceItems : [{ icon: <CalendarDays size={21} />, title: "今日建议", desc: "建议先完成当前课程任务，再查看画像变化。", action: "去完成", color: "blue" }]).map((item) => (
              <div className="advice-row" key={item.title}>
                <span className={item.color}>{item.icon}</span>
                <div><strong>{item.title}</strong><p>{item.desc}</p></div>
                <button type="button">{item.action}</button>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="profile-bottom-grid">
        <article className="profile-card chart-card">
          <h2>学习行为画像 <span>（近 7 天）</span></h2>
          <div className="behavior-layout">
            <svg className="line-chart" viewBox="0 0 500 210" aria-label="近七天学习时长和正确率趋势">
              <g stroke="#e7edf6" strokeWidth="1">
                <line x1="48" y1="30" x2="460" y2="30" /><line x1="48" y1="75" x2="460" y2="75" /><line x1="48" y1="120" x2="460" y2="120" /><line x1="48" y1="165" x2="460" y2="165" />
              </g>
              <g fill="#748198" fontSize="11">
                <text x="24" y="33">120</text><text x="30" y="78">90</text><text x="30" y="123">60</text><text x="30" y="168">30</text>
                {["05-11", "05-12", "05-13", "05-14", "05-15", "05-16", "05-17"].map((day, idx) => <text key={day} x={62 + idx * 58} y="198">{day}</text>)}
              </g>
              <polyline points="62,130 120,97 178,127 236,145 294,112 352,98 410,126" fill="none" stroke="#176cf5" strokeWidth="4" strokeLinecap="round" />
              <polyline points="62,132 120,146 178,104 236,96 294,86 352,117 410,151" fill="none" stroke="#20bd79" strokeWidth="4" strokeLinecap="round" />
              {[62,120,178,236,294,352,410].map((x, idx) => <circle key={`b-${x}`} cx={x} cy={[130,97,127,145,112,98,126][idx]} r="4" fill="#176cf5" />)}
              {[62,120,178,236,294,352,410].map((x, idx) => <circle key={`g-${x}`} cx={x} cy={[132,146,104,96,86,117,151][idx]} r="4" fill="#20bd79" />)}
            </svg>
            <div className="behavior-stats">
              <span>学习高峰时间<strong>20:00 - 22:00</strong></span>
              <span>编译错误率<strong>{compileRate}%</strong></span>
              <span>逻辑错误率<strong>{logicRate}%</strong></span>
              <span>任务完成率 <b>{completion}%</b></span>
            </div>
          </div>
          <a className="profile-more" href="#">查看学习周报 ›</a>
        </article>

        <article className="profile-card chart-card">
          <h2>近期学习记录</h2>
          <div className="profile-timeline">
            {records.map((item) => (
              <div className="record-row" key={item.title}>
                <span className={"done" in item && item.done ? "done" : ""}>{item.icon}</span>
                <strong>{item.title}</strong>
                <em>{item.meta}</em>
                <time>{item.time}</time>
              </div>
            ))}
          </div>
          <a className="profile-more" href="#">查看全部记录 ›</a>
        </article>
      </section>

      <section className="profile-summary-grid">
        <article className="profile-card summary-card">
          <div className="summary-icon"><Star size={27} fill="currentColor" /></div>
          <div><h3>系统分析</h3><strong>{progress}<span> 分</span></strong><p>{overview?.summary ?? "综合表现良好，继续保持！"}<br />更新于：{formatTime(overview?.updated_at)}</p></div>
        </article>
        <article className="profile-card summary-card">
          <div className="summary-icon purple"><GraduationCap size={28} /></div>
          <div><h3>教师评价</h3><strong className="purple">{currentCourse?.teacher_name ?? "任课教师"} <span>课程视角</span></strong><p>画像按课程独立计算，便于老师查看本课程情况。<br />来自：{profile?.course.name ?? currentCourse?.course_name ?? "当前课程"}</p><a href="#">查看评语 ›</a></div>
        </article>
        <article className="profile-card summary-card">
          <div className="summary-icon green"><UserRound size={28} /></div>
          <div><h3>自我评价</h3><strong className="green">{completion}<span> 分</span></strong><p>我会继续努力，突破薄弱点！<br />班级：{context?.student.class_name ?? "软件工程 1 班"}</p><a href="#">去更新 ›</a></div>
        </article>
      </section>
    </div>
  );
}
