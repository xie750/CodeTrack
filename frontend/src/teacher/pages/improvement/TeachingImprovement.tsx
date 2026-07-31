import { Tabs } from "antd";
import StrategyOptimization from "./StrategyOptimization";
import TaskAdjustment from "./TaskAdjustment";
import EffectEvaluation from "./EffectEvaluation";

/**
 * 开发方案 §十二 教学改进
 * 三个子页共享同一套班级统计上下文，用 Tabs 组织，
 * 与学情诊断（§十）保持一致的交互结构。
 */
export default function TeachingImprovement() {
  return (
    <div className="page-grid">
      <div className="page-lead">
        <h1>教学改进</h1>
        <p>
          基于真实学情统计调整教学策略和任务难度，并评估改进效果。
          AI 只负责解释统计和组织语言，不自动改分、不自动发布正式题目。
        </p>
      </div>

      <Tabs
        items={[
          {
            key: "strategy",
            label: "教学策略优化",
            children: <StrategyOptimization />,
          },
          {
            key: "adjustment",
            label: "任务调整",
            children: <TaskAdjustment />,
          },
          {
            key: "effect",
            label: "教学效果评估",
            children: <EffectEvaluation />,
          },
        ]}
      />
    </div>
  );
}
