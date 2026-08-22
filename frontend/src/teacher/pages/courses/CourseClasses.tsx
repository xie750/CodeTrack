import { BookOpen, Boxes, ChevronLeft, ChevronRight, Database, FileBox, GraduationCap, Layers, MoreVertical, Plus, Search, Settings, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const courses = [
  { title: "数据结构与程序设计基础", status: "进行中", term: "2024-2025春季学期", major: "计算机科学与技术", classes: 6, progress: 60, nextTask: "实验3：栈与队列的应用", deadline: "05-28 23:59", visual: "cube" },
  { title: "Java Web 开发技术", status: "进行中", term: "2024-2025春季学期", major: "软件工程", classes: 5, progress: 75, nextTask: "项目实战：图书管理系统", deadline: "06-02 23:59", visual: "code" },
  { title: "数据库系统原理", status: "进行中", term: "2024-2025春季学期", major: "数据科学与大数据技术", classes: 4, progress: 40, nextTask: "第4章 练习题", deadline: "05-27 23:59", visual: "db" },
  { title: "操作系统基础", status: "筹备中", term: "2024-2025春季学期", major: "计算机科学与技术", classes: 2, progress: 10, nextTask: "课程大纲已更新", deadline: "5月18日 16:20", visual: "os" },
  { title: "C++ 程序设计", status: "筹备中", term: "2024-2025春季学期", major: "计算机科学与技术", classes: 3, progress: 5, nextTask: "上传了课程资料（第1章 课件）", deadline: "5月17日 10:15", visual: "cpp" },
  { title: "计算机网络", status: "已归档", term: "2024-2025秋季学期", major: "软件工程", classes: 3, progress: 100, nextTask: "课程已归档", deadline: "2024年12月30日", visual: "network" }
];

const statCards = [
  { label: "课程总数", value: "6", icon: <BookOpen size={22} />, tone: "green" },
  { label: "进行中课程", value: "3", icon: <Layers size={22} />, tone: "orange" },
  { label: "本学期课程", value: "5", icon: <FileBox size={22} />, tone: "blue" },
  { label: "筹备中课程", value: "2", icon: <GraduationCap size={22} />, tone: "purple" }
];

const tips = [
  { title: "课程模板推荐", desc: "参考优质课程模板，快速搭建课程框架", icon: <Boxes size={22} />, tone: "orange" },
  { title: "批量导入资源", desc: "一次性导入课件、题库等教学资源", icon: <FileBox size={22} />, tone: "green" },
  { title: "课程公开设置", desc: "设置课程可见范围与访问权限", icon: <ShieldCheck size={22} />, tone: "blue" }
];

export default function CourseClasses() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [term, setTerm] = useState("2024-2025春季学期");
  const [major, setMajor] = useState("全部专业");
  const [status, setStatus] = useState("全部状态");

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      const matchKeyword = !keyword.trim() || course.title.toLowerCase().includes(keyword.trim().toLowerCase());
      const matchTerm = term === "全部学期" || course.term === term;
      const matchMajor = major === "全部专业" || course.major === major;
      const matchStatus = status === "全部状态" || course.status === status;
      return matchKeyword && matchTerm && matchMajor && matchStatus;
    });
  }, [keyword, term, major, status]);

  function openCourse(courseTitle: string) {
    navigate("/teacher/courses/syllabus", { state: { courseTitle } });
  }

  function resetFilters() {
    setKeyword("");
    setTerm("全部学期");
    setMajor("全部专业");
    setStatus("全部状态");
  }

  function handleQuickTip(title: string) {
    if (title === "课程模板推荐") {
      navigate("/teacher/courses/syllabus");
      return;
    }
    if (title === "批量导入资源") {
      navigate("/teacher/resources");
      return;
    }
    navigate("/teacher/settings");
  }

  return (
    <div className="teacher-courses-v2">
      <section className="teacher-courses-main">
        <header className="teacher-courses-head">
          <div>
            <h1>我的课程</h1>
            <p>管理您的全部课程，进入课程工作空间继续教学管理。</p>
          </div>
        </header>

        <div className="teacher-course-filters">
          <label className="teacher-searchbox">
            <Search size={18} />
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索课程名称、关键词" />
          </label>
          <select value={term} onChange={(event) => setTerm(event.target.value)}>
            <option>2024-2025春季学期</option>
            <option>2024-2025秋季学期</option>
            <option>全部学期</option>
          </select>
          <select value={major} onChange={(event) => setMajor(event.target.value)}>
            <option>全部专业</option>
            <option>计算机科学与技术</option>
            <option>软件工程</option>
            <option>数据科学与大数据技术</option>
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option>全部状态</option>
            <option>进行中</option>
            <option>筹备中</option>
            <option>已归档</option>
          </select>
          <button type="button" className="teacher-new-course" onClick={() => navigate("/teacher/courses/syllabus")}><Plus size={22} />新建课程</button>
        </div>

        <section className="teacher-course-grid-v2" aria-label="我的课程列表">
          {filteredCourses.map((course) => (
            <article
              className="teacher-course-card-v2 my-course"
              key={course.title}
              role="button"
              tabIndex={0}
              onClick={() => openCourse(course.title)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openCourse(course.title);
                }
              }}
            >
              <span className={`course-status ${course.status === "筹备中" ? "preparing" : course.status === "已归档" ? "archived" : ""}`}>{course.status}</span>
              <CourseVisual type={course.visual} />
              <h3>{course.title}</h3>
              <p>{course.term} · {course.major}</p>
              <small>绑定班级 {course.classes} 个</small>
              <div className="course-progress-line">
                <span>进度</span>
                <strong>{course.progress}%</strong>
                <i><b style={{ width: `${course.progress}%` }} /></i>
              </div>
              <dl>
                <dt>{course.status === "已归档" ? "最近活动" : "下次任务"}</dt>
                <dd>{course.nextTask}<span>{course.status === "已归档" ? course.deadline : `截止 ${course.deadline}`}</span></dd>
              </dl>
              <footer>
                <button type="button" onClick={(event) => { event.stopPropagation(); openCourse(course.title); }}>{course.status === "已归档" ? "查看课程" : "进入课程"}</button>
                <button type="button" onClick={(event) => { event.stopPropagation(); openCourse(course.title); }}>管理课程</button>
                <button type="button" aria-label={`更多 ${course.title}`} onClick={(event) => event.stopPropagation()}><MoreVertical size={18} /></button>
              </footer>
            </article>
          ))}
        </section>

        <section className="teacher-draft-panel">
          <header>
            <h2>最近草稿 / 已归档课程</h2>
            <button type="button" onClick={() => setStatus("已归档")}>查看全部</button>
          </header>
          <div>
            <article><span>已归档</span><strong>离散数学</strong><small>2024-2024秋季学期</small><em>已归档 2024-12-25</em><button type="button" onClick={() => openCourse("离散数学")}>查看</button><button type="button" aria-label="更多 离散数学"><MoreVertical size={16} /></button></article>
            <article><span className="draft">草稿</span><strong>人工智能导论</strong><small>2024-2025春季学期</small><em>草稿 5月16日</em><button type="button" onClick={() => navigate("/teacher/courses/syllabus", { state: { courseTitle: "人工智能导论", mode: "draft" } })}>继续编辑</button><button type="button" aria-label="更多 人工智能导论"><MoreVertical size={16} /></button></article>
          </div>
        </section>
      </section>

      <aside className="teacher-courses-aside">
        <section className="teacher-panel-v2">
          <header className="teacher-panel-head-v2">
            <h2>课程总览</h2>
            <button type="button" onClick={resetFilters}>查看全部</button>
          </header>
          <div className="course-overview-grid">
            {statCards.map((card) => (
              <article key={card.label}>
                <span className={`teacher-soft-icon ${card.tone}`}>{card.icon}</span>
                <p>{card.label}</p>
                <strong>{card.value}</strong>
                <small>门</small>
              </article>
            ))}
          </div>
        </section>

        <section className="teacher-panel-v2 quick-tip-panel">
          <h2>快速提示</h2>
          {tips.map((tip) => (
            <article
              key={tip.title}
              role="button"
              tabIndex={0}
              onClick={() => handleQuickTip(tip.title)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleQuickTip(tip.title);
                }
              }}
            >
              <span className={`teacher-soft-icon ${tip.tone}`}>{tip.icon}</span>
              <div>
                <strong>{tip.title}</strong>
                <p>{tip.desc}</p>
              </div>
              <ChevronRight size={22} />
            </article>
          ))}
          <button type="button" onClick={() => navigate("/teacher/settings")}>去设置</button>
        </section>

        <section className="teacher-panel-v2 sticky-note-panel">
          <div>
            <h2>使用小贴士</h2>
            <p>定期更新课程资料，保持内容时效性，有助于提升学生学习效果。</p>
          </div>
          <CourseVisual type="cap" />
          <footer>
            <button type="button" aria-label="上一条"><ChevronLeft size={18} /></button>
            <span>1 / 3</span>
            <button type="button" aria-label="下一条"><ChevronRight size={18} /></button>
          </footer>
        </section>
      </aside>
    </div>
  );
}

function CourseVisual({ type }: { type: string }) {
  const Icon = type === "db" ? Database : type === "network" ? ShieldCheck : type === "cap" ? GraduationCap : BookOpen;
  return (
    <div className={`course-visual ${type}`} aria-hidden="true">
      <Icon size={type === "cap" ? 46 : 62} strokeWidth={1.45} />
      <span />
      <span />
      <span />
    </div>
  );
}
