import { useState } from 'react'
import { Card, Row, Col, Button, Space, Tag, Switch, Slider, InputNumber, Select, Input, message, Timeline } from 'antd'
import { SlidersHorizontal, Undo2, Save } from 'lucide-react'
import PageHeader from '@admin/components/PageHeader'
import VerifyModal from '@admin/components/VerifyModal'
import { useAppStore } from '@admin/stores/useAppStore'
import { colors } from '@admin/theme/themeConfig'

export default function SystemConfig() {
  const paramGroups = useAppStore((s) => s.paramGroups)
  const saveParamGroup = useAppStore((s) => s.saveParamGroup)
  const rollbackParamGroup = useAppStore((s) => s.rollbackParamGroup)
  const addLog = useAppStore((s) => s.addLog)

  const [verify, setVerify] = useState<{ open: boolean; onOk: () => void }>({ open: false, onOk: () => {} })

  // 参数编辑 state
  const [draft, setDraft] = useState<Record<string, Record<string, unknown>>>({})
  const draftFor = (key: string) => draft[key] || {}

  const renderField = (key: string, f: { key: string; label: string; type: string; value: unknown; suffix?: string; options?: { label: string; value: string }[]; min?: number; max?: number }) => {
    const current = draftFor(key)[f.key] ?? f.value
    switch (f.type) {
      case 'switch':
        return <Switch checked={!!current} onChange={(v) => setDraft({ ...draft, [key]: { ...draftFor(key), [f.key]: v } })} />
      case 'slider':
        return (
          <div className="flex gap16" style={{ alignItems: 'center' }}>
            <Slider style={{ width: 200 }} min={f.min ?? 0} max={f.max ?? 100} value={current as number} onChange={(v) => setDraft({ ...draft, [key]: { ...draftFor(key), [f.key]: v } })} />
            <b>{String(current)}{f.suffix}</b>
          </div>
        )
      case 'number':
        return (
          <div className="flex gap8" style={{ alignItems: 'center' }}>
            <InputNumber value={current as number} min={1} onChange={(v) => setDraft({ ...draft, [key]: { ...draftFor(key), [f.key]: v } })} />
            <span style={{ color: colors.textMuted }}>{f.suffix}</span>
          </div>
        )
      case 'select':
        return (
          <Select style={{ width: 200 }} value={current as string} onChange={(v) => setDraft({ ...draft, [key]: { ...draftFor(key), [f.key]: v } })} options={f.options} />
        )
      default:
        return <Input value={current as string} onChange={(e) => setDraft({ ...draft, [key]: { ...draftFor(key), [f.key]: e.target.value } })} style={{ width: 220 }} />
    }
  }

  const saveParam = (key: string, label: string) => {
    setVerify({
      open: true,
      onOk: () => {
        saveParamGroup(key, draftFor(key))
        message.success(`「${label}」已保存，全校即时生效`)
        addLog({ id: `L${Date.now()}`, operator: '超级管理员', actionType: '编辑', resourceType: '基础参数', resourceId: key, desc: `修改基础参数：${label}`, before: '', after: JSON.stringify(draftFor(key)), ip: '10.20.1.8', ua: 'Chrome/126', time: new Date().toLocaleString('zh-CN', { hour12: false }), sensitive: true })
      },
    })
  }

  return (
    <div>
      <PageHeader
        title="系统配置"
        extra={<Space><SlidersHorizontal size={16} /><span style={{ fontSize: 13, color: colors.textMuted }}>基础参数配置</span></Space>}
      />

      <Card style={{ borderRadius: 12, padding: '0 14px 12px' }}>
        <div style={{ marginBottom: 12, fontSize: 12, color: colors.textMuted, padding: '12px 0 0' }}>以下参数修改后即时生效，影响全校用户</div>
        <Row gutter={[12, 12]}>
          {paramGroups.map((g) => (
            <Col xs={24} sm={12} key={g.key} style={{ display: 'flex' }}>
              <Card
                size="small"
                title={<span style={{ fontSize: 13, fontWeight: 600 }}>{g.label}</span>}
                extra={<Tag style={{ fontSize: 11, marginRight: 0 }}>{g.desc}</Tag>}
                style={{ borderRadius: 10, width: '100%', border: '1px solid var(--n-3)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', background: 'var(--n-1)' }}
                styles={{ body: { padding: '8px 14px 10px' } }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {g.fields.map((f) => (
                    <div className="flex-between" key={f.key} style={{ minHeight: 26, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: colors.textSecondary }}>{f.label}</span>
                      {renderField(g.key, f)}
                    </div>
                  ))}
                </div>
                <div className="flex" style={{ gap: 8, marginTop: 6, paddingTop: 8, borderTop: '1px solid var(--n-2)' }}>
                  <Button size="small" type="primary" icon={<Save size={13} />} onClick={() => saveParam(g.key, g.label)}>保存</Button>
                  {g.history.length > 0 && (
                    <Button size="small" icon={<Undo2 size={13} />} onClick={() => { rollbackParamGroup(g.key); message.success(`「${g.label}」已回滚到上一个版本`) }}>
                      回滚（{g.history.length} 个历史版本）
                    </Button>
                  )}
                </div>
                {g.history.length > 0 && (
                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--n-3)' }}>
                    <b style={{ fontSize: 11, color: colors.textMuted }}>变更历史</b>
                    <Timeline
                      style={{ marginTop: 4 }}
                      items={g.history.slice(0, 3).map((h) => ({
                        color: 'green',
                        children: <span style={{ fontSize: 11 }}>{h.changes} · {h.operator} · {h.time}</span>,
                      }))}
                    />
                  </div>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      <VerifyModal open={verify.open} actionLabel="修改基础参数配置" onCancel={() => setVerify({ open: false, onOk: () => {} })} onConfirm={verify.onOk} />
    </div>
  )
}
