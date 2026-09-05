import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'
import { Button, Input, Modal, Select, Slider, Spin, Tag, Tooltip, Typography } from 'antd'
import {
  CirclePlus, FileText, GitBranch, Link2, MousePointer2, Network, RefreshCw,
  Save, Send, Sparkles, Trash2, UploadCloud, WandSparkles, Eye,
} from 'lucide-react'

import { api, type ApiClass, type ApiCourse } from '../api'
import type { ExactView } from './components'
import { CourseBreadcrumb } from './components'
import './graph-exact.css'

const { Text, Title } = Typography

type NodeType = '知识点' | '概念' | '方法' | '公式' | '案例' | '能力'
type EdgeType = '前驱' | '后继' | '相关'
type Selection = { kind: 'node' | 'edge'; id: string } | null

interface GraphNode {
  id: string
  label: string
  type: NodeType
  description: string
  difficulty: number
  x: number
  y: number
  color: string
  source: 'ai' | 'custom'
  attachments?: GraphNodeAttachment[]
}

interface GraphEdge {
  id: string
  source: string
  target: string
  type: EdgeType
  label: EdgeType
}

interface GraphNodeAttachment {
  id: string
  title: string
  resource_type: 'text' | 'link' | 'file'
  content: string
  link_url: string
  file_name?: string
  file_mime_type?: string
  file_size_bytes?: number
  file_url?: string
  visible: boolean
  created_at: string
  updated_at: string
}

interface SourceFile { filename: string; mime_type: string; size_bytes: number }
interface GraphSummary {
  id: number; title: string; status: 'draft' | 'published'; node_count: number; edge_count: number; updated_at: string
  target_classes?: string[]
  target_class_ids?: string[]
}
interface TeacherGraph extends GraphSummary {
  description: string; target_classes: string[]; source_files: SourceFile[]; source_summary: string
  target_class_ids: string[]
  publications?: Array<{ id: string; class_id: string; course_id: string; class_name: string; status: string; published_at: string }>
  nodes: GraphNode[]; edges: GraphEdge[]; created_at: string; published_at: string
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

const NODE_TYPES: NodeType[] = ['知识点', '概念', '方法', '公式', '案例', '能力']
const EDGE_TYPES: EdgeType[] = ['前驱', '后继', '相关']
const NODE_COLORS: Record<NodeType, string> = {
  知识点: '#2563eb', 概念: '#2563eb', 方法: '#0f766e', 公式: '#7c3aed', 案例: '#d97706', 能力: '#dc2626',
}
const EDGE_STYLES: Record<EdgeType, { color: string; width: number; type: 'solid' | 'dashed' }> = {
  前驱: { color: '#CBD5E1', width: 1.5, type: 'solid' },
  后继: { color: '#67E8F9', width: 1.2, type: 'solid' },
  相关: { color: '#93C5FD', width: 1.2, type: 'dashed' },
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`
}

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function attachmentSummary(attachment: GraphNodeAttachment) {
  if (attachment.resource_type === 'file') return `${attachment.file_name || '文件资料'} · ${fileSize(attachment.file_size_bytes || 0)}`
  if (attachment.resource_type === 'link') return attachment.link_url
  return attachment.content
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character)
}

function clampDifficulty(value: number) {
  return Math.max(1, Math.min(5, Number.isFinite(value) ? value : 2))
}

function symbolSize(difficulty: number) {
  return 30 + clampDifficulty(difficulty) * 8
}

function patchZoomedPointerEvent(event: Event) {
  if (!(event instanceof MouseEvent)) return
  const target = event.target instanceof HTMLElement ? event.target : null
  const canvas = target?.tagName === 'CANVAS' ? target : target?.querySelector?.('canvas')
  if (!(canvas instanceof HTMLCanvasElement)) return

  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return

  const scaleX = canvas.clientWidth / rect.width
  const scaleY = canvas.clientHeight / rect.height
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) return

  const offsetX = (event.clientX - rect.left) * scaleX
  const offsetY = (event.clientY - rect.top) * scaleY
  try {
    Object.defineProperty(event, 'offsetX', { configurable: true, value: offsetX })
    Object.defineProperty(event, 'offsetY', { configurable: true, value: offsetY })
  } catch {
    // Some browsers keep offsetX/Y non-configurable; native ECharts coordinates still work there.
  }
}

function canvasPointFromEvent(host: HTMLElement, event: any): [number, number] | null {
  const nativeEvent = event?.event instanceof MouseEvent ? event.event : event instanceof MouseEvent ? event : null
  const canvas = host.querySelector('canvas')
  if (!nativeEvent || !(canvas instanceof HTMLCanvasElement)) return null
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  const scaleX = canvas.clientWidth / rect.width
  const scaleY = canvas.clientHeight / rect.height
  const x = (nativeEvent.clientX - rect.left) * scaleX
  const y = (nativeEvent.clientY - rect.top) * scaleY
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
}

function buildTeacherChartOption(graph: TeacherGraph, selection: Selection, linkStart: string): EChartsOption {
  const selectedId = selection?.id
  return {
    tooltip: {
      trigger: 'item',
      backgroundColor: '#fff',
      borderColor: '#E5EAF2',
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: '#111827', fontSize: 12 },
      extraCssText: 'border-radius:10px;box-shadow:0 4px 16px rgba(15,23,42,.08)',
      formatter: (params: any) => {
        if (params.dataType === 'edge') {
          return `<strong>${escapeHtml(params.data?.raw?.label ?? params.data?.relationType ?? '关系')}</strong>`
        }
        const node = params.data
        const difficulty = clampDifficulty(node?.raw?.difficulty ?? node?.value ?? 2)
        return [
          `<strong>${escapeHtml(node?.name ?? '')}</strong>`,
          `<div>类型：${escapeHtml(node?.raw?.type ?? '知识点')}</div>`,
          `<div>难度：${'★'.repeat(difficulty)}${'☆'.repeat(5 - difficulty)}</div>`,
          node?.raw?.description ? `<div>${escapeHtml(node.raw.description)}</div>` : '',
        ].filter(Boolean).join('')
      },
    },
    animationDuration: 800,
    animationEasingUpdate: 'quinticInOut',
    series: [
      {
        type: 'graph',
        layout: 'force',
        data: graph.nodes.map((node) => {
          const color = node.color || NODE_COLORS[node.type] || '#2563eb'
          const selected = selectedId === node.id
          const relationSource = linkStart === node.id
          return {
            id: node.id,
            name: node.label,
            value: clampDifficulty(node.difficulty),
            x: node.x,
            y: node.y,
            raw: node,
            symbolSize: symbolSize(node.difficulty),
            itemStyle: {
              color: '#fff',
              borderColor: relationSource ? '#f59e0b' : selected ? '#2563eb' : color,
              borderWidth: relationSource ? 4 : selected ? 4 : 1.5,
              shadowBlur: relationSource ? 18 : selected ? 16 : 8,
              shadowColor: relationSource ? 'rgba(245,158,11,.3)' : selected ? 'rgba(37,99,235,.28)' : `${color}33`,
            },
            label: {
              show: true,
              position: 'bottom',
              formatter: '{b}',
              fontSize: 11,
              fontWeight: 700,
              color: '#374151',
              distance: 7,
              width: 112,
              overflow: 'truncate',
            },
          }
        }),
        links: graph.edges.map((edge) => {
          const style = EDGE_STYLES[edge.type] ?? EDGE_STYLES.相关
          const selected = selectedId === edge.id
          return {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            relationType: edge.type,
            raw: edge,
            lineStyle: {
              color: selected ? '#2563eb' : style.color,
              width: selected ? 2.8 : style.width,
              type: style.type,
              opacity: selected ? .96 : .78,
              curveness: .15,
            },
            label: {
              show: selected,
              formatter: edge.label || edge.type,
              color: '#1f3762',
              fontSize: 11,
              fontWeight: 700,
              backgroundColor: 'rgba(255,255,255,.86)',
              borderColor: '#dbeafe',
              borderWidth: 1,
              borderRadius: 5,
              padding: [3, 6],
            },
          }
        }),
        categories: NODE_TYPES.map((name) => ({ name })),
        roam: true,
        draggable: true,
        focusNodeAdjacency: true,
        force: {
          repulsion: 360,
          gravity: .08,
          edgeLength: [105, 210],
          friction: .58,
        },
        emphasis: {
          focus: 'adjacency',
          blurScope: 'global',
          itemStyle: {
            borderWidth: 3,
            borderColor: '#2563EB',
            shadowBlur: 14,
            shadowColor: 'rgba(37, 99, 235, 0.28)',
          },
          lineStyle: {
            width: 2.6,
            color: '#2563eb',
          },
        },
        selectedMode: 'single',
        scaleLimit: { min: .35, max: 3 },
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: 7,
        edgeLabel: { show: false },
      },
    ],
  } as EChartsOption
}

function GraphCanvas({ graph, selection, mode, linkStart, onSelection, onLinkNode, onNodePosition }: {
  graph: TeacherGraph
  selection: Selection
  mode: 'select' | 'connect'
  linkStart: string
  onSelection: (selection: Selection) => void
  onLinkNode: (nodeId: string) => void
  onNodePosition: (nodeId: string, x: number, y: number) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const chart = chartRef.current ?? echarts.init(host, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    chart.setOption(buildTeacherChartOption(graph, selection, linkStart), true)

    const click = (params: any) => {
      if (params.dataType === 'node' && params.data?.id) {
        if (mode === 'connect') onLinkNode(params.data.id)
        else onSelection({ kind: 'node', id: params.data.id })
        return
      }
      if (params.dataType === 'edge' && params.data?.id) {
        onSelection({ kind: 'edge', id: params.data.id })
      }
    }
    const dragEnd = (params: any) => {
      if (params.dataType !== 'node' || !params.data?.id) return
      const canvasPoint = canvasPointFromEvent(host, params.event)
      const point = canvasPoint ? chart.convertFromPixel({ seriesIndex: 0 }, canvasPoint) as number[] : null
      if (Array.isArray(point) && point.every(Number.isFinite)) onNodePosition(params.data.id, point[0], point[1])
    }
    chart.off('click')
    chart.off('dragend')
    chart.on('click', click)
    chart.on('dragend', dragEnd)

    const eventTypes = ['pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mousemove', 'mouseup', 'click', 'dblclick', 'wheel']
    eventTypes.forEach((type) => host.addEventListener(type, patchZoomedPointerEvent, { capture: true, passive: true }))
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(host)
    window.requestAnimationFrame(() => chart.resize())
    return () => {
      observer.disconnect()
      chart.off('click', click)
      chart.off('dragend', dragEnd)
      eventTypes.forEach((type) => host.removeEventListener(type, patchZoomedPointerEvent, { capture: true }))
    }
  }, [graph, linkStart, mode, onLinkNode, onNodePosition, onSelection, selection])

  useEffect(() => {
    return () => {
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  return <div className="kg-canvas" ref={hostRef} aria-label="知识图谱交互画布" />
}

export function ExactGraphV2(props: Props) {
  const [graphs, setGraphs] = useState<GraphSummary[]>([])
  const [graph, setGraph] = useState<TeacherGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [selection, setSelection] = useState<Selection>(null)
  const [mode, setMode] = useState<'select' | 'connect'>('select')
  const [edgeType, setEdgeType] = useState<EdgeType>('前驱')
  const [linkStart, setLinkStart] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [title, setTitle] = useState('')
  const [targetClassIds, setTargetClassIds] = useState<string[]>([])
  const [description, setDescription] = useState('')
  const [attachmentOpen, setAttachmentOpen] = useState(false)
  const [attachmentSaving, setAttachmentSaving] = useState(false)
  const [attachmentDraft, setAttachmentDraft] = useState({ title: '', resource_type: 'text' as 'text' | 'link' | 'file', content: '', link_url: '' })
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [viewingAttachment, setViewingAttachment] = useState<GraphNodeAttachment | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishClassIds, setPublishClassIds] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const attachmentFileInputRef = useRef<HTMLInputElement>(null)

  const loadList = useCallback(async (preferredId?: number) => {
    setLoading(true); setError('')
    try {
      const rows = await api.teacherGraphs() as GraphSummary[]
      setGraphs(rows)
      const target = preferredId ?? graph?.id ?? rows[0]?.id
      if (target) setGraph(await api.teacherGraph(target))
      else setGraph(null)
    } catch (reason: any) { setError(reason.message || '图谱加载失败') }
    finally { setLoading(false) }
  }, [graph?.id])

  useEffect(() => { void loadList() }, [])

  const openGraph = async (id: number) => {
    setLoading(true); setError(''); setSelection(null); setLinkStart('')
    try { setGraph(await api.teacherGraph(id)) }
    catch (reason: any) { setError(reason.message || '图谱加载失败') }
    finally { setLoading(false) }
  }

  const patchGraph = (patch: Partial<TeacherGraph>) => setGraph((current) => current ? { ...current, ...patch } : current)
  const selectedNode = selection?.kind === 'node' ? graph?.nodes.find((item) => item.id === selection.id) : undefined
  const selectedEdge = selection?.kind === 'edge' ? graph?.edges.find((item) => item.id === selection.id) : undefined
  const selectedNodeAttachments = selectedNode?.attachments ?? []
  const publishClasses = useMemo(
    () => props.classes.filter((item) => item.course_id === props.courseId && item.status !== 'closed'),
    [props.classes, props.courseId],
  )
  const publishClassNames = useMemo(() => publishClasses.filter((item) => publishClassIds.includes(item.id)).map((item) => item.name), [publishClasses, publishClassIds])
  const targetClassNames = useMemo(
    () => publishClasses.filter((item) => targetClassIds.includes(item.id)).map((item) => item.name),
    [publishClasses, targetClassIds],
  )
  const classSelectOptions = useMemo(
    () => publishClasses.map((item) => ({ value: item.id, label: `${item.name} · ${item.students} 人` })),
    [publishClasses],
  )

  useEffect(() => {
    if (!graph?.nodes.length) {
      if (selection) setSelection(null)
      return
    }
    if (selection?.kind === 'node' && graph.nodes.some((node) => node.id === selection.id)) return
    if (selection?.kind === 'edge' && graph.edges.some((edge) => edge.id === selection.id)) return
    setSelection({ kind: 'node', id: graph.nodes[0].id })
  }, [graph, selection])

  useEffect(() => {
    setAttachmentOpen(false)
    setAttachmentDraft({ title: '', resource_type: 'text', content: '', link_url: '' })
    setAttachmentFile(null)
  }, [selectedNode?.id])

  useEffect(() => {
    const allowedIds = new Set(publishClasses.map((item) => item.id))
    setTargetClassIds((current) => current.filter((id) => allowedIds.has(id)))
    setPublishClassIds((current) => current.filter((id) => allowedIds.has(id)))
  }, [publishClasses])

  const createBlank = async () => {
    setSaving(true); setError('')
    try {
      const created = await api.createTeacherGraph({ title: title.trim() || '未命名知识图谱', description, target_classes: targetClassNames })
      setTitle(''); setDescription(''); setTargetClassIds([]); setGraph(created); await loadList(created.id); props.notify('空白图谱已创建')
    } catch (reason: any) { setError(reason.message || '创建失败') }
    finally { setSaving(false) }
  }

  const generate = async () => {
    if (!files.length) { setError('请先选择 PDF、Word、PPT、Markdown 或 TXT 资料'); return }
    setGenerating(true); setError('')
    try {
      const created = await api.createTeacherGraphFromFiles(files, { title: title.trim() || files[0].name.replace(/\.[^.]+$/, ''), description, target_classes: targetClassNames.join('，') })
      setFiles([]); setTitle(''); setDescription(''); setTargetClassIds([]); setGraph(created); await loadList(created.id); props.notify('资料分析完成，图谱草稿已生成')
    } catch (reason: any) { setError(reason.message || '图谱生成失败') }
    finally { setGenerating(false) }
  }

  const save = async () => {
    if (!graph) return
    setSaving(true); setError('')
    try {
      const saved = await api.saveTeacherGraph(graph.id, graph)
      setGraph(saved); await loadList(saved.id); props.notify('图谱草稿已保存')
    } catch (reason: any) { setError(reason.message || '保存失败') }
    finally { setSaving(false) }
  }

  const openPublish = () => {
    if (!graph) return
    const allowedIds = new Set(publishClasses.map((item) => item.id))
    const existing = (graph.target_class_ids ?? []).filter((id) => allowedIds.has(id))
    const fallback = props.classId && allowedIds.has(props.classId) ? [props.classId] : []
    setPublishClassIds(existing.length ? existing : fallback)
    setPublishOpen(true)
  }

  const publish = async () => {
    if (!graph) return
    if (!publishClassIds.length) { setError('请选择要发布的班级'); return }
    setSaving(true); setError('')
    try {
      await api.saveTeacherGraph(graph.id, graph)
      const published = await api.publishTeacherGraph(graph.id, { class_ids: publishClassIds })
      setGraph(published); setPublishOpen(false); await loadList(published.id); props.notify(`知识图谱已发布到 ${publishClassNames.join('、') || '所选班级'}`)
    } catch (reason: any) { setError(reason.message || '发布失败') }
    finally { setSaving(false) }
  }

  const addNode = () => {
    if (!graph) return
    const count = graph.nodes.length
    const node: GraphNode = { id: uid('node'), label: `自定义节点 ${count + 1}`, type: '知识点', description: '教师手动添加的知识点。', difficulty: 2, x: 160 + count % 4 * 150, y: 120 + Math.floor(count / 4) * 96, color: '#2563eb', source: 'custom' }
    patchGraph({ nodes: [...graph.nodes, node], node_count: count + 1 }); setSelection({ kind: 'node', id: node.id }); setMode('select')
  }

  const automaticLayout = () => {
    if (!graph?.nodes.length) return
    const count = Math.max(1, graph.nodes.length - 1)
    const nodes = graph.nodes.map((node, index) => index === 0 ? { ...node, x: 430, y: 270 } : { ...node, x: 430 + 270 * Math.cos(-Math.PI / 2 + (index - 1) * Math.PI * 2 / count), y: 270 + 175 * Math.sin(-Math.PI / 2 + (index - 1) * Math.PI * 2 / count) })
    patchGraph({ nodes }); props.notify('已按椭圆关系重新布局')
  }

  const removeSelection = () => {
    if (!graph || !selection) return
    if (selection.kind === 'node') {
      const nodes = graph.nodes.filter((item) => item.id !== selection.id)
      const edges = graph.edges.filter((item) => item.source !== selection.id && item.target !== selection.id)
      patchGraph({ nodes, edges, node_count: nodes.length, edge_count: edges.length })
    } else {
      const edges = graph.edges.filter((item) => item.id !== selection.id)
      patchGraph({ edges, edge_count: edges.length })
    }
    setSelection(null)
  }

  const chooseLinkNode = (id: string) => {
    if (!graph) return
    if (!linkStart) { setLinkStart(id); props.notify('已选择起始节点，请点击目标节点'); return }
    if (linkStart === id) { setLinkStart(''); setError('起始节点与目标节点不能相同'); return }
    if (graph.edges.some((item) => item.source === linkStart && item.target === id && item.type === edgeType)) { setLinkStart(''); setError('相同关系已存在'); return }
    const edge: GraphEdge = { id: uid('edge'), source: linkStart, target: id, type: edgeType, label: edgeType }
    patchGraph({ edges: [...graph.edges, edge], edge_count: graph.edges.length + 1 }); setSelection({ kind: 'edge', id: edge.id }); setLinkStart(''); setMode('select')
  }

  const updateNode = (patch: Partial<GraphNode>) => {
    if (!graph || !selectedNode) return
    const next = { ...selectedNode, ...patch }
    if (patch.type) next.color = NODE_COLORS[patch.type]
    patchGraph({ nodes: graph.nodes.map((item) => item.id === next.id ? next : item) })
  }
  const updateEdge = (type: EdgeType) => {
    if (!graph || !selectedEdge) return
    patchGraph({ edges: graph.edges.map((item) => item.id === selectedEdge.id ? { ...item, type, label: type } : item) })
  }
  const addAttachment = async () => {
    if (!graph || !selectedNode) return
    if (!attachmentDraft.title.trim()) { setError('请填写挂载知识标题'); return }
    if (attachmentDraft.resource_type === 'text' && !attachmentDraft.content.trim()) { setError('请填写知识内容'); return }
    if (attachmentDraft.resource_type === 'link' && !attachmentDraft.link_url.trim()) { setError('请填写链接地址'); return }
    if (attachmentDraft.resource_type === 'file' && !attachmentFile) { setError('请选择要挂载的文件'); return }
    setAttachmentSaving(true); setError('')
    try {
      const saved = await api.saveTeacherGraph(graph.id, graph)
      const savedNode = saved.nodes.find((node: GraphNode) => node.id === selectedNode.id)
        ?? saved.nodes.find((node: GraphNode) => node.label === selectedNode.label || node.label === selectedNode.label.slice(0, 32))
      if (!savedNode) throw new Error('当前节点保存后未找到，请重新选择节点')
      const created = attachmentDraft.resource_type === 'file' && attachmentFile
        ? await api.uploadTeacherGraphNodeAttachmentFile(saved.id, savedNode.id, attachmentFile, { title: attachmentDraft.title.trim(), visible: true })
        : await api.createTeacherGraphNodeAttachment(saved.id, savedNode.id, {
            title: attachmentDraft.title.trim(),
            resource_type: attachmentDraft.resource_type as 'text' | 'link',
            content: attachmentDraft.content,
            link_url: attachmentDraft.link_url,
            visible: true,
          })
      const nextGraph = {
        ...saved,
        nodes: saved.nodes.map((node: GraphNode) => node.id === savedNode.id ? { ...node, attachments: [...(node.attachments ?? []), created] } : node),
      }
      setGraph(nextGraph)
      setSelection({ kind: 'node', id: savedNode.id })
      setAttachmentDraft({ title: '', resource_type: 'text', content: '', link_url: '' })
      setAttachmentFile(null)
      setAttachmentOpen(false)
      await loadList(saved.id)
      props.notify('节点挂载知识已添加')
    } catch (reason: any) { setError(reason.message || '挂载知识添加失败') }
    finally { setAttachmentSaving(false) }
  }
  const deleteAttachment = async (attachment: GraphNodeAttachment) => {
    if (!graph || !selectedNode) return
    setAttachmentSaving(true); setError('')
    try {
      await api.deleteTeacherGraphNodeAttachment(graph.id, selectedNode.id, attachment.id)
      patchGraph({ nodes: graph.nodes.map((node) => node.id === selectedNode.id ? { ...node, attachments: (node.attachments ?? []).filter((item) => item.id !== attachment.id) } : node) })
      await loadList(graph.id)
      props.notify('节点挂载知识已删除')
    } catch (reason: any) { setError(reason.message || '挂载知识删除失败') }
    finally { setAttachmentSaving(false) }
  }
  const deleteGraph = () => {
    if (!graph) return
    Modal.confirm({ title: '删除当前图谱？', content: '节点、关系和来源资料将一并删除，此操作不可撤销。', okText: '删除', okButtonProps: { danger: true }, cancelText: '取消', onOk: async () => { await api.deleteTeacherGraph(graph.id); setGraph(null); setSelection(null); await loadList(); props.notify('图谱已删除') } })
  }

  const associated = useMemo(() => !graph || !selectedNode ? [] : graph.edges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id).map((edge) => ({ edge, node: graph.nodes.find((node) => node.id === (edge.source === selectedNode.id ? edge.target : edge.source)), direction: edge.source === selectedNode.id ? '出' : '入' })).filter((item) => item.node), [graph, selectedNode])
  const totalPublished = graphs.filter((item) => item.status === 'published').length

  return <div className="exact-course-page kg-page">
    <header className="kg-page-head">
      <div><CourseBreadcrumb current="知识图谱" onNavigate={props.onNavigate} /><Title level={2}>知识图谱</Title><Text type="secondary">上传课程资料生成图谱草稿，教师可继续自定义节点、调整关系并发布到目标班级。</Text></div>
      <div className="kg-head-actions">
        <Tooltip title="重新加载图谱"><Button icon={<RefreshCw size={15} />} onClick={() => void loadList(graph?.id)}>刷新</Button></Tooltip>
        <Button icon={<Save size={15} />} disabled={!graph || saving} loading={saving} onClick={() => void save()}>保存草稿</Button>
        <Button type="primary" icon={<Send size={15} />} disabled={!graph || saving} onClick={openPublish}>发布</Button>
      </div>
      <div className="kg-stats">
        <Stat label="图谱总数" value={graphs.length} /><Stat label="已发布" value={totalPublished} /><Stat label="当前节点" value={graph?.nodes.length || 0} /><Stat label="当前关系" value={graph?.edges.length || 0} />
      </div>
    </header>
    {error && <div className="kg-error" role="alert"><span>{error}</span><button onClick={() => setError('')}>关闭</button></div>}
    <Spin spinning={loading} tip="正在加载图谱">
      <div className="kg-layout">
        <aside className="kg-left">
          <section className="kg-card kg-generator">
            <CardTitle icon={<WandSparkles size={16} />} title="资料生成" extra={<Tag color="blue">PDF / Word / PPT / MD / TXT</Tag>} />
            <label>图谱名称<Input value={title} placeholder="例如：数据结构课程图谱" onChange={(event) => setTitle(event.target.value)} /></label>
            <label>发布班级<Select mode="multiple" value={targetClassIds} placeholder="选择当前教师授课班级" options={classSelectOptions} onChange={setTargetClassIds} /></label>
            {!publishClasses.length && <small className="kg-form-hint">当前课程下暂无可发布班级。</small>}
            <label>说明<Input.TextArea value={description} rows={2} placeholder="填写图谱用途或教学目标" onChange={(event) => setDescription(event.target.value)} /></label>
            <input ref={inputRef} hidden type="file" multiple accept=".pdf,.docx,.pptx,.md,.markdown,.txt" onChange={(event) => setFiles(Array.from(event.target.files || []))} />
            <button type="button" className="kg-upload" onClick={() => inputRef.current?.click()}><UploadCloud size={22} /><strong>{files.length ? `已选择 ${files.length} 个文件` : '选择课程资料'}</strong><small>单个文件不超过 20 MB</small></button>
            {!!files.length && <div className="kg-file-list">{files.map((file) => <span key={`${file.name}-${file.size}`}><FileText size={13} /><b>{file.name}</b><small>{fileSize(file.size)}</small></span>)}</div>}
            <Button block type="primary" icon={<Sparkles size={15} />} loading={generating} disabled={saving} onClick={() => void generate()}>分析并生成图谱</Button>
            <Button block icon={<CirclePlus size={15} />} loading={saving} disabled={generating} onClick={() => void createBlank()}>新建空白图谱</Button>
          </section>
          <section className="kg-card kg-list-card">
            <CardTitle icon={<Network size={16} />} title="图谱列表" extra={<span className="kg-count">{graphs.length}</span>} />
            <div className="kg-graph-list">{graphs.map((item) => <button type="button" key={item.id} className={graph?.id === item.id ? 'active' : ''} onClick={() => void openGraph(item.id)}><span><strong>{item.title}</strong><Tag color={item.status === 'published' ? 'green' : 'default'}>{item.status === 'published' ? '已发布' : '草稿'}</Tag></span><small>{item.node_count} 节点 · {item.edge_count} 关系{item.target_classes?.length ? ` · ${item.target_classes.join('、')}` : ''}</small></button>)}{!graphs.length && <div className="kg-list-empty">还没有图谱</div>}</div>
          </section>
        </aside>
        <main className="kg-main">
          <div className="kg-toolbar">
            <div className="kg-segment"><Button type={mode === 'select' ? 'primary' : 'text'} icon={<MousePointer2 size={14} />} onClick={() => { setMode('select'); setLinkStart('') }}>选择</Button><Button type={mode === 'connect' ? 'primary' : 'text'} icon={<Link2 size={14} />} onClick={() => setMode('connect')}>连接</Button></div>
            <Select value={edgeType} options={EDGE_TYPES.map((value) => ({ value, label: value }))} onChange={setEdgeType} aria-label="关系类型" />
            <Button icon={<CirclePlus size={14} />} disabled={!graph} onClick={addNode}>节点</Button>
            <Button icon={<GitBranch size={14} />} disabled={!graph?.nodes.length} onClick={automaticLayout}>布局</Button>
            <Button danger icon={<Trash2 size={14} />} disabled={!selection} onClick={removeSelection}>删除</Button>
            {mode === 'connect' && <span className="kg-connect-hint">{linkStart ? '请选择目标节点' : '请选择起始节点'}</span>}
          </div>
          <section className="kg-canvas-shell">
            {graph && graph.nodes.length ? <GraphCanvas graph={graph} selection={selection} mode={mode} linkStart={linkStart} onSelection={setSelection} onLinkNode={chooseLinkNode} onNodePosition={(id, x, y) => patchGraph({ nodes: graph.nodes.map((node) => node.id === id ? { ...node, x, y } : node) })} /> : <div className="kg-empty"><Network size={36} /><strong>还没有图谱内容</strong><span>上传资料自动生成，或先新建空白图谱再手动添加节点。</span></div>}
          </section>
        </main>
        <aside className="kg-right">
          <section className="kg-card kg-properties">
            <CardTitle icon={<MousePointer2 size={16} />} title="属性面板" />
            {!selection && <div className="kg-property-empty"><MousePointer2 size={25} /><p>选择画布中的节点或关系后，可在这里编辑名称、类型、难度和说明。</p></div>}
            {selectedNode && <div className="kg-form">
              <label>节点名称<Input value={selectedNode.label} maxLength={32} onChange={(event) => updateNode({ label: event.target.value })} /></label>
              <label>节点类型<Select value={selectedNode.type} options={NODE_TYPES.map((value) => ({ value, label: value }))} onChange={(value) => updateNode({ type: value })} /></label>
              <label><span>难度 <b>{selectedNode.difficulty}</b></span><Slider min={1} max={5} marks={{ 1: '1', 3: '3', 5: '5' }} value={selectedNode.difficulty} onChange={(value) => updateNode({ difficulty: value })} /></label>
              <label>说明<Input.TextArea rows={4} maxLength={120} value={selectedNode.description} onChange={(event) => updateNode({ description: event.target.value })} /></label>
              <div className="kg-node-attachments">
                <div className="kg-node-attachments-head">
                  <strong>挂载知识</strong>
                  <Button size="small" type="text" icon={<CirclePlus size={13} />} onClick={() => setAttachmentOpen((open) => !open)}>{attachmentOpen ? '收起' : '添加'}</Button>
                </div>
                {selectedNodeAttachments.length ? (
                  <div className="kg-node-attachment-list">
                    {selectedNodeAttachments.map((attachment) => (
                      <article key={attachment.id}>
                        <span>{attachment.resource_type === 'link' ? <Link2 size={13} /> : <FileText size={13} />}</span>
                        <div>
                          <strong>{attachment.title}</strong>
                          {attachment.resource_type === 'file' && attachment.file_url ? (
                            <a href={attachment.file_url} target="_blank" rel="noreferrer" title={attachmentSummary(attachment)}>{attachmentSummary(attachment)}</a>
                          ) : attachment.resource_type === 'link' ? (
                            <a href={attachment.link_url} target="_blank" rel="noreferrer" title={attachment.link_url}>{attachmentSummary(attachment)}</a>
                          ) : (
                            <>
                              <p>{attachmentSummary(attachment)}</p>
                              <button type="button" className="kg-attachment-view" onClick={() => setViewingAttachment(attachment)}><Eye size={12} />查看全文</button>
                            </>
                          )}
                        </div>
                        <button type="button" aria-label="删除挂载知识" disabled={attachmentSaving} onClick={() => void deleteAttachment(attachment)}><Trash2 size={13} /></button>
                      </article>
                    ))}
                  </div>
                ) : <small className="kg-attachment-empty">当前节点还没有挂载知识</small>}
                {attachmentOpen && (
                  <div className="kg-attachment-form">
                    <Input size="small" placeholder="标题，例如：课前补充阅读" value={attachmentDraft.title} onChange={(event) => setAttachmentDraft((current) => ({ ...current, title: event.target.value }))} />
                    <Select size="small" value={attachmentDraft.resource_type} options={[{ value: 'text', label: '文本' }, { value: 'link', label: '链接' }, { value: 'file', label: '文件' }]} onChange={(value) => { setAttachmentDraft((current) => ({ ...current, resource_type: value })); setAttachmentFile(null) }} />
                    {attachmentDraft.resource_type === 'file' ? (
                      <div className="kg-attachment-file-picker">
                        <input ref={attachmentFileInputRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.md,.markdown,.txt,.png,.jpg,.jpeg,.webp,.csv,.xlsx" onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)} />
                        <Button size="small" icon={<UploadCloud size={13} />} onClick={() => attachmentFileInputRef.current?.click()}>选择文件</Button>
                        <span>{attachmentFile ? `${attachmentFile.name} · ${fileSize(attachmentFile.size)}` : '支持 PDF、Word、PPT、MD、TXT、图片、表格'}</span>
                      </div>
                    ) : attachmentDraft.resource_type === 'link' ? (
                      <Input size="small" placeholder="https://..." value={attachmentDraft.link_url} onChange={(event) => setAttachmentDraft((current) => ({ ...current, link_url: event.target.value }))} />
                    ) : (
                      <Input.TextArea rows={3} maxLength={2000} placeholder="写一段给学生看的补充知识" value={attachmentDraft.content} onChange={(event) => setAttachmentDraft((current) => ({ ...current, content: event.target.value }))} />
                    )}
                    <Button size="small" type="primary" loading={attachmentSaving} onClick={() => void addAttachment()}>保存挂载</Button>
                  </div>
                )}
              </div>
              <div className="kg-associated"><strong>关联节点</strong>{associated.map(({ edge, node, direction }) => <button type="button" key={edge.id} onClick={() => setSelection({ kind: 'edge', id: edge.id })}><span>{direction} · {edge.type}</span><b>{node?.label}</b></button>)}{!associated.length && <small>暂无关联关系</small>}</div>
            </div>}
            {selectedEdge && <div className="kg-form"><label>关系类型<Select value={selectedEdge.type} options={EDGE_TYPES.map((value) => ({ value, label: value }))} onChange={updateEdge} /></label><div className="kg-endpoints"><span>起点<strong>{graph?.nodes.find((node) => node.id === selectedEdge.source)?.label || '-'}</strong></span><GitBranch size={17} /><span>终点<strong>{graph?.nodes.find((node) => node.id === selectedEdge.target)?.label || '-'}</strong></span></div></div>}
          </section>
          <section className="kg-card kg-source">
            <CardTitle icon={<FileText size={16} />} title="来源资料" extra={graph && <Tag color={graph.status === 'published' ? 'green' : 'default'}>{graph.status === 'published' ? '已发布' : '草稿'}</Tag>} />
            {graph?.source_files.length ? <div className="kg-source-files">{graph.source_files.map((file) => <span key={file.filename}><FileText size={14} /><b>{file.filename}</b><small>{fileSize(file.size_bytes)}</small></span>)}</div> : <p className="kg-muted">当前图谱没有上传来源资料。</p>}
            {graph?.source_summary && <div className="kg-summary"><strong>资料摘要</strong><p>{graph.source_summary}</p></div>}
            <Button block danger icon={<Trash2 size={14} />} disabled={!graph} onClick={deleteGraph}>删除当前图谱</Button>
          </section>
        </aside>
      </div>
    </Spin>
    <Modal
      title="选择发布班级"
      open={publishOpen}
      okText="发布并同步"
      cancelText="取消"
      confirmLoading={saving}
      onOk={() => void publish()}
      onCancel={() => setPublishOpen(false)}
    >
      <div className="kg-publish-modal">
        <p>选择后，这张图谱会同步到对应班级学生端的课程知识图谱；未选择的班级不会收到更新。</p>
        <Select
          mode="multiple"
          value={publishClassIds}
          placeholder="选择一个或多个班级"
          options={classSelectOptions}
          onChange={setPublishClassIds}
        />
        {!publishClasses.length && <small>当前课程下暂无可发布班级。</small>}
      </div>
    </Modal>
    <Modal
      title={viewingAttachment?.title || '挂载文本'}
      open={!!viewingAttachment}
      footer={null}
      onCancel={() => setViewingAttachment(null)}
    >
      <div className="kg-attachment-text-modal">{viewingAttachment?.content || '暂无文本内容'}</div>
    </Modal>
  </div>
}

function Stat({ label, value }: { label: string; value: number }) { return <div><span>{label}</span><strong>{value}</strong></div> }
function CardTitle({ icon, title, extra }: { icon: React.ReactNode; title: string; extra?: React.ReactNode }) { return <header className="kg-card-title"><span>{icon}<strong>{title}</strong></span>{extra}</header> }
