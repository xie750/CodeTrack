import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts'
import { Button, Input, Modal, Select, Slider, Spin, Tag, Tooltip, Typography } from 'antd'
import {
  CirclePlus, FileText, GitBranch, Link2, MousePointer2, Network, RefreshCw,
  Save, Send, Sparkles, Trash2, UploadCloud, WandSparkles,
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
}

interface GraphEdge {
  id: string
  source: string
  target: string
  type: EdgeType
  label: EdgeType
}

interface SourceFile { filename: string; mime_type: string; size_bytes: number }
interface GraphSummary {
  id: number; title: string; status: 'draft' | 'published'; node_count: number; edge_count: number; updated_at: string
}
interface TeacherGraph extends GraphSummary {
  description: string; target_classes: string[]; source_files: SourceFile[]; source_summary: string
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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character)
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
  const graphRef = useRef(graph)
  const handlersRef = useRef({ onSelection, onLinkNode, onNodePosition, mode })
  graphRef.current = graph
  handlersRef.current = { onSelection, onLinkNode, onNodePosition, mode }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const chart = echarts.init(host, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    let draggingNodeId = ''
    let handledChartClickAt = 0
    const chooseNode = (nodeId: string) => {
      if (handlersRef.current.mode === 'connect') handlersRef.current.onLinkNode(nodeId)
      else handlersRef.current.onSelection({ kind: 'node', id: nodeId })
    }
    const nearestNodeAt = (point: [number, number]) => {
      const seriesModel = (chart as any).getModel?.()?.getSeriesByIndex?.(0)
      const data = seriesModel?.getData?.()
      if (!data) return ''
      let bestNodeId = ''
      let bestDistance = Number.POSITIVE_INFINITY
      graphRef.current.nodes.forEach((node, index) => {
        const layout = data.getItemLayout(index)
        if (!Array.isArray(layout) || layout.length < 2) return
        const x = Number(layout[0])
        const y = Number(layout[1])
        if (!Number.isFinite(x) || !Number.isFinite(y)) return
        const radius = (30 + Math.max(1, Math.min(5, node.difficulty)) * 8) / 2 + 10
        const distance = Math.hypot(point[0] - x, point[1] - y)
        if (distance <= radius && distance < bestDistance) {
          bestDistance = distance
          bestNodeId = node.id
        }
      })
      return bestNodeId
    }
    const click = (params: any) => {
      if (params.dataType === 'node') {
        handledChartClickAt = Date.now()
        chooseNode(params.data.id)
      } else if (params.dataType === 'edge') {
        handledChartClickAt = Date.now()
        handlersRef.current.onSelection({ kind: 'edge', id: params.data.id })
      }
    }
    const dragEnd = (params: any) => {
      const canvasPoint = canvasPointFromEvent(host, params.event)
      const point = canvasPoint ? chart.convertFromPixel({ seriesIndex: 0 }, canvasPoint) as number[] : null
      if (params.dataType === 'node' && Array.isArray(point) && point.every(Number.isFinite)) handlersRef.current.onNodePosition(params.data.id, point[0], point[1])
    }
    const pointerDown = (params: any) => {
      draggingNodeId = params.dataType === 'node' ? params.data.id : ''
    }
    const pointerUp = (event: any) => {
      if (!draggingNodeId) return
      const canvasPoint = canvasPointFromEvent(host, event)
      const point = canvasPoint ? chart.convertFromPixel({ seriesIndex: 0 }, canvasPoint) as number[] : null
      if (Array.isArray(point) && point.every(Number.isFinite)) handlersRef.current.onNodePosition(draggingNodeId, point[0], point[1])
      draggingNodeId = ''
    }
    const fallbackPointerDown = (event: any) => {
      if (draggingNodeId) return
      const point = canvasPointFromEvent(host, event)
      const nodeId = point ? nearestNodeAt(point) : ''
      if (nodeId) draggingNodeId = nodeId
    }
    const fallbackClick = (event: any) => {
      window.setTimeout(() => {
        if (Date.now() - handledChartClickAt < 80) return
        const point = canvasPointFromEvent(host, event)
        const nodeId = point ? nearestNodeAt(point) : ''
        if (nodeId) chooseNode(nodeId)
      }, 0)
    }
    chart.on('click', click)
    chart.on('mousedown', pointerDown)
    chart.on('dragend', dragEnd)
    chart.getZr().on('mousedown', fallbackPointerDown)
    chart.getZr().on('click', fallbackClick)
    chart.getZr().on('mouseup', pointerUp)
    const eventTypes = ['pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mousemove', 'mouseup', 'click', 'dblclick', 'wheel']
    eventTypes.forEach((type) => host.addEventListener(type, patchZoomedPointerEvent, { capture: true, passive: true }))
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(host)
    window.requestAnimationFrame(() => chart.resize())
    return () => {
      observer.disconnect()
      chart.off('click', click)
      chart.off('mousedown', pointerDown)
      chart.off('dragend', dragEnd)
      chart.getZr().off('mousedown', fallbackPointerDown)
      chart.getZr().off('click', fallbackClick)
      chart.getZr().off('mouseup', pointerUp)
      eventTypes.forEach((type) => host.removeEventListener(type, patchZoomedPointerEvent, { capture: true }))
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const selectedNode = selection?.kind === 'node' ? selection.id : ''
    const selectedEdge = selection?.kind === 'edge' ? selection.id : ''
    chart.setOption({
      animationDuration: 800,
      animationEasingUpdate: 'quinticInOut',
      tooltip: {
        trigger: 'item', backgroundColor: '#fff', borderColor: '#E5EAF2', borderWidth: 1,
        padding: [10, 14], textStyle: { color: '#334155', fontSize: 12 }, extraCssText: 'border-radius:10px;box-shadow:0 4px 16px rgba(15,23,42,.08)',
        formatter: (params: any) => params.dataType === 'edge'
          ? `<strong>${escapeHtml(params.data.type)}</strong>`
          : `<strong>${escapeHtml(params.data.label)}</strong><div style="margin-top:6px"><span style="color:${params.data.color}">${escapeHtml(params.data.type)}</span> · 难度 ${'★'.repeat(params.data.difficulty)}</div><div style="margin-top:5px;color:#64748b;max-width:220px">${escapeHtml(params.data.description || '暂无说明')}</div>`,
      },
      series: [{
        type: 'graph', layout: 'force', roam: true, draggable: true, focusNodeAdjacency: true,
        edgeSymbol: ['none', 'arrow'], edgeSymbolSize: 7, selectedMode: 'single',
        scaleLimit: { min: .35, max: 3 },
        force: { repulsion: 360, gravity: .08, edgeLength: [105, 210], friction: .58 },
        data: graph.nodes.map((node) => ({
          ...node, name: node.label, symbolSize: 30 + Math.max(1, Math.min(5, node.difficulty)) * 8,
          selected: selectedNode === node.id,
          itemStyle: {
            color: '#fff', borderColor: linkStart === node.id ? '#f59e0b' : selectedNode === node.id ? '#2563eb' : node.color,
            borderWidth: linkStart === node.id || selectedNode === node.id ? 4 : 1.5,
            shadowBlur: linkStart === node.id || selectedNode === node.id ? 16 : 8,
            shadowColor: `${linkStart === node.id ? '#f59e0b' : node.color}33`,
          },
          label: { show: true, position: 'bottom', formatter: '{b}', fontSize: 11, fontWeight: 700, color: '#374151', distance: 7, width: 112, overflow: 'truncate' },
        })),
        links: graph.edges.map((edge) => {
          const style = EDGE_STYLES[edge.type]
          const selected = selectedEdge === edge.id
          return { ...edge, lineStyle: { color: selected ? '#2563eb' : style.color, width: selected ? 2.8 : style.width, type: style.type, opacity: selected ? .96 : .78, curveness: .15 } }
        }),
        label: { show: true }, edgeLabel: { show: false },
        emphasis: { focus: 'adjacency' },
      }],
    }, true)
  }, [graph, linkStart, selection])

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
  const [targetClasses, setTargetClasses] = useState('')
  const [description, setDescription] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

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

  const createBlank = async () => {
    setSaving(true); setError('')
    try {
      const created = await api.createTeacherGraph({ title: title.trim() || '未命名知识图谱', description, target_classes: splitClasses(targetClasses) })
      setTitle(''); setDescription(''); setTargetClasses(''); setGraph(created); await loadList(created.id); props.notify('空白图谱已创建')
    } catch (reason: any) { setError(reason.message || '创建失败') }
    finally { setSaving(false) }
  }

  const generate = async () => {
    if (!files.length) { setError('请先选择 PDF、Word、PPT、Markdown 或 TXT 资料'); return }
    setGenerating(true); setError('')
    try {
      const created = await api.createTeacherGraphFromFiles(files, { title: title.trim() || files[0].name.replace(/\.[^.]+$/, ''), description, target_classes: targetClasses })
      setFiles([]); setTitle(''); setDescription(''); setTargetClasses(''); setGraph(created); await loadList(created.id); props.notify('资料分析完成，图谱草稿已生成')
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

  const publish = async () => {
    if (!graph) return
    setSaving(true); setError('')
    try {
      await api.saveTeacherGraph(graph.id, graph)
      const published = await api.publishTeacherGraph(graph.id)
      setGraph(published); await loadList(published.id); props.notify('知识图谱已发布')
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
        <Button type="primary" icon={<Send size={15} />} disabled={!graph || saving} onClick={() => void publish()}>发布</Button>
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
            <label>发布班级<Input.TextArea value={targetClasses} rows={2} placeholder="中文逗号、英文逗号或换行分隔" onChange={(event) => setTargetClasses(event.target.value)} /></label>
            <label>说明<Input.TextArea value={description} rows={2} placeholder="填写图谱用途或教学目标" onChange={(event) => setDescription(event.target.value)} /></label>
            <input ref={inputRef} hidden type="file" multiple accept=".pdf,.docx,.pptx,.md,.markdown,.txt" onChange={(event) => setFiles(Array.from(event.target.files || []))} />
            <button type="button" className="kg-upload" onClick={() => inputRef.current?.click()}><UploadCloud size={22} /><strong>{files.length ? `已选择 ${files.length} 个文件` : '选择课程资料'}</strong><small>单个文件不超过 20 MB</small></button>
            {!!files.length && <div className="kg-file-list">{files.map((file) => <span key={`${file.name}-${file.size}`}><FileText size={13} /><b>{file.name}</b><small>{fileSize(file.size)}</small></span>)}</div>}
            <Button block type="primary" icon={<Sparkles size={15} />} loading={generating} disabled={saving} onClick={() => void generate()}>分析并生成图谱</Button>
            <Button block icon={<CirclePlus size={15} />} loading={saving} disabled={generating} onClick={() => void createBlank()}>新建空白图谱</Button>
          </section>
          <section className="kg-card kg-list-card">
            <CardTitle icon={<Network size={16} />} title="图谱列表" extra={<span className="kg-count">{graphs.length}</span>} />
            <div className="kg-graph-list">{graphs.map((item) => <button type="button" key={item.id} className={graph?.id === item.id ? 'active' : ''} onClick={() => void openGraph(item.id)}><span><strong>{item.title}</strong><Tag color={item.status === 'published' ? 'green' : 'default'}>{item.status === 'published' ? '已发布' : '草稿'}</Tag></span><small>{item.node_count} 节点 · {item.edge_count} 关系</small></button>)}{!graphs.length && <div className="kg-list-empty">还没有图谱</div>}</div>
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
  </div>
}

function splitClasses(value: string) { return value.split(/[,，\n]+/).map((item) => item.trim()).filter(Boolean) }
function Stat({ label, value }: { label: string; value: number }) { return <div><span>{label}</span><strong>{value}</strong></div> }
function CardTitle({ icon, title, extra }: { icon: React.ReactNode; title: string; extra?: React.ReactNode }) { return <header className="kg-card-title"><span>{icon}<strong>{title}</strong></span>{extra}</header> }
