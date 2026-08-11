import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

interface EChartProps {
  option: echarts.EChartsOption
  height?: number
  style?: React.CSSProperties
}

// ECharts 轻量封装：自动初始化 / resize / 销毁
export default function EChart({ option, height = 260, style }: EChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!ref.current) return
    chartRef.current = echarts.init(ref.current)
    const onResize = () => chartRef.current?.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      chartRef.current?.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, true)
  }, [option])

  return <div ref={ref} style={{ width: '100%', height, ...style }} />
}
