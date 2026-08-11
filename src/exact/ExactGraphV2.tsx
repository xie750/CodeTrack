import { useEffect, useMemo, useRef, useState } from 'react'
import {
  forceCollide, forceLink, forceManyBody, forceSimulation,
  type SimulationLinkDatum, type SimulationNodeDatum,
} from 'd3-force'
import {
  Alert, Button, Checkbox, Col, Form, Input, InputNumber, Modal, Row, Select,
  Space, Tag, Typography,
} from 'antd'
import {
  BrainCircuit, ChevronDown, CloudDownload, Edit3, Expand, ExternalLink, FileText, Filter,
  GitFork, Link2, LocateFixed, Maximize2, Minus, Network, Plus, Search,
  Send, Settings, Sparkles, X,
} from 'lucide-react'

import { api, type ApiClass, type ApiCourse } from '../api'
import type { ExactView } from './components'
import { CourseBreadcrumb, EmptyPanel, PageLoader } from './components'
import './graph-exact.css'

const { Text, Title, Paragraph } = Typography

interface GraphNode {
  id: string
  name: string
  description: string
  difficulty: string
  mastery: number
  x: number
  y: number
  materials?: GraphMaterial[]
}

interface GraphMaterial {
  id: string
  title: string
  type: string
  chapter: string
  size: string
  content_url?: string | null
  updated_at: string
  relation?: 'explicit' | 'chapter' | 'recommended'
}

interface GraphEdge {
  source: string
  target: string
  type?: string
}

interface ForceNode extends SimulationNodeDatum {
  id: string
  name: string
  description: string
  difficulty: string
  mastery: number
  x: number
  y: number
  materials?: GraphMaterial[]
}

interface ForceEdge extends SimulationLinkDatum<ForceNode> {
  source: string | ForceNode
  target: string | ForceNode
  type?: string
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

interface ForceGraphProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedId: string
  search: string
  zoom: number
  resetSignal: number
  onSelect: (id: string) => void
}

function ForceGraph({ nodes, edges, selectedId, search, zoom, resetSignal, onSelect }: ForceGraphProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  const driftFrameRef = useRef<number | null>(null)
  const driftRef = useRef({ x: 0, y: 0 })
  const fluidRef = useRef({ x: 0, y: 0, vx: 0, vy: 0, active: false, initialized: false })
  const [size, setSize] = useState({ width: 760, height: 560 })
  const [layoutNodes, setLayoutNodes] = useState<ForceNode[]>([])
  const [cursor, setCursor] = useState({ x: 0, y: 0, active: false })
  const [drift, setDrift] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (!hostRef.current) return
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(560, Math.round(entry.contentRect.width))
      const height = Math.max(460, Math.round(entry.contentRect.height))
      setSize({ width, height })
    })
    observer.observe(hostRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const animateDrift = (time: number) => {
      const fluid = fluidRef.current
      const pointerX = fluid.active ? (fluid.x - size.width / 2) / Math.max(1, size.width / 2) : 0
      const pointerY = fluid.active ? (fluid.y - size.height / 2) / Math.max(1, size.height / 2) : 0
      const targetX = Math.max(-1, Math.min(1, pointerX)) * 38 + Math.sin(time * .00032) * 7
      const targetY = Math.max(-1, Math.min(1, pointerY)) * 30 + Math.cos(time * .00027) * 6
      driftRef.current.x += (targetX - driftRef.current.x) * .045
      driftRef.current.y += (targetY - driftRef.current.y) * .045
      setDrift({ x: driftRef.current.x, y: driftRef.current.y })
      driftFrameRef.current = requestAnimationFrame(animateDrift)
    }
    driftFrameRef.current = requestAnimationFrame(animateDrift)
    return () => {
      if (driftFrameRef.current !== null) cancelAnimationFrame(driftFrameRef.current)
      driftFrameRef.current = null
    }
  }, [size.height, size.width])

  useEffect(() => {
    const centerX = size.width * .59
    const centerY = size.height * .52
    const baseRadius = Math.min(size.width * .34, size.height * .37)
    fluidRef.current.x = centerX
    fluidRef.current.y = centerY
    const simulationNodes: ForceNode[] = nodes.map((node, index) => {
      const isCore = node.id === 'kp-linked' || index === 0
      const satelliteIndex = isCore ? 0 : index - 1
      const ring = Math.floor(satelliteIndex / 8)
      const ringCount = Math.min(8, Math.max(1, nodes.length - 1 - ring * 8))
      const angle = (satelliteIndex % 8) / ringCount * Math.PI * 2 - Math.PI / 2
      const radius = isCore ? 0 : baseRadius + ring * 82
      const startX = isCore ? centerX : centerX + Math.cos(angle) * radius
      const startY = isCore ? centerY : centerY + Math.sin(angle) * radius * .78
      return {
        ...node,
        x: startX + (index % 3 - 1) * 7,
        y: startY + ((index + 1) % 3 - 1) * 7,
        vx: 0,
        vy: 0,
      }
    })
    const links: ForceEdge[] = edges.map((edge) => ({ ...edge }))
    const flowForce = (alpha: number) => {
      const time = performance.now() * .00028
      const fluid = fluidRef.current
      fluid.vx *= .88
      fluid.vy *= .88
      const centroid = simulationNodes.reduce((total, node) => ({
        x: total.x + (node.x || centerX),
        y: total.y + (node.y || centerY),
      }), { x: 0, y: 0 })
      centroid.x /= Math.max(1, simulationNodes.length)
      centroid.y /= Math.max(1, simulationNodes.length)

      // The cursor controls where the whole graph slowly drifts. This common force moves
      // every node together, so the graph feels fluid without collapsing its structure.
      const pointerX = fluid.active ? (fluid.x - centerX) / Math.max(1, size.width / 2) : 0
      const pointerY = fluid.active ? (fluid.y - centerY) / Math.max(1, size.height / 2) : 0
      const targetCenterX = centerX + Math.max(-1, Math.min(1, pointerX)) * Math.min(105, size.width * .12)
      const targetCenterY = centerY + Math.max(-1, Math.min(1, pointerY)) * Math.min(82, size.height * .12)
      const globalFlowX = (targetCenterX - centroid.x) * .00085 + fluid.vx * .0018
      const globalFlowY = (targetCenterY - centroid.y) * .00085 + fluid.vy * .0018

      simulationNodes.forEach((node, index) => {
        const phase = time + index * 1.73
        const direction = index % 2 ? 1 : -1
        const dx = (node.x || centerX) - centroid.x
        const dy = (node.y || centerY) - centroid.y
        const distance = Math.max(60, Math.hypot(dx, dy))
        const wave = .075 * alpha
        const pointerDx = (node.x || centerX) - fluid.x
        const pointerDy = (node.y || centerY) - fluid.y
        const pointerRadius = Math.max(36, Math.hypot(pointerDx, pointerDy))
        const ripple = fluid.active ? Math.max(0, 1 - pointerRadius / 340) * .024 * alpha : 0
        node.vx = (node.vx || 0) + globalFlowX + Math.cos(phase * 1.13) * wave - dy / distance * .018 * alpha * direction - pointerDy / pointerRadius * ripple
        node.vy = (node.vy || 0) + globalFlowY + Math.sin(phase * .91) * wave + dx / distance * .018 * alpha * direction + pointerDx / pointerRadius * ripple
      })
    }

    const simulation = forceSimulation(simulationNodes)
      .force('link', forceLink<ForceNode, ForceEdge>(links).id((node) => node.id).distance(178).strength(.075))
      .force('charge', forceManyBody<ForceNode>().strength(-620))
      .force('collision', forceCollide<ForceNode>().radius(84).strength(1))
      .force('continuous-flow', flowForce)
      .alpha(.28)
      .alphaDecay(0)
      .velocityDecay(.36)

    simulation.on('tick', () => {
      simulationNodes.forEach((node) => {
        const nextX = node.x || centerX
        const nextY = node.y || centerY
        if (nextX < 82 || nextX > size.width - 82) node.vx = -(node.vx || 0) * .68
        if (nextY < 76 || nextY > size.height - 96) node.vy = -(node.vy || 0) * .68
        node.x = Math.max(82, Math.min(size.width - 82, nextX))
        node.y = Math.max(76, Math.min(size.height - 96, nextY))
      })
      if (frameRef.current !== null) return
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null
        setLayoutNodes(simulationNodes.map((node) => ({ ...node })))
      })
    })

    simulation.restart()
    return () => {
      simulation.stop()
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [edges, nodes, resetSignal, size.height, size.width])

  const nodeMap = useMemo(() => new Map(layoutNodes.map((node) => [node.id, node])), [layoutNodes])
  const transformedCursor = useMemo(() => ({
    x: (cursor.x - size.width / 2) / zoom + size.width / 2,
    y: (cursor.y - size.height / 2) / zoom + size.height / 2,
  }), [cursor.x, cursor.y, size.height, size.width, zoom])

  const pointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const rawX = event.clientX - rect.left
    const rawY = event.clientY - rect.top
    const x = (rawX - size.width / 2) / zoom + size.width / 2
    const y = (rawY - size.height / 2) / zoom + size.height / 2
    const fluid = fluidRef.current
    if (fluid.initialized) {
      const deltaX = Math.max(-40, Math.min(40, x - fluid.x))
      const deltaY = Math.max(-40, Math.min(40, y - fluid.y))
      fluid.vx = fluid.vx * .68 + deltaX * .32
      fluid.vy = fluid.vy * .68 + deltaY * .32
    }
    fluid.x = x
    fluid.y = y
    fluid.active = true
    fluid.initialized = true
    setCursor({ x: rawX, y: rawY, active: true })
  }

  const pointerLeave = () => {
    fluidRef.current.active = false
    fluidRef.current.initialized = false
    setCursor((current) => ({ ...current, active: false }))
  }

  const searchKey = search.trim().toLowerCase()
  const transform = `translate(${drift.x.toFixed(2)} ${drift.y.toFixed(2)}) translate(${size.width / 2} ${size.height / 2}) scale(${zoom}) translate(${-size.width / 2} ${-size.height / 2})`
  const cursorDistances = layoutNodes.map((node) => Math.hypot((node.x || 0) - transformedCursor.x, (node.y || 0) - transformedCursor.y))
  const lightRadius = 210
  const proximityAt = (distance: number) => {
    if (!cursor.active) return 0
    const value = Math.max(0, Math.min(1, 1 - distance / lightRadius))
    return value * value * (3 - 2 * value)
  }
  const proximityById = new Map(layoutNodes.map((node, index) => [node.id, proximityAt(cursorDistances[index])]))

  return <div className="force-graph-host" ref={hostRef}>
    <div className={'force-cursor-light ' + (cursor.active ? 'visible' : '')} style={{ left: cursor.x, top: cursor.y }} />
    <svg
      className="force-graph-svg"
      viewBox={`0 0 ${size.width} ${size.height}`}
      onPointerMove={pointerMove}
      onPointerLeave={pointerLeave}
      aria-label="课程知识图谱交互画布"
    >
      <g transform={transform}>
        <g className="force-edges">
          {edges.map((edge, index) => {
            const source = nodeMap.get(edge.source)
            const target = nodeMap.get(edge.target)
            if (!source || !target) return null
            const connected = source.id === selectedId || target.id === selectedId
            const edgeProximity = ((proximityById.get(source.id) || 0) + (proximityById.get(target.id) || 0)) / 2
            const lineLevel = Math.round(8 + edgeProximity * 116)
            return <g key={`${edge.source}-${edge.target}-${index}`}>
              <line
                className={connected ? 'active' : ''}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                style={{
                  stroke: `rgb(${lineLevel}, ${lineLevel}, ${lineLevel})`,
                  opacity: .82 + edgeProximity * .18,
                }}
              />
              <line
                className="force-edge-flow"
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                style={{
                  stroke: `rgb(${Math.max(28, lineLevel)}, ${Math.max(28, lineLevel)}, ${Math.max(28, lineLevel)})`,
                  opacity: .2 + edgeProximity * .55,
                  animationDelay: `${-index * .19}s`,
                }}
              />
            </g>
          })}
        </g>
        <g className="force-nodes">
          {layoutNodes.map((node, index) => {
            const proximity = proximityAt(cursorDistances[index])
            const selected = node.id === selectedId
            const searchMatch = !!searchKey && node.name.toLowerCase().includes(searchKey)
            const scale = 1 + proximity * .09
            const coreLevel = Math.round(4 + proximity * 74)
            const edgeLevel = Math.round(24 + proximity * 174)
            const iconLevel = Math.round(118 + proximity * 137)
            return <g
              className={`force-node color-${index % 6} ${selected ? 'selected' : ''} ${searchMatch ? 'search-match' : ''} ${node.materials?.length ? 'has-materials' : ''}`}
              key={node.id}
              transform={`translate(${node.x || 0} ${node.y || 0}) scale(${scale})`}
              style={{
                '--node-core-fill': `rgb(${coreLevel}, ${coreLevel}, ${coreLevel})`,
                '--node-edge-color': `rgb(${edgeLevel}, ${edgeLevel}, ${edgeLevel})`,
                '--node-icon-color': `rgb(${iconLevel}, ${iconLevel}, ${iconLevel})`,
                '--node-proximity': proximity,
              } as React.CSSProperties}
              onClick={() => onSelect(node.id)}
              role="button"
              tabIndex={0}
            >
              <circle className="force-node-halo" r={37} />
              <circle className="force-node-core" r={29} />
              {node.id === 'kp-linked' || index === 0 ? <Link2 x={-12} y={-12} width={24} height={24} /> : index % 2 ? <BrainCircuit x={-11} y={-11} width={22} height={22} /> : <Network x={-11} y={-11} width={22} height={22} />}
              {!!node.materials?.length && <g className="force-node-material-marker">
                <title>{`已关联 ${node.materials.length} 份课程资料`}</title>
                <circle cx={24} cy={-23} r={9} />
                <FileText x={19} y={-28} width={10} height={10} />
              </g>}
              <foreignObject x={-70} y={40} width={140} height={42}>
                <div className="force-node-label" title={node.name}>{node.name}</div>
              </foreignObject>
            </g>
          })}
        </g>
      </g>
    </svg>
    <div className="force-graph-legend"><Sparkles size={13} /><span>移动鼠标探索关联层级</span></div>
  </div>
}

export function ExactGraphV2(props: Props) {
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null)
  const [selectedId, setSelectedId] = useState('kp-linked')
  const [editOpen, setEditOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [candidates, setCandidates] = useState<any[]>([])
  const [candidateNames, setCandidateNames] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [zoom, setZoom] = useState(1)
  const [resetSignal, setResetSignal] = useState(0)
  const [importCollapsed, setImportCollapsed] = useState(false)
  const [previewMaterial, setPreviewMaterial] = useState<GraphMaterial | null>(null)
  const [form] = Form.useForm()

  const load = () => api.graph(props.courseId).then((data) => {
    setGraph(data)
    setSelectedId((current) => data.nodes.some((item: GraphNode) => item.id === current) ? current : data.nodes[0]?.id || '')
  }).catch((reason: any) => props.notify(reason.message || '知识图谱加载失败'))

  useEffect(() => { void load() }, [props.courseId])

  const selected = useMemo(
    () => graph?.nodes.find((item) => item.id === selectedId) || graph?.nodes[0],
    [graph, selectedId],
  )

  const related = useMemo(() => {
    if (!graph || !selected) return []
    const ids = graph.edges.flatMap((edge) => edge.source === selected.id ? [edge.target] : edge.target === selected.id ? [edge.source] : [])
    return graph.nodes.filter((item) => ids.includes(item.id))
  }, [graph, selected])

  const openEdit = () => {
    if (!selected) return
    form.setFieldsValue({
      name: selected.name,
      description: selected.description,
      difficulty: selected.difficulty,
      mastery: selected.mastery,
      position_x: selected.x,
      position_y: selected.y,
    })
    setEditOpen(true)
  }

  const saveNode = async () => {
    if (!selected) return
    try {
      await api.updateGraphNode(selected.id, form.getFieldsValue())
      props.notify('知识点全部信息已更新')
      setEditOpen(false)
      await load()
    } catch (reason: any) {
      props.notify(reason.message)
    }
  }

  const createNode = async () => {
    try {
      const chapters = await api.chapters(props.courseId)
      const values = form.getFieldsValue()
      await api.createKnowledgePoint({
        chapter_id: chapters[0].id,
        name: values.name,
        description: values.description || '',
        difficulty: values.difficulty || '基础',
        position_x: 65,
        position_y: 45,
      })
      props.notify('知识点已创建')
      setCreateOpen(false)
      form.resetFields()
      await load()
    } catch (reason: any) {
      props.notify(reason.message)
    }
  }

  const generateCandidates = async () => {
    setAiOpen(true)
    setAiLoading(true)
    try {
      const result = await api.aiGraphCandidates(props.courseId)
      setCandidates(result.candidates)
      setCandidateNames(result.candidates.map((item: any) => item.name))
    } catch (reason: any) {
      props.notify(reason.message)
    } finally {
      setAiLoading(false)
    }
  }

  const confirmCandidates = async () => {
    setAiLoading(true)
    try {
      const chosen = candidates.filter((item) => candidateNames.includes(item.name))
      await api.confirmGraphCandidates(props.courseId, chosen)
      props.notify('AI 候选节点已由教师确认并创建')
      setAiOpen(false)
      await load()
    } catch (reason: any) {
      props.notify(reason.message)
    } finally {
      setAiLoading(false)
    }
  }

  const resetView = () => {
    setZoom(1)
    setResetSignal((value) => value + 1)
  }

  const requestFullscreen = () => {
    const stage = document.querySelector<HTMLElement>('.graph-v2-stage')
    if (stage?.requestFullscreen) void stage.requestFullscreen()
  }

  if (!graph) return <PageLoader />

  return <div className="exact-course-page graph-v2-page">
    <div className="graph-v2-heading">
      <div><CourseBreadcrumb current="课程知识图谱" onNavigate={props.onNavigate} /><Title level={2}>课程知识图谱</Title><Text type="secondary">构建课程知识体系，梳理知识点关联关系，支撑教学设计与学情分析。</Text></div>
      <Space className="graph-v2-toolbar" wrap>
        <Button icon={<LocateFixed size={14} />} onClick={() => setCreateOpen(true)}>添加概念</Button>
        <Button icon={<GitFork size={14} />} onClick={() => props.notify('请先选择父节点，再添加子级')}>添加子级</Button>
        <Button icon={<Network size={14} />} onClick={() => props.notify('关系编辑模式已开启')}>添加关系 <ChevronDown size={12} /></Button>
        <Button icon={<Expand size={14} />} onClick={() => props.notify('交叉关联模式已开启')}>交叉关联</Button>
        <Button icon={<Settings size={14} />} onClick={openEdit}>节点样式</Button>
        <Button type="primary" icon={<BrainCircuit size={14} />} onClick={generateCandidates}>AI 生成图谱</Button>
      </Space>
    </div>

    <div className="graph-v2-layout">
      <main className="graph-v2-stage">
        <div className="graph-v2-search">
          <Input allowClear value={search} onChange={(event) => setSearch(event.target.value)} prefix={<Search size={14} />} placeholder="搜索知识点" suffix={<Settings size={13} />} />
          <Button icon={<Filter size={14} />} onClick={() => props.notify('当前显示全部知识点')}>筛选</Button>
          <Button aria-label="收起导入面板" onClick={() => setImportCollapsed((value) => !value)}>{importCollapsed ? '»' : '«'}</Button>
        </div>
        {!importCollapsed && <div className="graph-v2-import">
          <strong>从素材导入知识点</strong>
          <button onClick={() => props.onNavigate('materials')}><FileText size={16} /><span><b>从教学资源导入</b><small>从课件、教案等资源导入</small></span><ChevronDown size={12} /></button>
          <button onClick={() => props.onNavigate('materials')}><Link2 size={16} /><span><b>从文档导入</b><small>从文档、PPT、试题等导入</small></span><ChevronDown size={12} /></button>
          <button onClick={generateCandidates}><BrainCircuit size={16} /><span><b>从 AI 资料库生成</b><small>从大纲提取候选知识点</small></span><ChevronDown size={12} /></button>
        </div>}

        {graph.nodes.length ? <ForceGraph
          nodes={graph.nodes}
          edges={graph.edges}
          selectedId={selected?.id || ''}
          search={search}
          zoom={zoom}
          resetSignal={resetSignal}
          onSelect={setSelectedId}
        /> : <EmptyPanel text="当前课程还没有知识点，可以先使用 AI 从课程大纲生成候选节点" />}

        <div className="graph-v2-zoom">
          <Button size="small" aria-label="适配画布" icon={<Maximize2 size={13} />} onClick={resetView} />
          <Button size="small" aria-label="放大" icon={<Plus size={13} />} onClick={() => setZoom((value) => Math.min(1.35, value + .1))} />
          <Button size="small" aria-label="缩小" icon={<Minus size={13} />} onClick={() => setZoom((value) => Math.max(.75, value - .1))} />
          <span>{Math.round(zoom * 100)}%</span>
          <Button size="small" aria-label="全屏" icon={<Expand size={13} />} onClick={requestFullscreen} />
        </div>
        <div className="graph-v2-minimap">{graph.nodes.slice(0,12).map((node, index) => <i key={node.id} style={{ left: `${18 + index % 4 * 21}%`, top: `${20 + Math.floor(index / 4) * 27}%` }} />)}</div>
      </main>

      <aside className="graph-v2-detail">
        {selected ? <>
          <div className="graph-v2-detail-head"><span><Link2 size={18} /></span><div><Title level={3}>{selected.name}</Title><Tag color="green">核心知识</Tag></div><Button icon={<Edit3 size={14} />} onClick={openEdit}>编辑</Button><Button type="text" icon={<X size={15} />} /></div>
          <div className="graph-v2-definition"><strong>节点定义</strong><Paragraph>{selected.description || '该知识点是课程知识结构中的核心概念，与多个前置和关联知识相连。'}</Paragraph></div>
          <div className="graph-v2-difficulty"><strong>难易程度</strong><Tag color="gold">{selected.difficulty || '中等'}</Tag></div>
          <div className="graph-v2-related"><div><strong>前置知识（{Math.min(related.length, 2)}）</strong><Button type="link">＋ 添加</Button></div>{related.slice(0,2).map((item) => <span key={item.id}><i className="blue" />{item.name}<small>掌握度 {item.mastery}%</small></span>)}</div>
          <div className="graph-v2-related"><div><strong>关联知识（{related.length}）</strong><Button type="link">＋ 添加</Button></div>{related.slice(0,5).map((item, index) => <span key={item.id}><i className={'r' + index} />{item.name}<small>掌握度 {item.mastery}%</small></span>)}</div>
          <section className="graph-v2-materials">
            <div><strong>关联资料（{selected.materials?.length || 0}）</strong><Button type="link" onClick={() => props.onNavigate('materials')}>管理资料</Button></div>
            {selected.materials?.length ? selected.materials.map((material) => <button key={material.id} onClick={() => setPreviewMaterial(material)}>
              <span><FileText size={16} /></span>
              <span><b title={material.title}>{material.title}</b><small>{material.relation === 'explicit' ? '已导入' : material.relation === 'chapter' ? '章节匹配' : '课程推荐'} · {material.chapter || '课程资料'} · {material.size || material.type.toUpperCase()}</small></span>
              <ExternalLink size={13} />
            </button>) : <div className="graph-v2-material-empty">
              <FileText size={18} /><span>该知识点暂未关联资料</span><Button size="small" onClick={() => props.onNavigate('materials')}>去资料管理导入</Button>
            </div>}
          </section>
          <Button type="primary" size="large" block icon={<Send size={14} />} onClick={() => props.notify('知识图谱已发布')}>发布图谱</Button>
        </> : <EmptyPanel text="选择或创建知识点后查看详情" />}
      </aside>
    </div>

    <Modal title="AI 从大纲提取知识图谱候选" open={aiOpen} onCancel={() => setAiOpen(false)} onOk={confirmCandidates} confirmLoading={aiLoading} okText="确认并创建节点">
      <Alert type="warning" showIcon message="AI 只生成候选节点，教师确认后才写入正式知识图谱。" />
      <Checkbox.Group className="graph-ai-candidates" value={candidateNames} onChange={(values) => setCandidateNames(values as string[])}>
        {candidates.map((item) => <Checkbox key={item.name} value={item.name}><strong>{item.name}</strong><small>{item.description}</small></Checkbox>)}
      </Checkbox.Group>
    </Modal>

    <Modal title="编辑知识点全部信息" open={editOpen} onCancel={() => setEditOpen(false)} onOk={saveNode} okText="保存全部信息">
      <Form form={form} layout="vertical">
        <Form.Item label="知识点名称" name="name" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item label="节点定义" name="description"><Input.TextArea rows={4} /></Form.Item>
        <Row gutter={12}><Col span={12}><Form.Item label="难度" name="difficulty"><Select options={['基础','中等','进阶','挑战'].map((value) => ({ value, label: value }))} /></Form.Item></Col><Col span={12}><Form.Item label="掌握度" name="mastery"><InputNumber min={0} max={100} suffix="%" /></Form.Item></Col></Row>
        <Row gutter={12}><Col span={12}><Form.Item label="横向位置" name="position_x"><InputNumber min={0} max={100} /></Form.Item></Col><Col span={12}><Form.Item label="纵向位置" name="position_y"><InputNumber min={0} max={100} /></Form.Item></Col></Row>
      </Form>
    </Modal>

    <Modal title="添加知识点" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={createNode} okText="创建节点">
      <Form form={form} layout="vertical"><Form.Item label="知识点名称" name="name" rules={[{ required: true }]}><Input /></Form.Item><Form.Item label="节点定义" name="description"><Input.TextArea rows={4} /></Form.Item><Form.Item label="难度" name="difficulty" initialValue="基础"><Select options={['基础','进阶','挑战'].map((value) => ({ value, label: value }))} /></Form.Item></Form>
    </Modal>

    <Modal
      className="graph-material-preview-modal"
      title="知识点关联资料"
      open={!!previewMaterial}
      onCancel={() => setPreviewMaterial(null)}
      footer={previewMaterial?.content_url ? <Button type="primary" href={previewMaterial.content_url} target="_blank" icon={<ExternalLink size={14} />}>打开原资料</Button> : null}
      width={720}
    >
      {previewMaterial && <div className="graph-material-preview">
        <div className="graph-material-preview-head"><span><FileText size={22} /></span><div><strong>{previewMaterial.title}</strong><small>{previewMaterial.chapter || '课程资料'} · {previewMaterial.size || previewMaterial.type.toUpperCase()}</small></div></div>
        {previewMaterial.type === 'pdf' && previewMaterial.content_url
          ? <iframe title={previewMaterial.title} src={previewMaterial.content_url} />
          : <div className="graph-material-preview-body"><CloudDownload size={34} /><strong>{previewMaterial.title}</strong><p>该资料已作为当前知识点的教学证据，可用于备课、课堂讲解和 AI 知识库引用。</p>{!previewMaterial.content_url && <Tag>当前资料暂无在线原文件</Tag>}</div>}
      </div>}
    </Modal>
  </div>
}
