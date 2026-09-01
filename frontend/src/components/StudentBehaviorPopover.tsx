import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock3, TrendingUp, X } from "lucide-react";
import { api, type StudentProfile } from "../api";

type BehaviorEvent = NonNullable<StudentProfile["behavior_events"]>[number];
type TrendPoint = {
  key: string;
  label: string;
  value: number;
  minutes: number;
  events: BehaviorEvent[];
};
type PopoverPlacement = "right" | "left" | "bottom";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseEventDate(event: BehaviorEvent) {
  if (!event.occurred_at) return null;
  const date = new Date(event.occurred_at);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayKey(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatHours(value: number) {
  if (value <= 0.04) return "0";
  if (value < 1) return value.toFixed(1);
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function formatEventTime(date: Date | null) {
  if (!date) return "--:--";
  return `${`${date.getHours()}`.padStart(2, "0")}:${`${date.getMinutes()}`.padStart(2, "0")}`;
}

function formatEventTitle(event: BehaviorEvent) {
  if (event.summary) return event.summary;
  if (event.knowledge_points.length) return event.knowledge_points.join("、");
  if (event.event_type === "task_submission") return "任务提交";
  if (event.event_type === "artifact_saved") return "学习产物保存";
  return "学习行为记录";
}

function buildSmoothPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const before = points[index - 2] ?? previous;
    const after = points[index + 1] ?? current;
    const cp1x = previous.x + (current.x - before.x) / 6;
    const cp1y = previous.y + (current.y - before.y) / 6;
    const cp2x = current.x - (after.x - previous.x) / 6;
    const cp2y = current.y - (after.y - previous.y) / 6;
    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${current.x} ${current.y}`;
  }
  return path;
}

function buildTrend(events: BehaviorEvent[], now = new Date()) {
  const today = startOfLocalDay(now);
  const validEvents = events
    .map((event) => ({ event, date: parseEventDate(event) }))
    .filter((item): item is { event: BehaviorEvent; date: Date } => item.date !== null && item.date <= now);
  const points: TrendPoint[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getTime() - (6 - index) * DAY_MS);
    const key = dayKey(date);
    const dayEvents = validEvents
      .filter((item) => dayKey(item.date) === key)
      .map((item) => item.event);
    const minutes = dayEvents.reduce((sum, event) => sum + Math.max(0, event.activity_minutes || 0), 0);
    return {
      key,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      value: Number((minutes / 60).toFixed(2)),
      minutes,
      events: dayEvents
    };
  });
  const todayPoint = points[points.length - 1];
  const latestEvents = validEvents
    .sort((left, right) => right.date.getTime() - left.date.getTime())
    .slice(0, 2);
  const activeDays = points.filter((point) => point.minutes > 0).length;
  const totalMinutes = points.reduce((sum, point) => sum + point.minutes, 0);
  return {
    points,
    todayHours: todayPoint?.value ?? 0,
    activeDays,
    totalHours: totalMinutes / 60,
    latestEvents
  };
}

function BehaviorMiniChart({ points }: { points: TrendPoint[] }) {
  const width = 318;
  const height = 150;
  const paddingX = 28;
  const paddingTop = 14;
  const paddingBottom = 34;
  const maxValue = Math.max(1, ...points.map((point) => point.value));
  const chartPoints = points.map((point, index) => {
    const x = paddingX + (index * (width - paddingX * 2)) / Math.max(1, points.length - 1);
    const y = paddingTop + (1 - point.value / maxValue) * (height - paddingTop - paddingBottom);
    return { ...point, x, y };
  });
  const linePath = buildSmoothPath(chartPoints);
  const areaPath = linePath
    ? `${linePath} L ${chartPoints[chartPoints.length - 1].x} ${height - paddingBottom} L ${chartPoints[0].x} ${height - paddingBottom} Z`
    : "";
  const activePoint = chartPoints[chartPoints.length - 1];

  return (
    <div className="student-behavior-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="近 7 天学习时长曲线">
        <defs>
          <linearGradient id="studentBehaviorArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2f7df6" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#2f7df6" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((ratio) => (
          <line
            key={ratio}
            x1={paddingX}
            x2={width - paddingX}
            y1={paddingTop + ratio * (height - paddingTop - paddingBottom)}
            y2={paddingTop + ratio * (height - paddingTop - paddingBottom)}
          />
        ))}
        <path className="student-behavior-area" d={areaPath} />
        <path className="student-behavior-line" d={linePath} />
        {chartPoints.map((point) => (
          <g key={point.key}>
            <circle className={point.minutes > 0 ? "has-data" : ""} cx={point.x} cy={point.y} r={point.key === activePoint.key ? 4.5 : 3.2} />
            <text x={point.x} y={height - 12} textAnchor="middle">
              {point.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="student-behavior-chart-tip">
        <strong>{activePoint.label}</strong>
        <span>{formatHours(activePoint.value)} 小时</span>
      </div>
    </div>
  );
}

export default function StudentBehaviorPopover() {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [profiles, setProfiles] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, placement: "right" as PopoverPlacement });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setHasError(false);
    api
      .getLearningContext()
      .then((context) => Promise.allSettled(context.courses.map((course) => api.getStudentProfile(course.course_id))))
      .then((results) => {
        if (!alive) return;
        const loadedProfiles = results
          .filter((result): result is PromiseFulfilledResult<StudentProfile> => result.status === "fulfilled")
          .map((result) => result.value);
        setProfiles(loadedProfiles);
      })
      .catch(() => {
        if (!alive) return;
        setHasError(true);
        setProfiles([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const summary = useMemo(() => {
    const events = profiles.flatMap((profile) => profile.behavior_events ?? []);
    return buildTrend(events);
  }, [profiles]);

  const openPopover = () => {
    updatePosition();
    setIsRendered(true);
    setIsClosing(false);
    setOpen(true);
  };

  const closePopover = () => {
    setIsClosing(true);
    setOpen(false);
  };

  const togglePopover = () => {
    if (open) closePopover();
    else openPopover();
  };

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 12;
    const padding = 12;
    const width = Math.min(360, window.innerWidth - padding * 2);
    const height = 328;
    let placement: PopoverPlacement = "right";
    let left = rect.right + gap;
    let top = rect.bottom - height;

    if (left + width > window.innerWidth - padding) {
      left = rect.left - width - gap;
      placement = "left";
    }
    if (left < padding) {
      left = padding;
      top = rect.bottom + gap;
      placement = "bottom";
    }
    if (top + height > window.innerHeight - padding) top = window.innerHeight - height - padding;
    if (top < padding) top = padding;

    setPosition({ left, top, placement });
  };

  useEffect(() => {
    if (!isRendered) return undefined;
    updatePosition();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      closePopover();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePopover();
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRendered, open]);

  const label = loading ? "今日学习 -- 小时" : `今日学习 ${formatHours(summary.todayHours)} 小时`;

  return (
    <>
      <button
        ref={triggerRef}
        className={`student-window-streak${open ? " is-active" : ""}`}
        type="button"
        onClick={togglePopover}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="查看学习行为曲线"
      >
        <span><Clock3 size={17} /></span>
        <div>
          <strong>{label}</strong>
          <small>点击查看学习行为曲线</small>
        </div>
      </button>
      {isRendered && typeof document !== "undefined" ? createPortal(
        <div
          ref={popoverRef}
          className={`student-behavior-popover${isClosing ? " is-closing" : ""}`}
          data-placement={position.placement}
          style={{ left: position.left, top: position.top }}
          onAnimationEnd={() => {
            if (isClosing) {
              setIsClosing(false);
              setIsRendered(false);
            }
          }}
          role="dialog"
          aria-label="学习行为曲线记录"
        >
          <header>
            <div>
              <span><TrendingUp size={15} /></span>
              <strong>学习行为记录</strong>
            </div>
            <button type="button" onClick={closePopover} aria-label="关闭学习行为记录" title="关闭">
              <X size={15} />
            </button>
          </header>
          <div className="student-behavior-summary">
            <span>
              <small>今日学习</small>
              <strong>{loading ? "--" : `${formatHours(summary.todayHours)}h`}</strong>
            </span>
            <span>
              <small>近 7 天活跃</small>
              <strong>{loading ? "--" : `${summary.activeDays} 天`}</strong>
            </span>
            <span>
              <small>近 7 天累计</small>
              <strong>{loading ? "--" : `${formatHours(summary.totalHours)}h`}</strong>
            </span>
          </div>
          <BehaviorMiniChart points={summary.points} />
          <div className="student-behavior-events">
            {hasError ? (
              <p>学习行为暂时无法读取</p>
            ) : summary.latestEvents.length ? (
              summary.latestEvents.map(({ event, date }) => (
                <article key={event.id}>
                  <time>{formatEventTime(date)}</time>
                  <div>
                    <strong>{formatEventTitle(event)}</strong>
                    <small>{event.source} · {event.activity_minutes} 分钟</small>
                  </div>
                </article>
              ))
            ) : (
              <p>今天还没有产生学习行为记录</p>
            )}
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}
