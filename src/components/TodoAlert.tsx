import { Card, Button, Tag } from 'antd'
import { AlertTriangle, ShieldAlert, Database } from 'lucide-react'

// 预警 / 提示卡片：左侧彩色边框 + 图标 + 标题 + 描述 + 操作（功能色仅用于预警场景）
const typeMap = {
  error: { color: 'var(--c-danger)', icon: <ShieldAlert size={18} />, bg: 'var(--c-danger-bg)' },
  warning: { color: 'var(--c-warning)', icon: <AlertTriangle size={18} />, bg: 'var(--c-warning-bg)' },
  info: { color: 'var(--c-info)', icon: <Database size={18} />, bg: 'var(--c-info-bg)' },
}

interface TodoAlertProps {
  type: 'error' | 'warning' | 'info'
  title: string
  desc: string
  count?: number
  tag?: string
  actionText?: string
  onAction?: () => void
}

export default function TodoAlert({ type, title, desc, count, tag, actionText = '去处理', onAction }: TodoAlertProps) {
  const cfg = typeMap[type]
  return (
    <Card
      className="alert-card"
      style={{
        borderLeft: `4px solid ${cfg.color}`,
        background: cfg.bg,
      }}
      styles={{ body: { padding: '16px 18px' } }}
    >
      <div className="flex-between">
        <div className="flex gap16" style={{ alignItems: 'flex-start' }}>
          <div style={{ color: cfg.color, marginTop: 2 }}>{cfg.icon}</div>
          <div>
            <div className="flex" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
              {count !== undefined && count > 0 && <Tag color={type === 'error' ? 'error' : 'warning'}>{count} 项</Tag>}
              {tag && <Tag color="default">{tag}</Tag>}
            </div>
            <div style={{ fontSize: 13, color: 'var(--n-7)', marginTop: 4 }}>{desc}</div>
          </div>
        </div>
        {onAction && (
          <Button size="small" type="primary" ghost onClick={onAction}>
            {actionText}
          </Button>
        )}
      </div>
    </Card>
  )
}
