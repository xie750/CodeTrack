import { useEffect, useState } from "react";
import { ArrowRight, BookOpenCheck, CalendarClock, Camera, Check, ClipboardList, Code2, FileText, MonitorPlay, NotebookTabs } from "lucide-react";
import { api, TaskListItem } from "../api";
import { buildTaskCards } from "../data/constants";
import heroArt from "../assets/ui-home/hero-art.png";
import robotImg from "../assets/ui-home/robot-img.png";

type PageProps = {
  onNavigate: (page: string) => void;
  onOpenWorkspace: (taskId?: string) => void;
};

const todayTasks = [
  { title: "数组与循环综合应用", type: "编程任务", deadline: "今天 23:59", progress: 60, color: "blue", icon: <Code2 size={22} /> },
  { title: "函数基础练习题", type: "练习题", deadline: "明天 23:59", progress: 80, color: "green", icon: <ClipboardList size={22} /> },
  { title: "指针与数组应用复习", type: "知识点复习", deadline: "5-31 23:59", progress: 30, color: "purple", icon: <BookOpenCheck size={22} /> }
];

const recommendations = [
  { label: "编程任务", title: "两数之和", desc: "给定一个整数数组 nums 和一个目标值 target...", action: "开始练习", color: "blue" },
  { label: "练习题", title: "链表操作综合题", desc: "基于链表的插入、删除与反转练习。", action: "去练习", color: "green" },
  { label: "知识点复习", title: "数据结构复习", desc: "回顾栈、队列、哈希表的核心概念。", action: "开始复习", color: "purple" }
];

const reminders = [
  { icon: <ClipboardList size={20} />, title: "班级任务 截止", desc: "函数基础练习题", time: "截止时间：明天 23:59", color: "orange" },
  { icon: <Camera size={20} />, title: "直播课开始", desc: "数据结构与算法精讲", time: "今天 19:30", color: "blue" },
  { icon: <NotebookTabs size={20} />, title: "作业截止", desc: "两数之和 编程任务", time: "5-31 23:59", color: "purple" }
];

const resources = [
  { title: "Python 数据结构速查手册", meta: "PDF · 1.2MB", color: "red", label: "pdf" },
  { title: "常见算法图解（含代码）", meta: "PDF · 3.5MB", color: "blue", label: "pdf" },
  { title: "LeetCode 热题精选 100 题", meta: "PDF · 2.8MB", color: "black", label: "C" }
];

const skills = [
  { name: "逻辑思维", value: 85 },
  { name: "代码能力", value: 78 },
  { name: "算法能力", value: 72 },
  { name: "问题解决", value: 80 },
  { name: "学习效率", value: 90 }
];

export default function LearningHome({ onNavigate, onOpenWorkspace }: PageProps) {
  const [tasks, setTasks] = useState<TaskListItem[]>([]);

  useEffect(() => {
    api.listTasks().then(setTasks).catch(() => setTasks([]));
  }, []);

  const cards = buildTaskCards(tasks);
  const primaryTaskId = cards[0]?.task_id;

  return (
    <div className="home-dashboard">
      <section className="home-main">
        <section className="home-card home-hero">
          <div className="hero-copy">
            <h1>早上好，张同学！</h1>
            <p>坚持学习的每一天，都是更好的自己迈进一步。</p>
            <button className="primary-btn" type="button" onClick={() => onOpenWorkspace(primaryTaskId)}>
              继续学习
              <span>
                <ArrowRight size={17} />
              </span>
            </button>
          </div>
          <img className="hero-art" src={heroArt} alt="学生使用电脑学习" />
        </section>

        <section className="home-card home-section tasks-section">
          <div className="home-card-header">
            <h2>今日任务</h2>
            <button className="text-link" type="button" onClick={() => onNavigate("/tasks")}>
              查看全部
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="task-list">
            {todayTasks.map((task, index) => (
              <article className="task-row" key={task.title}>
                <div className={`task-icon ${task.color}`}>{task.icon}</div>
                <div className="task-info">
                  <div className="task-title-line">
                    <strong>{task.title}</strong>
                    <span className={`type-tag ${task.color}`}>{task.type}</span>
                  </div>
                  <span>
                    截止：<b className={index === 0 ? "danger" : ""}>{task.deadline}</b>
                  </span>
                </div>
                <div className="task-progress">
                  <span>进度&nbsp; {task.progress}%</span>
                  <div className="mini-progress">
                    <i className={task.color} style={{ width: `${task.progress}%` }} />
                  </div>
                </div>
                <button className="outline-btn" type="button" onClick={() => onOpenWorkspace(primaryTaskId)}>
                  继续学习
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="home-card home-section">
          <div className="home-card-header">
            <h2>推荐学习</h2>
          </div>
          <div className="recommendations">
            {recommendations.map((item) => (
              <article className="recommendation" key={item.title}>
                <span className={`recommend-tag ${item.color}`}>{item.label}</span>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
                <button className="outline-btn" type="button" onClick={() => (item.color === "blue" ? onOpenWorkspace(primaryTaskId) : onNavigate("/self-study"))}>
                  {item.action}
                </button>
              </article>
            ))}
          </div>
        </section>

        <div className="analytics-grid">
          <section className="home-card analytics-card">
            <h2>学习进度</h2>
            <div className="progress-layout">
              <div className="donut">
                <div className="donut-center">
                  <strong>72%</strong>
                  <span>总体进度</span>
                </div>
              </div>
              <div className="legend-list">
                <span><i className="dot blue" />已完成&nbsp; 72%</span>
                <span><i className="dot green" />进行中&nbsp; 20%</span>
                <span><i className="dot gray" />未开始&nbsp; 8%</span>
              </div>
            </div>
          </section>

          <section className="home-card analytics-card radar-card">
            <h2>能力雷达</h2>
            <div className="radar-layout">
              <svg viewBox="0 0 180 170" aria-label="能力雷达图">
                <polygon points="90,14 158,58 132,138 48,138 22,58" fill="#eef4ff" stroke="#cddcff" />
                <polygon points="90,42 130,68 116,120 62,120 48,68" fill="#d7e5ff" stroke="#adc6ff" />
                <polygon points="90,70 104,80 100,102 80,102 76,80" fill="#f8fbff" stroke="#d9e5ff" />
                <polygon points="90,27 135,63 118,124 62,124 43,65" fill="rgba(32, 111, 246, .2)" stroke="#176cf5" strokeWidth="3" />
                <circle cx="90" cy="27" r="4" fill="#176cf5" />
                <circle cx="135" cy="63" r="4" fill="#176cf5" />
                <circle cx="118" cy="124" r="4" fill="#176cf5" />
                <circle cx="62" cy="124" r="4" fill="#176cf5" />
                <circle cx="43" cy="65" r="4" fill="#176cf5" />
                <text x="90" y="11" textAnchor="middle">逻辑思维</text>
                <text x="164" y="63">逻辑思维</text>
                <text x="123" y="151">算法能力</text>
                <text x="18" y="151">问题解决</text>
                <text x="0" y="66">学习效率</text>
              </svg>
              <div className="skill-list">
                {skills.map((skill) => (
                  <div className="skill-row" key={skill.name}>
                    <span>{skill.name}</span>
                    <div className="skill-bar"><i style={{ width: `${skill.value}%` }} /></div>
                    <b>{skill.value}</b>
                  </div>
                ))}
                <p className="growth">较上月总体提升 <b>6% ↑</b></p>
              </div>
            </div>
          </section>
        </div>

        <footer className="home-footer">© 2024 CodeTrack · 时代码点亮未来 <span>帮助中心</span><span>隐私政策</span><span>用户协议</span></footer>
      </section>

      <aside className="home-aside">
        <section className="home-card right-card today-goal">
          <div className="home-card-header">
            <h2>今日目标</h2>
            <button className="text-link" type="button">编辑</button>
          </div>
          <div className="goal-ring">
            <div>
              <strong>70%</strong>
              <span>已完成</span>
            </div>
          </div>
          <div className="goal-list">
            <span className="done"><Check size={14} />学习时长 ≥ 60 分钟</span>
            <span className="done"><Check size={14} />完成 1 个编程任务</span>
            <span><i />完成 15 道练习题</span>
          </div>
        </section>

        <section className="home-card right-card">
          <div className="home-card-header">
            <h2>近期提醒</h2>
            <button className="text-link" type="button">查看全部</button>
          </div>
          <div className="reminder-list">
            {reminders.map((item) => (
              <article className="reminder-item" key={item.title}>
                <div className={`reminder-icon ${item.color}`}>{item.icon}</div>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.desc}</span>
                  <em>{item.time}</em>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="home-card right-card ai-card">
          <h2>AI 助学</h2>
          <img src={robotImg} alt="AI 助学机器人" />
          <strong>AI 助教小码</strong>
          <p>有问题随时问我，为你提供学习建议。</p>
          <button className="primary-btn" type="button" onClick={() => onNavigate("/ai-tutor")}>去提问</button>
        </section>

        <section className="home-card right-card resource-card">
          <div className="home-card-header">
            <h2>推荐资料</h2>
            <button className="text-link" type="button" onClick={() => onNavigate("/library")}>查看全部</button>
          </div>
          {resources.map((item) => (
            <article className="resource-item" key={item.title}>
              <div className={`file-icon ${item.color}`}>{item.label}</div>
              <div>
                <strong>{item.title}</strong>
                <span>{item.meta}</span>
              </div>
            </article>
          ))}
        </section>
      </aside>
    </div>
  );
}
