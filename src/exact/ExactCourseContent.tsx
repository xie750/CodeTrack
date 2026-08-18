import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, Drawer, Empty, Form, Input, Modal, Progress, Select, Space,
  Switch, Tag, Typography, Upload,
} from 'antd'
import {
  BookOpen, CheckCircle2, ChevronRight, ClipboardCheck, Clock3, Edit3, Eye,
  FileQuestion, FileText, GraduationCap, ListTree, MonitorPlay, Plus, Presentation,
  Send, Sparkles, UploadCloud, Users,
} from 'lucide-react'

import {
  api, type ApiChapter, type ApiClass, type ApiCourse, type ApiMaterial,
  type ApiStudentChapter, type ApiTask,
} from '../api'
import type { ExactView } from './components'
import { CourseBreadcrumb, PageLoader } from './components'
import './course-content.css'

const { Text, Title } = Typography

interface Props {
  courseId: string
  classId: string
  courses: ApiCourse[]
  classes: ApiClass[]
  onNavigate: (view: ExactView) => void
  onRefresh: () => void | Promise<void>
  notify: (text: string) => void
}

const teachingModes = ['理论讲授', '翻转课堂', '案例教学', '项目制教学', '实验实训', '混合式教学']

function materialIcon(type: string) {
  if (/ppt|pptx|slides/.test(type)) return Presentation
  if (/quiz|exercise|练习/.test(type)) return FileQuestion
  return FileText
}

export function ExactCourseContent(props: Props) {
  const [chapters, setChapters] = useState<ApiChapter[]>([])
  const [materials, setMaterials] = useState<ApiMaterial[]>([])
  const [tasks, setTasks] = useState<ApiTask[]>([])
  const [selectedChapterId, setSelectedChapterId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [chapterModalOpen, setChapterModalOpen] = useState(false)
  const [knowledgeModalOpen, setKnowledgeModalOpen] = useState(false)
  const [practiceModalOpen, setPracticeModalOpen] = useState(false)
  const [chapterDetailOpen, setChapterDetailOpen] = useState(false)
  const [detailTab, setDetailTab] = useState<'knowledge' | 'materials' | 'practice'>('knowledge')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [studentChapters, setStudentChapters] = useState<ApiStudentChapter[]>([])
  const [studentChapterId, setStudentChapterId] = useState('')
  const [chapterForm] = Form.useForm()
  const [knowledgeForm] = Form.useForm()
  const [practiceForm] = Form.useForm()
  const course = props.courses.find((item) => item.id === props.courseId)

  const load = async () => {
    setLoading(true)
    try {
      const [chapterRows, materialRows, taskRows] = await Promise.all([
        api.chapters(props.courseId),
        api.materials(props.courseId),
        api.tasks(props.courseId),
      ])
      setChapters(chapterRows)
      setMaterials(materialRows)
      setTasks(taskRows)
      setSelectedChapterId((current) => chapterRows.some((item) => item.id === current) ? current : '')
    } catch (reason: any) {
      props.notify(reason.message || '课程章节内容加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [props.courseId])

  const selectedChapter = chapters.find((item) => item.id === selectedChapterId)
  const chapterMaterials = useMemo(() => materials.filter((item) => item.chapter === selectedChapter?.title), [materials, selectedChapter?.title])
  const chapterTasks = useMemo(() => tasks.filter((item) => item.chapter === selectedChapter?.title), [tasks, selectedChapter?.title])
  const publishedCount = chapters.filter((item) => item.status === 'published').length
  const resourceCount = materials.length + tasks.length

  const changeTeachingMode = async (teachingMode: string) => {
    if (!selectedChapter) return
    setSaving(true)
    try {
      await api.updateChapter(selectedChapter.id, { teaching_mode: teachingMode })
      setChapters((current) => current.map((item) => item.id === selectedChapter.id ? { ...item, teaching_mode: teachingMode } : item))
      props.notify('教学方式已保存')
    } catch (reason: any) {
      props.notify(reason.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleChapterPublish = async (published: boolean) => {
    if (!selectedChapter) return
    setSaving(true)
    try {
      await api.updateChapter(selectedChapter.id, { status: published ? 'published' : 'draft' })
      props.notify(published ? '章节已发布到学生端' : '章节已从学生端撤回')
      await load()
    } catch (reason: any) {
      props.notify(reason.message)
    } finally {
      setSaving(false)
    }
  }

  const saveChapter = async () => {
    try {
      const values = await chapterForm.validateFields()
      setSaving(true)
      const created = await api.createChapter(props.courseId, values)
      chapterForm.resetFields()
      setChapterModalOpen(false)
      await load()
      setSelectedChapterId(created.id)
      setChapterDetailOpen(true)
      props.notify('课程章节已创建')
    } catch (reason: any) {
      if (!reason?.errorFields) props.notify(reason.message)
    } finally {
      setSaving(false)
    }
  }

  const saveKnowledgePoint = async () => {
    if (!selectedChapter) return
    try {
      const values = await knowledgeForm.validateFields()
      setSaving(true)
      await api.createKnowledgePoint({ chapter_id: selectedChapter.id, ...values })
      knowledgeForm.resetFields()
      setKnowledgeModalOpen(false)
      await load()
      props.notify('知识点已添加到章节')
    } catch (reason: any) {
      if (!reason?.errorFields) props.notify(reason.message)
    } finally {
      setSaving(false)
    }
  }

  const uploadChapterMaterial = async (file: File) => {
    if (!selectedChapter) return false
    setUploading(true)
    try {
      await api.uploadMaterial(
        props.courseId,
        file,
        selectedChapter.title,
        selectedChapter.status === 'published' ? 'students' : 'teacher',
      )
      props.notify(selectedChapter.status === 'published' ? '课件已上传并同步给学生' : '课件已上传到章节草稿')
      await load()
    } catch (reason: any) {
      props.notify(reason.message)
    } finally {
      setUploading(false)
    }
    return false
  }

  const toggleMaterialVisibility = async (material: ApiMaterial, visible: boolean) => {
    try {
      await api.updateMaterial(material.id, { visibility: visible ? 'students' : 'teacher' })
      setMaterials((current) => current.map((item) => item.id === material.id ? { ...item, visibility: visible ? 'students' : 'teacher' } : item))
      props.notify(visible ? '资料已对学生开放' : '资料已设为仅教师可见')
    } catch (reason: any) {
      props.notify(reason.message)
    }
  }

  const savePractice = async (publish: boolean) => {
    if (!selectedChapter) return
    try {
      const values = await practiceForm.validateFields()
      setSaving(true)
      const created = await api.createTask({
        course_id: props.courseId,
        class_id: props.classId,
        title: values.title,
        type: values.type,
        chapter_label: selectedChapter.title,
        description: values.description,
        starter_code: values.type === 'programming' ? '// 请在这里完成代码\n' : '',
        difficulty: values.difficulty,
        total_score: 100,
        due_at: values.due_at,
        allow_hints: true,
        test_cases: values.type === 'programming' ? [
          { name: '基础用例', hidden: false, weight: 40 },
          { name: '边界用例', hidden: true, weight: 60 },
        ] : [],
      })
      if (publish) await api.publishTask(created.id, { class_id: props.classId, due_at: values.due_at })
      practiceForm.resetFields()
      setPracticeModalOpen(false)
      await load()
      props.notify(publish ? '课后练习已发布给学生' : '课后练习已保存到任务草稿')
    } catch (reason: any) {
      if (!reason?.errorFields) props.notify(reason.message)
    } finally {
      setSaving(false)
    }
  }

  const openStudentPreview = async () => {
    setPreviewOpen(true)
    setPreviewLoading(true)
    const rows: ApiStudentChapter[] = chapters
      .filter((chapter) => chapter.status === 'published')
      .map((chapter) => ({
        ...chapter,
        materials: materials
          .filter((item) => item.chapter === chapter.title && item.visibility === 'students')
          .map((item) => ({ id: item.id, title: item.title, type: item.type, size: item.size, content_url: item.content_url || null })),
        tasks: tasks
          .filter((item) => item.chapter === chapter.title && item.status === 'published')
          .map((item) => ({ id: item.id, title: item.title, type: item.type, due_at: item.due_at, difficulty: item.difficulty })),
      }))
    setStudentChapters(rows)
    setStudentChapterId(rows.find((item) => item.materials.length || item.tasks.length)?.id || rows[0]?.id || '')
    setPreviewLoading(false)
  }

  if (loading) return <PageLoader />

  const selectedStudentChapter = studentChapters.find((item) => item.id === studentChapterId)
  const chapterNumber = (position: number) => {
    const numerals = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
    return position <= 10 ? numerals[position] : String(position)
  }
  const chapterName = (title: string) => title.replace(/^第\s*\d+\s*章\s*/, '')
  const openChapter = (chapterId: string) => {
    setSelectedChapterId(chapterId)
    setDetailTab('knowledge')
    setChapterDetailOpen(true)
  }

  return <div className="exact-course-page course-content-page">
    <CourseBreadcrumb current="课程章节内容" onNavigate={props.onNavigate} />
    <header className="course-content-heading">
      <div><Title level={2}>课程章节内容</Title><Text type="secondary">{course?.name}</Text></div>
      <Space><Button icon={<Eye size={15} />} onClick={openStudentPreview}>查看学生视角</Button><Button type="primary" icon={<Plus size={15} />} onClick={() => setChapterModalOpen(true)}>新建章节</Button></Space>
    </header>

    <div className="course-content-overview">
      <div><span><BookOpen size={20} /></span><div><strong>课程内容结构</strong><small>按教学顺序组织章节，并向学生发布学习内容</small></div></div>
      <dl><div><dt>{chapters.length}</dt><dd>章节</dd></div><div><dt>{publishedCount}</dt><dd>已发布</dd></div><div><dt>{chapters.reduce((sum, item) => sum + item.knowledge_points.length, 0)}</dt><dd>知识点</dd></div><div><dt>{resourceCount}</dt><dd>教学内容</dd></div></dl>
    </div>

    <section className="chapter-catalog">
      <header className="chapter-catalog-head">
        <div><span><ListTree size={18} /></span><div><strong>完整章节目录</strong><small>点击章节查看知识点、教学课件与课后练习</small></div></div>
        <Tag>{chapters.length} 章</Tag>
      </header>
      <div className="chapter-catalog-list">
        {chapters.map((chapter) => {
          const chapterMaterialCount = materials.filter((item) => item.chapter === chapter.title).length
          const chapterTaskCount = tasks.filter((item) => item.chapter === chapter.title).length
          return <button type="button" key={chapter.id} onClick={() => openChapter(chapter.id)}>
            <span className="chapter-catalog-number"><small>CHAPTER</small><strong>{String(chapter.position).padStart(2, '0')}</strong></span>
            <span className="chapter-catalog-title"><small>第{chapterNumber(chapter.position)}章</small><strong>{chapterName(chapter.title)}</strong><em>{chapter.description || '暂无章节说明'}</em></span>
            <span className="chapter-catalog-meta"><Tag color={chapter.status === 'published' ? 'green' : 'default'}>{chapter.status === 'published' ? '已发布' : '草稿'}</Tag><small><Sparkles size={13} />{chapter.knowledge_points.length} 知识点</small><small><Presentation size={13} />{chapterMaterialCount} 课件</small><small><ClipboardCheck size={13} />{chapterTaskCount} 练习</small></span>
            <ChevronRight size={18} />
          </button>
        })}
        {!chapters.length && <Empty description="暂未创建课程章节" />}
      </div>
      <button type="button" className="chapter-catalog-add" onClick={() => setChapterModalOpen(true)}><Plus size={16} /> 添加新章节</button>
    </section>

    <Drawer rootClassName="chapter-detail-drawer" title={selectedChapter ? `第${chapterNumber(selectedChapter.position)}章 · ${chapterName(selectedChapter.title)}` : '章节内容'} open={chapterDetailOpen} onClose={() => setChapterDetailOpen(false)} width={760}>
      <main className="chapter-editor">
        {selectedChapter && <>
          <section className="chapter-editor-head">
            <span className="chapter-detail-number">{String(selectedChapter.position).padStart(2, '0')}</span>
            <div><span>第{chapterNumber(selectedChapter.position)}章</span><Title level={3}>{chapterName(selectedChapter.title)}</Title><p>{selectedChapter.description || '尚未填写章节说明'}</p></div>
            <div className="chapter-publish-control"><small>学生端状态</small><Switch loading={saving} checked={selectedChapter.status === 'published'} onChange={toggleChapterPublish} checkedChildren="已发布" unCheckedChildren="草稿" /></div>
          </section>

          <section className="chapter-mode-section">
            <header><div><MonitorPlay size={17} /><span><strong>教学方式</strong><small>当前章节采用的课堂组织方式</small></span></div></header>
            <Select value={selectedChapter.teaching_mode} loading={saving} onChange={changeTeachingMode} options={teachingModes.map((value) => ({ value, label: value }))} />
          </section>

          <nav className="chapter-detail-tabs" aria-label="章节内容分类">
            <button type="button" className={detailTab === 'knowledge' ? 'active' : ''} onClick={() => setDetailTab('knowledge')}><Sparkles size={16} /><span>知识点</span><small>{selectedChapter.knowledge_points.length}</small></button>
            <button type="button" className={detailTab === 'materials' ? 'active' : ''} onClick={() => setDetailTab('materials')}><Presentation size={16} /><span>教学课件</span><small>{chapterMaterials.length}</small></button>
            <button type="button" className={detailTab === 'practice' ? 'active' : ''} onClick={() => setDetailTab('practice')}><ClipboardCheck size={16} /><span>课后练习</span><small>{chapterTasks.length}</small></button>
          </nav>

          {detailTab === 'knowledge' && <section className="chapter-knowledge-section chapter-tab-panel">
            <header><div><Sparkles size={17} /><span><strong>章节知识点</strong><small>按教学顺序组织二级内容</small></span></div><Button size="small" icon={<Plus size={13} />} onClick={() => setKnowledgeModalOpen(true)}>添加知识点</Button></header>
            <div className="chapter-knowledge-list">{selectedChapter.knowledge_points.map((point, index) => <article key={point.id}>
              <span>{index + 1}</span><div><strong>{point.name}</strong><p>{point.description || '暂无知识点说明'}</p></div><Tag color={point.difficulty === '挑战' ? 'red' : point.difficulty === '进阶' ? 'gold' : 'green'}>{point.difficulty}</Tag><Progress percent={point.mastery} size="small" showInfo={false} />
            </article>)}{!selectedChapter.knowledge_points.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本章节还没有知识点" />}</div>
          </section>}

          {detailTab === 'materials' && <section className="chapter-resource-section chapter-tab-panel">
            <header><div><Presentation size={17} /><span><strong>教学课件</strong><small>PPT、讲义、视频与参考资料</small></span></div><Upload beforeUpload={uploadChapterMaterial} showUploadList={false}><Button size="small" loading={uploading} icon={<UploadCloud size={13} />}>上传课件</Button></Upload></header>
            <div className="chapter-resource-list">{chapterMaterials.map((item) => {
              const Icon = materialIcon(item.type)
              return <article key={item.id}><span><Icon size={18} /></span><div><strong>{item.title}</strong><small>{item.type.toUpperCase()} · {item.size}</small></div><label><Switch size="small" checked={item.visibility === 'students'} onChange={(checked) => toggleMaterialVisibility(item, checked)} /><small>学生可见</small></label></article>
            })}{!chapterMaterials.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本章节还没有教学课件" />}</div>
          </section>}

          {detailTab === 'practice' && <section className="chapter-practice-section chapter-tab-panel">
            <header><div><ClipboardCheck size={17} /><span><strong>课后练习</strong><small>复用任务管理中的练习与成绩数据</small></span></div><Button size="small" icon={<Plus size={13} />} onClick={() => setPracticeModalOpen(true)}>创建练习</Button></header>
            <div className="chapter-practice-list">{chapterTasks.map((task) => <article key={task.id}><span><FileQuestion size={17} /></span><div><strong>{task.title}</strong><small>截止 {task.due_at.slice(0, 16).replace('T', ' ')} · {task.submitted}/{task.total || 0} 提交</small></div><Tag color={task.status === 'published' ? 'green' : 'gold'}>{task.status === 'published' ? '已发布' : '草稿'}</Tag><Button type="link" size="small" onClick={() => props.onNavigate('tasks')}>任务管理 <ChevronRight size={12} /></Button></article>)}{!chapterTasks.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本章节还没有课后练习" />}</div>
          </section>}
        </>}
      </main>
    </Drawer>

    <Modal title="新建课程章节" open={chapterModalOpen} onCancel={() => setChapterModalOpen(false)} onOk={saveChapter} confirmLoading={saving} okText="创建章节">
      <Form form={chapterForm} layout="vertical" initialValues={{ teaching_mode: '理论讲授' }}><Form.Item label="章节名称" name="title" rules={[{ required: true, message: '请输入章节名称' }]}><Input placeholder="例如：第 7 章 查找" /></Form.Item><Form.Item label="章节说明" name="description"><Input.TextArea rows={3} placeholder="填写本章教学目标与内容概要" /></Form.Item><Form.Item label="教学方式" name="teaching_mode"><Select options={teachingModes.map((value) => ({ value, label: value }))} /></Form.Item></Form>
    </Modal>

    <Modal title={`添加知识点 · ${selectedChapter?.title || ''}`} open={knowledgeModalOpen} onCancel={() => setKnowledgeModalOpen(false)} onOk={saveKnowledgePoint} confirmLoading={saving} okText="添加">
      <Form form={knowledgeForm} layout="vertical" initialValues={{ difficulty: '基础' }}><Form.Item label="知识点名称" name="name" rules={[{ required: true, message: '请输入知识点名称' }]}><Input placeholder="例如：二叉树层序遍历" /></Form.Item><Form.Item label="知识点说明" name="description"><Input.TextArea rows={3} /></Form.Item><Form.Item label="难度" name="difficulty"><Select options={['基础', '进阶', '挑战'].map((value) => ({ value, label: value }))} /></Form.Item></Form>
    </Modal>

    <Modal title={`创建课后练习 · ${selectedChapter?.title || ''}`} open={practiceModalOpen} onCancel={() => setPracticeModalOpen(false)} footer={<><Button onClick={() => setPracticeModalOpen(false)}>取消</Button><Button loading={saving} onClick={() => savePractice(false)}>保存草稿</Button><Button type="primary" loading={saving} icon={<Send size={14} />} onClick={() => savePractice(true)}>发布给学生</Button></>}>
      <Form form={practiceForm} layout="vertical" initialValues={{ type: 'programming', difficulty: '进阶', due_at: '2026-12-30T23:59:00' }}><Form.Item label="练习名称" name="title" rules={[{ required: true, message: '请输入练习名称' }]}><Input /></Form.Item><Form.Item label="练习说明" name="description"><Input.TextArea rows={3} /></Form.Item><div className="practice-form-grid"><Form.Item label="题型" name="type"><Select options={[{ value: 'programming', label: '编程题' }, { value: 'single_choice', label: '单选题' }, { value: 'short_answer', label: '简答题' }]} /></Form.Item><Form.Item label="难度" name="difficulty"><Select options={['基础', '进阶', '挑战'].map((value) => ({ value, label: value }))} /></Form.Item></div><Form.Item label="截止时间" name="due_at"><Input /></Form.Item></Form>
    </Modal>

    <Drawer rootClassName="student-content-preview-drawer" title={<span><GraduationCap size={18} /> 学生视角</span>} open={previewOpen} onClose={() => setPreviewOpen(false)} width={720}>
      {previewLoading ? <PageLoader /> : !studentChapters.length ? <Alert type="info" showIcon message="暂无已发布章节" description="发布章节后，学生才能在课程内容中查看对应知识点、课件和练习。" /> : <div className="student-content-preview">
        <header><div><small>我的课程</small><Title level={3}>{course?.name}</Title></div><Tag color="green">学生端预览</Tag></header>
        <div className="student-content-body"><aside>{studentChapters.map((chapter) => <button className={chapter.id === studentChapterId ? 'active' : ''} key={chapter.id} onClick={() => setStudentChapterId(chapter.id)}><span>{chapter.position}</span><div><strong>{chapter.title}</strong><small>{chapter.knowledge_points.length} 个知识点</small></div></button>)}</aside><main>{selectedStudentChapter && <>
          <div className="student-chapter-heading"><Tag>{selectedStudentChapter.teaching_mode}</Tag><Title level={3}>{selectedStudentChapter.title}</Title><p>{selectedStudentChapter.description || '本章课程内容'}</p></div>
          <section><strong><BookOpen size={15} /> 本章知识点</strong><div className="student-knowledge-grid">{selectedStudentChapter.knowledge_points.map((point) => <span key={point.id}><CheckCircle2 size={13} />{point.name}</span>)}</div></section>
          <section><strong><Presentation size={15} /> 学习资料</strong>{selectedStudentChapter.materials.map((item) => <article key={item.id}><FileText size={17} /><div><strong>{item.title}</strong><small>{item.type.toUpperCase()} · {item.size}</small></div><Button size="small">查看</Button></article>)}{!selectedStudentChapter.materials.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无公开资料" />}</section>
          <section><strong><ClipboardCheck size={15} /> 课后练习</strong>{selectedStudentChapter.tasks.map((task) => <article key={task.id}><FileQuestion size={17} /><div><strong>{task.title}</strong><small><Clock3 size={11} /> 截止 {task.due_at.slice(0, 16).replace('T', ' ')}</small></div><Button type="primary" size="small">开始练习</Button></article>)}{!selectedStudentChapter.tasks.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无课后练习" />}</section>
        </>}</main></div>
      </div>}
    </Drawer>
  </div>
}
