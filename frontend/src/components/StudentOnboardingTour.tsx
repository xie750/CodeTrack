import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BookOpenCheck,
  Bot,
  ClipboardList,
  Compass,
  FolderOpen,
  Lightbulb,
  Network,
  Route,
  ShieldCheck,
  Sparkles,
  X
} from "lucide-react";
import type { AuthUser } from "../authSession";

export const STUDENT_ONBOARDING_REPLAY_EVENT = "codetrack:student-onboarding-replay";

const ONBOARDING_VERSION = "v1";

type TourStep = {
  id: string;
  title: string;
  description: string;
  targetId?: string;
  fallbackTargetId?: string;
  route?: string;
  routeLabel?: string;
  placement?: "top" | "right" | "bottom" | "left" | "center";
  insight: string;
  icon: JSX.Element;
};

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type StudentOnboardingTourProps = {
  authUser: AuthUser;
  autoStart?: boolean;
};

const steps: TourStep[] = [
  {
    id: "loop",
    title: "先看学习闭环",
    description: "CodeTrack 学生端不是普通聊天框。你会从课程任务、自主学习、AI 诊断、资料沉淀和画像更新形成一个可回放的学习链路。",
    route: "/",
    routeLabel: "学生端入口",
    placement: "center",
    insight: "创新点：把 AI 能力拆成路径规划、代码诊断、渐进提示、资料生成和画像更新几个小代理，学生每一步都有依据。",
    icon: <Route size={20} />
  },
  {
    id: "courses",
    title: "从我的课程进入任务",
    description: "这里按人工智能专业的三门首版课程组织：机器学习、Python 程序设计和数据结构。每门课都有任务、知识图谱和课程画像。",
    targetId: "entry-courses",
    route: "/",
    routeLabel: "我的课程入口",
    placement: "right",
    insight: "首行动建议：先进入数据结构任务，体验“提交代码 -> AI 诊断 -> 分层提示”的主链路。",
    icon: <BookOpenCheck size={20} />
  },
  {
    id: "self-study",
    title: "自学不是资料堆",
    description: "自主学习会根据薄弱点推荐主题、练习和资料，适合在任务卡住后回到知识点补一段。",
    targetId: "entry-self-study",
    route: "/",
    routeLabel: "自主学习入口",
    placement: "left",
    insight: "创新点：自学入口会把画像、知识库和资料中心串起来，生成内容可以继续变成练习或笔记。",
    icon: <Compass size={20} />
  },
  {
    id: "profile",
    title: "画像罗盘会解释为什么推荐",
    description: "学习画像只描述学习状态，不给学生贴标签。它会展示薄弱知识点、高频错因、提示依赖和下一步建议。",
    targetId: "tour-profile-overview",
    fallbackTargetId: "tour-self-study-route",
    route: "/self-study/profile",
    routeLabel: "自主学习 / 学习画像",
    placement: "bottom",
    insight: "看推荐时重点看“依据”：最近任务、错因统计、资料保存和自学行为都会变成画像信号。",
    icon: <Sparkles size={20} />
  },
  {
    id: "diagnosis",
    title: "AI 诊断先看证据再解释",
    description: "编程任务里会先显示沙箱和测试事实，再显示 AI 诊断、分层提示、引用来源和能力成长。",
    targetId: "tour-task-diagnosis",
    fallbackTargetId: "tour-workspace-route",
    route: "/workspace/task_linked_list_delete_001",
    routeLabel: "任务工作区 / AI 学习助手",
    placement: "left",
    insight: "创新点：提示分三层，一级只给方向，二级给边界和分支，三级才给局部修复思路，避免直接泄露答案。",
    icon: <Lightbulb size={20} />
  },
  {
    id: "sources",
    title: "知识源雷达帮你判断可信度",
    description: "AI 回答和生成资料会标注课程知识库来源、是否结合画像、置信度和下一步动作。",
    targetId: "tour-ai-resource-actions",
    route: "/self-study/ai",
    routeLabel: "自主学习 / AI 导师",
    placement: "top",
    insight: "复习技巧：看到低置信度或未命中来源时，优先让 AI 换一种解释或进入课程知识库核对。",
    icon: <ShieldCheck size={20} />
  }
];

function completedKey(userId: string) {
  return `codetrack.student.onboarding.${ONBOARDING_VERSION}.${userId}.completed`;
}

function pendingKey(userId: string) {
  return `codetrack.student.onboarding.${ONBOARDING_VERSION}.${userId}.pending`;
}

export function markStudentOnboardingPending(user: AuthUser) {
  if (user.role !== "STUDENT") return;
  if (hasCompleted(user.id)) return;
  window.localStorage.setItem(pendingKey(user.id), "1");
}

function hasCompleted(userId: string) {
  return window.localStorage.getItem(completedKey(userId)) === "1";
}

function hasPending(userId: string) {
  return window.localStorage.getItem(pendingKey(userId)) === "1";
}

function markCompleted(userId: string) {
  window.localStorage.setItem(completedKey(userId), "1");
  window.localStorage.removeItem(pendingKey(userId));
}

function findTargetElement(step: TourStep) {
  const targetIds = [step.targetId, step.fallbackTargetId].filter(Boolean);
  for (const targetId of targetIds) {
    const element = document.querySelector<HTMLElement>(`[data-onboarding-id="${targetId}"]`);
    if (element) return element;
  }
  return null;
}

function targetRect(step: TourStep): SpotlightRect | null {
  const element = findTargetElement(step);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const padding = 10;
  return {
    top: Math.max(12, rect.top - padding),
    left: Math.max(12, rect.left - padding),
    width: rect.width + padding * 2,
    height: rect.height + padding * 2
  };
}

function currentRoute(location: ReturnType<typeof useLocation>) {
  return `${location.pathname}${location.search}`;
}

function stepRouteMatches(step: TourStep, location: ReturnType<typeof useLocation>) {
  if (!step.route) return true;
  return currentRoute(location) === step.route;
}

function rectsOverlap(
  a: SpotlightRect,
  b: SpotlightRect,
  gap = 10
) {
  return (
    a.left - gap < b.left + b.width &&
    a.left + a.width + gap > b.left &&
    a.top - gap < b.top + b.height &&
    a.top + a.height + gap > b.top
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(min, value), max);
}

function tooltipStyle(step: TourStep, rect: SpotlightRect | null): CSSProperties {
  if (!rect || step.placement === "center" || !step.targetId) {
    return {};
  }

  const target = rect;
  const gap = 18;
  const margin = 14;
  const width = Math.min(392, window.innerWidth - margin * 2);
  const heightEstimate = Math.min(460, window.innerHeight - margin * 2);
  const preferred = step.placement ?? "bottom";
  const placements = [preferred, "right", "left", "bottom", "top"].filter(
    (placement, index, list): placement is NonNullable<TourStep["placement"]> => placement !== "center" && list.indexOf(placement) === index
  );

  function boundsFor(placement: NonNullable<TourStep["placement"]>): SpotlightRect {
    let top = target.top + target.height + gap;
    let left = target.left + target.width / 2 - width / 2;

    if (placement === "top") top = target.top - heightEstimate - gap;
    if (placement === "left") {
      top = target.top + target.height / 2 - heightEstimate / 2;
      left = target.left - width - gap;
    }
    if (placement === "right") {
      top = target.top + target.height / 2 - heightEstimate / 2;
      left = target.left + target.width + gap;
    }

    return {
      top: clamp(top, margin, Math.max(margin, window.innerHeight - heightEstimate - margin)),
      left: clamp(left, margin, Math.max(margin, window.innerWidth - width - margin)),
      width,
      height: heightEstimate
    };
  }

  const nonOverlapping = placements.map(boundsFor).find((candidate) => !rectsOverlap(candidate, target, 12));
  const bounds = nonOverlapping ?? boundsFor(preferred);
  return { width, top: bounds.top, left: bounds.left };
}

function SpotlightShades({ rect }: { rect: SpotlightRect }) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const topHeight = Math.max(0, rect.top);
  const bottomTop = Math.min(viewportHeight, rect.top + rect.height);
  const leftWidth = Math.max(0, rect.left);
  const rightLeft = Math.min(viewportWidth, rect.left + rect.width);

  return (
    <>
      <span className="student-onboarding-shade" style={{ top: 0, left: 0, width: viewportWidth, height: topHeight }} />
      <span className="student-onboarding-shade" style={{ top: bottomTop, left: 0, width: viewportWidth, height: Math.max(0, viewportHeight - bottomTop) }} />
      <span className="student-onboarding-shade" style={{ top: topHeight, left: 0, width: leftWidth, height: Math.max(0, rect.height) }} />
      <span className="student-onboarding-shade" style={{ top: topHeight, left: rightLeft, width: Math.max(0, viewportWidth - rightLeft), height: Math.max(0, rect.height) }} />
    </>
  );
}

function useSpotlight(step: TourStep, open: boolean) {
  const [rect, setRect] = useState<SpotlightRect | null>(null);

  const refresh = useCallback(() => {
    setRect(targetRect(step));
  }, [step]);

  useEffect(() => {
    if (!open) return undefined;
    refresh();
    const interval = window.setInterval(refresh, 240);
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
    };
  }, [open, refresh]);

  return rect;
}

export default function StudentOnboardingTour({ authUser, autoStart = true }: StudentOnboardingTourProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex] ?? steps[0];
  const rect = useSpotlight(step, open);
  const progress = Math.round(((stepIndex + 1) / steps.length) * 100);
  const isLast = stepIndex === steps.length - 1;

  const shouldAutoStart = useMemo(() => {
    if (!autoStart || authUser.role !== "STUDENT") return false;
    return hasPending(authUser.id) || !hasCompleted(authUser.id);
  }, [authUser.id, authUser.role, autoStart]);

  useEffect(() => {
    if (!shouldAutoStart) return;
    const timer = window.setTimeout(() => {
      setStepIndex(0);
      setOpen(true);
    }, 460);
    return () => window.clearTimeout(timer);
  }, [shouldAutoStart]);

  useEffect(() => {
    function replay() {
      setStepIndex(0);
      setOpen(true);
    }

    window.addEventListener(STUDENT_ONBOARDING_REPLAY_EVENT, replay);
    return () => window.removeEventListener(STUDENT_ONBOARDING_REPLAY_EVENT, replay);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (step.route && !stepRouteMatches(step, location)) {
      navigate(step.route);
      return;
    }
    const timer = window.setTimeout(() => {
      findTargetElement(step)?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [location, navigate, open, step]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        finish();
      }
      if (event.key === "ArrowRight") {
        next();
      }
      if (event.key === "ArrowLeft") {
        previous();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function finish() {
    markCompleted(authUser.id);
    setOpen(false);
  }

  function next() {
    if (isLast) {
      finish();
      return;
    }
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  }

  function previous() {
    setStepIndex((current) => Math.max(current - 1, 0));
  }

  if (!open) return null;

  return createPortal(
    <div className="student-onboarding-layer" role="dialog" aria-modal="true" aria-label="学生端新手引导">
      {rect ? <SpotlightShades rect={rect} /> : <div className="student-onboarding-dim" />}
      {rect ? (
        <div
          className="student-onboarding-spotlight"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
          }}
        />
      ) : null}

      <section
        className={`student-onboarding-card ${rect && step.placement !== "center" ? "anchored" : "centered"}`}
        style={tooltipStyle(step, rect)}
      >
        <header>
          <span>{step.icon}</span>
          <div>
            <small>新手引导 · {stepIndex + 1}/{steps.length}</small>
            <h2>{step.title}</h2>
          </div>
          <button type="button" aria-label="跳过新手引导" onClick={finish}>
            <X size={18} />
          </button>
        </header>

        <p>{step.description}</p>

        {step.routeLabel ? (
          <div className="student-onboarding-route">
            <Compass size={15} />
            <span>{stepRouteMatches(step, location) ? `已定位到：${step.routeLabel}` : `正在跳转到：${step.routeLabel}`}</span>
          </div>
        ) : null}

        <div className="student-onboarding-insight">
          <Sparkles size={16} />
          <span>{step.insight}</span>
        </div>

        <div className="student-onboarding-map" aria-label="引导覆盖模块">
          <span className={step.id === "courses" ? "active" : ""}><ClipboardList size={14} />课程任务</span>
          <span className={step.id === "diagnosis" ? "active" : ""}><Bot size={14} />AI诊断</span>
          <span className={step.id === "profile" ? "active" : ""}><Compass size={14} />学习画像</span>
          <span className={step.id === "sources" ? "active" : ""}><Network size={14} />知识来源</span>
          <span className={step.id === "self-study" ? "active" : ""}><FolderOpen size={14} />资料沉淀</span>
        </div>

        <div className="student-onboarding-progress" aria-label={`引导进度 ${progress}%`}>
          <i style={{ width: `${progress}%` }} />
        </div>

        <footer>
          <button type="button" className="student-onboarding-ghost" onClick={finish}>跳过</button>
          <div>
            <button type="button" disabled={stepIndex === 0} onClick={previous}>上一步</button>
            <button type="button" className="primary" onClick={next}>{isLast ? "完成" : "下一步"}</button>
          </div>
        </footer>
      </section>
    </div>,
    document.body
  );
}
