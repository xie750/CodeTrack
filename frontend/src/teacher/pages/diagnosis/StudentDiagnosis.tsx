import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  ClipboardCheck,
  Lightbulb,
  Send,
  Sparkles,
  Star,
} from "lucide-react";
import { getStudentAnalytics } from "../../teacherApi";
import type { StudentAnalytics } from "../../teacherTypes";
import RadarChart from "../../components/RadarChart";
import {
  HINT_DEPENDENCY_TEXT,
  formatDateTime,
  knowledgeStateText,
  masteryBand,
  metricText,
  progressStatusText,
  eventTypeText,
  evidenceStrengthText,
} from "./diagnosisLabels";

/**
 * 个体诊断（开发方案 §十 10.2）
 *
 * 画像六件套与学生端 /api/v1/student/profile 走同一个后端序列化函数，所以这里显示的
 * 掌握度、错误统计和建议与学生自己看到的完全一致。教师额外拿到能力证据、提示明细、
 * 行为轨迹和任务历史 —— 这几块学生端看不到。
 *
 * 边界：教师不能在这里改系统掌握分数（§10.2）。写操作类控件（发送反馈、下发补救任务、
 * 推荐资料、重点关注）依赖教师反馈和任务中心模块，本页保持禁用并说明原因，
 * 不做「点了只 console.log」这种假交互（迁移执行清单 §15.2）。
 */

interface Props {
  courseId?: string;
  studentId?: string;
  classId?: string;
}

const PENDING_ACTION_REASON = "该动作属于教师反馈与任务中心模块，接口就绪后开放";

export default function StudentDiagnosis({ courseId, studentId, classId }: Props) {
  const [data, setData] = useState<StudentAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!courseId || !studentId) {
      setData(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    getStudentAnalytics(courseId, studentId, classId)
      .then((result) => {
        if (alive) setData(result);
      })
      .catch(() => {
        if (!alive) return;
        setData(null);
        setError("学生诊断数据加载失败。该学生可能不在当前教师负责的班级名单内。");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [courseId, studentId, classId]);

  if (!courseId) {
    return (
      <div className="class-empty">
        <h2>请先选择课程</h2>
        <p>选定课程后，学生下拉框会列出当前教师负责班级的在册学生。</p>
      </div>
    );
  }

  if (!studentId) {
    return (
      <div className="class-empty">
        <h2>请选择一名学生</h2>
        <p>
          也可以在「班级学情总览」的知识点热力图里点击学生姓名，直接下钻到这里。
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <section className="diagnosis-body" aria-busy="true">
        <div className="diagnosis-two-col">
          <article className="profile-card diagnosis-chart skeleton-block" />
          <article className="profile-card diagnosis-chart skeleton-block" />
        </div>
        <article className="profile-card diagnosis-chart skeleton-block" />
      </section>
    );
  }

  if (error) {
    return <p className="review-message error">{error}</p>;
  }

  if (!data) return null;

  return (
    <section className="diagnosis-body">
      <header className="diagnosis-student-head">
        <div>
          <h2>{data.student.name || data.student.id}</h2>
          <p>
            {data.course?.name ? `${data.course.name} · ` : ""}
            {data.has_profile && data.overview
              ? `画像更新于 ${formatDateTime(data.overview.updated_at)}`
              : "该学生在名册内，但还没有足够的学习记录生成画像"}
          </p>
        </div>
        <div className="diagnosis-student-actions">
          {[
            { label: "发送教师反馈", icon: <Send size={14} /> },
            { label: "下发补救任务", icon: <ClipboardCheck size={14} /> },
            { label: "推荐学习资料", icon: <Sparkles size={14} /> },
            { label: "加入重点关注", icon: <Star size={14} /> },
          ].map((action) => (
            <button
              className="review-back"
              type="button"
              key={action.label}
              disabled
              title={PENDING_ACTION_REASON}
            >
              {action.icon} {action.label}
            </button>
          ))}
        </div>
      </header>

      <p className="diagnosis-sufficiency">
        <AlertTriangle size={14} />
        教师不能直接修改系统掌握分数。上面四个干预动作{PENDING_ACTION_REASON}。
      </p>

      {!data.has_profile ? (
        <div className="class-empty">
          <h2>暂无画像数据</h2>
          <p>
            这不是加载失败：该学生还没有产生足够的提交或答题记录。下面的任务历史和行为
            轨迹是已有的真实记录，可以先据此判断学生是否根本没有开始学习。
          </p>
        </div>
      ) : (
        <>
          <div className="diagnosis-two-col">
            <article className="profile-card diagnosis-chart">
              <div className="profile-section-head">
                <h2>能力维度画像</h2>
              </div>
              <div className="profile-radar-wrap">
                <RadarChart
                  ariaLabel={`${data.student.name} 的能力维度雷达图`}
                  axes={[
                    { label: "掌握进度", value: data.overview?.overall_progress ?? null },
                    {
                      label: "任务完成",
                      value: (data.overview?.recent_task_completion ?? 0) * 100,
                    },
                    {
                      label: "编译稳定",
                      value: 100 - (data.overview?.compile_error_rate ?? 0) * 100,
                    },
                    {
                      label: "逻辑稳定",
                      value: 100 - (data.overview?.logic_error_rate ?? 0) * 100,
                    },
                    {
                      label: "提示自主",
                      value:
                        data.overview?.hint_dependency_level === "HIGH"
                          ? 40
                          : data.overview?.hint_dependency_level === "MEDIUM"
                            ? 70
                            : 90,
                    },
                  ]}
                />
                <div className="profile-legend">
                  <span>
                    <i className="orange" />
                    提示依赖：
                    {HINT_DEPENDENCY_TEXT[
                      (data.overview?.hint_dependency_level ?? "LOW") as "LOW"
                    ]}
                  </span>
                  <span>
                    <i className="green" />
                    编译错误率 {metricText((data.overview?.compile_error_rate ?? 0) * 100, "%")}
                  </span>
                  <span>
                    <i className="blue" />
                    逻辑错误率 {metricText((data.overview?.logic_error_rate ?? 0) * 100, "%")}
                  </span>
                </div>
              </div>
            </article>

            <article className="profile-card diagnosis-chart">
              <div className="profile-section-head">
                <h2>系统结论</h2>
              </div>
              <div className="goal-table">
                <span>整体进度</span>
                <div className="profile-progress-line">
                  <div className="profile-track">
                    <i style={{ width: `${data.overview?.overall_progress ?? 0}%` }} />
                  </div>
                  <b>{metricText(data.overview?.overall_progress)}</b>
                </div>
                <span>近期完成率</span>
                <strong>
                  {metricText((data.overview?.recent_task_completion ?? 0) * 100, "%")}
                </strong>
                <span>系统摘要</span>
                <strong className="diagnosis-summary-text">
                  {data.overview?.summary || "暂无摘要"}
                </strong>
                <span>下一步建议</span>
                <strong className="diagnosis-summary-text">
                  {data.overview?.recommendation || "暂无建议"}
                </strong>
              </div>
            </article>
          </div>

          <div className="diagnosis-two-col">
            <article className="profile-card diagnosis-chart">
              <div className="profile-section-head">
                <h2>知识短板</h2>
                <span className="diagnosis-head-note">掌握度低到高</span>
              </div>
              <div className="weak-list">
                {(data.knowledge_states ?? []).length === 0 ? (
                  <div className="empty-panel">暂无知识点掌握记录。</div>
                ) : (
                  (data.knowledge_states ?? []).map((item, index) => (
                    <div className="weak-row" key={item.knowledge_point}>
                      <span className="rank">{index + 1}</span>
                      <div className="weak-name">
                        <strong>{item.knowledge_point}</strong>
                        <span>
                          掌握度 {Math.round(item.mastery_score)}% ·{" "}
                          {knowledgeStateText(item.state)}
                        </span>
                      </div>
                      <p>{item.last_evidence || `已有 ${item.evidence_count} 条证据。`}</p>
                      <div className="profile-track diagnosis-weak-track">
                        <i
                          className={masteryBand(item.mastery_score) === "excellent" ? "" : "orange"}
                          style={{ width: `${item.mastery_score}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="profile-card diagnosis-chart">
              <div className="profile-section-head">
                <h2>高频错误排行</h2>
              </div>
              <div className="diagnosis-error-bars">
                {(data.frequent_errors ?? []).length === 0 ? (
                  <div className="empty-panel">暂无错误统计记录。</div>
                ) : (
                  (data.frequent_errors ?? []).map((item) => {
                    const max = Math.max(
                      ...(data.frequent_errors ?? []).map((row) => row.count),
                      1
                    );
                    return (
                      <div className="diagnosis-bar-row" key={item.error_type}>
                        <span className="diagnosis-bar-label">
                          {item.label}
                          {item.severity === "HIGH" ? (
                            <em className="diagnosis-severity">
                              <AlertTriangle size={12} /> 高
                            </em>
                          ) : null}
                        </span>
                        <i className="diagnosis-bar-track">
                          <b
                            className={item.severity === "HIGH" ? "red" : "orange"}
                            style={{ width: `${(item.count * 100) / max}%` }}
                          />
                        </i>
                        <b className="diagnosis-bar-value">{item.count} 次</b>
                      </div>
                    );
                  })
                )}
              </div>
            </article>
          </div>
        </>
      )}

      <article className="profile-card diagnosis-chart">
        <div className="profile-section-head">
          <h2>任务历史</h2>
          <span className="diagnosis-head-note">当前教师已发布的任务</span>
        </div>
        {data.task_history.length === 0 ? (
          <div className="empty-panel">当前范围内还没有已发布任务。</div>
        ) : (
          <div className="diagnosis-trend-table">
            {data.task_history.map((item) => (
              <div className="diagnosis-trend-row" key={item.task_id}>
                <strong>{item.task_title}</strong>
                <span className={`diagnosis-status ${item.status.toLowerCase()}`}>
                  {progressStatusText(item.status)}
                </span>
                <span>
                  得分 <b>{metricText(item.score)}</b>
                </span>
                <span>
                  提交 <b>{item.version_count}</b> 次
                </span>
                <span>
                  最高提示 <b>{item.highest_hint_level}</b> 级
                </span>
                <span>最后提交 {formatDateTime(item.last_submitted_at)}</span>
              </div>
            ))}
          </div>
        )}
      </article>

      <div className="diagnosis-two-col">
        <article className="profile-card diagnosis-chart">
          <div className="profile-section-head">
            <h2>提示使用分析</h2>
            <span className="diagnosis-head-note">含学生是否主动索取</span>
          </div>
          {data.hint_usage.length === 0 ? (
            <div className="empty-panel">该学生没有查看过分层提示。</div>
          ) : (
            <div className="profile-timeline">
              {data.hint_usage.map((item) => (
                <div className="record-row" key={item.hint_id}>
                  <span>
                    <Lightbulb size={16} />
                  </span>
                  <strong>
                    {item.level} 级提示　{item.task_title || item.task_id || "未关联任务"}
                  </strong>
                  <em>
                    {item.student_requested ? "学生主动索取" : "系统推送"}
                    {item.request_reason ? ` · ${item.request_reason}` : ""}
                    {item.version_no !== null ? ` · 第 ${item.version_no} 版` : ""}
                  </em>
                  <time>{formatDateTime(item.viewed_at)}</time>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="profile-card diagnosis-chart">
          <div className="profile-section-head">
            <h2>能力证据</h2>
            <span className="diagnosis-head-note">学生端不展示这一层</span>
          </div>
          {data.capability_evidence.length === 0 ? (
            <div className="empty-panel">暂无能力证据记录。</div>
          ) : (
            <div className="advice-list">
              {data.capability_evidence.map((item) => (
                <div className="advice-row" key={item.evidence_id}>
                  <span className={item.strength === "STRONG" ? "green" : "orange"}>
                    <BadgeCheck size={21} />
                  </span>
                  <div>
                    <strong>
                      {item.capability_name}
                      <em className="diagnosis-inline-tag">
                        {evidenceStrengthText(item.strength)}
                      </em>
                      {item.teacher_confirmed ? (
                        <em className="diagnosis-inline-tag confirmed">教师已确认</em>
                      ) : null}
                    </strong>
                    <p>
                      {item.explanation}
                      <br />
                      来自：{item.task_title} · {formatDateTime(item.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>

      <article className="profile-card diagnosis-chart">
        <div className="profile-section-head">
          <h2>行为轨迹时间线</h2>
          <span className="diagnosis-head-note">最近的学习事件在最上面</span>
        </div>
        {data.behavior_timeline.length === 0 ? (
          <div className="empty-panel">
            该学生在本课程下还没有任何学习行为记录，可能从未进入过任务。
          </div>
        ) : (
          <div className="profile-timeline">
            {data.behavior_timeline.map((item) => (
              <div className="record-row" key={item.event_id}>
                <span>
                  <ClipboardCheck size={16} />
                </span>
                <strong>{eventTypeText(item.event_type)}</strong>
                <em>
                  {item.knowledge_points.length
                    ? item.knowledge_points.join(" / ")
                    : item.task_id || "无关联知识点"}
                  {item.error_type ? ` · ${item.error_type}` : ""}
                </em>
                <time>{formatDateTime(item.created_at)}</time>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
