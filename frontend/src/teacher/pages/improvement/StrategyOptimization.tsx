import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BookOpenCheck,
  ChartNoAxesColumnIncreasing,
  CircleAlert,
  ClipboardCheck,
  Gauge,
  Info,
  Lightbulb,
  RefreshCw,
  Target,
} from "lucide-react";
import TeacherSubNav from "../../components/TeacherSubNav";
import { getImprovementStrategy, getTeacherTeachingAssignments } from "../../teacherApi";
import type {
  ImprovementStrategyData,
  ImprovementSuggestion,
} from "../../teacherTypes";
import { improvementNav } from "./improvementNav";
import {
  SEVERITY_TEXT,
  barWidth,
  errorSeverityText,
  formatDelta,
  formatRate,
  formatScore,
  masteryStateText,
  severityBadgeClass,
} from "./improvementLabels";

/**
 * 教学策略优化（开发方案 §十二 12.1）
 *
 * 数据全部来自后端聚合接口 `/api/v1/teacher/improvement/strategy`，它复用学情诊断
 * （§十）那套班级聚合，所以这一页和班级学情总览的数字同源、不会出现两个口径。
 *
 * 「教学建议」是**后端规则**从统计推导的，不是大模型输出 —— 卡片上必须保留「规则生成」
 * 标识和 suggestion_meta.note，不要改成 AI 措辞（§15.3）。
 *
 * 控件样式沿用学生端那套手写卡片（.profile-card / .weak-row / .advice-row /
 * .class-stat / .class-tabs），不使用 antd 默认外观。
 */

const SUGGESTION_ICONS: Record<string, JSX.Element> = {
  WEAK_KNOWLEDGE_POINT: <Target size={21} />,
  DEVELOPING_KNOWLEDGE_POINT: <Target size={21} />,
  HIGH_FREQUENCY_ERROR: <CircleAlert size={21} />,
  LOW_COMPLETION: <ClipboardCheck size={21} />,
  HINT_DEPENDENCY: <Lightbulb size={21} />,
  LOGIC_OVER_COMPILE: <ChartNoAxesColumnIncreasing size={21} />,
  LOW_AVG_SCORE: <Gauge size={21} />,
  TREND_REGRESSION: <ChartNoAxesColumnIncreasing size={21} />,
  INSUFFICIENT_SCORE_DATA: <Info size={21} />,
  SMALL_SAMPLE: <Info size={21} />,
  STEADY: <BookOpenCheck size={21} />,
};

const COMPARE_METRICS: Array<{ key: string; label: string; unit: string }> = [
  { key: "completion_rate", label: "任务完成率", unit: "%" },
  { key: "avg_score", label: "平均成绩", unit: " 分" },
  { key: "avg_mastery", label: "平均掌握度", unit: "%" },
  { key: "hint_ratio", label: "二级以上提示占比", unit: "%" },
];

export default function StrategyOptimization() {
  const navigate = useNavigate();

  const [courses, setCourses] = useState<Array<{ course_id: string; title: string }>>([]);
  const [courseId, setCourseId] = useState("");
  const [classId, setClassId] = useState("");
  const [compareClassId, setCompareClassId] = useState("");
  const [windowDays, setWindowDays] = useState(0);

  const [data, setData] = useState<ImprovementStrategyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /**
   * 课程下拉必须来自「教学安排」而不是 getTeacherCourses()。
   * getTeacherCourses() 返回的是教师作为 owner / enrollment 关联的课程，包含没有
   * 生效教学安排的课；本页的范围口径是 TeachingAssignment（§15.1），拿那种课去查
   * 会被 resolve_diagnosis_scope 直接 403，页面一进来就是错误态。
   */
  useEffect(() => {
    let alive = true;
    getTeacherTeachingAssignments()
      .then((rows) => {
        if (!alive) return;
        const unique = new Map<string, { course_id: string; title: string }>();
        rows.forEach((row) => {
          if (!unique.has(row.course_id)) {
            unique.set(row.course_id, { course_id: row.course_id, title: row.title });
          }
        });
        const list = Array.from(unique.values());
        setCourses(list);
        setCourseId((current) => current || list[0]?.course_id || "");
        if (!list.length) {
          setLoading(false);
          setError("当前账号没有生效的教学安排，无法查看班级统计。请联系管理员分配授课关系。");
        }
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
        setError("课程列表加载失败。请确认已用教师账号登录，后端服务可用后重试。");
      });
    return () => {
      alive = false;
    };
  }, []);

  const load = useCallback(() => {
    if (!courseId) return undefined;
    let alive = true;
    setLoading(true);
    setError("");
    getImprovementStrategy({
      courseId,
      classId: classId || undefined,
      compareClassId: compareClassId || undefined,
      windowDays,
    })
      .then((result) => {
        if (alive) setData(result);
      })
      .catch(() => {
        if (!alive) return;
        setData(null);
        setError("教学改进统计加载失败。该接口只读取本人任教班级的数据，请确认教学安排后重试。");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [courseId, classId, compareClassId, windowDays]);

  useEffect(() => load(), [load]);

  const summary = data?.summary;
  const statCards = useMemo(
    () => [
      {
        title: "任务完成率",
        value: formatRate(summary?.completion_rate ?? null),
        sub: summary
          ? `窗口内 ${summary.published_task_count} 个已发布任务`
          : "按已发布任务的通过情况计算",
        icon: <ClipboardCheck size={26} />,
        color: "",
      },
      {
        title: "平均成绩",
        value: formatScore(summary?.avg_score ?? null),
        // 0 条评分记录时上面显示「—」，这里说明为什么，避免被当成查询坏了
        sub: summary ? `覆盖 ${summary.scored_count} 条已评分进度` : "只统计已评分的任务进度",
        icon: <Gauge size={26} />,
        color: "indigo",
      },
      {
        title: "平均掌握度",
        value: formatRate(summary?.avg_mastery ?? null),
        sub: summary
          ? `${summary.weak_knowledge_point_count}/${summary.knowledge_point_count} 个知识点偏弱`
          : "按知识点班级均值再平均",
        icon: <Target size={26} />,
        color: "green",
      },
      {
        title: "累计错误次数",
        value: summary ? `${summary.error_total_count} 次` : "—",
        sub: summary ? `涉及 ${summary.error_type_count} 类错误` : "来自累计错误统计",
        icon: <CircleAlert size={26} />,
        color: "orange",
      },
    ],
    [summary]
  );

  const reasonFor = useCallback(
    (action: string) =>
      data?.unavailable_actions.find((item) => item.action === action)?.reason ?? "",
    [data]
  );

  const compareOptions = (data?.class_options ?? []).filter(
    (item) => !classId || item.class_id !== classId
  );

  return (
    <div className="improve-page">
      <TeacherSubNav items={improvementNav} ariaLabel="教学改进子页面" />

      <header className="review-head">
        <div className="review-head-copy">
          <h1>教学策略优化</h1>
          <p>
            基于后端聚合后的班级统计给出教学建议。建议由规则直接从统计推导，不调用大模型；
            本页全程只读，不会修改学生成绩，也不会改动学习画像分数。
          </p>
        </div>
        <div className="review-head-actions">
          <button className="review-back" type="button" onClick={load} disabled={loading}>
            <RefreshCw size={15} /> {loading ? "加载中" : "刷新统计"}
          </button>
        </div>
      </header>

      {error ? <p className="review-message error">{error}</p> : null}

      <div className="review-filters">
        <div className="class-tabs" role="group" aria-label="班级选择">
          <button
            type="button"
            className={classId === "" ? "active" : ""}
            aria-pressed={classId === ""}
            onClick={() => {
              setClassId("");
              setCompareClassId("");
            }}
          >
            全部班级
          </button>
          {(data?.class_options ?? []).map((item) => (
            <button
              type="button"
              key={item.class_id}
              className={classId === item.class_id ? "active" : ""}
              aria-pressed={classId === item.class_id}
              onClick={() => {
                setClassId(item.class_id);
                if (compareClassId === item.class_id) setCompareClassId("");
              }}
            >
              {item.class_name}
            </button>
          ))}
        </div>

        <div className="review-filter-group">
          <select
            className="review-select"
            aria-label="课程选择"
            value={courseId}
            onChange={(event) => {
              setCourseId(event.target.value);
              setClassId("");
              setCompareClassId("");
            }}
          >
            {courses.map((course) => (
              <option value={course.course_id} key={course.course_id}>
                {course.title}
              </option>
            ))}
          </select>

          <select
            className="review-select"
            aria-label="时间范围"
            value={String(windowDays)}
            onChange={(event) => setWindowDays(Number(event.target.value))}
          >
            {(data?.window_options ?? [{ days: 0, label: "全部" }]).map((option) => (
              <option value={String(option.days)} key={option.days}>
                时间范围：{option.label}
              </option>
            ))}
          </select>

          <select
            className="review-select"
            aria-label="对比班级"
            value={compareClassId}
            onChange={(event) => setCompareClassId(event.target.value)}
          >
            <option value="">对比班级：不对比</option>
            {compareOptions.map((item) => (
              <option value={item.class_id} key={item.class_id}>
                对比：{item.class_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {data?.window_scope_note ? (
        <p className="improve-note">
          <Info size={14} />
          {data.window_scope_note}
        </p>
      ) : null}

      {loading ? (
        <>
          <section className="review-stats improve-stats" aria-busy="true">
            {Array.from({ length: 4 }).map((_, index) => (
              <article className="class-card class-stat skeleton-block" key={index} />
            ))}
          </section>
          <section className="profile-top-grid">
            <article className="profile-card profile-pad skeleton-block" />
            <article className="profile-card profile-pad skeleton-block" />
          </section>
        </>
      ) : !data ? null : (
        <>
          {data.data_gaps.length ? (
            <ul className="improve-notes">
              {data.data_gaps.map((gap) => (
                <li className="improve-note warn" key={gap.code}>
                  <AlertTriangle size={14} />
                  {gap.message}
                </li>
              ))}
            </ul>
          ) : null}

          <section className="review-stats improve-stats" aria-label="学情摘要">
            {statCards.map((card) => (
              <article className="class-card class-stat" key={card.title}>
                <span className={card.color}>{card.icon}</span>
                <p>{card.title}</p>
                <strong>{card.value}</strong>
                <em>{card.sub}</em>
              </article>
            ))}
          </section>

          <section className="profile-top-grid">
            <article className="profile-card profile-pad">
              <div className="profile-section-head">
                <h2>学情摘要</h2>
                <span className="class-badge">
                  {data.scope.class_names.join(" / ") || data.scope.course_name}
                </span>
              </div>
              <div className="goal-table">
                <span>课程</span>
                <strong>{data.scope.course_name}</strong>
                <span>统计范围</span>
                <strong>
                  {data.scope.class_names.join(" / ") || "全部班级"} · 在册{" "}
                  {data.scope.active_student_count} 人
                </strong>
                <span>画像覆盖</span>
                <strong>
                  {data.scope.with_profile} 人有画像 / {data.scope.without_profile} 人暂无
                </strong>
                <span>时间窗口</span>
                <strong>{data.window.label}</strong>
                <span>任务完成率</span>
                <div className="profile-progress-line">
                  <div className="profile-track">
                    <i style={{ width: barWidth(summary?.completion_rate ?? null) }} />
                  </div>
                  <b>{formatRate(summary?.completion_rate ?? null)}</b>
                </div>
                <span>平均掌握度</span>
                <div className="profile-progress-line">
                  <div className="profile-track">
                    <i
                      className={
                        (summary?.avg_mastery ?? 100) < 60 ? "orange" : undefined
                      }
                      style={{ width: barWidth(summary?.avg_mastery ?? null) }}
                    />
                  </div>
                  <b>{formatRate(summary?.avg_mastery ?? null)}</b>
                </div>
                <span>编译错误率</span>
                <strong>{formatRate(summary?.avg_compile_error_rate ?? null)}</strong>
                <span>逻辑错误率</span>
                <strong>{formatRate(summary?.avg_logic_error_rate ?? null)}</strong>
                <span>提示依赖</span>
                <strong>
                  {summary?.hint_level_2_plus_count ?? 0} 人用到二级及以上（
                  {formatRate(summary?.hint_ratio ?? null)}）
                </strong>
                <span>任务分段</span>
                <strong>
                  {data.trend.early && data.trend.late
                    ? `${data.trend.early.label} ${formatScore(data.trend.early.avg_score)} → ${
                        data.trend.late.label
                      } ${formatScore(data.trend.late.avg_score)}`
                    : "已发布任务不足 2 个，暂不分段"}
                </strong>
              </div>
            </article>

            <article className="profile-card profile-pad">
              <div className="profile-section-head">
                <h2>教学建议</h2>
                <span className="type-tag purple">规则生成</span>
              </div>
              <p className="improve-note">
                <Info size={14} />
                {data.suggestion_meta.note}
              </p>
              <p className="improve-note warn">
                <AlertTriangle size={14} />
                采纳、忽略和生成补充资料三个动作暂不可用（缺少留存表与资料创建接口）；
                「去创建补救任务」会跳转到任务创建入口。
              </p>
              <div className="advice-list improve-advice-list">
                {data.suggestions.map((item) => (
                  <SuggestionRow
                    key={item.id}
                    item={item}
                    reasonFor={reasonFor}
                    onCreateTask={() =>
                      navigate(
                        `/teacher/tasks/new?from=improvement&rule=${encodeURIComponent(
                          item.rule_id
                        )}`
                      )
                    }
                  />
                ))}
              </div>
            </article>
          </section>

          <section className="profile-mid-grid">
            <article className="profile-card profile-pad">
              <div className="profile-section-head">
                <h2>薄弱知识点排行</h2>
                <span className="class-badge">按班级平均掌握度升序</span>
              </div>
              <div className="weak-list">
                {data.weak_knowledge_points.length ? (
                  data.weak_knowledge_points.map((item, index) => (
                    <div className="weak-row" key={item.knowledge_point}>
                      <span className="rank">{index + 1}</span>
                      <div className="weak-name">
                        <strong>{item.knowledge_point}</strong>
                        <span>{masteryStateText(item.state)}</span>
                      </div>
                      <div className="improve-bar-cell">
                        <div className="profile-track">
                          <i
                            className={item.state === "WEAK" ? "orange" : undefined}
                            style={{ width: barWidth(item.avg_mastery) }}
                          />
                        </div>
                        <p>
                          {item.weak_student_count}/{item.covered_students} 名学生偏弱
                        </p>
                      </div>
                      <b className="improve-count">{formatRate(item.avg_mastery)}</b>
                    </div>
                  ))
                ) : (
                  <div className="empty-panel">
                    所选范围还没有知识点掌握记录。学生完成客观题任务后会自动生成。
                  </div>
                )}
              </div>
            </article>

            <article className="profile-card profile-pad">
              <div className="profile-section-head">
                <h2>高频错误排行</h2>
                <span className="class-badge">按影响人数与累计次数</span>
              </div>
              <div className="weak-list">
                {data.frequent_errors.length ? (
                  data.frequent_errors.map((item, index) => (
                    <div className="weak-row" key={item.error_type}>
                      <span className="rank">{index + 1}</span>
                      <div className="weak-name">
                        <strong>{item.label || item.error_type}</strong>
                        <span>严重度 {errorSeverityText(item.severity)}</span>
                      </div>
                      <p>
                        影响 {item.student_count} 名学生
                        {item.related_knowledge_points.length
                          ? ` · 关联 ${item.related_knowledge_points.join("、")}`
                          : ""}
                      </p>
                      <b className="improve-count">{item.total_count} 次</b>
                    </div>
                  ))
                ) : (
                  <div className="empty-panel">所选范围还没有累计错误统计。</div>
                )}
              </div>
            </article>
          </section>

          {data.compare ? (
            <section className="profile-card chart-card improve-compare">
              <h2>
                班级对比{" "}
                <span>
                  （{data.scope.class_names.join(" / ") || "本次范围"} vs{" "}
                  {data.class_options.find((item) => item.class_id === compareClassId)
                    ?.class_name ?? "对比班级"}）
                </span>
              </h2>
              <div className="improve-compare-list">
                {COMPARE_METRICS.map((metric) => {
                  const mine = (summary as unknown as Record<string, number | null>)[metric.key];
                  const other = (
                    data.compare!.summary as unknown as Record<string, number | null>
                  )[metric.key];
                  return (
                    <div className="improve-compare-row" key={metric.key}>
                      <strong>{metric.label}</strong>
                      <div className="improve-compare-bars">
                        <span>
                          <b>本次范围</b>
                          <div className="profile-track">
                            <i style={{ width: barWidth(mine) }} />
                          </div>
                          <em>{formatRate(mine, metric.unit)}</em>
                        </span>
                        <span>
                          <b>对比班级</b>
                          <div className="profile-track">
                            <i className="orange" style={{ width: barWidth(other) }} />
                          </div>
                          <em>{formatRate(other, metric.unit)}</em>
                        </span>
                      </div>
                      <b className="improve-count">
                        {formatDelta(data.compare!.deltas[metric.key] ?? null, metric.unit)}
                      </b>
                    </div>
                  );
                })}
              </div>
              <p className="improve-note">
                <Info size={14} />
                差值为「本次范围 − 对比班级」。任一侧无数据时显示「—」，不按 0 计算。
              </p>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function SuggestionRow({
  item,
  reasonFor,
  onCreateTask,
}: {
  item: ImprovementSuggestion;
  reasonFor: (action: string) => string;
  onCreateTask: () => void;
}) {
  const adoptReason = reasonFor("ADOPT_SUGGESTION");
  const ignoreReason = reasonFor("IGNORE_SUGGESTION");
  const materialReason = reasonFor("GENERATE_MATERIAL");
  const tint = item.severity === "HIGH" ? "orange" : item.severity === "MEDIUM" ? "" : "green";

  return (
    <div className="advice-row">
      <span className={tint}>{SUGGESTION_ICONS[item.rule_id] ?? <Lightbulb size={21} />}</span>
      <div>
        <div className="improve-advice-title">
          <strong>{item.title}</strong>
          <span className={severityBadgeClass(item.severity)}>
            {SEVERITY_TEXT[item.severity]}
          </span>
          <span className="type-tag purple">规则生成</span>
        </div>
        <p>{item.detail}</p>
        {item.evidence.length ? (
          <p className="improve-evidence">
            依据：
            {item.evidence
              .map(
                (entry) =>
                  `${entry.subject || entry.metric} = ${entry.value}（${entry.source_table}）`
              )
              .join("；")}
          </p>
        ) : null}
      </div>
      <div className="improve-advice-actions">
        {/* 三个禁用按钮的理由来自后端 unavailable_actions，tooltip 之外再用 aria 暴露一次 */}
        <button type="button" disabled title={adoptReason} aria-describedby={`${item.id}-why`}>
          采纳
        </button>
        <button type="button" disabled title={ignoreReason} aria-describedby={`${item.id}-why`}>
          忽略
        </button>
        <button type="button" disabled title={materialReason} aria-describedby={`${item.id}-why`}>
          生成资料
        </button>
        <button type="button" className="primary" onClick={onCreateTask}>
          去创建补救任务
        </button>
        <span className="improve-sr-only" id={`${item.id}-why`}>
          {adoptReason} {ignoreReason} {materialReason}
        </span>
      </div>
    </div>
  );
}
