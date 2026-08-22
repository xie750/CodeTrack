import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/J/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1672, height: 941 } })
const failures = []
page.on('response', (response) => {
  if (response.status() >= 400) failures.push({ url: response.url(), status: response.status() })
})
await page.goto('http://127.0.0.1:8000/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /进入工作台/ }).click()
await page.getByRole('heading', { name: '欢迎回来，王老师' }).waitFor()
const state = await page.evaluate(() => ({
  title: document.title,
  heading: document.querySelector('h2')?.textContent,
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
}))
console.log(JSON.stringify({ state, failures }, null, 2))
await browser.close()
