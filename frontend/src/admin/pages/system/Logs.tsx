import { useMemo, useState } from 'react'
import { Card, Table, Button, Space, Input, Select, DatePicker, Tag, Drawer, Descriptions, Switch, message, Alert, Row, Col } from 'antd'
import { Download, ShieldAlert, Eye, FileArchive, Activity, FileDown, LogIn, TrendingUp, TrendingDown } from 'lucide-react'
import PageHeader from '@admin/components/PageHeader'
import VerifyModal from '@admin/components/VerifyModal'
import { useAppStore } from '@admin/stores/useAppStore'
import { colors } from '@admin/theme/themeConfig'
import type { LogActionType, OperationLog } from '@admin/types'

const actionTypes: LogActionType[] = ['创建', '编辑', '删除', '审核', '导出', '权限变更', '登录', '处置', '审批']

export default function Logs() {
  const logs = useAppStore((s) => s.logs)
  const addLog = useAppStore((s) => s.addLog)

  const [operator, setOperator] = useState('')
  const [actionType, setActionType] = useState<LogActionType>()
  const [resourceType, setResourceType] = useState<string>()
  const [sensitiveOnly, setSensitiveOnly] = useState(false)
  const [detail, setDetail] = useState<OperationLog | null>(null)
  const [exportVerify, setExportVerify] = useState(false)

  const filtered = useMemo(
    () =>
      logs.filter((l) => {
        if (sensitiveOnly && !l.sensitive) return false
        if (actionType && l.actionType !== actionType) return false
        if (resourceType && !l.resourceType.includes(resourceType)) return false
        if (operator && !`${l.operator}`.includes(operator)) return false
        return true
      }),
    [logs, operator, actionType, resourceType, sensitiveOnly],
  )

  const sensitiveCount = logs.filter((l) => l.sensitive).length
  const todayCount = logs.filter((l) => l.time.startsWith('2026-08-08')).length
  const exportCount = logs.filter((l) => l.actionType === '导出').length
  const loginCount = logs.filter((l) => l.actionType === '登录').length

  const columns = [
    { title: '操作时间', dataIndex: 'time', width: 160, render: (v: string) => <span style={{ fontSize: 12 }}>{v}</span> },
    { title: '操作人', dataIndex: 'operator', width: 110 },
    { title: '操作类型', dataIndex: 'actionType', width: 100, render: (v: string) => <Tag color={v === '权限变更' || v === '删除' ? 'error' : v === '导出' ? 'warning' : 'default'}>{v}</Tag> },
    { title: '资源类型', dataIndex: 'resourceType', width: 100 },
    { title: '资源ID', dataIndex: 'resourceId', width: 110 },
    { title: '操作描述', dataIndex: 'desc', ellipsis: true },
    {
      title: '敏感', width: 70,
      render: (_: unknown, r: OperationLog) => r.sensitive ? <Tag color="error"><ShieldAlert size={11} /> 敏感</Tag> : <Tag>—</Tag>,
    },
    { title: '来源IP', dataIndex: 'ip', width: 110, render: (v: string) => <span style={{ fontSize: 12, color: colors.textMuted }}>{v}</span> },
    {
      title: '操作', width: 90, fixed: 'right' as const,
      render: (_: unknown, r: OperationLog) => <Button type="link" size="small" onClick={() => setDetail(r)}><Eye size={14} />详情</Button>,
    },
  ]

  return (
    <div>
      <PageHeader title="操作日志" />

      {/* 汇总卡片 + 操作按钮同行 */}
      <Row gutter={12} style={{ marginBottom: 16 }} align="middle" justify="space-between">
        <Col>
          <Row gutter={12}>
            {[
              { icon: <Activity size={22} />, label: '今日操作', value: todayCount, color: colors.primary, trend: 12, trendLabel: '较昨日' },
              { icon: <ShieldAlert size={22} />, label: '敏感操作', value: sensitiveCount, color: colors.warning, trend: -5, trendLabel: '较昨日' },
              { icon: <FileDown size={22} />, label: '导出操作', value: exportCount, color: colors.info, trend: 0, trendLabel: '较昨日' },
              { icon: <LogIn size={22} />, label: '登录操作', value: loginCount, color: colors.success, trend: 8, trendLabel: '较昨日' },
            ].map((s) => {
              const isUp = (s.trend ?? 0) >= 0
              const trendColor = isUp ? 'var(--c-success)' : 'var(--c-danger)'
              return (
                <Col key={s.label} style={{ width: 205 }}>
                  <div style={{
                    padding: '14px 16px', borderRadius: 10, background: 'var(--n-0)',
                    border: '1px solid var(--n-2)', display: 'flex', alignItems: 'center', gap: 14,
                  }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: `${s.color}14`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {s.icon}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                      <span style={{ fontSize: 12, color: 'var(--n-6)', fontWeight: 500, lineHeight: 1.4 }}>{s.label}</span>
                      <span style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, color: 'var(--n-9)' }}>{s.value}</span>
                      {s.trendLabel && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: 'var(--n-6)', fontSize: 11, lineHeight: 1.4 }}>
                          {s.trendLabel}
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, color: trendColor, fontWeight: 600 }}>
                            {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                            {Math.abs(s.trend)}%
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </Col>
              )
            })}
          </Row>
        </Col>
        <Col>
          <Space>
            <Button icon={<FileArchive size={15} />} onClick={() => message.success('日志归档策略：保留 180 天，可定期归档导出（原型演示）')}>归档策略</Button>
            <Button type="primary" icon={<Download size={15} />} onClick={() => setExportVerify(true)}>导出日志</Button>
          </Space>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }}>
        <Space wrap className="filter-bar">
          <Input.Search placeholder="操作人" allowClear style={{ width: 180 }} onChange={(e) => setOperator(e.target.value)} />
          <Select placeholder="操作类型" allowClear style={{ width: 130 }} options={actionTypes.map((t) => ({ label: t, value: t }))} onChange={setActionType} />
          <Select placeholder="资源类型" allowClear style={{ width: 160 }} options={['教师账号', '学生账号', '班级课程', '课程知识库', 'AI模型路由', '公告', '基础参数', '学期', '操作日志'].map((t) => ({ label: t, value: t }))} onChange={setResourceType} />
          <DatePicker.RangePicker style={{ width: 260 }} placeholder={['开始时间', '结束时间']} />
          <Switch checked={sensitiveOnly} onChange={setSensitiveOnly} checkedChildren="仅看敏感操作" unCheckedChildren="全部操作" />
          {sensitiveOnly && <Tag color="error"><ShieldAlert size={11} /> 当前显示 {sensitiveCount} 条敏感操作</Tag>}
        </Space>
        <Table rowKey="id" size="middle" columns={columns} dataSource={filtered} scroll={{ x: 1100 }} pagination={{ pageSize: 8, showTotal: (t) => `共 ${t} 条` }} />
      </Card>

      <Drawer title={`日志详情 · ${detail?.id}`} open={!!detail} onClose={() => setDetail(null)} width={640}>
        {detail && (
          <>
            <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="操作时间">{detail.time}</Descriptions.Item>
              <Descriptions.Item label="操作人">{detail.operator}</Descriptions.Item>
              <Descriptions.Item label="操作类型"><Tag color={detail.actionType === '权限变更' || detail.actionType === '删除' ? 'error' : 'default'}>{detail.actionType}</Tag></Descriptions.Item>
              <Descriptions.Item label="资源类型 / ID">{detail.resourceType} / {detail.resourceId}</Descriptions.Item>
              <Descriptions.Item label="操作描述">{detail.desc}</Descriptions.Item>
              <Descriptions.Item label="来源 IP">{detail.ip}</Descriptions.Item>
              <Descriptions.Item label="User-Agent">{detail.ua}</Descriptions.Item>
            </Descriptions>
            <Alert type={detail.sensitive ? 'error' : 'info'} showIcon message={detail.sensitive ? '敏感操作' : '普通操作'} description={detail.sensitive ? '权限变更、删除类及敏感资源读写已自动标记并高亮。' : '该操作已正常记录留痕。'} style={{ marginBottom: 16 }} />
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <b style={{ fontSize: 13 }}>变更前数据</b>
                <pre style={{ background: 'var(--n-3)', padding: 12, borderRadius: 'var(--radius-btn)', fontSize: 12, color: colors.textSecondary }}>{detail.before || '—'}</pre>
              </div>
              <div>
                <b style={{ fontSize: 13 }}>变更后数据</b>
                <pre style={{ background: 'var(--n-3)', padding: 12, borderRadius: 'var(--radius-btn)', fontSize: 12, color: colors.textSecondary }}>{detail.after || '—'}</pre>
              </div>
            </Space>
          </>
        )}
      </Drawer>

      <VerifyModal
        open={exportVerify}
        actionLabel="导出操作日志"
        onCancel={() => setExportVerify(false)}
        onConfirm={() => {
          message.success('操作日志导出成功，已记录导出日志')
          addLog({ id: `L${Date.now()}`, operator: '超级管理员', actionType: '导出', resourceType: '操作日志', resourceId: '—', desc: '导出操作日志（二次验证通过）', before: '', after: '', ip: '10.20.1.8', ua: 'Chrome/126', time: new Date().toLocaleString('zh-CN', { hour12: false }), sensitive: true })
        }}
      />
    </div>
  )
}
