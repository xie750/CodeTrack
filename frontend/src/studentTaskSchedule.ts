export type StudentVisibleTaskStatus =
  | "PENDING_START"
  | "READY_TO_START"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "NEEDS_REVISION"
  | "COMPLETED"
  | "EXPIRED"
  | string;

export type ScheduleInfo = {
  isOpen: boolean;
  label: string;
  absoluteLabel: string;
  tone: "blue" | "green" | "orange" | "red" | "muted";
};

export function formatStudentDateTime(value: string | null | undefined, fallback = "未设置") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

export function getScheduleInfo(startAt: string | null | undefined): ScheduleInfo {
  if (!startAt) {
    return {
      isOpen: true,
      label: "已开放",
      absoluteLabel: "未设置开始时间",
      tone: "green"
    };
  }

  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) {
    return {
      isOpen: true,
      label: "开放时间待确认",
      absoluteLabel: startAt,
      tone: "muted"
    };
  }

  const diff = date.getTime() - Date.now();
  const absHours = Math.max(1, Math.ceil(Math.abs(diff) / 36e5));
  if (diff > 0) {
    return {
      isOpen: false,
      label: absHours < 24 ? `${absHours} 小时后开放` : `${Math.ceil(absHours / 24)} 天后开放`,
      absoluteLabel: formatStudentDateTime(startAt),
      tone: "blue"
    };
  }

  return {
    isOpen: true,
    label: absHours < 24 ? `已开放 ${absHours} 小时` : `已开放 ${Math.ceil(absHours / 24)} 天`,
    absoluteLabel: formatStudentDateTime(startAt),
    tone: "green"
  };
}

export function resolveVisibleTaskStatus(status: string, startAt: string | null | undefined): StudentVisibleTaskStatus {
  if (status !== "NOT_STARTED") return status;
  return getScheduleInfo(startAt).isOpen ? "READY_TO_START" : "PENDING_START";
}

export function visibleTaskStatusLabel(status: StudentVisibleTaskStatus) {
  const map: Record<string, string> = {
    PENDING_START: "待开放",
    READY_TO_START: "可开始",
    NOT_STARTED: "未作答",
    DRAFT: "作答中",
    IN_PROGRESS: "进行中",
    SUBMITTED: "已提交",
    NEEDS_REVISION: "待修正",
    COMPLETED: "已完成",
    EXPIRED: "已截止",
    PASSED: "已通过",
    FAILED: "未通过"
  };
  return map[status] ?? status;
}

export function visibleTaskStatusTone(status: StudentVisibleTaskStatus) {
  if (status === "COMPLETED" || status === "PASSED") return "green";
  if (status === "SUBMITTED") return "cyan";
  if (status === "READY_TO_START" || status === "IN_PROGRESS") return "orange";
  if (status === "PENDING_START") return "blue";
  if (status === "NEEDS_REVISION" || status === "EXPIRED" || status === "FAILED") return "red";
  return "blue";
}
