import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'

const pythonCandidates = [
  process.env.CODETRACK_PYTHON,
  'D:/Anaconda/python.exe',
  'python',
].filter(Boolean)
const python = pythonCandidates.find((candidate) => candidate === 'python' || existsSync(candidate))
if (!python) throw new Error('Python runtime not found. Set CODETRACK_PYTHON.')

const backend = spawn(python, ['-m', 'uvicorn', 'teacher_backend.app.main:app', '--host', '127.0.0.1', '--port', '8001'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: false,
})
const frontend = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: false,
})

console.log('CodeTrack API: http://127.0.0.1:8001/api/v1/health')
console.log('CodeTrack UI:  http://127.0.0.1:5173/')

const stop = () => {
  backend.kill()
  frontend.kill()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
backend.on('exit', (code) => {
  if (code) console.error('Backend exited with code', code)
})
frontend.on('exit', (code) => {
  if (code) console.error('Frontend exited with code', code)
})
