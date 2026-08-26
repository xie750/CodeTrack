import { useRef, useState } from 'react'
import { Modal, Button, Steps, Upload, Table, Alert, Tag, message } from 'antd'
import { Download, CloudUpload } from 'lucide-react'
import { colors } from '@admin/theme/themeConfig'

interface ImportModalProps {
  open: boolean
  onCancel: () => void
  kind: '教师' | '学生'
  onSuccess: (rows: Record<string, string>[]) => void
}

interface ImportRow {
  key: string
  line: number
  reason: string
}

// 批量导入：下载模板 → 上传 → 智能校验（重复/缺失/格式）→ 导入结果，异常行跳过
export default function ImportModal({ open, onCancel, kind, onSuccess }: ImportModalProps) {
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<ImportRow[]>([])
  const [done, setDone] = useState<number>(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const idLabel = kind === '教师' ? '工号' : '学号'
  const idPrefix = kind === '教师' ? 'T' : 'U'

  const handleUpload = (file: File) => {
    // 原型演示：模拟解析 Excel，预置几行校验异常
    const simulated: ImportRow[] = [
      { key: 'e1', line: 3, reason: '工号重复：与现有账号 T1001 冲突' },
      { key: 'e2', line: 5, reason: '必填缺失：姓名为空' },
      { key: 'e3', line: 7, reason: '邮箱格式错误：zhangsan#mail.com' },
    ]
    // 模拟有效行
    const valid = Array.from({ length: 8 }, (_, i) => ({
      [`${kind === '教师' ? '工号' : '学号'}`]: `${idPrefix}${String(20260800 + i)}`,
      姓名: `批量导入-${i + 1}号`,
      院系: '计算机科学与技术学院',
    }))
    setErrors(simulated)
    setDone(valid.length)
    setStep(1)
    return false
  }

  const confirmImport = () => {
    message.success(`导入完成：成功 ${done} 条，异常 ${errors.length} 条（已跳过）`)
    onSuccess([])
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
              <Button key="ok" type="primary" onClick={confirmImport}>
                确认导入 {done} 条有效数据
              </Button>,
            ]
      }
    >
      <Steps
        current={step}
        size="small"
        items={[{ title: '下载模板' }, { title: '上传校验' }, { title: '导入结果' }]}
        style={{ marginBottom: 20 }}
      />
      {step === 0 && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <p style={{ color: colors.textSecondary, marginBottom: 16 }}>
            请先下载模板，按模板列填写后上传。系统将自动校验{idLabel}重复、必填缺失、邮箱手机格式错误。
          </p>
          <div className="flex" style={{ gap: 12, justifyContent: 'center' }}>
            <Button icon={<Download size={15} />} onClick={() => message.info('模板下载已触发（原型演示）')}>
              下载导入模板
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />
            <Button type="primary" icon={<CloudUpload size={15} />} onClick={() => fileRef.current?.click()}>
              上传 Excel 文件
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
