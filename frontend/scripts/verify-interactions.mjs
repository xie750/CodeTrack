import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import ts from 'typescript'
import { chromium } from 'playwright'

// These browser checks use explicit API fixtures; they never mutate a live database.
const baseURL = process.env.INTERACTION_BASE_URL || 'http://127.0.0.1:5174'
const out = new URL('../../artifacts/interaction-audit/', import.meta.url)
await mkdir(out, { recursive: true })
const source = await readFile(new URL('../src/admin/importCsv.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText
const { parseAccountCsv } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const parsed = parseAccountCsv('\uFEFF工号,姓名,邮箱\r\nT9001,"张,老师",test@example.com\r\nT9001,重复,\r\nT1001,已有,\r\nT9002,,\r\nT9003,错误,broken\r\nT9004,"两行\n姓名",\r\n', '教师', ['T1001'])
assert.equal(parsed.rows.length, 2)
assert.equal(parsed.rows[0].姓名, '张,老师')
assert.equal(parsed.rows[1].姓名, '两行\n姓名')
assert.deepEqual(parsed.errors.map((e) => e.line), [3, 4, 5, 6])
assert.throws(() => parseAccountCsv('工号,姓名\nT1,"未闭合', '教师', []))
assert.throws(() => parseAccountCsv('工号,工号,姓名\nT1,T2,姓名', '教师', []))
assert.throws(() => parseAccountCsv('姓名\n张三', '教师', []))
assert.throws(() => parseAccountCsv('工号,姓名\n', '教师', []))
assert.equal(parseAccountCsv('学号,姓名,性别,年级,院系,课程\nS1,张三,男,2026级,人工智能,机器学习\nS2,李四,未知,2026级,人工智能,机器学习', '学生', []).errors.length, 1)
console.log('PASS CSV: BOM, quoted commas/newlines, duplicates, required fields, invalid email/gender/header/quotes, empty data')

const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
page.setDefaultTimeout(20000)
page.setDefaultNavigationTimeout(60000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const student = { id: 'interaction-student', username: 'interaction_student', display_name: '交互测试学生', role: 'STUDENT' }
const course = { course_id: 'course-a', course_name: '机器学习测试课程', teacher_id: 'teacher-a', teacher_name: '测试老师', teaching_assignment_id: 'teaching-a', class_id: 'class-a', class_name: '测试班级', term: '2026 秋季测试学期', task_count: 2, unfinished_count: 1 }
const task = (id, title, status, published, passed) => ({ assignment_id: `assignment-${id}`, task_id: `task-${id}`, course_id: course.course_id, course_name: course.course_name, class_id: course.class_id, class_name: course.class_name, teacher_id: course.teacher_id, teacher_name: course.teacher_name, title, task_type: 'CODING', workspace_type: 'PROGRAMMING', assignment_mode: 'PRACTICE', description: '交互测试任务', published_at: published, start_at: null, deadline: null, difficulty: 'MEDIUM', knowledge_points: ['监督学习'], status, passed_count: passed, total_required_count: 4, highest_hint_level: 0, latest_summary: '' })
const tasks = [task('a', '已完成收藏任务', 'COMPLETED', '2026-01-01', 4), task('b', '待完成收藏任务', 'IN_PROGRESS', '2026-08-01', 1)]
const profile = { student: { id: student.id, name: student.display_name }, course: { id: course.course_id, name: course.course_name }, overview: { overall_progress: 25, recent_task_completion: 50, compile_error_rate: 0, logic_error_rate: 0 }, knowledge_states: [{ knowledge_point: '监督学习', state: 'WEAK', mastery_score: 25 }], frequent_errors: [], recommendations: [] }
let failTasks = false
let joiningAvailable = false
let joinRequests = 0
await context.route('**/api/**', async (route) => {
  const path = new URL(route.request().url()).pathname
  let data = {}
  if (path.endsWith('/auth/me')) data = student
  else if (path.endsWith('/learning-context')) data = { student: { id: student.id, name: student.display_name, class_id: course.class_id, class_name: course.class_name }, courses: [course] }
  else if (path.endsWith('/student/tasks')) {
    if (failTasks) return route.fulfill({ status: 503, json: { error: { code: 'TEST_UNAVAILABLE', message: '测试离线' } } })
    data = tasks
  }
  else if (path.endsWith('/profile')) data = profile
  else if (path.endsWith('/interventions')) data = { summary: { total: 0, unread: 0 }, items: [] }
  else if (path.endsWith('/sessions')) data = []
  else if (path.endsWith('/course-offerings/join')) {
    joinRequests++
    data = { joined: true, learning_context: { student: { id: student.id, name: student.display_name, class_name: course.class_name }, courses: [course] } }
  }
  else if (path.endsWith('/course-offerings')) data = { items: joiningAvailable ? [{ ...course, teaching_assignment_id: 'join-test', course_name: '待加入测试课程', joined: false }] : [] }
  else if (path.endsWith('/models')) data = { items: [] }
  else return route.fulfill({ status: 503, json: { error: { code: 'TEST_UNAVAILABLE', message: '该能力不在本次交互测试范围内' } } })
  return route.fulfill({ json: { data } })
})
try {
  await page.goto(`${baseURL}/admin/users/teachers`)
  await page.getByRole('button', { name: '批量导入', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载导入模板' }).click()
  assert.equal((await downloadPromise).suggestedFilename(), '教师导入模板.csv')
  await page.locator('input[type=file]').setInputFiles({ name: 'teachers.csv', mimeType: 'text/csv', buffer: Buffer.from('工号,姓名,院系,职称,邮箱,手机\nTAUDIT1,交互导入老师,人工智能学院,讲师,teacher@example.com,13800138000\nTAUDIT1,重复老师,,,,\nTAUDIT2,,人工智能学院,,,') })
  await page.getByText('校验完成：有效数据 1 条，异常 2 条（异常行已跳过）', { exact: true }).waitFor()
  await page.getByRole('button', { name: '确认导入 1 条有效数据' }).click()
  await page.getByRole('dialog', { name: '批量导入教师账号' }).waitFor({ state: 'hidden' })
  await page.getByPlaceholder('工号/姓名（空格多关键字）').fill('TAUDIT1')
  await page.getByRole('cell', { name: '交互导入老师', exact: true }).waitFor()
  await page.getByRole('button', { name: '批量导入', exact: true }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'duplicate.csv', mimeType: 'text/csv', buffer: Buffer.from('工号,姓名\nTAUDIT1,重复') })
  const blockedImport = page.getByRole('button', { name: '确认导入 0 条有效数据' })
  await blockedImport.waitFor()
  assert.equal(await blockedImport.isDisabled(), true)
  await page.screenshot({ path: new URL('import-validation.png', out).pathname.replace(/^\/(\w:)/, '$1') })
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  console.log('PASS teacher import: real download, preview, create rows, duplicate existing account, zero-valid disabled')

  await page.goto(`${baseURL}/admin/users/students`)
  await page.getByRole('button', { name: '批量导入', exact: true }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'students.csv', mimeType: 'text/csv', buffer: Buffer.from('学号,姓名,性别,年级,院系,班级,课程\nSAUDIT1,交互导入学生,女,2026级,人工智能,人工智能 1 班,机器学习') })
  await page.getByRole('button', { name: '确认导入 1 条有效数据' }).click()
  await page.getByRole('dialog', { name: '批量导入学生账号' }).waitFor({ state: 'hidden' })
  await page.getByRole('cell', { name: '交互导入学生', exact: true }).waitFor()
  console.log('PASS student import: account fields and visible list update')

  await page.goto(`${baseURL}/admin/system/notices`)
  await page.getByRole('button', { name: '新建公告', exact: true }).click()
  await page.getByLabel('标题', { exact: true }).fill('交互测试公告')
  await page.getByLabel('正文内容').fill('原始正文')
  await page.getByText('全体学生', { exact: true }).last().click()
  await page.getByRole('button', { name: /确\s*定/ }).click()
  await page.getByRole('button', { name: '编辑公告 交互测试公告', exact: true }).click()
  await page.getByLabel('标题', { exact: true }).fill('已修改交互公告')
  await page.getByLabel('正文内容').fill('修改后的正文')
  await page.getByRole('button', { name: /确\s*定/ }).click()
  await page.getByRole('cell', { name: '已修改交互公告', exact: true }).waitFor()
  assert.equal(await page.getByRole('cell', { name: '交互测试公告', exact: true }).count(), 0)
  await page.getByRole('button', { name: '编辑公告 已修改交互公告', exact: true }).click()
  assert.equal(await page.getByLabel('正文内容').inputValue(), '修改后的正文')
  await page.getByRole('button', { name: /取\s*消/ }).click()
  for (let index = 1; index <= 4; index++) {
    await page.getByRole('button', { name: '新建公告', exact: true }).click()
    await page.getByLabel('标题', { exact: true }).fill(`拖拽测试 ${index}`)
    await page.getByLabel('正文内容').fill('用于验证第二页的拖拽定位')
    await page.getByText('全体学生', { exact: true }).last().click()
    await page.getByRole('button', { name: /确\s*定/ }).click()
    await page.getByRole('dialog', { name: '新建公告', exact: true }).waitFor({ state: 'hidden' })
  }
  await page.locator('.ant-pagination-item-2').click()
  const noticeRows = page.locator('tbody tr[data-row-key]')
  const beforeDrag = await noticeRows.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-row-key')))
  assert.equal(beforeDrag.length, 2)
  await noticeRows.first().locator('[draggable]').dragTo(noticeRows.last())
  await page.waitForFunction((before) => document.querySelector('tbody tr[data-row-key]')?.getAttribute('data-row-key') === before[1], beforeDrag)
  await page.locator('.ant-pagination-item-1').click()
  await page.locator('.ant-pagination-item-2').click()
  assert.deepEqual(await noticeRows.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-row-key'))), [...beforeDrag].reverse())
  await page.screenshot({ path: new URL('notice-edited.png', out).pathname.replace(/^\/(\w:)/, '$1') })
  console.log('PASS notices: create, edit, save, reopen, second-page drag survives pagination')

  const token = `test.${Buffer.from(JSON.stringify({ sub: student.id })).toString('base64url')}.test`
  const favorites = tasks.map((item, index) => ({ id: `coding:${item.assignment_id}`, kind: 'CODING_TASK', title: item.title, taskId: item.task_id, assignmentId: item.assignment_id, courseId: course.course_id, courseName: course.course_name, workspaceType: 'PROGRAMMING', taskType: 'CODING', progressPercent: 0, countLabel: '0/4', publishedAt: item.published_at, knowledgePoints: ['监督学习'], createdAt: new Date().toISOString(), updatedAt: index ? '2020-01-01T00:00:00Z' : new Date().toISOString() }))
  await context.addInitScript(({ token, favorites, studentId }) => {
    localStorage.setItem('codetrack.accessToken', token)
    localStorage.setItem(`codetrack.studentFavorites.v1:${studentId}`, JSON.stringify(favorites))
  }, { token, favorites, studentId: student.id })
  await page.goto(`${baseURL}/courses/course-a/favorites`)
  await page.getByRole('heading', { name: '已完成收藏任务', exact: true }).waitFor()
  assert.match(await page.locator('.favorite-card').first().innerText(), /100%/)
  assert.match(await page.locator('.library-donut').evaluate((element) => getComputedStyle(element).backgroundImage), /rgb\(25, 185, 120\) 100%/)
  assert.equal(await page.locator('.library-donut').getAttribute('aria-label'), '收藏分布：编程题 2 道，练习题 0 道，考核题 0 道')
  await page.getByLabel('收藏排序').selectOption('published')
  assert.match(await page.locator('.favorite-card').first().innerText(), /待完成收藏任务/)
  await page.getByRole('button', { name: '最近收藏', exact: true }).click()
  assert.equal(await page.locator('.favorite-card').count(), 1)
  await page.getByPlaceholder('搜索已收藏任务').fill('不存在的搜索')
  await page.getByRole('heading', { name: '没有符合筛选条件的收藏' }).waitFor()
  await page.getByRole('button', { name: '清除筛选', exact: true }).click()
  assert.equal(await page.locator('.favorite-card').count(), 2)
  await page.getByRole('button', { name: '取消收藏 已完成收藏任务', exact: true }).click()
  await page.getByRole('button', { name: '重新收藏 已完成收藏任务', exact: true }).click()
  assert.equal(await page.locator('.favorite-card.faded').count(), 0)
  await page.screenshot({ path: new URL('favorites.png', out).pathname.replace(/^\/(\w:)/, '$1') })
  await page.getByRole('button', { name: '生成个性化学习计划' }).click()
  await page.waitForURL('**/self-study/ai')
  await page.waitForFunction(() => [...document.querySelectorAll('textarea')].some((el) => el.value.includes('已完成收藏任务')))
  console.log('PASS favorites: live progress, sort, recent filter, empty state, reset, AI context')

  await page.goto(`${baseURL}/courses/course-a`)
  await page.getByText('2026 秋季测试学期', { exact: true }).waitFor()
  assert.equal(await page.getByText('教学楼 A305', { exact: true }).count(), 0)
  await page.getByLabel('任务完成率 50%').waitFor()
  await page.screenshot({ path: new URL('course.png', out).pathname.replace(/^\/(\w:)/, '$1') })
  await page.getByRole('button', { name: '打开课程知识图谱' }).click()
  await page.waitForURL('**/courses/course-a/knowledge-map')
  await page.goto(`${baseURL}/tasks`)
  await page.getByText('已完成收藏任务', { exact: true }).first().waitFor()
  await page.goto(`${baseURL}/courses`)
  await page.locator('.student-course-drawer-layer.open').waitFor()
  await page.getByRole('dialog', { name: '学生端新手引导' }).waitFor()
  await page.getByRole('button', { name: '跳过', exact: true }).click()
  await page.goto(`${baseURL}/missing-page`)
  await page.getByRole('heading', { name: '未找到该页面' }).waitFor()
  await page.getByRole('button', { name: '查看课程任务' }).click()
  await page.waitForURL('**/tasks')
  await page.goto(`${baseURL}/workspace`)
  await page.getByRole('heading', { name: '未找到该工作区' }).waitFor()
  await page.goto(`${baseURL}/courses/missing-course`)
  await page.getByRole('heading', { name: '未找到该课程' }).waitFor()
  console.log('PASS routes: task list, course chooser, missing page/workspace recovery; course metrics and knowledge-map entry')

  failTasks = true
  await page.goto(`${baseURL}/courses/course-a/favorites`)
  await page.getByText(/任务进度同步失败/).waitFor()
  await page.getByRole('heading', { name: '已完成收藏任务', exact: true }).waitFor()
  failTasks = false
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await page.waitForFunction(() => !document.body.textContent.includes('任务进度同步失败'))
  assert.match(await page.locator('.favorite-card').first().innerText(), /100%/)
  console.log('PASS API failure: retain favorites, explain stale progress, retry and recover')

  joiningAvailable = true; failTasks = true
  await page.goto(`${baseURL}/courses`)
  await page.locator('.student-course-drawer-layer.open').waitFor()
  await page.getByText('待加入测试课程', { exact: true }).waitFor()
  await page.getByRole('button', { name: '加入', exact: true }).click()
  await page.getByText('已加入 待加入测试课程，任务进度暂未同步，可进入课程后重试。', { exact: true }).waitFor()
  assert.equal(joinRequests, 1)
  console.log('PASS partial course failure: keep course chooser usable, preserve successful join when task refresh fails')
  assert.deepEqual(errors, [], `Uncaught browser errors: ${errors.join('\n')}`)
} catch (error) {
  console.error('PAGE ERRORS', errors)
  console.error('PAGE TEXT', (await page.locator('body').innerText()).slice(0, 2500))
  await page.screenshot({ path: new URL('failure.png', out).pathname.replace(/^\/(\w:)/, '$1') })
  throw error
} finally {
  await browser.close()
}
