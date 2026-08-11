import { Bell, BookOpen, CalendarCheck, ClipboardCheck, ClipboardList, FileText, MoreVertical, Plus, Sparkles, TrendingUp, UserPlus, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

const stats = [
  { label: "我的课程", value: "3", delta: "较上周 ↑ 1", icon: <BookOpen size={26} />, tone: "green" },
  { label: "待发布任务", value: "2", delta: "较上周 -", icon: <ClipboardCheck size={26} />, tone: "green" },
  { label: "待批阅提交", value: "18", delta: "较上周 ↑ 6", icon: <FileText size={26} />, tone: "green" },
  { label: "学情提醒", value: "5", delta: "较上周 ↑ 2", icon: <Bell size={26} />, tone: "green" }
];

const courses = [
  {
    title: "数据结构与程序设计基础",
    meta: "2024 春季 · 2 个班级",
    chapter: "第6章 树与二叉树",
    progress: 60,
    task: "栈与队列 编程作业",
    deadline: "05-28 23:59",
    visual: "cube"
  },
  {
    title: "Java Web 开发技术",
    meta: "2024 春季 · 1 个班级",
    chapter: "第5章 Servlet 与 JSP",
    progress: 75,
    task: "项目实战：图书管理系统",
    deadline: "06-23 23:59",
    visual: "code"
  },
  {
    title: "数据库系统原理",
    meta: "2024 春季 · 1 个班级",
    chapter: "第7章 关系数据库设计",
    progress: 40,
    task: "第4章 练习题",
    deadline: "05-27 23:59",
    visual: "db"
  }
];

const todos = [
  { title: "批阅《链表实现》作业提交", course: "数据结构与程序设计基础 · 2 班", value: "12 份待批", icon: <FileText size={22} />, tone: "green" },
  { title: "检查《栈与队列》截止情况", course: "数据结构与程序设计基础 · 1 班", value: "今天 23:59 截止", icon: <CalendarCheck size={22} />, tone: "orange" },
  { title: "邀请学生加入课程", course: "Java Web 开发技术", value: "3 位待邀请", icon: <UserPlus size={22} />, tone: "blue" },
  { title: "查看学情预警详情", course: "数据库系统原理 · 1 班", value: "5 条预警", icon: <TrendingUp size={22} />, tone: "purple" },
  { title: "上传第 4 章教学资料", course: "数据库系统原理", value: "待完成", icon: <ClipboardList size={22} />, tone: "orange" }
];

const suggestions = [
  { level: "高优先级", title: "关注学生：3名学生需重点关注", desc: "近期提交率低于 40%，正确率下降明显", course: "数据结构与程序设计基础 · 2班", action: "查看详情", tone: "red", icon: <Users size={22} /> },
  { level: "中优先级", title: "今日应布置作业的班级", desc: "建议布置本周进度练习，强化知识点掌握", course: "Java Web 开发技术 1班", action: "布置作业", tone: "orange", icon: <CalendarCheck size={22} /> },
  { level: "中优先级", title: "学情预警：1个班级存在预警", desc: "第7章部分知识点掌握度较低", course: "数据库系统原理 1班", action: "查看详情", tone: "orange", icon: <Bell size={22} /> },
  { level: "低优先级", title: "下一份教学方案建议", desc: "建议生成《关系代数》教学方案", course: "数据库系统原理 第8章", action: "生成方案", tone: "blue", icon: <BookOpen size={22} /> }
];

const activities = [
  "你发布了作业《栈与队列 编程作业》到 数据结构与程序设计基础 · 2班",
  "学生 张三 在《Java Web 开发技术》提交了一个新问题",
  "系统已自动生成《数据库系统原理》第4章 学情分析报告"
];

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <div className="teacher-dashboard-v2">
      <section className="teacher-dashboard-main">
        <header className="teacher-hero-v2">
          <div>
            <h1>欢迎回来，王老师</h1>
            <p>高效管理教学任务，智能助力教学与学情提升。</p>
          </div>
          <div className="teacher-hero-art" aria-hidden="true">
            <CourseVisual type="panel" />
          </div>
        </header>

        <section className="teacher-stat-strip" aria-label="工作台概览">
          {stats.map((item) => (
            <article className="teacher-v2-stat" key={item.label}>
              <span className={`teacher-soft-icon ${item.tone}`}>{item.icon}</span>
              <div>
                <em>{item.label}</em>
                <strong>{item.value}</strong>
                <small>{item.delta}</small>
              </div>
            </article>
          ))}
        </section>

        <button className="teacher-create-course" type="button" onClick={() => navigate("/teacher/courses")}>
          <Plus size={24} />
          创建课程
        </button>

        <section className="teacher-panel-v2">
          <PanelHeader title="我的课程" action="查看全部课程" onClick={() => navigate("/teacher/courses")} />
          <div className="teacher-course-row">
            {courses.map((course) => (
              <CourseCard key={course.title} course={course} onOpen={() => navigate("/teacher/courses")} />
            ))}
          </div>
        </section>

        <section className="teacher-panel-v2 teacher-activity-panel">
          <PanelHeader title="最近动态" action="查看全部动态" />
          <ul>
            {activities.map((item, index) => (
              <li key={item}>
                <i className={`activity-dot dot-${index}`} />
                <span>{item}</span>
                <time>{index + 1} 小时前</time>
              </li>
            ))}
          </ul>
        </section>
      </section>

      <aside className="teacher-dashboard-aside">
        <section className="teacher-panel-v2">
          <PanelHeader title="今日待办" action="查看全部" />
          <div className="teacher-todo-list-v2">
            {todos.map((todo) => (
              <article className="teacher-todo-v2" key={todo.title}>
                <span className={`teacher-soft-icon ${todo.tone}`}>{todo.icon}</span>
                <div>
                  <strong>{todo.title}</strong>
                  <p>{todo.course}</p>
                </div>
                <em>{todo.value}</em>
              </article>
            ))}
          </div>
        </section>

        <section className="teacher-panel-v2 teacher-ai-suggestion">
          <PanelHeader title="AI 教学建议" sparkle />
          <p className="ai-summary">AI 综合分析：今日建议优先处理 2 个事项，5 名学生，3 项教学动作</p>
          <div className="teacher-suggestion-list">
            {suggestions.map((item) => (
              <article className="teacher-suggestion" key={item.title}>
                <span className={`priority ${item.tone}`}>{item.level}</span>
                <span className="suggestion-icon">{item.icon}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.desc}</p>
                </div>
                <small>{item.course}</small>
                <button type="button">{item.action}</button>
              </article>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

function PanelHeader({ title, action, sparkle, onClick }: { title: string; action?: string; sparkle?: boolean; onClick?: () => void }) {
  return (
    <header className="teacher-panel-head-v2">
      <h2>{title}</h2>
      {sparkle ? <Sparkles size={24} strokeWidth={1.9} /> : null}
      {action ? (
        <button type="button" onClick={onClick}>
          {action}
        </button>
      ) : null}
    </header>
  );
}

function CourseCard({ course, onOpen }: { course: (typeof courses)[number]; onOpen: () => void }) {
  return (
    <article className="teacher-course-card-v2">
      <span className="course-status">进行中</span>
      <CourseVisual type={course.visual} />
      <h3>{course.title}</h3>
      <p>{course.meta}</p>
      <div className="course-progress-line">
        <span>进度</span>
        <strong>{course.progress}%</strong>
        <i><b style={{ width: `${course.progress}%` }} /></i>
      </div>
      <dl>
        <dt>下次任务</dt>
        <dd>{course.task}<span>截止 {course.deadline}</span></dd>
      </dl>
      <footer>
        <button type="button" onClick={onOpen}>进入课程</button>
        <button type="button" onClick={onOpen}>管理课程</button>
        <button type="button" aria-label={`更多 ${course.title}`}><MoreVertical size={18} /></button>
      </footer>
    </article>
  );
}

function CourseVisual({ type }: { type: string }) {
  return (
    <div className={`course-visual ${type}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}
