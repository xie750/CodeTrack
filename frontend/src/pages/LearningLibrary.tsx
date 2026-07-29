import { useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  FileText,
  Filter,
  Heart,
  Pencil,
  PlusCircle,
  Search,
  Target
} from "lucide-react";

type FavoriteType = "编程题" | "练习题" | "考核题";

type FavoriteItem = {
  title: string;
  type: FavoriteType;
  badgeClass: "green" | "purple" | "orange";
  tags: string[];
  description: string;
  course: string;
  className: string;
  collectedAt: string;
  difficulty: string;
  progress: number;
  count: string;
};

const favoriteItems: FavoriteItem[] = [
  {
    title: "两数之和",
    type: "编程题",
    badgeClass: "green",
    tags: ["C++", "算法", "数组"],
    description: "给定一个整数数组 nums 和一个目标值 target，找出和为目标值的两个数下标。",
    course: "数据结构",
    className: "软件工程 2 班",
    collectedAt: "2024-05-26 23:59",
    difficulty: "中等",
    progress: 20,
    count: "2/10"
  },
  {
    title: "链表基础练习",
    type: "练习题",
    badgeClass: "purple",
    tags: ["C++", "数据结构", "链表"],
    description: "练习链表的基本操作与概念理解，巩固链表的插入、删除与反转等操作。",
    course: "数据结构",
    className: "软件工程 2 班",
    collectedAt: "2024-05-25 21:10",
    difficulty: "简单",
    progress: 60,
    count: "6/10"
  },
  {
    title: "数据库基础测验",
    type: "考核题",
    badgeClass: "orange",
    tags: ["单选", "填空", "SQL"],
    description: "考查数据库基础知识点，包含 SQL 语句与概念理解题。",
    course: "数据库原理",
    className: "软件工程 2 班",
    collectedAt: "2024-05-26 23:59",
    difficulty: "中等",
    progress: 35,
    count: "7/20"
  },
  {
    title: "条件判断综合题",
    type: "练习题",
    badgeClass: "purple",
    tags: ["单选", "判断题", "C++"],
    description: "基于条件判断语句的综合应用练习，巩固 if-else 与 switch-case 的使用。",
    course: "程序设计基础",
    className: "软件工程 2 班",
    collectedAt: "2024-05-23 19:30",
    difficulty: "简单",
    progress: 80,
    count: "8/10"
  },
  {
    title: "Python 函数练习",
    type: "编程题",
    badgeClass: "green",
    tags: ["Python", "函数", "基础"],
    description: "通过多个小题练习函数定义、调用与参数传递等基础知识。",
    course: "Python 基础",
    className: "软件工程 2 班",
    collectedAt: "2024-05-22 18:45",
    difficulty: "简单",
    progress: 50,
    count: "5/10"
  },
  {
    title: "栈与队列复习",
    type: "练习题",
    badgeClass: "purple",
    tags: ["数据结构", "栈", "队列"],
    description: "复习栈与队列的基本概念与实现，包含多种题型巩固理解。",
    course: "数据结构",
    className: "软件工程 2 班",
    collectedAt: "2024-05-21 21:05",
    difficulty: "中等",
    progress: 30,
    count: "3/10"
  }
];

const tabs = ["全部收藏", "编程题", "练习题", "考核题", "最近收藏"];

export default function LearningLibrary() {
  const [activeTab, setActiveTab] = useState("全部收藏");
  const [query, setQuery] = useState("");
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return favoriteItems.filter((item) => {
      const typeMatch = activeTab === "全部收藏" || activeTab === "最近收藏" || item.type === activeTab;
      const queryMatch =
        !normalizedQuery ||
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery));
      return typeMatch && queryMatch;
    });
  }, [activeTab, query]);

  function removeFavorite(title: string) {
    setRemoved((current) => new Set(current).add(title));
  }

  return (
    <div className="library-page">
      <section className="library-main">
        <header className="library-head">
          <div className="library-head-left">
            <h1>收藏夹</h1>
            <button type="button" className="library-select">
              软件工程 2 班
              <ChevronDown size={17} />
            </button>
            <button type="button" className="library-select library-select-sm">
              数据结构
              <ChevronDown size={17} />
            </button>
          </div>
          <label className="library-search">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索收藏的题目" />
            <Search size={18} />
          </label>
        </header>

        <section className="library-stats" aria-label="收藏统计">
          <StatCard title="收藏题目总数" value="48" unit="道" detail="较上周" growth="+6" tone="blue" icon={<Bookmark size={24} fill="currentColor" />} />
          <StatCard title="本周新增" value="6" unit="道" detail="较上周" growth="+3" tone="orange" icon={<PlusCircle size={25} fill="currentColor" />} />
          <StatCard title="编程题" value="24" unit="道" detail="占比 50%" tone="green" icon={<Code2 size={25} />} />
          <StatCard title="练习题" value="16" unit="道" detail="占比 33%" tone="purple" icon={<Pencil size={25} fill="currentColor" />} />
        </section>

        <section className="library-filterbar">
          <div className="library-tabs" role="tablist" aria-label="收藏类型">
            {tabs.map((tab) => (
              <button key={tab} type="button" className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
                {tab}
              </button>
            ))}
          </div>
          <div className="library-tools">
            <button type="button" className="library-select library-sort">
              最新收藏
              <ChevronDown size={17} />
            </button>
            <button type="button" className="library-filter">
              <Filter size={17} />
              筛选
              <ChevronDown size={15} />
            </button>
          </div>
        </section>

        <section className="favorite-grid" aria-label="收藏题目列表">
          {filtered.map((item) => (
            <article key={item.title} className={removed.has(item.title) ? "favorite-card faded" : "favorite-card"}>
              <button type="button" className="favorite-heart" aria-label={`取消收藏 ${item.title}`} onClick={() => removeFavorite(item.title)}>
                <Heart size={23} fill="currentColor" />
              </button>
              <span className={`favorite-badge ${item.badgeClass}`}>{item.type}</span>
              <h2>{item.title}</h2>
              <div className="favorite-tags">
                {item.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <p>{item.description}</p>
              <div className="favorite-meta">
                {item.course} · {item.className}
                <br />
                收藏时间：{item.collectedAt}
              </div>
              <div className="favorite-progress-row">
                <span>
                  难度：<b className={item.difficulty === "中等" ? "warn" : ""}>{item.difficulty}</b>
                </span>
                <div>
                  <div className="favorite-progress-label">
                    <span>进度：</span>
                    <b>
                      {item.progress}% ({item.count})
                    </b>
                  </div>
                  <i className="favorite-track">
                    <b style={{ width: `${item.progress}%` }} />
                  </i>
                </div>
              </div>
              <div className="favorite-actions">
                <button type="button" className="solid">查看题目</button>
                <button type="button">继续练习</button>
                <button type="button" className="ghost" onClick={() => removeFavorite(item.title)}>
                  取消收藏
                </button>
              </div>
            </article>
          ))}
        </section>

        <footer className="library-footer">
          <span>© 2024 CodeTrack</span>
          <span>·</span>
          <span>时代码点亮未来</span>
          <span>帮助中心</span>
          <span>|</span>
          <span>隐私政策</span>
          <span>|</span>
          <span>用户协议</span>
        </footer>
      </section>

      <aside className="library-aside" aria-label="收藏侧栏">
        <section className="library-side-card overview">
          <header>
            <h2>收藏概览</h2>
            <a href="#">
              查看详情 <ChevronRight size={14} />
            </a>
          </header>
          <div className="library-overview-body">
            <div className="library-donut">
              <div>
                <strong>48</strong>
                <span>总收藏</span>
              </div>
            </div>
            <div className="library-legend">
              <span>
                <i className="green" /> 编程题&nbsp;&nbsp;24 (50%)
              </span>
              <span>
                <i className="purple" /> 练习题&nbsp;&nbsp;16 (33%)
              </span>
              <span>
                <i className="orange" /> 考核题&nbsp;&nbsp;8 (17%)
              </span>
            </div>
          </div>
          <div className="library-side-summary">
            <span>本周新增：6 道</span>
            <span>
              较上周：<b>▲ 3 道</b>
            </span>
          </div>
        </section>

        <section className="library-side-card recent">
          <header>
            <h2>最近收藏</h2>
            <a href="#">
              查看全部 <ChevronRight size={14} />
            </a>
          </header>
          <RecentItem tone="green" icon={<Code2 size={17} />} title="两数之和" meta="编程题 · 数据结构" time="刚刚" />
          <RecentItem tone="purple" icon={<FileText size={16} />} title="链表基础练习" meta="练习题 · 数据结构" time="1 小时前" />
          <RecentItem tone="orange" icon={<FileText size={16} />} title="数据库基础测验" meta="考核题 · 数据库原理" time="昨天 23:59" />
        </section>

        <section className="library-side-card advice">
          <header>
            <h2>学习建议</h2>
          </header>
          <AdviceItem tone="blue" icon={<BarChart3 size={22} />} title="坚持每日练习" text="本周已收藏 6 道题，继续保持！" />
          <AdviceItem tone="green" icon={<Target size={22} />} title="强化薄弱知识点" text="条件判断得分较低，建议重点练习" />
          <AdviceItem tone="orange" icon={<Clock3 size={22} />} title="定期回顾收藏" text="回顾收藏可提升 20% 掌握率" />
          <button type="button" className="plan-button">
            生成个性化学习计划
          </button>
        </section>
      </aside>
    </div>
  );
}

function StatCard({
  title,
  value,
  unit,
  detail,
  growth,
  tone,
  icon
}: {
  title: string;
  value: string;
  unit: string;
  detail: string;
  growth?: string;
  tone: "blue" | "orange" | "green" | "purple";
  icon: ReactNode;
}) {
  return (
    <article className="library-stat">
      <span className={`library-stat-icon ${tone}`}>{icon}</span>
      <h2>{title}</h2>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
      <p>
        {detail} {growth && <b>{growth}</b>}
      </p>
    </article>
  );
}

function RecentItem({ tone, icon, title, meta, time }: { tone: string; icon: ReactNode; title: string; meta: string; time: string }) {
  return (
    <div className="recent-favorite">
      <span className={`recent-icon ${tone}`}>{icon}</span>
      <div>
        <strong>{title}</strong>
        <span>{meta}</span>
      </div>
      <em>{time}</em>
    </div>
  );
}

function AdviceItem({ tone, icon, title, text }: { tone: string; icon: ReactNode; title: string; text: string }) {
  return (
    <div className="library-advice-item">
      <span className={`advice-icon ${tone}`}>{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}
