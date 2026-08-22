import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/J/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1672, height: 941 } })
const uploadResponses = []
page.on('response', (response) => {
  if (response.url().includes('/teacher/materials/upload')) {
    uploadResponses.push({ status: response.status(), method: response.request().method() })
  }
})
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /进入工作台/ }).click()
await page.getByText('我的课程', { exact: true }).first().click()
await page.getByRole('button', { name: /进入课程/ }).first().click()
await page.getByText('资料管理', { exact: true }).first().click()
await page.getByRole('heading', { name: '教学材料' }).waitFor()
const fileInputs = page.locator('input[type="file"]')
await fileInputs.first().setInputFiles('teacher_backend/tests/fixtures/sample-material.txt')
await page.getByText('资料文件已上传到后端并完成持久化').waitFor()
await page.getByText('sample-material.txt').waitFor()
console.log(JSON.stringify({ uploadResponses, visible: true }, null, 2))
await browser.close()

