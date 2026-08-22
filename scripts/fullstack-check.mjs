import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/J/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const outputDir = 'E:/teacher/artifacts/fullstack'
mkdirSync(outputDir, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1672, height: 941 } })
const consoleErrors = []
const apiErrors = []
const apiCalls = []

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(error.message))
page.on('response', (response) => {
  if (response.url().includes('/api/v1/')) {
    apiCalls.push({ method: response.request().method(), url: response.url(), status: response.status() })
    if (response.status() >= 400) apiErrors.push({ url: response.url(), status: response.status() })
  }
})

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
await page.screenshot({ path: outputDir + '/01-portal.png', fullPage: true })
await page.getByRole('button', { name: /进入工作台/ }).click()
await page.getByRole('heading', { name: '欢迎回来，王老师' }).waitFor()
await page.screenshot({ path: outputDir + '/02-dashboard.png', fullPage: true })

await page.getByText('我的课程', { exact: true }).first().click()
await page.getByRole('heading', { name: '我的课程' }).waitFor()
await page.screenshot({ path: outputDir + '/03-courses.png', fullPage: true })

await page.getByRole('button', { name: /进入课程/ }).first().click()
await page.getByText('课程工作空间首页', { exact: true }).waitFor()
await page.screenshot({ path: outputDir + '/04-workspace.png', fullPage: true })

await page.getByText('班级管理', { exact: true }).first().click()
await page.getByRole('heading', { name: '班级管理' }).waitFor()
await page.screenshot({ path: outputDir + '/05-classes.png', fullPage: true })

await page.getByRole('button', { name: '邀请学生加入' }).last().click()
await page.getByRole('heading', { name: '邀请学生加入' }).waitFor()
await page.screenshot({ path: outputDir + '/09-invite.png', fullPage: true })

await page.getByText('任务管理', { exact: true }).first().click()
await page.getByRole('heading', { name: '任务管理' }).waitFor()
await page.screenshot({ path: outputDir + '/10-tasks.png', fullPage: true })
await page.getByRole('button', { name: '模拟学生提交并进入教师监控' }).click()
await page.getByRole('heading', { name: '任务监控' }).waitFor()

await page.getByText('资料管理', { exact: true }).first().click()
await page.getByRole('heading', { name: '教学材料' }).waitFor()
await page.screenshot({ path: outputDir + '/11-materials.png', fullPage: true })

await page.getByText('课程知识图谱', { exact: true }).first().click()
await page.getByRole('heading', { name: '课程知识图谱' }).waitFor()
await page.screenshot({ path: outputDir + '/12-graph.png', fullPage: true })

await page.getByText('学情分析', { exact: true }).first().click()
await page.getByRole('heading', { name: '学情分析' }).waitFor()

const layout = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  heading: document.querySelector('h2')?.textContent,
}))

console.log(JSON.stringify({
  layout,
  apiCallCount: apiCalls.length,
  apiMutations: apiCalls.filter((item) => item.method !== 'GET'),
  apiErrors,
  consoleErrors,
}, null, 2))
await browser.close()
