import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/J/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const outputDir = 'E:/teacher/artifacts'
mkdirSync(outputDir, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const errors = []
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
page.on('pageerror', (error) => errors.push(error.message))

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
await page.screenshot({ path: outputDir + '/portal-desktop.png', fullPage: true })
await page.getByRole('button', { name: '进入工作台' }).click()
await page.waitForTimeout(700)
await page.screenshot({ path: outputDir + '/dashboard-desktop.png', fullPage: true })

const pages = ['我的课程', '课程工作区', '班级管理', '课程大纲', '任务中心', '资料中心', '知识图谱', '任务监控', '批改工作区', '学情诊断', 'AI 审核', '教学改进']
const checks = []
for (const label of pages) {
  await page.getByText(label, { exact: true }).first().click()
  await page.waitForTimeout(180)
  const state = await page.evaluate(() => ({
    title: document.querySelector('.page-heading h2')?.textContent,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    bodyHeight: document.body.scrollHeight,
  }))
  checks.push({ label, ...state })
}
await page.screenshot({ path: outputDir + '/improvement-desktop.png', fullPage: true })

await page.setViewportSize({ width: 390, height: 844 })
await page.reload({ waitUntil: 'networkidle' })
await page.getByRole('button', { name: '进入工作台' }).click()
await page.waitForTimeout(500)
const mobile = await page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  width: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}))
await page.screenshot({ path: outputDir + '/dashboard-mobile.png', fullPage: true })

console.log(JSON.stringify({ checks, mobile, errors }, null, 2))
await browser.close()
