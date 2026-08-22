import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/J/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

const baseUrl = process.env.CODETRACK_UI_URL || 'http://127.0.0.1:5174'
const outputDir = 'E:/teacher/artifacts/backend-integration-check'
mkdirSync(outputDir, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const crossEndRequests = []
const apiErrors = []

page.on('request', (request) => {
  const url = request.url()
  if (url.includes('/api/v1/student/') || /\/api\/v1\/classes\/[^/]+\/join/.test(url)) crossEndRequests.push(url)
})
page.on('response', (response) => {
  if (response.url().includes('/api/v1/') && response.status() >= 400) apiErrors.push({ status: response.status(), url: response.url() })
})

await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' })
await page.locator('.exact-login-demo-list button').first().click()
await page.getByRole('button', { name: /进入工作台/ }).click()
await page.getByRole('heading', { name: /欢迎回来/ }).waitFor()

await page.goto(`${baseUrl}/teacher/courses/course-ds/content`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: '查看学生视角' }).click()
const localPreviewVisible = await page.getByText('学生端预览').isVisible()
await page.keyboard.press('Escape')

await page.goto(`${baseUrl}/teacher/courses/course-ds/invite`, { waitUntil: 'networkidle' })
const csvButtonVisible = await page.getByRole('button', { name: '选择 CSV 文件' }).isVisible()
await page.screenshot({ path: `${outputDir}/teacher-invite.png`, fullPage: true })

await page.goto(`${baseUrl}/join/ABC12345`, { waitUntil: 'networkidle' })
const reservedPageVisible = await page.getByRole('heading', { name: '学生端暂未启用' }).isVisible()
await page.screenshot({ path: `${outputDir}/reserved-student-entry.png`, fullPage: true })
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(`${baseUrl}/join/ABC12345`, { waitUntil: 'networkidle' })
const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
await page.screenshot({ path: `${outputDir}/reserved-student-entry-mobile.png`, fullPage: true })

const result = { localPreviewVisible, csvButtonVisible, reservedPageVisible, mobileOverflow, crossEndRequests, apiErrors }
console.log(JSON.stringify(result, null, 2))
await browser.close()

if (!localPreviewVisible || !csvButtonVisible || !reservedPageVisible || mobileOverflow || crossEndRequests.length || apiErrors.length) process.exit(1)
