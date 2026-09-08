import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Checkbox, Empty, Input, Modal, Progress, Select, Space, Tag, Typography, message } from 'antd'
import {
  Archive,
  Check,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileText,
  GitBranch,
  Loader2,
  Plus,
  RefreshCw,
  Route,
  Search,
  Send,
  UploadCloud,
  Users,
  X,
} from 'lucide-react'

import {
  api,
  type ApiTeacherResearchHome,
  type ApiTeacherResearchMaterial,
  type ApiTeacherResearchProject,
  type ApiTeacherResearchSubmission,
} from '../api'
import './exact-research.css'

const { Paragraph, Text, Title } = Typography

function unifiedDownloadUrl(url?: string | null) {
  if (!url) return ''
  return url.replace(/^\/api\/v1/, '/api/unified')
}

function statusColor(status: string) {
  if (status === 'PUBLISHED' || status === 'APPROVED' || status === 'COMPLETED') return 'green'
  if (status === 'REVIEWING' || status === 'NEEDS_REVISION') return 'orange'
  if (status === 'ARCHIVED') return 'blue'
  return 'cyan'
}

function MaterialRow({ item }: { item: ApiTeacherResearchMaterial }) {
  const downloadUrl = unifiedDownloadUrl(item.download_url)
  return <article className="research-material-row">
    <span><FileText size={16} /></span>
    <div>
      <strong>{item.title}</strong>
      <small>{item.description || item.file_name || item.external_url || '已沉淀为项目材料'}</small>
    </div>
    {item.external_url ? <a href={item.external_url} target="_blank" rel="noreferrer"><ExternalLink size={15} />外链</a> : null}
    {downloadUrl ? <a href={downloadUrl} target="_blank" rel="noreferrer"><Download size={15} />下载</a> : null}
  </article>
}

function SubmissionRow({
  item,
  onReview,
}: {
  item: ApiTeacherResearchSubmission
  onReview: (item: ApiTeacherResearchSubmission, status: string) => void
}) {
  const materialTitles = Array.isArray(item.content?.material_titles) ? item.content.material_titles as string[] : []
  return <article className="research-submission-row">
    <div>
      <Tag color={statusColor(item.status)}>{item.status_label}</Tag>
      <strong>{item.title}</strong>
      <small>{item.student_name} · {item.submitted_at?.slice(0, 16).replace('T', ' ')}</small>
      <p>{item.description}</p>
      {materialTitles.length ? <div className="research-submission-materials">
        {materialTitles.map((title) => <span key={title}>{title}</span>)}
      </div> : null}
      {item.review_comment ? <em>{item.review_comment}</em> : null}
    </div>
    <Space>
      <Button icon={<X size={14} />} onClick={() => onReview(item, 'NEEDS_REVISION')}>退回修订</Button>
      <Button type="primary" icon={<Check size={14} />} onClick={() => onReview(item, 'APPROVED')}>确认</Button>
    </Space>
  </article>
}

export function ExactResearch() {
  const [home, setHome] = useState<ApiTeacherResearchHome | null>(null)
  const [project, setProject] = useState<ApiTeacherResearchProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [focus, setFocus] = useState('')
  const [publishClassIds, setPublishClassIds] = useState<string[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [reviewing, setReviewing] = useState<{ item: ApiTeacherResearchSubmission; status: string } | null>(null)
  const [reviewComment, setReviewComment] = useState('')
  const [form, setForm] = useState({
    title: '大模型辅助编程学习诊断研究',
    direction: 'AI 教育 + 代码诊断 + 学习分析',
    description: '围绕学生代码提交、诊断解释和渐进式提示记录，形成可复查的科研项目实践。',
    course_id: '',
    tags: '人工智能专业,代码智能,学习分析',
  })
  const [materialForm, setMaterialForm] = useState({
    title: '',
    description: '',
    content: '',
    external_url: '',
  })
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [messageApi, contextHolder] = message.useMessage()

  const selectedId = project?.id

  const mergeProject = (next: ApiTeacherResearchProject) => {
    setProject(next)
    setHome((current) => current ? {
      ...current,
      projects: current.projects.map((item) => item.id === next.id ? next : item),
    } : current)
  }

  const load = async (preferredId?: string) => {
    setLoading(true)
    try {
      const data = await api.teacherResearchHome()
      setHome(data)
      const next = data.projects.find((item) => item.id === preferredId) || data.projects[0] || null
      if (next) {
        const detail = await api.teacherResearchProject(next.id)
        setProject(detail)
      } else {
        setProject(null)
      }
      if (!form.course_id && data.courses[0]) {
        setForm((current) => ({ ...current, course_id: data.courses[0].id }))
      }
    } catch (reason: any) {
      messageApi.error(reason.message || '科研工作台加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stats = home?.summary
  const publishScope = project?.publish_scope
  const publishClasses = publishScope?.classes || []
  const allPublishClassIds = useMemo(() => publishClasses.map((item) => item.class_id), [publishClasses])
  const selectedStudentCount = useMemo(() => {
    const selected = new Set(publishClassIds)
    return publishClasses
      .filter((item) => selected.has(item.class_id))
      .reduce((sum, item) => sum + item.student_count, 0)
  }, [publishClassIds, publishClasses])
  const selectedStudents = useMemo(() => {
    const selected = new Set(publishClassIds)
    const unique = new Map<string, NonNullable<typeof publishScope>['students'][number]>()
    publishClasses
      .filter((item) => selected.has(item.class_id))
      .forEach((item) => item.students.forEach((student) => unique.set(student.student_id, student)))
    return Array.from(unique.values())
  }, [publishClassIds, publishClasses, publishScope])
  const courseOptions = useMemo(
    () => (home?.courses || []).map((course) => ({ label: course.name, value: course.id })),
    [home?.courses],
  )

  useEffect(() => {
    setPublishClassIds(allPublishClassIds)
  }, [selectedId, allPublishClassIds.join('|')])

  const chooseProject = async (id: string) => {
    setBusy('select')
    try {
      setProject(await api.teacherResearchProject(id))
    } catch (reason: any) {
      messageApi.error(reason.message || '项目详情加载失败')
    } finally {
      setBusy('')
    }
  }

  const createProject = async () => {
    setBusy('create')
    try {
      const next = await api.createTeacherResearchProject({
        title: form.title,
        direction: form.direction,
        description: form.description,
        course_id: form.course_id || null,
        tags: form.tags.split(/[，,]/).map((item) => item.trim()).filter(Boolean),
      })
      setHome((current) => current ? { ...current, projects: [next, ...current.projects] } : current)
      setProject(next)
      setCreateOpen(false)
      messageApi.success('科研 Harness 项目已创建')
    } catch (reason: any) {
      messageApi.error(reason.message || '项目创建失败')
    } finally {
      setBusy('')
    }
  }

  const refreshFrontier = async () => {
    if (!project) return
    setBusy('frontier')
    try {
      const result = await api.refreshTeacherResearchFrontier(project.id, focus)
      mergeProject(result.project)
      messageApi.success('前沿追踪已刷新')
    } catch (reason: any) {
      messageApi.error(reason.message || '前沿追踪刷新失败')
    } finally {
      setBusy('')
    }
  }

  const saveMaterial = async () => {
    if (!project) return
    setBusy('material')
    try {
      const result = await api.createTeacherResearchMaterial(project.id, {
        material_type: 'NOTE',
        title: materialForm.title,
        description: materialForm.description,
        content: materialForm.content,
        external_url: materialForm.external_url,
      })
      mergeProject(result.project)
      setMaterialForm({ title: '', description: '', content: '', external_url: '' })
      messageApi.success('科研材料已沉淀')
    } catch (reason: any) {
      messageApi.error(reason.message || '材料保存失败')
    } finally {
      setBusy('')
    }
  }

  const uploadFile = async () => {
    if (!project) return
    const file = fileRef.current?.files?.[0]
    if (!file) {
      messageApi.warning('请先选择代码、Notebook、数据表或报告文件')
      return
    }
    setBusy('upload')
    try {
      const result = await api.uploadTeacherResearchMaterial(project.id, file, {
        title: file.name,
        description: '教师上传的科研过程文件',
        material_type: 'CODE_FILE',
      })
      mergeProject(result.project)
      if (fileRef.current) fileRef.current.value = ''
      messageApi.success('文件已上传并进入项目材料')
    } catch (reason: any) {
      messageApi.error(reason.message || '文件上传失败')
    } finally {
      setBusy('')
    }
  }

  const publish = async () => {
    if (!project) return
    if (!publishClassIds.length) {
      messageApi.warning('请先选择要发布的授课班级')
      return
    }
    setBusy('publish')
    try {
      const result = await api.publishTeacherResearchProject(project.id, publishClassIds)
      mergeProject(result.project)
      messageApi.success(`已发布到学生端，新增 ${result.created_enrollments} 个学生入口`)
    } catch (reason: any) {
      messageApi.error(reason.message || '发布失败')
    } finally {
      setBusy('')
    }
  }

  const submitReview = async () => {
    if (!project || !reviewing) return
    setBusy('review')
    try {
      const result = await api.reviewTeacherResearchSubmission(project.id, reviewing.item.id, {
        status: reviewing.status,
        comment: reviewComment,
      })
      mergeProject(result.project)
      setReviewing(null)
      setReviewComment('')
      messageApi.success('审核意见已写入阶段提交')
    } catch (reason: any) {
      messageApi.error(reason.message || '审核失败')
    } finally {
      setBusy('')
    }
  }

  const archive = async () => {
    if (!project) return
    setBusy('archive')
    try {
      const result = await api.archiveTeacherResearchProject(project.id)
      mergeProject(result.project)
      messageApi.success('成果已归档到课程资料库')
    } catch (reason: any) {
      messageApi.error(reason.message || '归档失败')
    } finally {
      setBusy('')
    }
  }

  if (loading) return <div className="exact-research-page"><div className="research-loading"><Loader2 className="research-spin" size={26} />正在装配科研 Harness</div></div>

  return <div className="exact-research-page">
    {contextHolder}
    <div className="research-page-title">
      <div>
        <Tag color="cyan">教师科研 Harness</Tag>
        <Title level={2}>科研协作工作台</Title>
        <Text type="secondary">把前沿追踪、项目发布、材料沉淀和学生阶段审核固定在同一条科研轨道里。</Text>
      </div>
      <Button type="primary" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>新建科研项目</Button>
    </div>

    <section className="research-metrics">
      <article><GitBranch size={18} /><span>科研项目</span><strong>{stats?.project_count ?? 0}</strong></article>
      <article><Send size={18} /><span>已发布</span><strong>{stats?.published_count ?? 0}</strong></article>
      <article><Search size={18} /><span>追踪中</span><strong>{stats?.tracking_count ?? 0}</strong></article>
      <article><ClipboardCheck size={18} /><span>待审核</span><strong>{project?.stats.pending_review_count ?? 0}</strong></article>
    </section>

    <div className="research-workbench">
      <aside className="research-project-list">
        {(home?.projects || []).map((item) => <button
          type="button"
          key={item.id}
          className={selectedId === item.id ? 'active' : ''}
          disabled={busy === 'select'}
          onClick={() => void chooseProject(item.id)}
        >
          <div><strong>{item.title}</strong><Tag color={statusColor(item.status)}>{item.status_label}</Tag></div>
          <span>{item.course_name} · {item.direction}</span>
          <Progress percent={item.progress} size="small" showInfo={false} />
        </button>)}
      </aside>

      {project ? <main className="research-detail">
        <section className="research-harness-panel">
          <div>
            <Tag color={statusColor(project.status)}>{project.status_label}</Tag>
            <Title level={3}>{project.title}</Title>
            <Paragraph>{project.description}</Paragraph>
            <div className="research-tags">{project.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          </div>
          <div className="research-harness-status">
            <Route size={22} />
            <span>当前轨道</span>
            <strong>{project.harness.stage}</strong>
            <Progress percent={project.progress} />
          </div>
        </section>

        <section className="research-section">
          <div className="research-section-head">
            <div><Title level={4}>Harness 约束</Title><Text type="secondary">AI 和项目流转都按这些规则收束。</Text></div>
          </div>
          <div className="research-guardrails">
            {project.harness.guardrails.map((rule) => <span key={rule}><Check size={14} />{rule}</span>)}
          </div>
          <div className="research-pullback">
            <strong>{project.harness.deviation_signal}</strong>
            <p>{project.harness.pullback_action}</p>
          </div>
        </section>

        <section className="research-section">
          <div className="research-section-head">
            <div><Title level={4}>前沿追踪</Title><Text type="secondary">可跳转到权威平台，也会沉淀为项目来源。</Text></div>
            <Space.Compact>
              <Input value={focus} onChange={(event) => setFocus(event.target.value)} placeholder="输入追踪重点，如 RAG 代码诊断" />
              <Button icon={busy === 'frontier' ? <Loader2 className="research-spin" size={14} /> : <RefreshCw size={14} />} onClick={() => void refreshFrontier()}>刷新</Button>
            </Space.Compact>
          </div>
          <div className="research-source-grid">
            {project.external_sources.map((source) => <a key={source.platform} href={source.url} target="_blank" rel="noreferrer">
              <strong>{source.label}</strong>
              <span>{source.description}</span>
              <ExternalLink size={15} />
            </a>)}
          </div>
          <div className="research-topic-grid">
            {project.frontier_topics.map((topic) => <article key={topic.title}>
              <div><strong>{topic.title}</strong><Tag color="blue">{topic.heat}</Tag></div>
              <p>{topic.summary}</p>
              <a href={topic.source_url} target="_blank" rel="noreferrer">{topic.source}<ExternalLink size={14} /></a>
            </article>)}
          </div>
        </section>

        <section className="research-section research-material-section">
          <div className="research-section-head">
            <div><Title level={4}>材料沉淀</Title><Text type="secondary">支持论文链接、代码、Notebook、数据表和阶段报告。</Text></div>
          </div>
          <div className="research-material-editor">
            <Input value={materialForm.title} onChange={(event) => setMaterialForm({ ...materialForm, title: event.target.value })} placeholder="材料标题" />
            <Input value={materialForm.external_url} onChange={(event) => setMaterialForm({ ...materialForm, external_url: event.target.value })} placeholder="外部链接，可选" />
            <Input.TextArea rows={3} value={materialForm.description} onChange={(event) => setMaterialForm({ ...materialForm, description: event.target.value })} placeholder="材料说明" />
            <Input.TextArea rows={4} value={materialForm.content} onChange={(event) => setMaterialForm({ ...materialForm, content: event.target.value })} placeholder="正文摘录、实验记录或阅读笔记" />
            <Button type="primary" icon={<FileText size={15} />} loading={busy === 'material'} onClick={() => void saveMaterial()}>保存材料</Button>
          </div>
          <div className="research-upload-box">
            <input ref={fileRef} type="file" accept=".py,.ipynb,.cpp,.c,.h,.hpp,.java,.js,.ts,.tsx,.json,.csv,.xlsx,.md,.txt,.zip,.pdf,.doc,.docx" />
            <Button icon={<UploadCloud size={15} />} loading={busy === 'upload'} onClick={() => void uploadFile()}>上传文件</Button>
          </div>
          <div className="research-material-list">
            {project.materials.length ? project.materials.map((item) => <MaterialRow key={item.id} item={item} />) : <Empty description="暂无材料，先上传代码或保存一条论文来源" />}
          </div>
        </section>

        <section className="research-section">
          <div className="research-section-head">
            <div><Title level={4}>发布与审核</Title><Text type="secondary">发布后学生端会出现科研项目实践入口，提交后回到这里审核。</Text></div>
            <Space>
              <Button icon={<Send size={15} />} loading={busy === 'publish'} disabled={!publishClassIds.length} onClick={() => void publish()}>发布给学生</Button>
              <Button icon={<Archive size={15} />} loading={busy === 'archive'} onClick={() => void archive()}>成果归档</Button>
            </Space>
          </div>
          {publishScope ? <div className="research-publish-scope">
            <div className="research-publish-basis">
              <Users size={18} />
              <div>
                <strong>发布对象依据</strong>
                <p>{publishScope.basis}</p>
              </div>
              <Tag color="blue">{publishScope.course_name}</Tag>
            </div>
            {publishClasses.length ? <Checkbox.Group
              className="research-class-selector"
              value={publishClassIds}
              onChange={(values) => setPublishClassIds(values.map(String))}
            >
              {publishClasses.map((item) => <label key={item.class_id} className="research-class-card">
                <Checkbox value={item.class_id} />
                <div>
                  <strong>{item.class_name}</strong>
                  <small>{item.grade} · {item.major_name} · {item.term}</small>
                  <span>{item.student_count} 名在册学生</span>
                </div>
              </label>)}
            </Checkbox.Group> : <Empty description={project.course_id ? '该课程下暂无当前教师负责的授课班级' : '发布前需要先绑定课程'} />}
            <div className="research-publish-preview">
              <span>本次将生成入口 <strong>{selectedStudentCount}</strong> 名学生</span>
              <div>
                {selectedStudents.slice(0, 10).map((student) => <em key={student.student_id}>{student.student_name}</em>)}
                {selectedStudents.length > 10 ? <em>+{selectedStudents.length - 10}</em> : null}
              </div>
            </div>
          </div> : null}
          <div className="research-student-stats">
            <span>学生入口 <strong>{project.stats.student_count}</strong></span>
            <span>阶段提交 <strong>{project.stats.submission_count}</strong></span>
            <span>待审核 <strong>{project.stats.pending_review_count}</strong></span>
            {project.student_project_id ? <span>学生项目 ID <strong>{project.student_project_id}</strong></span> : null}
          </div>
          <div className="research-submission-list">
            {project.student_submissions.length ? project.student_submissions.map((item) => <SubmissionRow key={item.id} item={item} onReview={(row, status) => { setReviewing({ item: row, status }); setReviewComment(status === 'NEEDS_REVISION' ? '请补充来源链接、代码说明和实验结论，再重新提交。' : '阶段成果已确认，可进入下一阶段。') }} />) : <Empty description="暂无学生阶段提交" />}
          </div>
        </section>
      </main> : <main className="research-detail"><Empty description="暂无科研项目" /></main>}
    </div>

    <Modal
      title="新建科研 Harness 项目"
      open={createOpen}
      onCancel={() => setCreateOpen(false)}
      onOk={() => void createProject()}
      confirmLoading={busy === 'create'}
      okText="创建项目"
      destroyOnClose
    >
      <div className="research-create-form">
        <label>项目标题<Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label>研究方向<Input value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value })} /></label>
        <label>绑定课程<Select value={form.course_id || undefined} options={courseOptions} onChange={(course_id) => setForm({ ...form, course_id })} placeholder="选择课程" /></label>
        <label>标签<Input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} /></label>
        <label>项目说明<Input.TextArea rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      </div>
    </Modal>

    <Modal
      title={reviewing?.status === 'NEEDS_REVISION' ? '退回学生修订' : '确认阶段成果'}
      open={!!reviewing}
      onCancel={() => setReviewing(null)}
      onOk={() => void submitReview()}
      confirmLoading={busy === 'review'}
      okText="提交审核意见"
      destroyOnClose
    >
      <Input.TextArea rows={5} value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} />
    </Modal>
  </div>
}
