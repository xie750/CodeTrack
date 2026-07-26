import {
  BookOpenCheck,
  CalendarDays,
  Check,
  Circle,
  ClipboardCheck,
  Code2,
  FileCheck2,
  FlaskConical,
  FunctionSquare,
  Goal,
  GraduationCap,
  ListChecks,
  Medal,
  NotebookTabs,
  RefreshCw,
  Sparkles,
  Star,
  Triangle,
  UserRound
} from "lucide-react";
import heroArt from "../assets/ui-home/hero-art.png";

const knowledgeCards = [
  { icon: <Medal size={19} />, title: "基础语法", score: 85, state: "良好", color: "blue" },
  { icon: <FunctionSquare size={19} />, title: "函数与表达式", score: 78, state: "良好", color: "green" },
  { icon: <Triangle size={19} />, title: "条件判断", score: 72, state: "良好", color: "blue" },
  { icon: <RefreshCw size={19} />, title: "循环结构", score: 68, state: "待提升", color: "purple", warn: true },
  { icon: <NotebookTabs size={19} />, title: "数组/字符串", score: 74, state: "良好", color: "green" },
  { icon: <Sparkles size={19} />, title: "算法思维", score: 65, state: "待提升", color: "orange", warn: true }
];

const weakItems = [
  { title: "嵌套循环逻辑", rate: "正确率 52%", desc: "在多层循环问题中容易遗漏条件或边界处理。典型相似：矩阵遍历、九九乘法表" },
  { title: "列表推导式", rate: "正确率 50%", desc: "对推导式的语法和应用场景掌握不够熟练。典型相似：条件过滤、数据清洗" },
  { title: "字符串切片", rate: "正确率 61%", desc: "对切片步长与负索引理解不够深入。典型相似：步长切片、反向切片" },
  { title: "函数参数传递", rate: "正确率 64%", desc: "对可变参数与默认值的使用不够熟练。典型相似：*args、**kwargs 的应用" }
];

const adviceItems = [
  { icon: <CalendarDays size={21} />, title: "今日建议", desc: "建议完成 3 个循环结构相关练习，巩固循环逻辑应用。", action: "去完成", color: "blue" },
  { icon: <Goal size={21} />, title: "本周建议", desc: "建议完成《函数进阶》课程并完成章节测试。", action: "去学习", color: "green" },
  { icon: <BookOpenCheck size={21} />, title: "长期建议", desc: "建议多参与算法题目训练，提升问题分析与解题能力。", action: "去提升", color: "orange" }
];

const records = [
  { icon: <Check size={16} />, title: "完成练习　循环结构综合练习", meta: "正确率 82%", time: "05-17 09:45", done: true },
  { icon: <ClipboardCheck size={16} />, title: "完成测验　函数与参数配置测验", meta: "得分 86/100", time: "05-16 21:10" },
  { icon: <Circle size={16} />, title: "观看课程　Python 函数进阶（第 3 课）", meta: "观看时长 42 分钟", time: "05-16 19:30" },
  { icon: <FileCheck2 size={16} />, title: "完成任务　阶段任务：流程控制实战", meta: "进度 100%", time: "05-15 16:20" }
];

export default function LearningProfile() {
  return (
    <div className="profile-page">
      <section className="profile-hero">
        <div>
          <h1>早上好，小码同学！</h1>
          <p>这是你的学习画像与成长分析，继续朝目标前进吧。</p>
        </div>
        <img src={heroArt} alt="学生使用电脑学习" />
      </section>

      <section className="profile-top-grid">
        <article className="profile-card profile-pad">
          <h2>当前学习目标与进度</h2>
          <div className="goal-table">
            <span>当前目标</span><strong>掌握 Python 基础语法与流程控制</strong>
            <span>截止日期</span><strong>2024-06-30（剩余 15 天）</strong>
            <span>总体进度</span>
            <div className="profile-progress-line">
              <div className="profile-track"><i style={{ width: "68%" }} /></div>
              <b>68%</b>
            </div>
            <span>当前阶段</span><strong>阶段 3：流程控制与循环</strong>
            <span>下一步计划</span><strong>完成《for 循环的应用》并通过随堂测验</strong>
          </div>
          <div className="profile-action"><button type="button">查看学习计划</button></div>
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
              <text x="158" y="16" textAnchor="middle">基础知识</text>
              <text x="158" y="32" textAnchor="middle">84</text>
              <text x="258" y="86">实践操作</text>
              <text x="258" y="103">78</text>
              <text x="247" y="178">问题分析</text>
              <text x="247" y="195">72</text>
              <text x="158" y="228" textAnchor="middle">自主学习</text>
              <text x="158" y="244" textAnchor="middle">80</text>
              <text x="37" y="178">任务执行</text>
              <text x="57" y="195">76</text>
              <text x="27" y="86">学习反思</text>
              <text x="57" y="103">70</text>
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
          {knowledgeCards.map((item) => (
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
            {weakItems.map((item, index) => (
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
            {adviceItems.map((item) => (
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
              <span>平均单次学习时长<strong>48 分钟</strong></span>
              <span>任务按时完成率<strong>88%</strong></span>
              <span>较上周 <b>↑ 6%</b></span>
            </div>
          </div>
          <a className="profile-more" href="#">查看学习周报 ›</a>
        </article>

        <article className="profile-card chart-card">
          <h2>近期学习记录</h2>
          <div className="profile-timeline">
            {records.map((item) => (
              <div className="record-row" key={item.title}>
                <span className={item.done ? "done" : ""}>{item.icon}</span>
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
          <div><h3>系统分析</h3><strong>82<span> 分</span></strong><p>综合表现良好，继续保持！<br />较上次 ↑ 8 分</p></div>
        </article>
        <article className="profile-card summary-card">
          <div className="summary-icon purple"><GraduationCap size={28} /></div>
          <div><h3>教师评价</h3><strong className="purple">B+ <span>良好</span></strong><p>学习态度认真，进步明显！<br />来自：张老师　05-16</p><a href="#">查看评语 ›</a></div>
        </article>
        <article className="profile-card summary-card">
          <div className="summary-icon green"><UserRound size={28} /></div>
          <div><h3>自我评价</h3><strong className="green">80<span> 分</span></strong><p>我会继续努力，突破薄弱点！<br />更新于：05-17</p><a href="#">去更新 ›</a></div>
        </article>
      </section>
    </div>
  );
}
