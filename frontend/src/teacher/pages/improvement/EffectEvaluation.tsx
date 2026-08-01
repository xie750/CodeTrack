import { AlertTriangle, Info } from "lucide-react";
import TeacherSubNav from "../../components/TeacherSubNav";
import { improvementNav } from "./improvementNav";

/**
 * 教学效果评估（开发方案 §十二 12.3）—— 骨架页
 *
 * 这一页不展示任何对比数字，原因是结构性的：库里只有画像的当前值，没有历史快照，
 * 「改进前」根本取不到。编一个对比图比留白更糟，所以这里只说清阻塞点。
 *
 * 注意与 §12.1 的区别：策略优化页上的「较早/较近任务」对比来自
 * task_assignments.published_at，那是任务维度的真实历史，和画像维度的历史快照是两件事。
 */

const BLOCKER =
  "教学效果评估要比较改进前后同一批指标，但当前数据库只保存学习画像的当前值：" +
  "learner_profile_snapshots 按 (student_id, course_id) 唯一、" +
  "learner_knowledge_states 按 (student_id, course_id, knowledge_point) 唯一、" +
  "learner_error_stats 按 (student_id, course_id, error_type) 唯一，三张表都在更新时原地覆盖，" +
  "没有任何历史快照表。因此「改进前」的成绩、掌握度、错误数和提示依赖都无法从系统统计中取得，" +
  "本页在补上画像历史快照表之前不展示任何对比数字。";

const CONTROLS: Array<[string, string]> = [
  ["改进前后选择器", "选择对比时间或任务"],
  ["成绩对比图", "展示改进前后成绩"],
  ["知识点提升率", "展示知识点掌握变化"],
  ["错误下降率", "展示高频错误变化"],
  ["提示依赖变化", "展示高级提示使用变化"],
  ["任务完成率变化", "展示完成情况变化"],
  ["AI 教学效果总结", "基于统计生成总结草稿"],
  ["导出教学报告按钮", "导出阶段报告"],
  ["生成学期总结按钮", "生成学期总结草稿"],
];

const BOUNDARIES = [
  "报告中的数字必须来自系统统计，AI 只负责组织语言和解释",
  "报告生成后必须允许教师编辑",
  "自动总结不得作为正式评价直接发布",
];

export default function EffectEvaluation() {
  return (
    <div className="improve-page">
      <TeacherSubNav items={improvementNav} ariaLabel="教学改进子页面" />

      <header className="review-head">
        <div className="review-head-copy">
          <h1>教学效果评估</h1>
          <p>
            对比改进前后的成绩、知识点掌握和错误分布，生成阶段教学报告。
            报告里的每个数字都必须来自系统统计，AI 只负责组织语言。
          </p>
        </div>
      </header>

      <div className="class-empty">
        <h2>该子页依赖未就绪：缺少画像历史快照表</h2>
        <p>{BLOCKER}</p>
      </div>

      <section className="profile-card profile-pad">
        <div className="profile-section-head">
          <h2>页面控件（§十二 12.3）</h2>
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
          当前可用的真实历史只有任务维度的：教学策略优化页已按任务发布时间做了「较早 /
          较近任务」分段对比，可先用那一处。画像维度的前后对比需要先加历史快照表。
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
