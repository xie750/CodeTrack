import {
  BellRing,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  FileCode2,
  FileText,
  Filter,
  Flame,
  Grid2X2,
  List,
  Maximize2,
  MoreVertical,
  Plus,
  Save,
  Send,
  SquareCode,
  SunMedium,
  UserRound
} from "lucide-react";

type PageProps = {
  onOpenWorkspace: (taskId?: string) => void;
};

const stats = [
  { title: "班级任务总数", value: "18", sub: "较上周 +2", icon: <FileText size={28} />, color: "blue" },
  { title: "进行中任务", value: "7", sub: "较上周 +1", icon: <BellRing size={28} />, color: "orange" },
  { title: "已完成任务", value: "11", sub: "较上周 +3", icon: <CheckCircle2 size={28} />, color: "green" },
  { title: "本周截止任务", value: "3", sub: "本周日截止", icon: <CalendarDays size={28} />, color: "indigo" }
];

const taskCards = [
  {
    type: "考核任务",
    title: "期中考核：数据库基础测验",
    tags: ["单选", "填空"],
    desc: "考查数据库基础知识点，包含 SQL 语句与概念理解题。",
    deadline: "2024-05-24 23:59",
    teacher: "张老师",
    progress: 35,
    count: "7/20",
    action: "继续作答",
    color: "red"
  },
  {
    type: "练习任务",
    title: "课堂练习：链表基础",
    tags: ["判断", "填空"],
    desc: "练习链表的基本操作与概念理解，巩固课堂所学知识。",
    deadline: "2024-05-20 23:59",
    teacher: "李老师",
    progress: 60,
    count: "6/10",
    action: "继续练习",
    color: "green"
  },
  {
    type: "编程任务",
    title: "编程任务：两数之和",
    tags: ["C++", "算法"],
    desc: "实现两数之和算法，返回目标值对应的下标。",
    deadline: "2024-05-26 23:59",
    teacher: "王老师",
    progress: 20,
    count: "2/10",
    action: "进入编程",
    color: "purple",
    hot: true
  }
];

const testRows = [
  ["测试点 1", "[2,7,11,15], 9", "[0,1]", "[0,1]", "通过", "3 ms"],
  ["测试点 2", "[3,2,4], 6", "[1,2]", "[1,2]", "通过", "2 ms"],
  ["测试点 3", "[3,3], 6", "[0,1]", "[0,1]", "通过", "1 ms"],
  ["测试点 4", "[3,5,7,10], 13", "[1,3]", "[1,3]", "通过", "4 ms"],
  ["测试点 5", "[0,4,3,0], 0", "[0,3]", "[-1,-1]", "失败", "1 ms"]
];

const codeLines = [
  "class Solution {",
  "public:",
  "    vector<int> twoSum(vector<int>& nums, int target) {",
  "        unordered_map<int, int> mp;",
  "        for (int i = 0; i < nums.size(); i++) {",
  "            int complement = target - nums[i];",
  "            if (mp.count(complement)) {",
  "                return {mp[complement], i};",
  "            }",
  "            mp[nums[i]] = i;",
  "        }",
  "        return {};",
  "    }",
  "};"
];

export default function CourseTasks({ onOpenWorkspace }: PageProps) {
  return (
    <div className="class-task-page">
      <header className="class-task-head">
        <div className="class-title-row">
          <h1>班级任务</h1>
          <button className="class-select" type="button">软件工程 2 班 <ChevronDown size={16} /></button>
          <button className="class-ghost" type="button"><Plus size={17} /> 加入班级</button>
        </div>
        <div className="class-title-row">
          <div className="view-switch">
            <button type="button"><List size={17} /> 列表视图</button>
            <button className="active" type="button"><Grid2X2 size={17} /> 卡片视图</button>
          </div>
          <button className="class-primary" type="button" onClick={() => onOpenWorkspace("task_linked_list_delete_001")}>
            <SquareCode size={17} /> 进入编程模式
          </button>
        </div>
      </header>

      <div className="class-task-body">
      <section className="class-task-main">
        <section className="class-stats">
          {stats.map((stat) => (
            <article className="class-card class-stat" key={stat.title}>
              <span className={stat.color}>{stat.icon}</span>
              <p>{stat.title}</p>
              <strong>{stat.value}<small> 个</small></strong>
              <em>{stat.sub}</em>
            </article>
          ))}
        </section>

        <div className="class-filters">
          <div className="class-tabs">
            {["全部任务", "考核任务", "练习任务", "编程任务", "已完成"].map((tab, index) => <button className={index === 0 ? "active" : ""} type="button" key={tab}>{tab}</button>)}
          </div>
          <div className="class-filter-actions">
            <button type="button">最新发布 <ChevronDown size={15} /></button>
            <button type="button">筛选 <Filter size={15} /></button>
          </div>
        </div>

        <section className="class-task-grid">
          {taskCards.map((task) => (
            <article className={`class-card class-task-card ${task.hot ? "highlight" : ""}`} key={task.title}>
              {task.hot ? <Flame className="hot-icon" size={21} fill="currentColor" /> : null}
              <span className={`class-badge ${task.color}`}>{task.type}</span>
              <h2>{task.title}</h2>
              <div className="class-tag-row">{task.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              <p>{task.desc}</p>
              <div className="class-meta">
                <span><CalendarDays size={14} /> 截止时间：{task.deadline}</span>
                <span><UserRound size={14} /> 发布老师：{task.teacher}</span>
              </div>
              <div className="class-task-bottom">
                <div>
                  <div className="class-progress-meta"><span>进度</span><b>{task.progress}% <small>({task.count})</small></b></div>
                  <div className="class-progress"><i style={{ width: `${task.progress}%` }} /></div>
                </div>
                <button className={task.hot ? "primary" : ""} type="button" onClick={() => task.hot && onOpenWorkspace("task_linked_list_delete_001")}>{task.action}</button>
              </div>
            </article>
          ))}
        </section>

        <section className="coding-preview">
          <article className="class-card problem-panel">
            <header><h2>编程任务：两数之和</h2><span>难度：<b>中等</b></span></header>
            <h3>题目描述</h3>
            <p>给定一个整数数组 nums 和一个整数目标值 target，请你在该数组中找出和为目标值 target 的那两个整数，并返回它们的数组下标。</p>
            <h3>输入输出说明</h3>
            <ul>
              <li>输入：整数数组 nums 和整数 target</li>
              <li>输出：返回两个整数的下标，返回任意一个即可</li>
            </ul>
            <h3>示例</h3>
            <p>输入：nums = [2,7,11,15], target = 9<br />输出：[0,1]<br />解释：因为 nums[0] + nums[1] == 9，所以返回 [0,1]</p>
            <h3>约束条件</h3>
            <ul>
              <li>2 &lt;= nums.length &lt;= 10⁴</li>
              <li>-10⁹ &lt;= nums[i] &lt;= 10⁹</li>
              <li>只会存在一个有效答案</li>
            </ul>
            <h3>知识点</h3>
            <div className="problem-tags"><span>哈希表</span><span>数组</span><span>两数之和</span><span>时间复杂度</span></div>
            <h3>老师备注</h3>
            <p>请尽量使用 O(n) 时间复杂度和 O(n) 空间复杂度完成。可使用哈希表等辅助结构在好的数据量下找。</p>
          </article>

          <div className="code-column">
            <article className="class-card code-panel">
              <header>
                <h2>代码编辑器</h2>
                <div className="code-tools"><button>C++ <ChevronDown size={14} /></button><SunMedium size={18} /><Maximize2 size={17} /><MoreVertical size={17} /></div>
              </header>
              <pre>{codeLines.map((line, index) => <span key={`${index}-${line}`}><em>{index + 1}</em>{line}</span>)}</pre>
              <footer>
                <button type="button"><Save size={16} /> 保存草稿</button>
                <button type="button" className="primary"><Code2 size={16} /> 运行代码</button>
                <button type="button" className="primary" onClick={() => onOpenWorkspace("task_linked_list_delete_001")}><Send size={16} /> 提交代码</button>
              </footer>
            </article>

            <article className="class-card result-panel">
              <header>
                <nav><button className="active" type="button">测试结果</button><button type="button">运行输出</button></nav>
                <div>执行用时：<strong>12 ms</strong>　内存使用：<strong>8.6 MB</strong> <CheckCircle2 size={18} /></div>
              </header>
              <table>
                <thead><tr><th>测试点</th><th>输入</th><th>期望输出</th><th>你的输出</th><th>结果</th><th>耗时</th></tr></thead>
                <tbody>
                  {testRows.map((row) => (
                    <tr key={row[0]}>
                      {row.map((cell, index) => <td className={index === 4 ? (cell === "通过" ? "pass" : "fail") : ""} key={`${row[0]}-${index}`}>{index === 4 ? <span>{cell === "通过" ? <Check size={13} /> : "×"} {cell}</span> : cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="result-success"><CheckCircle2 size={24} fill="currentColor" /> 全部通过！ <span>恭喜你，你的代码已通过所有测试用例。</span></div>
            </article>
          </div>
        </section>
      </section>

      <aside className="class-task-side">
        <section className="class-card sidecard">
          <h2>今日目标</h2>
          <div className="goal-top"><div><span>目标进度</span><strong>3/5 <small>个任务</small></strong></div><div className="class-ring"><b>60%</b></div></div>
          <div className="class-side-list">
            <p className="done"><Check size={14} /> 完成课堂练习 <span>2/3</span></p>
            <p className="done"><Check size={14} /> 学习编程任务 <span>1/1</span></p>
            <p><i /> 复习题库 <span>0/1</span></p>
          </div>
          <a href="#">查看全部目标</a>
        </section>

        <section className="class-card sidecard">
          <h2>任务提醒</h2>
          <div className="remind-list">
            <p><span className="red" /> <strong>两数之和</strong><em>2 天后截止</em></p>
            <p><span className="orange" /> <strong>数据库基础测验</strong><em>3 天后截止</em></p>
            <p><span className="blue" /> <strong>链表基础练习</strong><em>今天 23:59 截止</em></p>
          </div>
          <a href="#">查看全部提醒</a>
        </section>

        <section className="class-card sidecard">
          <h2>相关资料</h2>
          <div className="material-list">
            <p><span><FileCode2 size={16} /></span><strong>哈希表原理与实现</strong><em>视频 | 12:30</em></p>
            <p><span><FileText size={16} /></span><strong>两数之和解题思路</strong><em>文档</em></p>
            <p><span><Code2 size={16} /></span><strong>C++ unordered_map 用法</strong><em>文档</em></p>
          </div>
          <a href="#">查看全部资料</a>
        </section>

        <section className="class-card sidecard submit-card">
          <h2>提交记录</h2>
          <p><strong>第 3 次</strong><span className="pass">通过</span><em>2 分钟前</em></p>
          <p><strong>第 2 次</strong><span className="pass">通过</span><em>15 分钟前</em></p>
          <p><strong>第 1 次</strong><span className="fail">编译错误</span><em>1 小时前</em></p>
          <a href="#">查看全部记录</a>
        </section>

        <section className="class-card sidecard notice-card">
          <h2>班级公告</h2>
          <strong>本周编程作业安排</strong>
          <p>本周编程作业为链表相关任务，请按时提交以保证得分。</p>
          <em>发布者：王老师<br />2024-05-20 10:30</em>
          <a href="#">查看全部公告</a>
        </section>
      </aside>
      </div>
    </div>
  );
}
