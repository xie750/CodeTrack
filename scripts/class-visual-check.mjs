import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/J/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /进入工作台/ }).click()
await page.getByText('我的课程', { exact: true }).first().click()
await page.getByRole('button', { name: /进入课程/ }).first().click()
await page.getByText('班级管理', { exact: true }).first().click()
await page.getByRole('heading', { name: '班级管理' }).waitFor()
await page.waitForTimeout(600)
const state = await page.evaluate(() => ({
  rows: document.querySelectorAll('.class-v2-list > article').length,
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  rightPanelWidth: document.querySelector('.class-v2-detail')?.getBoundingClientRect().width,
}))
await page.screenshot({ path: 'E:/teacher/artifacts/exact/class-2560.png', fullPage: false })
console.log(JSON.stringify({ state, errors }, null, 2))
await browser.close()
