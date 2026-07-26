import {
  ArrowLeft,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Code2,
  Eye,
  GraduationCap,
  Lightbulb,
  Maximize2,
  MoreVertical,
  NotebookTabs,
  Play,
  Save,
  Search,
  ShieldCheck,
  Upload,
  Zap
} from "lucide-react";
import avatarImg from "../assets/ui-home/avatar.png";

type PageProps = {
  taskId: string;
  onBack: () => void;
};

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

const testRows = [
  ["测试点 1", "[2,7,11,15], 9", "[0,1]", "[0,1]", "通过", "2 ms"],
  ["测试点 2", "[3,2,4], 6", "[1,2]", "[1,2]", "通过", "2 ms"],
  ["测试点 3", "[3,3], 6", "[0,1]", "[0,1]", "通过", "1 ms"],
  ["测试点 4", "[3,5,7,10], 13", "[1,3]", "[1,3]", "通过", "3 ms"],
  ["测试点 5", "[0,4,3,0], 0", "[0,3]", "[-1,-1]", "失败", "1 ms"]
];

const hints = [
  {
    title: "第一层提示 · 思考方向",
    desc: "思考在遍历数组时，如何正确处理相同的元素值？关注“查询补数”和“存入当前元素下标”的时机。",
    open: false
  },
  {
    title: "第二层提示 · 逻辑分析",
    desc: "对于每个元素 nums[i]：先在哈希表中查找 target - nums[i] 是否存在；如果存在，直接返回对应下标；如果不存在，再把当前元素及其下标存入哈希表。",
    open: true
  },
  {
    title: "第三层提示 · 关键步骤 / 伪代码",
    desc: "创建哈希表 mp，用于存储数值到下标。遍历 nums，计算 complement；若 mp 中存在 complement，返回 {mp[complement], i}；否则写入 nums[i]。",
    open: true
  }
];

const historyRows = [
  ["通过", "2024-06-01 10:25", "12 ms", "8.6 MB"],
  ["通过", "2024-06-01 10:20", "11 ms", "8.2 MB"],
  ["失败", "2024-06-01 10:10", "12 ms", "8.6 MB"],
  ["通过", "2024-06-01 09:55", "10 ms", "8.0 MB"],
  ["通过", "2024-05-31 22:45", "13 ms", "8.7 MB"]
];

const growthItems = [
  ["哈希表使用", "+15 经验值", "熟练度提升 12%", 62],
  ["边界处理", "+10 经验值", "熟练度提升 8%", 52],
  ["复杂度优化", "+8 经验值", "熟练度提升 6%", 44]
];

const suggestions = [
  ["复习哈希表相关知识", "建议复习哈希表的基本操作和使用场景。", "done"],
  ["练习边界条件处理", "多练习包含重复元素、负数等情况的题目。", "warn"],
  ["尝试同类中等题目", "推荐练习：三数之和、有效的字母异位词。", "todo"]
];

export default function TaskWorkspace({ taskId, onBack }: PageProps) {
  return (
    <div className="program-shell" data-task-id={taskId}>
      <header className="program-topbar">
        <div className="program-brand">
          <span><ShieldCheck size={22} /></span>
          <strong>码学堂</strong>
        </div>
        <nav className="program-nav" aria-label="课程导航">
          {["首页", "课程学习", "班级任务", "题库", "竞赛", "学习分析"].map((item) => (
            <button className={item === "班级任务" ? "active" : ""} type="button" key={item}>{item}</button>
          ))}
        </nav>
        <div className="program-top-actions">
          <button type="button" aria-label="搜索"><Search size={22} /></button>
          <button className="program-bell" type="button" aria-label="通知"><Bell size={21} /><span>3</span></button>
          <img src={avatarImg} alt="张同学头像" />
          <strong>张同学</strong>
          <ChevronDown size={16} />
        </div>
      </header>

      <main className="program-page">
        <section className="program-head">
          <div>
            <button className="program-back" type="button" onClick={onBack}><ArrowLeft size={16} /> 返回班级任务</button>
            <div className="program-title-line">
              <h1>编程任务：两数之和</h1>
              <span>难度：<b>中等</b></span>
            </div>
          </div>
          <div className="program-head-actions">
            <button type="button"><Eye size={17} /> 收藏</button>
            <button type="button"><NotebookTabs size={17} /> 笔记</button>
            <button className="outline" type="button"><ChevronLeft size={17} /> 上一题</button>
            <button className="primary" type="button">下一题 <ChevronRight size={17} /></button>
          </div>
        </section>

        <section className="program-grid">
          <article className="program-card program-problem">
            <h2>题目描述</h2>
            <p>给定一个整数数组 nums 和一个整数目标值 target，请你在该数组中找出和为目标值 target 的那两个整数，并返回它们的数组下标。</p>
            <p>你可以假设每个输入只对应一种答案，并且你不可以重复使用数组中的同一个元素。</p>

            <h2>输入输出说明</h2>
            <ul>
              <li>输入：整数数组 nums 和整数 target</li>
              <li>输出：返回这两个整数在数组中的下标，顺序不限。</li>
            </ul>

            <h2>示例</h2>
            <p><b>输入：</b> nums = [2,7,11,15], target = 9</p>
            <p><b>输出：</b> [0,1]</p>
            <p><b>解释：</b> 因为 nums[0] + nums[1] == 9，所以返回 [0,1]</p>

            <h2>约束条件</h2>
            <ul>
              <li>2 &lt;= nums.length &lt;= 10^4</li>
              <li>-10^9 &lt;= nums[i] &lt;= 10^9</li>
              <li>-10^9 &lt;= target &lt;= 10^9</li>
              <li>只会存在一个有效答案</li>
            </ul>

            <h2>知识点</h2>
            <div className="program-tags"><span>哈希表</span><span>数组</span><span>两数之和</span><span>时间复杂度</span></div>

            <h2>老师备注</h2>
            <p>请尽量使用 O(n) 时间复杂度和 O(n) 空间复杂度完成。可使用哈希表存储遍历过程中的数值与下标。</p>
          </article>

          <div className="program-center">
            <article className="program-card program-editor">
              <header>
                <h2>代码编辑器</h2>
                <div>
                  <button type="button">C++ <ChevronDown size={14} /></button>
                  <button type="button" aria-label="主题"><Lightbulb size={17} /></button>
                  <button type="button" aria-label="全屏"><Maximize2 size={17} /></button>
                  <button type="button" aria-label="更多"><MoreVertical size={17} /></button>
                </div>
              </header>
              <pre>{codeLines.map((line, index) => <span key={`${index}-${line}`}><em>{index + 1}</em><code>{line}</code></span>)}</pre>
              <footer>
                <button type="button"><Save size={16} /> 保存草稿</button>
                <button className="primary" type="button"><Play size={16} /> 运行代码</button>
                <button className="primary" type="button"><Upload size={16} /> 提交代码</button>
              </footer>
            </article>

            <article className="program-card program-result">
              <header>
                <nav><button className="active" type="button">测试结果</button><button type="button">运行输出</button></nav>
                <div>执行用时：<b>12 ms</b><span>内存使用：</span><b>8.6 MB</b><CheckCircle2 size={18} /></div>
              </header>
              <table>
                <thead><tr><th>测试点</th><th>输入</th><th>期望输出</th><th>你的输出</th><th>结果</th><th>耗时</th></tr></thead>
                <tbody>
                  {testRows.map((row) => (
                    <tr key={row[0]}>
                      {row.map((cell, index) => (
                        <td className={index === 4 ? (cell === "通过" ? "pass" : "fail") : ""} key={`${row[0]}-${cell}-${index}`}>
                          {index === 4 ? <span>{cell === "通过" ? <Check size={13} /> : <Circle size={12} fill="currentColor" />} {cell}</span> : cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="program-pass"><CheckCircle2 size={18} /> 已通过 4/5 个测试点，继续根据提示优化代码。</div>
            </article>
          </div>

          <aside className="program-card program-ai">
            <header>
              <span><Bot size={22} /></span>
              <h2>AI学习助手</h2>
            </header>
            <section>
              <h3>AI诊断总结</h3>
              <p>你的代码整体思路正确，使用哈希表查找补数，时间复杂度为 O(n)。但在处理重复元素或存储顺序上仍存在问题，导致在某些情况下未能找到有效解。</p>
            </section>
            <section>
              <h3>问题分析</h3>
              <ul>
                <li><b>失败测试点：</b>测试点 5（[0,4,3,0], target = 0）</li>
                <li><b>原因：</b>在处理当前元素前，未先查询补数，可能将当前元素的下标提前存入哈希表，导致误用自身元素或错过有效配对。</li>
              </ul>
            </section>
            <section className="program-hints">
              <h3>分层提示</h3>
              {hints.map((hint, index) => (
                <article className={hint.open ? "open" : ""} key={hint.title}>
                  <button type="button"><Lightbulb size={15} /> {hint.title}<ChevronDown size={15} /></button>
                  <p>{hint.desc}</p>
                  {hint.open && index === 2 ? <ol><li>创建哈希表 mp，用于存储数值到下标；</li><li>遍历数组 nums；</li><li>若找到补数，返回对应下标；否则写入当前元素。</li></ol> : null}
                </article>
              ))}
            </section>
            <div className="hint-usage">
              <p><Eye size={14} /> 第一层提示 <span>已查看（20:45）</span></p>
              <p><Eye size={14} /> 第二层提示 <span>已查看（20:46）</span></p>
              <p><Eye size={14} /> 第三层提示 <span>未查看</span></p>
            </div>
            <footer>
              <button type="button"><GraduationCap size={16} /> 查看讲解</button>
              <button className="primary" type="button"><Lightbulb size={16} /> 获取下一层提示</button>
            </footer>
          </aside>
        </section>

        <section className="program-bottom-grid">
          <article className="program-card program-history">
            <header><h2>提交记录</h2><a href="#">更多 <ChevronRight size={14} /></a></header>
            <table>
              <thead><tr><th>状态</th><th>提交时间</th><th>用时</th><th>内存</th></tr></thead>
              <tbody>
                {historyRows.map((row) => (
                  <tr key={row.join("-")}>
                    <td className={row[0] === "通过" ? "pass" : "fail"}>{row[0]}</td>
                    <td>{row[1]}</td>
                    <td>{row[2]}</td>
                    <td>{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <a className="program-card-link" href="#">查看全部提交 <ChevronRight size={14} /></a>
          </article>

          <article className="program-card program-growth">
            <h2>能力成长 <span>i</span></h2>
            {growthItems.map((item, index) => (
              <div className="growth-row" key={item[0]}>
                <span className={index === 1 ? "orange" : index === 2 ? "blue" : ""}>{index === 0 ? <NotebookTabs size={17} /> : index === 1 ? <Zap size={17} /> : <Code2 size={17} />}</span>
                <div><strong>{item[0]}</strong><p>{item[2]}</p><i><b style={{ width: `${item[3]}%` }} /></i></div>
                <em>{item[1]}</em>
              </div>
            ))}
            <a className="program-card-link" href="#">查看能力详情 <ChevronRight size={14} /></a>
          </article>

          <article className="program-card program-error">
            <header><h2>错因分析</h2><button type="button">本题表现 <ChevronDown size={14} /></button></header>
            <div className="error-layout">
              <div className="error-donut"><strong>5<span>次</span></strong></div>
              <div className="error-legend">
                <p><i className="blue" /> 逻辑错误 <b>60% (3次)</b></p>
                <p><i className="red" /> 边界条件 <b>20% (1次)</b></p>
                <p><i className="orange" /> 超时问题 <b>20% (1次)</b></p>
                <p><i /> 其他问题 <b>0% (0次)</b></p>
              </div>
            </div>
            <a className="program-card-link" href="#">查看错题本 <ChevronRight size={14} /></a>
          </article>

          <article className="program-card program-advice">
            <h2>学习建议</h2>
            {suggestions.map((item) => (
              <div className={item[2]} key={item[0]}>
                <span>{item[2] === "done" ? <Check size={15} /> : item[2] === "warn" ? <Circle size={15} /> : <Circle size={15} />}</span>
                <div><strong>{item[0]}</strong><p>{item[1]}</p></div>
              </div>
            ))}
            <a className="program-card-link" href="#">查看推荐题目 <ChevronRight size={14} /></a>
          </article>
        </section>
      </main>
    </div>
  );
}
