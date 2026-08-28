import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(scriptDir, '..')
const frontendDir = join(rootDir, 'frontend')
const mode = process.argv.includes('--backend-only')
  ? 'backend'
  : process.argv.includes('--student-backend-only')
    ? 'student-backend'
    : process.argv.includes('--teacher-backend-only')
      ? 'teacher-backend'
  : process.argv.includes('--frontend-only')
    ? 'frontend'
    : 'all'

const pythonCandidates = [
  process.env.CODETRACK_PYTHON,
  join(rootDir, '.venv', 'Scripts', 'python.exe'),
  join(rootDir, '.venv', 'bin', 'python'),
  'D:/Anaconda/python.exe',
  'python',
].filter(Boolean)

const python = pythonCandidates.find((candidate) => candidate === 'python' || existsSync(candidate))
if (!python && mode !== 'frontend') {
  throw new Error('Python runtime not found. Set CODETRACK_PYTHON.')
}

const children = []

async function isHealthy(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
    return response.ok
  } catch {
    return false
  }
}

async function startStudentBackend() {
  if (await isHealthy('http://127.0.0.1:8000/health')) {
    console.log('Reusing running student backend on http://127.0.0.1:8000')
    return
  }
  const child = spawn(
    python,
    ['-m', 'uvicorn', 'backend.app.main:app', '--host', '127.0.0.1', '--port', '8000'],
    {
      cwd: rootDir,
      stdio: 'inherit',
      shell: false,
    },
  )
  child.on('exit', (code) => {
    if (code) console.error('Student backend exited with code', code)
  })
  children.push(child)
}

async function startTeacherBackend() {
  if (await isHealthy('http://127.0.0.1:8001/api/v1/health')) {
    console.log('Reusing running teacher backend on http://127.0.0.1:8001')
    return
  }
  const child = spawn(
    python,
    ['-m', 'uvicorn', 'teacher_backend.app.main:app', '--host', '127.0.0.1', '--port', '8001'],
    {
      cwd: rootDir,
      stdio: 'inherit',
      shell: false,
    },
  )
  child.on('exit', (code) => {
    if (code) console.error('Teacher backend exited with code', code)
  })
  children.push(child)
}

function startFrontend() {
  const viteBin = join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js')
  if (!existsSync(viteBin)) {
    throw new Error('Vite is not installed. Run npm install in frontend first.')
  }
  const child = spawn(
    process.execPath,
    [viteBin, '--host', '127.0.0.1', '--port', '5173'],
    {
      cwd: frontendDir,
      stdio: 'inherit',
      shell: false,
      env: {
        ...process.env,
        VITE_BACKEND_TARGET: process.env.VITE_BACKEND_TARGET ?? 'http://127.0.0.1:8000',
        VITE_TEACHER_BACKEND_TARGET: process.env.VITE_TEACHER_BACKEND_TARGET ?? 'http://127.0.0.1:8001',
        VITE_TEACHER_API_BASE: process.env.VITE_TEACHER_API_BASE ?? '/api/v1',
      },
    },
  )
  child.on('exit', (code) => {
    if (code) console.error('Frontend exited with code', code)
  })
  children.push(child)
}

if (mode === 'all' || mode === 'backend' || mode === 'student-backend') await startStudentBackend()
if (mode === 'all' || mode === 'backend' || mode === 'teacher-backend') await startTeacherBackend()
if (mode === 'all' || mode === 'frontend') startFrontend()

if (mode === 'all' || mode === 'backend' || mode === 'student-backend') {
  console.log('CodeTrack Student API: http://127.0.0.1:8000/health')
}
if (mode === 'all' || mode === 'backend' || mode === 'teacher-backend') {
  console.log('CodeTrack Teacher API: http://127.0.0.1:8001/api/v1/health')
}
if (mode === 'all' || mode === 'frontend') console.log('CodeTrack UI:          http://127.0.0.1:5173/')

function stop() {
  for (const child of children) {
    if (!child.killed) child.kill()
  }
}

process.on('SIGINT', () => {
  stop()
  process.exit(0)
})
process.on('SIGTERM', () => {
  stop()
  process.exit(0)
})
