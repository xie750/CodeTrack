import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellRing, CheckCheck, ShieldAlert, UserRound } from "lucide-react";
import { getClassAlerts } from "../../teacherApi";
import type { AlertLevel, ClassAlerts } from "../../teacherTypes";
import {
  ALERT_LEVEL_ORDER,
  ALERT_LEVEL_TEXT,
  formatDateTime,
} from "./diagnosisLabels";

/**
 * 预警中心（开发方案 §十 10.3）
 *
 * 七条第一版规则由后端对现有提交、进度、错误统计和学习事件实时判定，不存预警表。
 * 所以本页是只读的：命中的规则和证据都能追到具体数据，但「标记已处理」「发送提醒」
 * 这类写操作需要 LearningAlert 状态表，接口未就绪时按钮保持禁用并说明原因
 * （迁移执行清单 §15.2：不允许按钮点了只 console.log）。
 *
 * 边界：系统只标记「高相似风险」之类的风险信号，不认定抄袭、不自动处罚（§10.3）。
 */

interface Props {
  courseId?: string;
  classId?: string;
  onOpenStudent?: (studentId: string) => void;
}

type LevelTab = "ALL" | AlertLevel;

const LEVEL_TABS: Array<{ key: LevelTab; label: string }> = [
  { key: "ALL", label: "全部" },
  { key: "HIGH", label: "高风险" },
  { key: "WATCH", label: "关注" },
  { key: "NOTICE", label: "提醒" },
];

export default function AlertCenter({ courseId, classId, onOpenStudent }: Props) {
  const [data, setData] = useState<ClassAlerts | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [levelTab, setLevelTab] = useState<LevelTab>("ALL");
  const [ruleCode, setRuleCode] = useState("");

  useEffect(() => {
    if (!courseId) {
      setData(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    getClassAlerts(courseId, classId)
      .then((result) => {
        if (alive) setData(result);
      })
      .catch(() => {
        if (!alive) return;
        setData(null);
        setError("预警数据加载失败。请确认已用教师账号登录，并且所选班级属于当前教师。");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [courseId, classId]);

  const visible = useMemo(() => {
    const alerts = data?.alerts ?? [];
    return alerts.filter(
      (item) =>
        (levelTab === "ALL" || item.level === levelTab) &&
        (!ruleCode || item.rule_codes.includes(ruleCode))
    );
  }, [data, levelTab, ruleCode]);

  if (!courseId) {
    return (
      <div className="class-empty">
        <h2>请先选择课程</h2>
        <p>预警只在当前教师负责的教学班范围内计算。</p>
      </div>
    );
  }

  if (loading) {
    return (
      <section className="diagnosis-body" aria-busy="true">
        <div className="class-stats diagnosis-stats-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <article className="class-card class-stat skeleton-block" key={index} />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, index) => (
          <article className="class-card diagnosis-alert-row skeleton-block" key={index} />
        ))}
      </section>
    );
  }

  if (error) {
    return <p className="review-message error">{error}</p>;
  }

  if (!data) return null;

  return (
    <section className="diagnosis-body">
      <p className="diagnosis-sufficiency">
        <ShieldAlert size={14} />
        预警按七条规则对真实提交、进度和学习事件实时判定，只作教学参考。系统不认定抄袭、
        不自动处罚学生；{data.actions_disabled_reason}。
      </p>

      <div className="class-stats diagnosis-stats-3">
        {ALERT_LEVEL_ORDER.map((level) => (
          <button
            className="class-card class-stat diagnosis-stat-button"
            type="button"
            key={level}
            aria-pressed={levelTab === level}
            onClick={() => setLevelTab(levelTab === level ? "ALL" : level)}
          >
            <span className={level === "HIGH" ? "orange" : level === "WATCH" ? "indigo" : "green"}>
              {level === "HIGH" ? <AlertTriangle size={28} /> : <BellRing size={28} />}
            </span>
            <p>{ALERT_LEVEL_TEXT[level]}</p>
            <strong>
              {data.level_counts[level]}
              <small> 人</small>
            </strong>
            <em>
              {level === "HIGH"
                ? "命中三条以上或已有任务逾期"
                : level === "WATCH"
                  ? "命中两条规则"
                  : "命中一条规则"}
            </em>
          </button>
        ))}
      </div>

      <div className="review-filters">
        <div className="class-tabs" role="group" aria-label="预警等级筛选">
          {LEVEL_TABS.map((tab) => (
            <button
              type="button"
              key={tab.key}
              className={levelTab === tab.key ? "active" : ""}
              aria-pressed={levelTab === tab.key}
              onClick={() => setLevelTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="review-filter-group">
          <select
            className="review-select"
            aria-label="预警类型筛选"
            value={ruleCode}
            onChange={(event) => setRuleCode(event.target.value)}
          >
            <option value="">预警类型：不限</option>
            {data.rules.map((rule) => (
              <option value={rule.code} key={rule.code}>
                {rule.label}
              </option>
            ))}
          </select>
          <span className="diagnosis-head-note">
            名册 {data.roster_total} 人，命中 {data.alert_count} 人
          </span>
        </div>
      </div>

      {data.alert_count === 0 ? (
        <div className="class-empty">
          <h2>当前范围内没有命中预警的学生</h2>
          <p>
            这是真实结果而不是空占位：名册 {data.roster_total} 人都没有触发七条规则中的任何
            一条。学生出现连续未完成、逾期、重复错误或长期无学习行为时会自动出现在这里。
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="class-empty">
          <h2>当前筛选条件下没有匹配的学生</h2>
          <p>共有 {data.alert_count} 名学生命中预警，换一个等级或类型再看。</p>
        </div>
      ) : (
        <section className="diagnosis-alert-list" aria-label="风险学生列表">
          {visible.map((item) => (
            <article
              className={`class-card diagnosis-alert-row ${item.level.toLowerCase()}`}
              key={item.student_id}
            >
              <span className={`diagnosis-level-badge ${item.level.toLowerCase()}`}>
                {item.level === "HIGH" ? <AlertTriangle size={13} /> : <BellRing size={13} />}
                {ALERT_LEVEL_TEXT[item.level]}
              </span>

              <div className="diagnosis-alert-main">
                <h2>
                  <UserRound size={15} />
                  {item.student_name || item.student_id}
                  <em className="diagnosis-inline-tag">命中 {item.rules.length} 条</em>
                </h2>
                <ul className="diagnosis-rule-list">
                  {item.rules.map((rule) => (
                    <li key={rule.code}>
                      <strong>{rule.label}</strong>
                      <span>{rule.evidence}</span>
                    </li>
                  ))}
                </ul>
                <p className="diagnosis-alert-meta">
                  最近学习行为：{formatDateTime(item.last_activity_at)}
                </p>
              </div>

              <div className="diagnosis-alert-actions">
                <button
                  className="review-back"
                  type="button"
                  onClick={() => onOpenStudent?.(item.student_id)}
                  disabled={!onOpenStudent}
                >
                  查看学生
                </button>
                <button
                  className="review-back"
                  type="button"
                  disabled
                  title={data.actions_disabled_reason}
                >
                  <BellRing size={14} /> 发送提醒
                </button>
                <button
                  className="review-back"
                  type="button"
                  disabled
                  title={data.actions_disabled_reason}
                >
                  <CheckCheck size={14} /> 标记已处理
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
