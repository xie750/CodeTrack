import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/J/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

const baseURL = 'http://127.0.0.1:5173'
const apiURL = 'http://127.0.0.1:8001/api/v1'
const testTitle = `浏览器验收知识图谱-${Date.now()}`
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const consoleErrors = []
const apiErrors = []
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('response', (response) => { if (response.url().includes('/api/') && response.status() >= 400) apiErrors.push(`${response.status()} ${response.url()}`) })

let createdId = 0
let generatedId = 0
try {
  await page.goto(`${baseURL}/teacher/courses/course-ds/graph`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: '知识图谱', exact: true }).waitFor()
  await page.getByPlaceholder('例如：数据结构课程图谱').fill(testTitle)
  await page.getByPlaceholder('中文逗号、英文逗号或换行分隔').fill('软件工程 1 班，实验班')
  await page.getByRole('button', { name: '新建空白图谱' }).click()
  await page.locator('.kg-canvas canvas').waitFor({ timeout: 10000 })

  const list = await page.request.get(`${apiURL}/teacher/knowledge-graphs`, { headers: { 'X-User-Id': 'teacher-01' } })
  const rows = (await list.json()).data
  createdId = rows.find((item) => item.title === testTitle).id

  await page.getByRole('button', { name: '节点', exact: true }).click()
  await page.getByRole('textbox', { name: '节点名称' }).fill('浏览器验收节点')
  await page.locator('.kg-form .ant-select').first().click()
  await page.getByTitle('方法', { exact: true }).last().click()
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/teacher/knowledge-graphs/') && response.request().method() === 'PUT' && response.ok()),
    page.getByRole('button', { name: '保存草稿' }).click(),
  ])
  await page.getByRole('button', { name: '连接', exact: true }).click()

  const graph = await page.request.get(`${apiURL}/teacher/knowledge-graphs/${createdId}`, { headers: { 'X-User-Id': 'teacher-01' } })
  const payload = (await graph.json()).data
  const nodes = payload.nodes.map((node, index) => index === 1 ? { ...node, label: '浏览器验收节点', type: '方法', color: '#0f766e' } : node)
  const edge = { id: 'edge-browser-check', source: nodes[0].id, target: nodes[1].id, type: '前驱', label: '前驱' }
  const saved = await page.request.put(`${apiURL}/teacher/knowledge-graphs/${createdId}`, { headers: { 'X-User-Id': 'teacher-01' }, data: { ...payload, nodes, edges: [edge] } })
  if (!saved.ok()) throw new Error(`API save failed: ${saved.status()} ${await saved.text()}`)

  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.kg-graph-list button.active').waitFor()
  const restoredResponse = await page.request.get(`${apiURL}/teacher/knowledge-graphs/${createdId}`, { headers: { 'X-User-Id': 'teacher-01' } })
  const restored = (await restoredResponse.json()).data
  if (restored.nodes.length !== 2 || restored.edges.length !== 1 || restored.nodes[1].type !== '方法') throw new Error('Persistence assertion failed')

  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith(`/teacher/knowledge-graphs/${createdId}/publish`) && response.ok()),
    page.getByRole('button', { name: '发布', exact: true }).click(),
  ])
  const published = (await (await page.request.get(`${apiURL}/teacher/knowledge-graphs/${createdId}`, { headers: { 'X-User-Id': 'teacher-01' } })).json()).data
  if (published.status !== 'published') throw new Error('Publish assertion failed')

  const canvas = page.locator('.kg-canvas canvas')
  await canvas.waitFor()
  const canvasPixels = await canvas.evaluate((element) => {
    const context = element.getContext('2d')
    const image = context.getImageData(0, 0, element.width, element.height).data
    let colored = 0
    for (let index = 0; index < image.length; index += 40) if (image[index + 3] && (image[index] < 245 || image[index + 1] < 245 || image[index + 2] < 245)) colored++
    return { width: element.width, height: element.height, colored }
  })
  if (canvasPixels.colored < 100) throw new Error('Canvas appears blank')

  const layouts = []
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1100, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await page.waitForTimeout(250)
    layouts.push(await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth, columns: getComputedStyle(document.querySelector('.kg-layout')).gridTemplateColumns })))
  }
  if (layouts.some((item) => item.documentWidth > item.width + 1)) throw new Error(`Horizontal overflow: ${JSON.stringify(layouts)}`)

  await page.request.delete(`${apiURL}/teacher/knowledge-graphs/${createdId}`, { headers: { 'X-User-Id': 'teacher-01' } })
  createdId = 0
  await page.setViewportSize({ width: 1440, height: 900 })
  const generatedTitle = `资料生成验收-${Date.now()}`
  await page.getByPlaceholder('例如：数据结构课程图谱').fill(generatedTitle)
  await page.locator('input[type=file]').setInputFiles({ name: 'algorithm-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('排序算法\n快速排序方法\n递归步骤\n算法复杂度\n综合项目实践\n能力目标') })
  await page.getByRole('button', { name: '分析并生成图谱' }).click()
  await page.locator('.kg-canvas canvas').waitFor()
  const generatedRows = (await (await page.request.get(`${apiURL}/teacher/knowledge-graphs`, { headers: { 'X-User-Id': 'teacher-01' } })).json()).data
  generatedId = generatedRows.find((item) => item.title === generatedTitle).id
  const generated = (await (await page.request.get(`${apiURL}/teacher/knowledge-graphs/${generatedId}`, { headers: { 'X-User-Id': 'teacher-01' } })).json()).data
  if (generated.node_count < 6 || generated.source_files[0]?.filename !== 'algorithm-notes.txt') throw new Error('File generation assertion failed')
  await page.screenshot({ path: 'artifacts/knowledge-graph-check-desktop.png', fullPage: true })
  await page.request.delete(`${apiURL}/teacher/knowledge-graphs/${generatedId}`, { headers: { 'X-User-Id': 'teacher-01' } })
  generatedId = 0
  console.log(JSON.stringify({ passed: true, restored: { nodes: restored.nodes.length, edges: restored.edges.length }, fileGeneration: { nodes: generated.node_count, edges: generated.edge_count, source: generated.source_files[0].filename }, canvasPixels, layouts, apiErrors, consoleErrors }, null, 2))
} finally {
  if (createdId) await page.request.delete(`${apiURL}/teacher/knowledge-graphs/${createdId}`, { headers: { 'X-User-Id': 'teacher-01' } }).catch(() => {})
  if (generatedId) await page.request.delete(`${apiURL}/teacher/knowledge-graphs/${generatedId}`, { headers: { 'X-User-Id': 'teacher-01' } }).catch(() => {})
  await browser.close()
}
