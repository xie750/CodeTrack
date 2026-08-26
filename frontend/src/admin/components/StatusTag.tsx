import { Tag } from 'antd'
import { CheckCircle2, Clock3, XCircle, PauseCircle, CircleDot, Rocket, RefreshCw } from 'lucide-react'

const map: Record<string, { color: string; icon?: React.ReactNode }> = {
  // 账号
  已启用: { color: 'success', icon: <CheckCircle2 size={12} /> },
  待激活: { color: 'warning', icon: <Clock3 size={12} /> },
  已停用: { color: 'default', icon: <PauseCircle size={12} /> },
  // 科研
  草稿: { color: 'default', icon: <CircleDot size={12} /> },
  待审核: { color: 'purple', icon: <Clock3 size={12} /> },
  进行中: { color: 'purple', icon: <Rocket size={12} /> },
  已结项: { color: 'success', icon: <CheckCircle2 size={12} /> },
  已驳回: { color: 'error', icon: <XCircle size={12} /> },
  // 合规
  待处理: { color: 'error', icon: <XCircle size={12} /> },
  已处置: { color: 'success', icon: <CheckCircle2 size={12} /> },
  合规: { color: 'success' },
  疑似违规: { color: 'error' },
  // 严重等级
  高: { color: 'error' },
  中: { color: 'warning' },
  低: { color: 'default' },
  // 公告
  已发布: { color: 'success', icon: <CheckCircle2 size={12} /> },
  已撤回: { color: 'default' },
  已到期: { color: 'default' },
  // 模型
  在线: { color: 'success', icon: <CircleDot size={12} /> },
  降级中: { color: 'warning', icon: <RefreshCw size={12} /> },
  维护中: { color: 'purple' },
  离线: { color: 'default' },
  // 资源
  正常: { color: 'success' },
  闲置: { color: 'default' },
  // 学期
  未开始: { color: 'default' },
  已结束: { color: 'default' },
}

export default function StatusTag({ status }: { status: string }) {
  const cfg = map[status] || { color: 'default' }
  return (
    <Tag color={cfg.color} icon={cfg.icon} style={{ borderRadius: 'var(--radius-tag)' }}>
      {status}
    </Tag>
  )
}
