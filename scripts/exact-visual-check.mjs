import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/J/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const outputDir = 'E:/teacher/artifacts/exact'
mkdirSync(outputDir, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1672, height: 941 } })
const errors = []
page.on('console', (message) => {
  const text = message.text()
  if (message.type() === 'error' && !text.includes('deprecated')) errors.push(text)
})
page.on('pageerror', (error) => errors.push(error.message))

const shot = async (name) => page.screenshot({ path: outputDir + '/' + name + '.png', fullPage: false })

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
await shot('01-portal')
await page.getByRole('button', { name: /进入工作台/ }).click()
await page.getByRole('heading', { name: '欢迎回来，王老师' }).waitFor()
await shot('02-dashboard')

await page.getByRole('button', { name: '创建课程' }).click()
await page.getByRole('heading', { name: '创建课程' }).waitFor()
await shot('06-create-basic')
await page.getByRole('button', { name: '下一步' }).click()
await page.getByText('教学章节与内容').waitFor()
await shot('07-create-teaching')
await page.getByRole('button', { name: '下一步' }).click()
await page.getByText('课程创建准备完成').waitFor()
await shot('08-create-finish')

await page.getByText('我的课程', { exact: true }).first().click()
await page.getByRole('heading', { name: '我的课程' }).waitFor()
await shot('03-courses')

await page.getByRole('button', { name: /进入课程/ }).first().click()
await page.getByRole('heading', { name: '数据结构与程序设计基础' }).waitFor()
await page.waitForTimeout(500)
await shot('04-workspace')

await page.getByText('班级管理', { exact: true }).first().click()
await page.getByRole('heading', { name: '班级管理' }).waitFor()
await page.waitForTimeout(300)
await shot('05-classes')

await page.getByRole('button', { name: '邀请学生加入' }).last().click()
await page.getByRole('heading', { name: '邀请学生加入' }).waitFor()
await page.waitForTimeout(300)
await shot('09-invite')

await page.getByText('任务管理', { exact: true }).first().click()
await page.getByRole('heading', { name: '任务管理' }).waitFor()
await page.waitForTimeout(300)
await shot('10-tasks')

await page.getByText('资料管理', { exact: true }).first().click()
await page.getByRole('heading', { name: '教学材料' }).waitFor()
await page.waitForTimeout(300)
await shot('11-materials')

await page.getByText('课程知识图谱', { exact: true }).first().click()
await page.getByRole('heading', { name: '课程知识图谱' }).waitFor()
await page.waitForTimeout(300)
await shot('12-graph')

const result = await page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  width: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth,
}))
console.log(JSON.stringify({ result, errors }, null, 2))
await browser.close()
