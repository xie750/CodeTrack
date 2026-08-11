import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, Checkbox, Dropdown, Form, Input, Modal, Select, Space,
  Tabs, Tag, Typography, Upload,
} from 'antd'
import {
  CheckCircle2, ChevronRight, Download, Edit3, ExternalLink, FileText, Folder,
  Link2, MoreHorizontal, Network, Plus, RotateCcw, Search, Trash2, UploadCloud,
  WandSparkles,
} from 'lucide-react'

import { api, type ApiClass, type ApiCourse, type ApiMaterial } from '../api'
import type { ExactView } from './components'
import { CourseBreadcrumb, EmptyPanel, PageLoader } from './components'
import './material-exact.css'

const { Text, Title } = Typography

interface FolderRow {
  id: string
  name: string
  position: number
  source: string
  material_count?: number
  materials?: ApiMaterial[]
}

interface Props {
  courseId: string
  classId: string
  courses: ApiCourse[]
  classes: ApiClass[]
  onNavigate: (view: ExactView) => void
  onRefresh: () => void
  notify: (text: string) => void
}

const typeLabels: Record<string, string> = {
  pdf: '讲义', ppt: '课件', pptx: '课件', slides: '课件', doc: '讲义', docx: '讲义',
  video: '实验指导', guide: '实验指导', link: '外部链接', xls: '数据表', xlsx: '数据表',
}

function materialKind(item: ApiMaterial) {
  if (['ppt', 'pptx', 'slides'].includes(item.type)) return 'slides'
  if (['video', 'guide'].includes(item.type)) return 'guide'
  if (item.type === 'link') return 'link'
  return 'doc'
}

function folderKey(value: string) {
  return value
    .replace(/第\s*[一二三四五六七八九十百\d]+\s*章/g, '')
    .replace(/^\s*\d+(?:\.\d+)*[.、]?\s*/, '')
    .replace(/资料|目录/g, '')
    .replace(/[\s_-]/g, '')
    .toLowerCase()
}

function belongsToFolder(item: ApiMaterial, folder: FolderRow) {
  const folderName = folderKey(folder.name)
  const chapterName = folderKey(item.chapter || '')
  if (!folderName) return false
  return chapterName.includes(folderName) || folderName.includes(chapterName)
}

function formatDate(value?: string) {
  if (!value) return { date: '-', time: '' }
  const normalized = value.replace('T', ' ')
  return { date: normalized.slice(0, 10), time: normalized.slice(11, 16) }
}

export function ExactMaterialsV2(props: Props) {
  const [materials, setMaterials] = useState<ApiMaterial[]>([])
  const [trashMaterials, setTrashMaterials] = useState<ApiMaterial[]>([])
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [deletedFolders, setDeletedFolders] = useState<FolderRow[]>([])
  const [expandedDeletedFolder, setExpandedDeletedFolder] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedFolder, setSelectedFolder] = useState('all')
  const [selected, setSelected] = useState<ApiMaterial | null>(null)
  const [activeType, setActiveType] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [uploading, setUploading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [folderOpen, setFolderOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [candidates, setCandidates] = useState<string[]>([])
  const [confirmedCandidates, setConfirmedCandidates] = useState<string[]>([])
  const [graphImportOpen, setGraphImportOpen] = useState(false)
  const [graphImportMaterial, setGraphImportMaterial] = useState<ApiMaterial | null>(null)
  const [graphPoints, setGraphPoints] = useState<Array<{ id: string; name: string; materials?: ApiMaterial[] }>>([])
  const [graphPointIds, setGraphPointIds] = useState<string[]>([])
  const [createGraphPoint, setCreateGraphPoint] = useState(false)
  const [graphImportLoading, setGraphImportLoading] = useState(false)
  const [form] = Form.useForm()

  const load = async () => {
    setLoading(true)
    try {
      const [materialRows, trashRows, folderRows, deletedFolderRows] = await Promise.all([
        api.materials(props.courseId),
        api.trashMaterials(props.courseId),
        api.materialFolders(props.courseId),
        api.trashedMaterialFolders(props.courseId),
      ])
      setMaterials(materialRows)
      setTrashMaterials(trashRows)
      setFolders(folderRows)
      setDeletedFolders(deletedFolderRows)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [props.courseId])

  const visibleMaterials = useMemo(() => {
    let rows = selectedFolder === 'trash' ? trashMaterials : materials
    if (selectedFolder !== 'all' && selectedFolder !== 'trash') {
      const folder = folders.find((item) => item.id === selectedFolder)
      rows = folder ? rows.filter((item) => belongsToFolder(item, folder)) : rows
    }
    if (activeType !== 'all') rows = rows.filter((item) => materialKind(item) === activeType)
    const keyword = searchTerm.trim().toLowerCase()
    if (keyword) {
      rows = rows.filter((item) => `${item.title} ${item.chapter}`.toLowerCase().includes(keyword))
    }
    return rows
  }, [activeType, folders, materials, searchTerm, selectedFolder, trashMaterials])

  useEffect(() => {
    setSelected((current) => visibleMaterials.find((item) => item.id === current?.id) || visibleMaterials[0] || null)
  }, [visibleMaterials])

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const folder = folders.find((item) => item.id === selectedFolder)
      await api.uploadMaterial(props.courseId, file, folder?.name)
      props.notify('教学材料已上传并保存到资料库')
      await load()
    } catch (reason: any) {
      props.notify(reason.message)
    } finally {
      setUploading(false)
    }
    return false
  }

  const moveToTrash = async (item: ApiMaterial) => {
    setBusyId(item.id)
    try {
      const moved = await api.trashMaterial(item.id)
      setMaterials((rows) => rows.filter((row) => row.id !== item.id))
      setTrashMaterials((rows) => [moved, ...rows.filter((row) => row.id !== item.id)])
      props.notify(`“${item.title}”已移入回收站`)
    } catch (reason: any) {
      props.notify(reason.message)
    } finally {
      setBusyId('')
    }
  }

  const restoreFromTrash = async (item: ApiMaterial) => {
    setBusyId(item.id)
    try {
      const restored = await api.restoreMaterial(item.id)
      setTrashMaterials((rows) => rows.filter((row) => row.id !== item.id))
      setMaterials((rows) => [restored, ...rows.filter((row) => row.id !== item.id)])
      props.notify(`“${item.title}”已恢复到原目录`)
    } catch (reason: any) {
      props.notify(reason.message)
    } finally {
      setBusyId('')
    }
  }

  const deleteFolder = async (folder: FolderRow) => {
    setBusyId(folder.id)
    try {
      const result = await api.deleteMaterialFolder(folder.id)
      setSelectedFolder('all')
      if (result.mode === 'permanent') {
        props.notify(`空目录“${folder.name}”已删除`)
      } else {
        props.notify(`目录“${folder.name}”及其中 ${result.material_count} 份资料已移入目录回收站`)
      }
      await load()
    } catch (reason: any) {
      props.notify(reason.message)
    } finally {
      setBusyId('')
    }
  }

  const confirmFolderDelete = (folder: FolderRow, materialCount: number) => {
    Modal.confirm({
      title: `删除目录“${folder.name}”？`,
      content: materialCount
        ? `该目录包含 ${materialCount} 份资料。删除后目录及所属资料会进入目录回收站，可随时恢复。`
        : '该目录中没有资料，删除后将直接移除且不会进入回收站。',
      okText: materialCount ? '移入目录回收站' : '删除空目录',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => deleteFolder(folder),
    })
  }

  const restoreFolder = async (folder: FolderRow) => {
    setBusyId(folder.id)
    try {
      const restored = await api.restoreMaterialFolder(folder.id)
      props.notify(`目录“${folder.name}”及其中 ${restored.material_count} 份资料已恢复`)
      await load()
    } catch (reason: any) {
      props.notify(reason.message)
    } finally {
      setBusyId('')
    }
  }

  const keepDeletedFolderMaterial = async (folder: FolderRow, material: ApiMaterial, targetFolderId?: string) => {
    setBusyId(material.id)
    try {
      const result = await api.keepDeletedFolderMaterial(folder.id, material.id, targetFolderId)
      props.notify(targetFolderId
        ? `“${material.title}”已恢复到“${result.target_folder_name}”`
        : `“${material.title}”已单独保留到全部材料`)
      if (result.folder_removed) setExpandedDeletedFolder('')
      await load()
    } catch (reason: any) {
      props.notify(reason.message)
    } finally {
      setBusyId('')
    }
  }

  const createFolder = async () => {
    try {
      await api.createMaterialFolder({ course_id: props.courseId, name: form.getFieldValue('name') })
      props.notify('材料文件夹已创建')
      setFolderOpen(false)
      form.resetFields()
      await load()
    } catch (reason: any) {
      props.notify(reason.message)
    }
  }

  const generateOutline = async () => {
    setAiOpen(true)
    setAiLoading(true)
    try {
      const result = await api.aiMaterialOutline(props.courseId)
      setCandidates(result.candidates)
      setConfirmedCandidates(result.candidates)
    } catch (reason: any) {
      props.notify(reason.message)
    } finally {
      setAiLoading(false)
    }
  }

  const confirmOutline = async () => {
    setAiLoading(true)
    try {
      await api.confirmMaterialOutline(props.courseId, confirmedCandidates)
      props.notify('AI 课件大纲已确认，材料目录已同步生成')
      setAiOpen(false)
      await load()
    } catch (reason: any) {
      props.notify(reason.message)
    } finally {
      setAiLoading(false)
    }
  }

  const addLink = async () => {
    try {
      await api.createMaterial({
        course_id: props.courseId,
        title: 'C语言标准库函数参考',
        type: 'link',
        chapter_label: folders.find((item) => item.id === selectedFolder)?.name || '参考资料',
        size: '外部链接',
        visibility: 'teacher',
        content_url: 'https://en.cppreference.com/',
      })
      props.notify('外部链接已添加到资料库')
      await load()
    } catch (reason: any) {
      props.notify(reason.message)
    }
  }

  const openGraphImport = async (item: ApiMaterial) => {
    setGraphImportMaterial(item)
    setGraphPointIds((item.knowledge_points || []).map((point) => point.id))
    setCreateGraphPoint(false)
    setGraphImportOpen(true)
    try {
      const result = await api.graph(props.courseId)
      setGraphPoints(result.nodes || [])
    } catch (reason: any) {
      props.notify(reason.message || '知识点加载失败')
    }
  }

  const confirmGraphImport = async () => {
    if (!graphImportMaterial) return
    if (!graphPointIds.length && !createGraphPoint) {
      props.notify('请至少选择一个知识点，或创建资料知识点')
      return
    }
    setGraphImportLoading(true)
    try {
      const result = await api.importMaterialToGraph(graphImportMaterial.id, {
        knowledge_point_ids: graphPointIds,
        create_from_material: createGraphPoint,
      })
      props.notify(`《${graphImportMaterial.title}》已关联到 ${result.linked_count} 个知识点`)
      setGraphImportOpen(false)
      await load()
    } catch (reason: any) {
      props.notify(reason.message || '导入知识图谱失败')
    } finally {
      setGraphImportLoading(false)
    }
  }

  if (loading) return <PageLoader />

  const isTrash = selectedFolder === 'trash'
  const selectedDate = formatDate(selected?.updated_at)
  const canInlinePreview = selected?.type === 'pdf' && selected.content_url

  return <div className="exact-course-page material-v2-page">
    <div className="material-v2-heading">
      <div>
        <CourseBreadcrumb current="资料管理" onNavigate={props.onNavigate} />
        <Title level={2}>教学材料</Title>
        <Text type="secondary">上传课件、讲义、实验指导与链接资料，并绑定知识点。</Text>
      </div>
      <img src="/ui-assets/materials-banner.png" alt="" />
    </div>

    <div className="material-v2-actions">
      <Upload beforeUpload={upload} showUploadList={false}><Button type="primary" loading={uploading} icon={<UploadCloud size={17} />}>上传课件</Button></Upload>
      <Upload beforeUpload={upload} showUploadList={false}><Button icon={<FileText size={17} />}>上传讲义</Button></Upload>
      <Button icon={<Link2 size={17} />} onClick={addLink}>添加链接</Button>
    </div>

    <div className="material-v2-layout">
      <aside className="material-v2-folders">
        <div className="material-v2-section-title">
          <strong>材料目录</strong>
          <Button type="text" icon={<Plus size={14} />} onClick={() => setFolderOpen(true)}>新建文件夹</Button>
        </div>
        <button className={selectedFolder === 'all' ? 'active' : ''} onClick={() => setSelectedFolder('all')}>
          <span className="folder-indent" /><Folder size={16} /><span>全部材料</span><b>{materials.length}</b>
        </button>
        {folders.map((folder, index) => {
          const materialCount = materials.filter((item) => belongsToFolder(item, folder)).length
          return <Dropdown
            key={folder.id}
            trigger={['contextMenu']}
            menu={{
              items: [{ key: 'delete-folder', danger: true, icon: <Trash2 size={14} />, label: '删除目录' }],
              onClick: ({ domEvent }) => {
                domEvent.stopPropagation()
                confirmFolderDelete(folder, materialCount)
              },
            }}
          >
            <button
              className={selectedFolder === folder.id ? 'active' : ''}
              onClick={() => setSelectedFolder(folder.id)}
              aria-label={`${folder.name}，右键可管理目录`}
            >
              <span className={'folder-indent indent-' + Math.min(index, 2)} />
              <Folder size={16} />
              <span title={folder.name}>{folder.name}</span>
              <b>{materialCount}</b>
              {folder.name.includes('章') && <ChevronRight size={13} />}
            </button>
          </Dropdown>
        })}
        <div className="folder-separator" />
        <button className={'trash-folder ' + (isTrash ? 'active' : '')} onClick={() => setSelectedFolder('trash')}>
          <span className="folder-indent" /><Trash2 size={16} /><span>回收站</span><b>{trashMaterials.length + deletedFolders.length}</b>
        </button>
      </aside>

      <main className="material-v2-table">
        <div className="material-v2-filter">
          <Tabs activeKey={activeType} onChange={setActiveType} items={[
            { key: 'all', label: isTrash ? '全部删除项' : '全部' },
            { key: 'slides', label: '课件' },
            { key: 'doc', label: '讲义' },
            { key: 'guide', label: '实验指导' },
            { key: 'link', label: '外部链接' },
          ]} />
          <Input allowClear value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} prefix={<Search size={15} />} placeholder="搜索文件名" />
        </div>
        <div className="material-v2-head">
          <span>文件名</span><span>类型</span><span>绑定知识点</span><span>{isTrash ? '删除时间' : '上传时间'}</span><span>解析状态</span><span>操作</span>
        </div>
        <div className="material-v2-rows">
          {!visibleMaterials.length && (isTrash
            ? <div className="trash-material-empty"><Trash2 size={19} /><span>没有单独删除的资料</span></div>
            : <EmptyPanel text="当前目录还没有教学资料" />)}
          {visibleMaterials.map((item) => {
            const date = formatDate(item.updated_at)
            const menuItems = isTrash
              ? [{ key: 'restore', icon: <RotateCcw size={14} />, label: '恢复到原目录' }]
              : [
                { key: 'graph', icon: <Network size={14} />, label: '导入课程知识图谱' },
                { type: 'divider' as const },
                { key: 'trash', danger: true, icon: <Trash2 size={14} />, label: '移至回收站' },
              ]
            return <div role="button" tabIndex={0} className={selected?.id === item.id ? 'active' : ''} key={item.id} onClick={() => setSelected(item)}>
              <span className="material-file-cell">
                <span className={'material-v2-file file-' + materialKind(item)}><FileText size={19} /></span>
                <span className="file-name"><strong title={item.title}>{item.title}</strong><small>{item.size || '未知大小'}</small></span>
              </span>
              <Tag>{typeLabels[item.type] || '教学资料'}</Tag>
              <span className="knowledge-tags">
                {(item.knowledge_points || []).length
                  ? <Tag color="green" title={(item.knowledge_points || []).map((point) => point.name).join('、')}>{item.knowledge_points?.[0]?.name}</Tag>
                  : <Tag title={item.chapter}>{item.chapter || '未绑定'}</Tag>}
                {(item.knowledge_points || []).length > 1 && <em>+{(item.knowledge_points || []).length - 1}</em>}
              </span>
              <span className="upload-time">{date.date}<small>{date.time}</small></span>
              <span className={'parse-state ' + (isTrash ? 'deleted' : '')}>
                {isTrash ? <Trash2 size={15} /> : <CheckCircle2 size={15} />}
                {isTrash ? '已删除' : item.status === 'ready' ? '解析完成' : '解析中'}
                <small>{isTrash ? '可恢复' : item.status === 'ready' ? '100%' : '72%'}</small>
              </span>
              <Dropdown
                trigger={['click']}
                menu={{
                  items: menuItems,
                  onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation()
                    if (key === 'restore') void restoreFromTrash(item)
                    if (key === 'graph') void openGraphImport(item)
                    if (key === 'trash') void moveToTrash(item)
                  },
                }}
              >
                <Button className="material-more" loading={busyId === item.id} type="text" aria-label={`操作 ${item.title}`} icon={<MoreHorizontal size={17} />} onClick={(event) => event.stopPropagation()} />
              </Dropdown>
            </div>
          })}
        </div>
        {!!visibleMaterials.length && <div className="material-v2-pagination">
          <span>共 {visibleMaterials.length} 条</span>
          <Space><Select size="small" value="10" options={[{ value: '10', label: '10 条/页' }]} /><Button size="small" disabled>‹</Button><Button size="small" type="primary">1</Button><Button size="small" disabled>›</Button></Space>
        </div>}
        {isTrash && <section className="deleted-folder-bin">
          <div className="deleted-folder-bin-title">
            <span><Folder size={17} /><strong>已删除目录</strong></span>
            <small>{deletedFolders.length} 个目录</small>
          </div>
          {!deletedFolders.length && <div className="deleted-folder-empty">删除的非空目录会保留在这里</div>}
          {deletedFolders.map((folder) => {
            const expanded = expandedDeletedFolder === folder.id
            return <div className={'deleted-folder-group ' + (expanded ? 'expanded' : '')} key={folder.id}>
              <div
                className="deleted-folder-row"
                role="button"
                tabIndex={0}
                onClick={() => setExpandedDeletedFolder(expanded ? '' : folder.id)}
              >
                <span className="deleted-folder-icon"><Folder size={18} /></span>
                <span><strong>{folder.name}</strong><small>包含 {folder.material_count || 0} 份资料，点击查看</small></span>
                <Tag>目录</Tag>
                <ChevronRight className="deleted-folder-chevron" size={15} />
                <Dropdown
                  trigger={['click', 'contextMenu']}
                  menu={{
                    items: [{ key: 'restore-folder', icon: <RotateCcw size={14} />, label: '恢复整个目录及资料' }],
                    onClick: ({ domEvent }) => {
                      domEvent.stopPropagation()
                      void restoreFolder(folder)
                    },
                  }}
                >
                  <Button loading={busyId === folder.id} type="text" aria-label={`管理已删除目录 ${folder.name}`} icon={<MoreHorizontal size={17} />} onClick={(event) => event.stopPropagation()} />
                </Dropdown>
              </div>
              {expanded && <div className="deleted-folder-materials">
                {(folder.materials || []).map((material) => <div className="deleted-folder-material" key={material.id} role="button" tabIndex={0} onClick={() => setSelected(material)}>
                  <span className={'material-v2-file file-' + materialKind(material)}><FileText size={16} /></span>
                  <span><strong title={material.title}>{material.title}</strong><small>{material.size || '未知大小'} · {typeLabels[material.type] || '教学资料'}</small></span>
                  <Dropdown
                    trigger={['click', 'contextMenu']}
                    menu={{
                      items: [
                        { key: 'keep', icon: <RotateCcw size={14} />, label: '单独保留到全部材料' },
                        {
                          key: 'move',
                          icon: <Folder size={14} />,
                          label: '恢复到已有目录',
                          children: folders.length
                            ? folders.map((target) => ({ key: `target:${target.id}`, label: target.name }))
                            : [{ key: 'no-target', disabled: true, label: '暂无可用目录' }],
                        },
                      ],
                      onClick: ({ key, domEvent }) => {
                        domEvent.stopPropagation()
                        if (key === 'keep') void keepDeletedFolderMaterial(folder, material)
                        if (key.startsWith('target:')) void keepDeletedFolderMaterial(folder, material, key.slice(7))
                      },
                    }}
                  >
                    <Button loading={busyId === material.id} type="text" aria-label={`管理已删除资料 ${material.title}`} icon={<MoreHorizontal size={17} />} onClick={(event) => event.stopPropagation()} />
                  </Dropdown>
                </div>)}
              </div>}
            </div>
          })}
        </section>}
      </main>

      <aside className="material-v2-preview">
        <div className="material-v2-section-title">
          <strong>资料预览</strong>
          {selected?.content_url && <Button type="text" href={selected.content_url} target="_blank" aria-label="在新窗口打开" icon={<ExternalLink size={15} />} />}
        </div>
        {!selected ? <div className="material-preview-empty"><FileText size={30} /><span>选择一份资料查看内容</span></div> : <>
          {canInlinePreview ? <iframe className="material-document-frame" title={selected.title} src={selected.content_url || undefined} /> : <div className={'material-slide material-slide-' + materialKind(selected)}>
            <small>{selected.chapter || '教学资料'}</small>
            <Title level={3}>{selected.title}</Title>
            <span className="preview-file-type">{typeLabels[selected.type] || selected.type.toUpperCase()}</span>
            <i />
          </div>}
          <div className="quote-preview">
            <div><strong>资料内容摘要</strong>{selected.content_url && <Button type="link" href={selected.content_url} target="_blank">查看原文件</Button>}</div>
            <p>{selected.type === 'link' ? '该资料为课程外部参考链接，可在新窗口打开并作为课堂讲解与自主学习的延伸材料。' : `《${selected.title}》已关联到“${selected.chapter || '未分类'}”，可用于备课、课堂讲解和 AI 知识库引用。`}</p>
          </div>
          <div className="trusted-source"><strong>可信来源</strong><span><CheckCircle2 size={16} />教学资料库（本课程）<Tag color="green">可信</Tag></span></div>
          <div className="material-v2-detail">
            <strong>标签 <Button type="link" icon={<Edit3 size={13} />}>编辑</Button></strong>
            <Space wrap><Tag>{selected.chapter || '未分类'}</Tag><Tag>{typeLabels[selected.type] || '资料'}</Tag><Tag>＋ 添加标签</Tag></Space>
            <span>{isTrash ? '删除时间' : '上传时间'} <b>{selectedDate.date} {selectedDate.time}</b></span>
            <span>上传者 <b>王老师</b></span>
            <span>文件大小 <b>{selected.size || '-'}</b></span>
            <span>格式 <b>{selected.type.toUpperCase()}</b></span>
            <span>资料状态 <b>{isTrash ? '回收站（可恢复）' : selected.status === 'ready' ? '解析完成（100%）' : '解析中（72%）'}</b></span>
            {selected.content_url && <Button block href={selected.content_url} target="_blank" icon={<Download size={15} />}>打开资料</Button>}
          </div>
        </>}
      </aside>
    </div>

    <div className="material-v2-ai">
      <span><WandSparkles size={23} /></span>
      <div><strong>生成课件大纲 <Tag color="green">AI</Tag></strong><small>AI 从已上传资料中提取章节结构；教师确认后，目录会立即出现在左侧并支持筛选。</small></div>
      <Button type="primary" icon={<WandSparkles size={16} />} onClick={generateOutline}>生成大纲</Button>
    </div>

    <Modal title="AI 生成材料目录" open={aiOpen} onCancel={() => setAiOpen(false)} onOk={confirmOutline} confirmLoading={aiLoading} okText="确认并生成目录">
      <Alert type="info" showIcon message="AI 只生成目录候选，确认后才会写入课程资料库。" />
      <Checkbox.Group className="material-outline-candidates" value={confirmedCandidates} onChange={(values) => setConfirmedCandidates(values as string[])}>
        {candidates.map((name) => <Checkbox value={name} key={name}>{name}</Checkbox>)}
      </Checkbox.Group>
    </Modal>

    <Modal title="新建材料文件夹" open={folderOpen} onCancel={() => setFolderOpen(false)} onOk={createFolder} okText="创建">
      <Form form={form} layout="vertical"><Form.Item label="文件夹名称" name="name" rules={[{ required: true, message: '请输入文件夹名称' }]}><Input /></Form.Item></Form>
    </Modal>

    <Modal
      className="material-graph-import-modal"
      title="导入课程知识图谱"
      open={graphImportOpen}
      onCancel={() => setGraphImportOpen(false)}
      onOk={confirmGraphImport}
      confirmLoading={graphImportLoading}
      okText="确认导入"
      width={640}
    >
      <Alert
        type="info"
        showIcon
        message={`正在导入《${graphImportMaterial?.title || ''}》`}
        description="资料会显示在知识点详情中；一个资料可以同时支持多个知识点。"
      />
      <div className="material-graph-import-section">
        <div><strong>选择关联知识点</strong><small>已关联的知识点会自动勾选</small></div>
        <Checkbox.Group value={graphPointIds} onChange={(values) => setGraphPointIds(values as string[])}>
          {graphPoints.map((point) => <Checkbox value={point.id} key={point.id}>
            <span><b>{point.name}</b><small>{point.materials?.length || 0} 份关联资料</small></span>
          </Checkbox>)}
        </Checkbox.Group>
      </div>
      <Checkbox className="material-create-graph-point" checked={createGraphPoint} onChange={(event) => setCreateGraphPoint(event.target.checked)}>
        <span><b>同时以资料标题创建新知识点</b><small>适合当前图谱中还没有对应概念的资料</small></span>
      </Checkbox>
    </Modal>
  </div>
}
