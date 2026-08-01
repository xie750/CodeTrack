import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BookOpenCheck,
  Gauge,
  Lightbulb,
  TrendingDown,
  Users,
} from "lucide-react";
import { getClassAnalytics } from "../../teacherApi";
import type { ClassAnalytics, ClassScorePoint } from "../../teacherTypes";
import RadarChart from "../../components/RadarChart";
import {
  MASTERY_BANDS,
  formatDate,
  knowledgeStateText,
  masteryBand,
  metricText,
} from "./diagnosisLabels";

/**
 * 班级学情总览（开发方案 §十 10.1）
 *
 * 所有指标由后端确定性计算，本页只做展示和下钻，不在前端二次加工数值，也不生成
 * 任何解释性文案 —— §10.1「原始指标由后端计算，AI 只负责解释和总结」。
 *
 * 控件样式沿用学生端：卡片 .class-card/.profile-card、统计卡 .class-stat、
 * 进度条 .profile-track、图例 .profile-legend、空状态 .empty-panel。
 */

interface Props {
  courseId?: string;
  classId?: string;
  taskId?: string;
  /** 下钻到个体诊断 */
  onOpenStudent?: (studentId: string) => void;
}

export default function ClassOverview({ courseId, classId, taskId, onOpenStudent }: Props) {
  const [data, setData] = useState<ClassAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!courseId) {
      setData(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    getClassAnalytics(courseId, classId, taskId)
      .then((result) => {
        if (alive) setData(result);
      })
      .catch(() => {
        if (!alive) return;
        setData(null);
        setError("班级学情数据加载失败。请确认已用教师账号登录，并且该课程属于当前教师的教学安排。");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [courseId, classId, taskId]);

  if (!courseId) {
    return (
      <div className="class-empty">
        <h2>请先选择课程</h2>
        <p>课程、班级和任务都来自当前教师的教学安排，不需要手动填写编号。</p>
      </div>
    );
  }

  if (loading) {
    return (
      <section className="diagnosis-body" aria-busy="true">
        <div className="class-stats">
          {Array.from({ length: 4 }).map((_, index) => (
            <article className="class-card class-stat skeleton-block" key={index} />
          ))}
        </div>
        <div className="diagnosis-two-col">
          <article className="profile-card diagnosis-chart skeleton-block" />
          <article className="profile-card diagnosis-chart skeleton-block" />
        </div>
      </section>
    );
  }

  if (error) {
    return <p className="review-message error">{error}</p>;
  }

  if (!data) return null;

  const { roster, ability, knowledge, errors, hint_levels: hints, score_trend: trend } = data;
  const hintTotal = hints.none + hints.level_1 + hints.level_2 + hints.level_3;

  // 名册为空说明教学安排下没有在册学生，和「有学生但没画像」是两件事
  if (roster.total === 0) {
    return (
      <div className="class-empty">
        <h2>当前范围内没有在册学生</h2>
        <p>
          学情统计基于行政班在册名单。请确认所选班级已导入学生，或换一个班级查看。
        </p>
      </div>
    );
  }

  return (
    <section className="diagnosis-body">
      <DataSufficiency roster={roster} />

      <div className="class-stats">
        <article className="class-card class-stat">
          <span>
            <Users size={28} />
          </span>
          <p>班级人数</p>
          <strong>
            {roster.total}
            <small> 人</small>
          </strong>
          <em>其中 {roster.with_profile} 人已有画像数据</em>
        </article>

        <article className="class-card class-stat">
          <span className="indigo">
            <Gauge size={28} />
          </span>
          <p>平均掌握进度</p>
          <strong>
            {metricText(ability.overall_progress)}
            <small> 分</small>
          </strong>
          <em>只按有画像的 {roster.with_profile} 人计算</em>
        </article>

        <article className="class-card class-stat">
          <span className="green">
            <BookOpenCheck size={28} />
          </span>
          <p>平均任务完成率</p>
          <strong>
            {metricText(ability.task_completion)}
            <small> %</small>
          </strong>
          <em>来自各学生画像的近期完成率</em>
        </article>

        <article className="class-card class-stat">
          <span className="orange">
            <Lightbulb size={28} />
          </span>
          <p>依赖三级提示</p>
          <strong>
            {hints.level_3}
            <small> 人</small>
          </strong>
          <em>提示等级越高说明任务偏难或讲解不足</em>
        </article>
      </div>

      <div className="diagnosis-two-col">
        <article className="profile-card diagnosis-chart">
          <div className="profile-section-head">
            <h2>班级能力仪表盘</h2>
          </div>
          {roster.with_profile === 0 ? (
            <div className="empty-panel">
              名册内还没有学生产生画像数据，能力维度暂时无法计算。
            </div>
          ) : (
            <div className="profile-radar-wrap">
              <RadarChart
                ariaLabel="班级能力维度雷达图"
                axes={[
                  { label: "掌握进度", value: ability.overall_progress },
                  { label: "任务完成", value: ability.task_completion },
                  // 错误率越低能力越强，所以取补值展示
                  { label: "编译稳定", value: 100 - ability.compile_error_rate },
                  { label: "逻辑稳定", value: 100 - ability.logic_error_rate },
                  {
                    label: "提示自主",
                    value: hintTotal
                      ? Math.round(((hints.none + hints.level_1) * 100) / hintTotal)
                      : null,
                  },
                ]}
              />
              <div className="profile-legend">
                <span>
                  <i className="green" />
                  编译错误率 {metricText(ability.compile_error_rate, "%")}
                </span>
                <span>
                  <i className="orange" />
                  逻辑错误率 {metricText(ability.logic_error_rate, "%")}
                </span>
                <span>
                  <i className="blue" />
                  提示依赖：低 {ability.hint_dependency.LOW} / 中{" "}
                  {ability.hint_dependency.MEDIUM} / 高 {ability.hint_dependency.HIGH}
                </span>
              </div>
            </div>
          )}
        </article>

        <article className="profile-card diagnosis-chart">
          <div className="profile-section-head">
            <h2>提示等级分布</h2>
          </div>
          {hintTotal === 0 ? (
            <div className="empty-panel">暂无提示使用记录。</div>
          ) : (
            <div className="diagnosis-error-bars">
              {[
                { label: "未使用提示", value: hints.none, tone: "green" },
                { label: "一级提示", value: hints.level_1, tone: "blue" },
                { label: "二级提示", value: hints.level_2, tone: "orange" },
                { label: "三级提示", value: hints.level_3, tone: "red" },
              ].map((row) => (
                <div className="diagnosis-bar-row" key={row.label}>
                  <span className="diagnosis-bar-label">{row.label}</span>
                  <i className="diagnosis-bar-track">
                    <b
                      className={row.tone}
                      style={{ width: `${(row.value * 100) / hintTotal}%` }}
                    />
                  </i>
                  <b className="diagnosis-bar-value">{row.value} 人</b>
                </div>
              ))}
            </div>
          )}
        </article>
      </div>

      <ScoreTrend trend={trend} />

      <article className="profile-card diagnosis-chart">
        <div className="profile-section-head">
          <h2>知识点掌握热力图</h2>
          <span className="diagnosis-head-note">点击学生姓名可下钻到个体诊断</span>
        </div>
        {knowledge.points.length === 0 ? (
          <div className="empty-panel">
            名册内还没有知识点掌握记录。学生完成任务后，知识点画像会自动出现在这里。
          </div>
        ) : (
          <>
            <div className="diagnosis-heatmap-scroll">
              <table className="diagnosis-heatmap">
                <thead>
                  <tr>
                    <th scope="col">学生</th>
                    {knowledge.points.map((point) => (
                      <th scope="col" key={point}>
                        {point}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {knowledge.rows.map((row) => (
                    <tr key={row.student_id}>
                      <th scope="row">
                        {onOpenStudent ? (
                          <button
                            className="diagnosis-link"
                            type="button"
                            onClick={() => onOpenStudent(row.student_id)}
                          >
                            {row.student_name || row.student_id}
                          </button>
                        ) : (
                          row.student_name || row.student_id
                        )}
                      </th>
                      {row.cells.map((cell) => (
                        <td
                          key={cell.knowledge_point}
                          className={
                            cell.mastery_score === null
                              ? "diagnosis-cell empty"
                              : `diagnosis-cell ${masteryBand(cell.mastery_score)}`
                          }
                          // 表格不只靠颜色表达（§04 可访问性），单元格内始终有数值和状态
                          title={`${cell.knowledge_point}：${knowledgeStateText(cell.state)}`}
                        >
                          {cell.mastery_score === null ? "—" : Math.round(cell.mastery_score)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">班级平均</th>
                    {knowledge.point_averages.map((item) => (
                      <td key={item.knowledge_point} className="diagnosis-cell avg">
                        {item.avg_mastery === null ? "—" : Math.round(item.avg_mastery)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="profile-legend diagnosis-heatmap-legend">
              {MASTERY_BANDS.map((item) => (
                <span key={item.band}>
                  <i className={`band-${item.band}`} />
                  {item.range}　{item.label}
                </span>
              ))}
              <span>
                <i className="band-empty" />
                无证据
              </span>
            </div>
          </>
        )}
      </article>

      <article className="profile-card diagnosis-chart">
        <div className="profile-section-head">
          <h2>错误分布图谱</h2>
          <span className="diagnosis-head-note">按受影响人数排序</span>
        </div>
        {errors.length === 0 ? (
          <div className="empty-panel">暂无错误统计记录。</div>
        ) : (
          <div className="diagnosis-error-bars">
            {errors.map((item) => (
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
                    style={{ width: `${(item.student_count * 100) / roster.total}%` }}
                  />
                </i>
                <b className="diagnosis-bar-value">
                  {item.student_count} 人 · {item.total_count} 次
                </b>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

/**
 * 数据充分性提示。
 *
 * 迁移执行清单 §11.7 验收要求「真实零值和无数据明确区分」：一个班里有人还没做过任务
 * 时，均值只覆盖部分学生，必须在页面上说清楚，否则教师会把它当成全班水平。
 */
function DataSufficiency({ roster }: { roster: ClassAnalytics["roster"] }) {
  if (roster.without_profile === 0) {
    return (
      <p className="diagnosis-sufficiency full">
        名册 {roster.total} 人全部已有画像数据，下列统计覆盖整个班级。
      </p>
    );
  }
  return (
    <p className="diagnosis-sufficiency">
      <AlertTriangle size={14} />
      名册 {roster.total} 人中有 {roster.with_profile} 人已有画像数据，
      {roster.without_profile} 人尚未产生足够学习记录。均值只按有画像的学生计算，
      未参与的学生不计入，避免把班级水平算低。
    </p>
  );
}

/** 成绩趋势图。用学生端 .line-chart 那套内联折线，坐标按真实数据算 */
function ScoreTrend({ trend }: { trend: ClassScorePoint[] }) {
  const scored = trend.filter((item) => item.avg_score !== null);

  return (
    <article className="profile-card diagnosis-chart">
      <div className="profile-section-head">
        <h2>成绩与提交趋势</h2>
        <span className="diagnosis-head-note">按任务发布时间排序</span>
      </div>

      {trend.length === 0 ? (
        <div className="empty-panel">当前范围内还没有已发布任务。</div>
      ) : (
        <>
          {scored.length < 2 ? (
            <p className="diagnosis-sufficiency">
              <AlertTriangle size={14} />
              只有 {scored.length} 个任务产生了评分，样本不足以画出趋势。下面按任务列出明细。
            </p>
          ) : (
            <TrendChart points={scored} />
          )}

          <div className="diagnosis-trend-table">
            {trend.map((item) => (
              <div className="diagnosis-trend-row" key={item.task_id}>
                <strong>{item.task_title}</strong>
                <span>发布 {formatDate(item.published_at)}</span>
                <span>
                  平均分 <b>{metricText(item.avg_score)}</b>
                  {item.scored_count > 0 ? `（${item.scored_count} 人有分）` : ""}
                </span>
                <span>
                  提交率 <b>{item.submit_rate}%</b>
                </span>
                <span>
                  通过率 <b>{item.pass_rate}%</b>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </article>
  );
}

function TrendChart({ points }: { points: ClassScorePoint[] }) {
  const width = 640;
  const height = 220;
  const left = 44;
  const right = width - 18;
  const top = 22;
  const bottom = height - 38;

  const stepX = points.length > 1 ? (right - left) / (points.length - 1) : 0;
  const yFor = (value: number) => bottom - (Math.max(0, Math.min(100, value)) / 100) * (bottom - top);
  const xFor = (index: number) => left + stepX * index;

  const line = (pick: (item: ClassScorePoint) => number) =>
    points.map((item, index) => `${xFor(index).toFixed(1)},${yFor(pick(item)).toFixed(1)}`).join(" ");

  return (
    <div className="behavior-layout">
      <svg
        className="line-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="班级平均分与通过率趋势"
      >
        <g stroke="#e7edf6" strokeWidth="1">
          {[0, 25, 50, 75, 100].map((tick) => (
            <line key={tick} x1={left} y1={yFor(tick)} x2={right} y2={yFor(tick)} />
          ))}
        </g>
        <g fill="#748198" fontSize="11">
          {[0, 25, 50, 75, 100].map((tick) => (
            <text key={tick} x={12} y={yFor(tick) + 4}>
              {tick}
            </text>
          ))}
          {points.map((item, index) => (
            <text key={item.task_id} x={xFor(index)} y={height - 12} textAnchor="middle">
              {formatDate(item.published_at)}
            </text>
          ))}
        </g>

        <polyline
          points={line((item) => item.avg_score ?? 0)}
          fill="none"
          stroke="#176cf5"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <polyline
          points={line((item) => item.pass_rate)}
          fill="none"
          stroke="#20bd79"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {points.map((item, index) => (
          <circle
            key={`s-${item.task_id}`}
            cx={xFor(index)}
            cy={yFor(item.avg_score ?? 0)}
            r="4"
            fill="#176cf5"
          />
        ))}
        {points.map((item, index) => (
          <circle
            key={`p-${item.task_id}`}
            cx={xFor(index)}
            cy={yFor(item.pass_rate)}
            r="4"
            fill="#20bd79"
          />
        ))}
      </svg>

      <div className="behavior-stats">
        <span>
          <i className="diagnosis-swatch blue" />
          平均分
          <strong>{metricText(points[points.length - 1]?.avg_score)}</strong>
        </span>
        <span>
          <i className="diagnosis-swatch green" />
          通过率
          <strong>{points[points.length - 1]?.pass_rate ?? 0}%</strong>
        </span>
        <span>
          <TrendingDown size={14} />
          最低平均分
          <strong>
            {metricText(Math.min(...points.map((item) => item.avg_score ?? 0)))}
          </strong>
        </span>
      </div>
    </div>
  );
}
