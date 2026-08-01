/**
 * 能力维度雷达图。
 *
 * 学生端 LearningProfile 那张雷达是把六个顶点坐标写死在 SVG 里的，数值变了图形不变。
 * 这里按维度数量真实计算顶点，视觉沿用学生端的 .profile-radar 样式（同样的网格线颜色
 * #d5dfef、同样的主色 #176cf5 半透明填充），所以两端看起来是同一张图。
 *
 * 不引入图表库：全站零图表依赖，学生端所有图都是内联 SVG。
 */

export interface RadarAxis {
  label: string;
  /** 0-100，null 表示该维度没有数据 */
  value: number | null;
}

interface Props {
  axes: RadarAxis[];
  /** 视觉半径，默认与学生端一致 */
  radius?: number;
  ariaLabel?: string;
}

const RINGS = [1, 2 / 3, 1 / 3];

export default function RadarChart({ axes, radius = 92, ariaLabel = "能力维度雷达图" }: Props) {
  // 标签要留在视口内，所以画布比半径宽出一圈
  const padding = 62;
  const size = (radius + padding) * 2;
  const center = size / 2;
  const count = axes.length;

  if (count < 3) {
    return <div className="empty-panel compact">能力维度不足，至少需要三个维度才能绘制雷达图。</div>;
  }

  // 从正上方开始顺时针排布
  const angleAt = (index: number) => (Math.PI * 2 * index) / count - Math.PI / 2;

  const pointAt = (index: number, ratio: number) => {
    const angle = angleAt(index);
    return [center + Math.cos(angle) * radius * ratio, center + Math.sin(angle) * radius * ratio];
  };

  const ringPoints = (ratio: number) =>
    axes
      .map((_, index) => pointAt(index, ratio).map((value) => value.toFixed(1)).join(","))
      .join(" ");

  // 没有数据的维度按 0 收进圆心，但下面的标签会写「暂无」，不会被误读成 0 分
  const valuePoints = axes
    .map((axis, index) =>
      pointAt(index, Math.max(0, Math.min(100, axis.value ?? 0)) / 100)
        .map((value) => value.toFixed(1))
        .join(",")
    )
    .join(" ");

  return (
    <svg
      className="profile-radar diagnosis-radar"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={ariaLabel}
    >
      <g fill="none" stroke="#d5dfef">
        {RINGS.map((ratio) => (
          <polygon key={ratio} points={ringPoints(ratio)} />
        ))}
        {axes.map((axis, index) => {
          const [x, y] = pointAt(index, 1);
          return <line key={axis.label} x1={center} y1={center} x2={x} y2={y} />;
        })}
      </g>

      <polygon
        points={valuePoints}
        fill="rgba(35,116,245,.18)"
        stroke="#176cf5"
        strokeWidth="3"
      />

      {axes.map((axis, index) => {
        const [x, y] = pointAt(index, Math.max(0, Math.min(100, axis.value ?? 0)) / 100);
        return <circle key={`dot-${axis.label}`} cx={x} cy={y} r="4" fill="#176cf5" />;
      })}

      {axes.map((axis, index) => {
        const [x, y] = pointAt(index, 1.2);
        // 标签靠左半边时右对齐，避免压到图形上
        const anchor = x < center - 6 ? "end" : x > center + 6 ? "start" : "middle";
        return (
          <g key={`label-${axis.label}`}>
            <text x={x} y={y} textAnchor={anchor}>
              {axis.label}
            </text>
            <text x={x} y={y + 15} textAnchor={anchor} className="diagnosis-radar-value">
              {axis.value === null ? "暂无" : Math.round(axis.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
