import { useEffect, useRef, useState } from 'react'
import { Modal, Button, Steps, Table, Alert, Tag, message } from 'antd'
import { Download, CloudUpload } from 'lucide-react'
import { colors } from '@admin/theme/themeConfig'
import { importColumns, parseAccountCsv } from '@admin/importCsv'

interface ImportModalProps {
  open: boolean
  onCancel: () => void
  kind: '教师' | '学生'
  onSuccess: (rows: Record<string, string>[]) => void
  existingIds: string[]
}

interface ImportRow {
  key: string
  line: number
  reason: string
}

// 批量导入：下载模板 → 上传 → 智能校验（重复/缺失/格式）→ 导入结果，异常行跳过
export default function ImportModal({ open, onCancel, kind, onSuccess, existingIds }: ImportModalProps) {
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<ImportRow[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [reading, setReading] = useState(false)
  const uploadVersion = useRef(0)
  const done = rows.length
  const fileRef = useRef<HTMLInputElement>(null)

  const idLabel = kind === '教师' ? '工号' : '学号'
  useEffect(() => {
    uploadVersion.current++
    setStep(0); setRows([]); setErrors([]); setReading(false)
    return () => { uploadVersion.current++ }
  }, [open, kind])

  const handleUpload = async (file: File) => {
    const version = ++uploadVersion.current
    setReading(true)
    try {
      if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('请将 Excel 文件另存为 CSV UTF-8 后上传')
      if (file.size > 5 * 1024 * 1024) throw new Error('文件不能超过 5 MB')
      const content = await file.text()
      if (version !== uploadVersion.current) return
      const result = parseAccountCsv(content, kind, existingIds)
      setErrors(result.errors); setRows(result.rows); setStep(1)
    } catch (error) {
      if (version === uploadVersion.current) message.error(error instanceof Error ? error.message : '文件读取失败，请重试')
    } finally {
      if (version === uploadVersion.current) setReading(false)
    }
  }

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + importColumns(kind).join(',') + '\r\n'], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = `${kind}导入模板.csv`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const confirmImport = () => {
    if (!rows.length) return
    if (rows.some((row) => existingIds.includes(row[idLabel]))) {
      message.error('账号列表已更新，部分编号重复，请重新上传校验')
      setStep(0)
      return
    }
    onSuccess(rows)
    message.success(`已加入当前演示列表 ${done} 条，异常 ${errors.length} 条（已跳过）`)
    setStep(0)
    onCancel()
  }

  return (
    <Modal
      title={`批量导入${kind}账号`}
      open={open}
      onCancel={() => {
        setStep(0)
        onCancel()
      }}
      width={640}
      footer={
        step === 0
          ? [
              <Button key="cancel" onClick={() => { setStep(0); onCancel() }}>
                取消
              </Button>,
            ]
          : [
              <Button key="back" onClick={() => setStep(0)}>
                返回重选
              </Button>,
              <Button key="ok" type="primary" onClick={confirmImport} disabled={!done}>
                确认导入 {done} 条有效数据
              </Button>,
            ]
      }
    >
      <Steps
        current={step}
        size="small"
        items={[{ title: '选择文件' }, { title: '校验并确认' }]}
        style={{ marginBottom: 20 }}
      />
      {step === 0 && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <p style={{ color: colors.textSecondary, marginBottom: 16 }}>
            下载模板后用 Excel 填写，另存为 CSV UTF-8 上传。系统校验{idLabel}重复及必填字段。当前仅更新本次会话的演示列表，不创建可登录账号。
          </p>
          <div className="flex" style={{ gap: 12, justifyContent: 'center' }}>
            <Button icon={<Download size={15} />} onClick={downloadTemplate}>
              下载导入模板
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void handleUpload(file) }}
            />
            <Button type="primary" loading={reading} icon={<CloudUpload size={15} />} onClick={() => fileRef.current?.click()}>
              上传 CSV 文件
            </Button>
          </div>
        </div>
      )}
      {step === 1 && (
        <div>
          <Alert
            type={errors.length ? 'warning' : 'success'}
            showIcon
            message={`校验完成：有效数据 ${done} 条，异常 ${errors.length} 条（异常行已跳过）`}
            style={{ marginBottom: 12 }}
          />
          <Table
            size="small"
            rowKey={(row) => row[idLabel]}
            dataSource={rows}
            columns={importColumns(kind).map((name) => ({ title: name, dataIndex: name }))}
            pagination={{ pageSize: 5 }}
            scroll={{ x: 600 }}
          />
          <Table
            size="small"
            rowKey="key"
            pagination={false}
            dataSource={errors}
            columns={[
              { title: '行号', dataIndex: 'line', width: 60 },
              { title: '异常原因', dataIndex: 'reason', render: (v: string) => <Tag color="error">{v}</Tag> },
            ]}
            locale={{ emptyText: '全部通过，无异常行' }}
          />
        </div>
      )}
    </Modal>
  )
}
