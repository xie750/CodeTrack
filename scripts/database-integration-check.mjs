import assert from 'node:assert/strict'
import { chromium } from 'file:///C:/Users/J/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const baseUrl = 'http://127.0.0.1:5173'
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const screenshot = 'E:/teacher/artifacts/database-integration-browser.png'

const browser = await chromium.launch({ headless: true, executablePath: chrome })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
const results = []

async function resetSession() {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle' })
}

try {
  await resetSession()
  await page.getByRole('button', { name: /林老师.*T2024002/ }).waitFor()
  assert.equal(await page.getByRole('button', { name: /王老师.*T2024001/ }).count(), 1)
  assert.equal(await page.getByRole('button', { name: /林老师.*T2024002/ }).count(), 1)
  await page.getByRole('button', { name: /林老师.*T2024002/ }).click()
  await page.getByRole('heading', { name: '你好，林老师' }).waitFor()
  await page.getByRole('button', { name: /进入工作台/ }).click()
  await page.getByRole('heading', { name: '欢迎回来，林老师' }).waitFor()
  await page.getByText('Python 数据分析', { exact: true }).first().waitFor()
  results.push('数据库双账号与林老师课程自动选择：通过')

  await resetSession()
  await page.getByRole('button', { name: /王老师.*T2024001/ }).click()
  await page.getByRole('heading', { name: '你好，王老师' }).waitFor()
  await page.getByRole('button', { name: /进入工作台/ }).click()
  await page.getByRole('heading', { name: '欢迎回来，王老师' }).waitFor()

  await page.goto(`${baseUrl}/teacher/courses/new`, { waitUntil: 'networkidle' })
  const courseName = page.getByLabel('课程名称')
  await courseName.fill('数据库接入浏览器测试草稿')
  await page.getByRole('button', { name: '保存草稿' }).first().click()
  await page.getByText('已自动保存草稿').waitFor()
  await page.reload({ waitUntil: 'networkidle' })
  assert.equal(await page.getByLabel('课程名称').inputValue(), '数据库接入浏览器测试草稿')
  results.push('课程草稿保存与刷新恢复：通过')

  await page.goto(`${baseUrl}/teacher/courses/course-ds/workspace`, { waitUntil: 'networkidle' })
  const unread = page.locator('.workspace-announcements .workspace-list-row.is-unread').first()
  await unread.waitFor()
  const announcementTitle = (await unread.locator('strong').innerText()).replace('置顶', '').trim()
  const announcementData = await page.evaluate(async () => {
    const response = await fetch('/api/v1/teacher/courses/course-ds/announcements', { headers: { 'X-User-Id': 'teacher-01' } })
    return (await response.json()).data
  })
  const announcementId = announcementData.find((item) => !item.read)?.id
  await unread.click()
  await page.locator('.announcement-detail').waitFor()
  await page.reload({ waitUntil: 'networkidle' })
  const persistedAnnouncement = page.locator('.workspace-announcements .workspace-list-row', { hasText: announcementTitle })
  await persistedAnnouncement.waitFor()
  assert.match(await persistedAnnouncement.getAttribute('class'), /is-read/)
  results.push('课程公告已读状态刷新保持：通过')

  await page.goto(`${baseUrl}/teacher/settings`, { waitUntil: 'networkidle' })
  const switches = page.getByRole('switch')
  await switches.nth(2).waitFor()
  const originalPreference = await page.evaluate(async () => {
    const response = await fetch('/api/v1/teacher/preferences', { headers: { 'X-User-Id': 'teacher-01' } })
    return (await response.json()).data
  })
  const originalEmailDigest = await switches.nth(2).isChecked()
  await switches.nth(2).click()
  await page.getByRole('button', { name: '保存偏好' }).click()
  await page.getByText('通知与 AI 偏好已写入数据库').waitFor()
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('switch').nth(2).waitFor()
  assert.equal(await page.getByRole('switch').nth(2).isChecked(), !originalEmailDigest)
  results.push('教师偏好保存与刷新恢复：通过')

  await page.screenshot({ path: screenshot, fullPage: true })

  await page.evaluate(async ({ originalPreference }) => {
    await fetch('/api/v1/teacher/course-draft', { method: 'DELETE', headers: { 'X-User-Id': 'teacher-01' } })
    await fetch('/api/v1/teacher/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'teacher-01' },
      body: JSON.stringify({
        notifications_enabled: originalPreference.notifications_enabled,
        ai_assistant_enabled: originalPreference.ai_assistant_enabled,
        email_digest: originalPreference.email_digest,
      }),
    })
  }, { originalPreference })

  console.log(JSON.stringify({ results, announcementId, screenshot }, null, 2))
} finally {
  await browser.close()
}
