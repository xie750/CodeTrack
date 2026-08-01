import { AlertTriangle, Info } from "lucide-react";
import TeacherSubNav from "../../components/TeacherSubNav";
import { improvementNav } from "./improvementNav";

/**
 * 任务调整（开发方案 §十二 12.2）—— 骨架页
 *
 * 这一页刻意不放任何可点击的调整或发布动作：核心动作依赖任务中心（§四）的写接口，
 * 那些接口还不存在，给一个能点的按钮只会造成「已调整」的假象。
 * 样式与本模块其他子页一致（学生端那套手写卡片），不使用 antd。
 */

const BLOCKER =
  "任务调整的核心动作是「把原任务复制为新任务或新版本再发布」，依赖任务中心（§四）的" +
  "任务创建、题目编辑和发布接口。/teacher/tasks 下的任务新建、题目编辑、编程题配置、" +
  "评分提示配置和发布页目前都还是框架页，没有可调用的写接口，因此本页不提供任何可点击的" +
  "调整或发布动作。";

const CONTROLS: Array<[string, string]> = [
  ["原任务选择器", "选择需要调整的任务"],
  ["难度建议", "展示系统或 AI 建议"],
  ["难度调节器", "调整下一次任务难度"],
  ["任务模板推荐", "推荐适合的任务模板"],
  ["复制并调整按钮", "从原任务创建新版本"],
  ["知识点补充选择器", "添加需要强化的知识点"],
  ["目标学生选择器", "选择全班或部分学生"],
  ["A/B 方案开关", "创建两个教学方案"],
  ["发布新任务按钮", "发布调整后的任务"],
];

const BOUNDARIES = [
  "已结束任务不得直接修改历史内容",
  "调整应复制为新任务或新版本",
  "学生历史提交和成绩必须保留",
  "A/B 第一版只做分组下发和结果对比，不做复杂实验平台",
];

export default function TaskAdjustment() {
  return (
    <div className="improve-page">
      <TeacherSubNav items={improvementNav} ariaLabel="教学改进子页面" />

      <header className="review-head">
        <div className="review-head-copy">
          <h1>任务调整</h1>
          <p>
            基于任务质量分析调整下一次任务的难度和知识点覆盖。调整一律复制为新任务或新版本，
            不改历史内容，学生的历史提交和成绩必须保留。
          </p>
        </div>
      </header>

      <div className="class-empty">
        <h2>该子页依赖未就绪</h2>
        <p>{BLOCKER}</p>
      </div>

      <section className="profile-card profile-pad">
        <div className="profile-section-head">
          <h2>页面控件（§十二 12.2）</h2>
          <span className="class-badge">待开发</span>
        </div>
        <div className="goal-table improve-control-table">
          {CONTROLS.map(([name, desc]) => (
            <ControlRow key={name} name={name} desc={desc} />
          ))}
        </div>
      </section>

      <section className="profile-card profile-pad">
        <div className="profile-section-head">
          <h2>开发边界（不得越界实现）</h2>
        </div>
        <ul className="improve-notes">
          {BOUNDARIES.map((item) => (
            <li className="improve-note warn" key={item}>
              <AlertTriangle size={14} />
              {item}
            </li>
          ))}
        </ul>
        <p className="improve-note">
          <Info size={14} />
          任务中心的写接口就绪后，本页可直接接入，届时请把上面的控件清单逐条替换成真实控件。
        </p>
      </section>
    </div>
  );
}

function ControlRow({ name, desc }: { name: string; desc: string }) {
  return (
    <>
      <span>{name}</span>
      <strong>
        {desc}
        <em className="improve-control-flag">待开发</em>
      </strong>
    </>
  );
}
