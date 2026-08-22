declare module 'd3-force' {
  export interface SimulationNodeDatum {
    index?: number
    x?: number
    y?: number
    vx?: number
    vy?: number
    fx?: number | null
    fy?: number | null
  }

  export interface SimulationLinkDatum<NodeDatum extends SimulationNodeDatum> {
    source: string | NodeDatum
    target: string | NodeDatum
    index?: number
  }

  interface ForceConfig<T> {
    strength(value: number): this
  }

  interface LinkForce<NodeDatum extends SimulationNodeDatum> extends ForceConfig<NodeDatum> {
    id(accessor: (node: NodeDatum) => string): this
    distance(value: number): this
  }

  interface CollisionForce<NodeDatum extends SimulationNodeDatum> {
    radius(value: number): this
    strength(value: number): this
  }

  export interface Simulation<NodeDatum extends SimulationNodeDatum> {
    force(name: string, force: unknown): this
    alpha(): number
    alpha(value: number): this
    alphaTarget(): number
    alphaTarget(value: number): this
    alphaDecay(): number
    alphaDecay(value: number): this
    velocityDecay(): number
    velocityDecay(value: number): this
    restart(): this
    stop(): this
    on(type: 'tick', listener: () => void): this
    nodes(): NodeDatum[]
  }

  export function forceSimulation<NodeDatum extends SimulationNodeDatum>(nodes?: NodeDatum[]): Simulation<NodeDatum>
  export function forceLink<NodeDatum extends SimulationNodeDatum, LinkDatum extends SimulationLinkDatum<NodeDatum>>(links?: LinkDatum[]): LinkForce<NodeDatum>
  export function forceManyBody<NodeDatum extends SimulationNodeDatum>(): ForceConfig<NodeDatum>
  export function forceCenter<NodeDatum extends SimulationNodeDatum>(x?: number, y?: number): unknown
  export function forceCollide<NodeDatum extends SimulationNodeDatum>(): CollisionForce<NodeDatum>
  export function forceX<NodeDatum extends SimulationNodeDatum>(x?: number | ((node: NodeDatum) => number)): ForceConfig<NodeDatum>
  export function forceY<NodeDatum extends SimulationNodeDatum>(y?: number | ((node: NodeDatum) => number)): ForceConfig<NodeDatum>
}
