import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/J/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

const outputDir = 'E:/teacher/artifacts/operation-manual'
mkdirSync(outputDir, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})

const results = []
const apiErrors = []
const consoleErrors = []

async function openApp(viewport) {
  const page = await browser.newPage({ viewport })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const value = message.text()
    if (!value.includes('deprecated')) consoleErrors.push(value)
  })
  page.on('response', (response) => {
    if (response.url().includes('/api/v1/') && response.status() >= 400) {
      apiErrors.push({ status: response.status(), url: response.url() })
    }
  })
  return page
}

async function enterTeacherWorkspace(page) {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
  const enter = page.getByRole('button', { name: /进入工作台/ })
  if (await enter.isVisible()) await enter.click()
  await page.getByRole('heading', { name: /欢迎回来，王老师/ }).waitFor()
}

async function inspect(page, name, heading, screenshot) {
  await page.getByRole('heading', { name: heading }).first().waitFor()
  await page.waitForTimeout(350)
  const layout = await page.evaluate(() => ({
    path: window.location.pathname,
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }))
  results.push({ name, ...layout })
  if (screenshot) await page.screenshot({ path: `${outputDir}/${screenshot}.png`, fullPage: true })
}

const desktop = await openApp({ width: 1440, height: 900 })
await enterTeacherWorkspace(desktop)
await inspect(desktop, '教师工作台', /欢迎回来，王老师/, '01-dashboard-desktop')

await desktop.goto('http://127.0.0.1:5173/teacher/courses', { waitUntil: 'networkidle' })
await inspect(desktop, '我的课程', '我的课程', '02-courses-desktop')

await desktop.goto('http://127.0.0.1:5173/teacher/courses/course-ds/content', { waitUntil: 'networkidle' })
await inspect(desktop, '课程章节内容', '课程章节内容', '03-content-desktop')
await desktop.getByRole('button', { name: '查看学生视角' }).click()
await desktop.getByText('学生端预览').waitFor()
results.push({ name: '章节学生端预览', visible: true })
await desktop.keyboard.press('Escape')

await desktop.goto('http://127.0.0.1:5173/teacher/courses/course-ds/classes', { waitUntil: 'networkidle' })
await inspect(desktop, '班级管理', '班级管理')
results.push({ name: '班级卡片', count: await desktop.locator('.class-v2-list > article').count() })

await desktop.goto('http://127.0.0.1:5173/teacher/courses/course-ds/invite', { waitUntil: 'networkidle' })
await inspect(desktop, '邀请学生', '邀请学生加入')

await desktop.goto('http://127.0.0.1:5173/teacher/courses/course-ds/tasks', { waitUntil: 'networkidle' })
await inspect(desktop, '任务管理', '任务管理', '04-tasks-desktop')
results.push({ name: '任务卡片', count: await desktop.locator('.task-v2-list > article').count() })

await desktop.goto('http://127.0.0.1:5173/teacher/courses/course-ds/grading', { waitUntil: 'networkidle' })
await inspect(desktop, '学生成绩', '学生成绩', '05-grading-desktop')

await desktop.goto('http://127.0.0.1:5173/teacher/courses/course-ds/materials', { waitUntil: 'networkidle' })
await inspect(desktop, '教学材料', '教学材料', '06-materials-desktop')

await desktop.goto('http://127.0.0.1:5173/teacher/courses/course-ds/graph', { waitUntil: 'networkidle' })
await inspect(desktop, '课程知识图谱', '课程知识图谱', '07-graph-desktop')
results.push({ name: '知识图谱画布', visible: await desktop.getByLabel('课程知识图谱交互画布').isVisible() })

await desktop.goto('http://127.0.0.1:5173/teacher/courses/course-ds/analytics', { waitUntil: 'networkidle' })
await inspect(desktop, '学情分析', '学情分析', '08-analytics-desktop')
await desktop.getByText('个体诊断', { exact: true }).click()
await desktop.getByPlaceholder('搜索姓名或学号').waitFor()
results.push({ name: '个体诊断', visible: true })

const mobile = await openApp({ width: 390, height: 844 })
await enterTeacherWorkspace(mobile)
await inspect(mobile, '手机端工作台', /欢迎回来，王老师/, '09-dashboard-mobile')
await mobile.goto('http://127.0.0.1:5173/teacher/courses/course-ds/content', { waitUntil: 'networkidle' })
await inspect(mobile, '手机端章节内容', '课程章节内容', '10-content-mobile')

console.log(JSON.stringify({
  passed: results.every((item) => item.overflow !== true && item.visible !== false && item.count !== 0),
  results,
  apiErrors,
  consoleErrors,
}, null, 2))

await desktop.close()
await mobile.close()
await browser.close()
