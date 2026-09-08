import { useId, useState, type KeyboardEvent } from "react";
import { ChevronDown, Info, Sparkles } from "lucide-react";

type AIContentDisclosureProps = {
  compact?: boolean;
  confidence?: number | null;
  sourceLabel?: string;
  modelLabel?: string | null;
  citationsCount?: number;
  className?: string;
  interactive?: boolean;
};

function confidenceLabel(confidence?: number | null) {
  if (typeof confidence !== "number") return null;
  return `置信度 ${Math.round(confidence * 100)}%`;
}

function summaryText({
  confidence,
  sourceLabel,
  modelLabel,
  citationsCount
}: Pick<AIContentDisclosureProps, "confidence" | "sourceLabel" | "modelLabel" | "citationsCount">) {
  const parts = ["AI 生成内容"];
  const confidenceText = confidenceLabel(confidence);
  if (confidenceText) parts.push(confidenceText);
  if (modelLabel) parts.push(`模型：${modelLabel}`);
  if (sourceLabel) parts.push(`来源：${sourceLabel}`);
  if (typeof citationsCount === "number") parts.push(`引用 ${citationsCount} 条`);
  return parts.join("，");
}

export default function AIContentDisclosure({
  compact = false,
  confidence,
  sourceLabel = "课程知识库与当前学习上下文",
  modelLabel,
  citationsCount,
  className = "",
  interactive = true
}: AIContentDisclosureProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const confidenceText = confidenceLabel(confidence);
  const text = summaryText({ confidence, sourceLabel, modelLabel, citationsCount });
  const classes = [
    "ai-content-disclosure",
    compact ? "compact" : "",
    interactive ? "interactive" : "static",
    className
  ].filter(Boolean).join(" ");

  function handleKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key === "Escape") setOpen(false);
  }

  if (!interactive) {
    return (
      <span className={classes} title={text} aria-label={text}>
        <Sparkles size={13} aria-hidden="true" />
        <span>AI 生成</span>
        {!compact && confidenceText ? <strong>{confidenceText.replace("置信度 ", "")}</strong> : null}
      </span>
    );
  }

  return (
    <span className={classes} onKeyDown={handleKeyDown}>
      <button
        type="button"
        className="ai-content-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={text}
        onClick={() => setOpen((value) => !value)}
      >
        <Sparkles size={13} aria-hidden="true" />
        <span>AI 生成</span>
        {!compact && confidenceText ? <strong>{confidenceText.replace("置信度 ", "")}</strong> : null}
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open ? (
        <span className="ai-content-popover" id={panelId} role="tooltip">
          <strong><Info size={14} aria-hidden="true" /> AI 生成内容</strong>
          <span>由 CodeTrack AI 根据课程资料、学习上下文和对话输入生成，关键结论应结合引用来源与教师要求复核。</span>
          <dl>
            {modelLabel ? (
              <>
                <dt>模型</dt>
                <dd>{modelLabel}</dd>
              </>
            ) : null}
            {sourceLabel ? (
              <>
                <dt>来源</dt>
                <dd>{sourceLabel}</dd>
              </>
            ) : null}
            {confidenceText ? (
              <>
                <dt>可信度</dt>
                <dd>{confidenceText}</dd>
              </>
            ) : null}
            {typeof citationsCount === "number" ? (
              <>
                <dt>引用</dt>
                <dd>{citationsCount} 条可查来源</dd>
              </>
            ) : null}
          </dl>
        </span>
      ) : null}
    </span>
  );
}
