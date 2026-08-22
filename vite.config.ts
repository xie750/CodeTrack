import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const dependencyPath = (relativePath: string) => decodeURIComponent(
  new URL(relativePath, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
)

export default defineConfig(({ mode }) => {
  const apiPort = mode === 'legacy' ? 8000 : 8001

  return {
    plugins: [react()],
    resolve: {
      alias: {
        'd3-force': dependencyPath('./node_modules/.pnpm/d3-force@3.0.0/node_modules/d3-force/src/index.js'),
        'd3-dispatch': dependencyPath('./node_modules/.pnpm/d3-dispatch@3.0.1/node_modules/d3-dispatch/src/index.js'),
        'd3-quadtree': dependencyPath('./node_modules/.pnpm/d3-quadtree@3.0.1/node_modules/d3-quadtree/src/index.js'),
        'd3-timer': dependencyPath('./node_modules/.pnpm/d3-timer@3.0.1/node_modules/d3-timer/src/index.js'),
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  }
})
