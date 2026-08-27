import { type ReactNode, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Database,
  FileSearch,
  Info,
  Loader2,
  RefreshCw,
  ShieldAlert,
  WifiOff
} from "lucide-react";
import { ApiRequestError } from "../api";

export type StudentStateKind =
  | "loading"
  | "empty"
  | "degraded"
  | "unavailable"
  | "actionFailed"
  | "forbidden";

export type StudentStateAction = {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "secondary";
  icon?: ReactNode;
};

type StudentStateProps = {
  kind?: StudentStateKind;
  title: string;
  description?: ReactNode;
  detail?: ReactNode;
  actions?: StudentStateAction[];
  className?: string;
  compact?: boolean;
};

const kindIcon: Record<StudentStateKind, ReactNode> = {
  loading: <Loader2 size={22} />,
  empty: <FileSearch size={22} />,
  degraded: <Info size={22} />,
  unavailable: <WifiOff size={22} />,
  actionFailed: <AlertTriangle size={22} />,
  forbidden: <ShieldAlert size={22} />
};

export function studentErrorMessage(error: unknown, fallback = "请求没有完成，请稍后重试。") {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function studentErrorDetail(error: unknown) {
  if (!(error instanceof ApiRequestError)) return null;
  const lines = [
    error.recovery,
    error.status ? `HTTP ${error.status}` : "",
    error.code ? `错误码：${error.code}` : "",
    error.requestId ? `请求 ID：${error.requestId}` : "",
    error.rawMessage ? `原始信息：${error.rawMessage}` : ""
  ].filter(Boolean);
  return lines.length ? lines.join(" · ") : null;
}

export function StudentState({
  kind = "empty",
  title,
  description,
  detail,
  actions = [],
  className = "",
  compact = false
}: StudentStateProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const hasDetail = Boolean(detail);

  return (
    <section className={`student-state student-state-${kind}${compact ? " compact" : ""} ${className}`.trim()}>
      <span className="student-state-icon" aria-hidden="true">
        {kindIcon[kind]}
      </span>
      <div className="student-state-copy">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions.length ? (
        <div className="student-state-actions">
          {actions.map((action) => {
            const content = (
              <>
                {action.icon ?? (action.variant === "primary" ? <RefreshCw size={15} /> : <ArrowLeft size={15} />)}
                {action.label}
              </>
            );
            const className = action.variant === "primary" ? "primary" : "";
            return action.href ? (
              <a className={className} href={action.href} key={action.label}>
                {content}
              </a>
            ) : (
              <button className={className} type="button" onClick={action.onClick} key={action.label}>
                {content}
              </button>
            );
          })}
        </div>
      ) : null}
      {hasDetail ? (
        <div className="student-state-detail">
          <button type="button" onClick={() => setDetailOpen((current) => !current)}>
            <Database size={14} />
            {detailOpen ? "收起技术信息" : "查看技术信息"}
          </button>
          {detailOpen ? <pre>{detail}</pre> : null}
        </div>
      ) : null}
    </section>
  );
}

export function StudentInlineNotice({
  kind = "degraded",
  title,
  description,
  detail,
  actions = [],
  className = ""
}: StudentStateProps) {
  return (
    <StudentState
      kind={kind}
      title={title}
      description={description}
      detail={detail}
      actions={actions}
      className={`student-state-inline ${className}`.trim()}
      compact
    />
  );
}

export function StudentImageFallback({
  src,
  alt,
  className = "",
  fallback,
  decorative = false
}: {
  src: string;
  alt: string;
  className?: string;
  fallback?: ReactNode;
  decorative?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <span className={`student-image-safe ${failed ? "failed" : ""} ${className}`.trim()} aria-hidden={decorative || undefined}>
      {!failed ? (
        <img
          src={src}
          alt={decorative ? "" : alt}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="student-image-safe-fallback">{fallback ?? <FileSearch size={24} />}</span>
      )}
    </span>
  );
}
