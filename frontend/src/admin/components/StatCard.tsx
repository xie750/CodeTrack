import type { ReactNode } from 'react'
import { Card } from 'antd'
import { TrendingUp, TrendingDown } from 'lucide-react'

type Tone = 'primary' | 'info' | 'warning' | 'success' | 'purple'

// 轻色 icon 容器：主色/功能色仅以低透明度浅底出现，符合「非中性色 ≤15%」
const tones: Record<Tone, { bg: string; color: string }> = {
  primary: { bg: 'var(--primary-bg)', color: 'var(--primary)' },
  info: { bg: 'var(--c-info-bg)', color: 'var(--c-info)' },
  warning: { bg: 'var(--c-warning-bg)', color: 'var(--c-warning)' },
  success: { bg: 'var(--c-success-bg)', color: 'var(--c-success)' },
  purple: { bg: 'var(--c-purple-bg)', color: 'var(--c-purple)' },
}

interface StatCardProps {
  icon: ReactNode
  tone?: Tone
  label: string
  value: string | number
  trend?: number
  trendSuffix?: string
  extra?: ReactNode
  onClick?: () => void
  compact?: boolean
}

export default function StatCard({
  icon,
  tone = 'primary',
  label,
  value,
  trend,
  trendSuffix = '%',
  extra,
  onClick,
  compact,
}: StatCardProps) {
  const up = (trend ?? 0) >= 0
  const t = tones[tone]
  const iconSize = compact ? 36 : 44
  const bodyPad = compact ? '12px 16px' : '18px 20px'

  return (
    <Card
      className="hover-card"
      style={{ borderRadius: 16, cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
      styles={{ body: { padding: bodyPad } }}
    >
      <div className="flex-between">
        <div
          style={{
            width: iconSize,
            height: iconSize,
            borderRadius: 10,
            background: t.bg,
            color: t.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        {extra}
      </div>
      <div className="stat-value" style={{ marginTop: compact ? 10 : 14 }}>
        {value}
      </div>
      <div className="stat-label" style={{ marginTop: 2 }}>
        {label}
      </div>
      {trend !== undefined && (
        <div style={{ marginTop: compact ? 4 : 8, fontSize: 12 }}>
          <span className={up ? 'trend-up' : 'trend-down'} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {Math.abs(trend)}
            {trendSuffix}
          </span>
          <span style={{ color: 'var(--n-6)', marginLeft: 6 }}>较昨日</span>
        </div>
      )}
    </Card>
  )
}
