import { chromium } from "playwright";

/**
 * 资料中心（§七）端到端校验：真登录、真接口、真页面。
 * 只做读和一次「新建 -> 编辑 -> 停用 -> 删除」的自建资料闭环，不动种子资料。
 */
const BASE = "http://localhost:5199";
const OUT = "d:/Office_File/other/CodeTrack/frontend/.resource-check";

const problems = [];
function check(label, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) problems.push(label);
}

/**
 * 轮询等到 count() 等于期望值再断言。
 * 固定 waitForTimeout 会在 React 重渲染之前就把数字读走，
 * 之前「版本记录」和「删除后行数」两处就是这样假失败的。
 */
async function expectCount(locator, expected, label) {
  const deadline = Date.now() + 10000;
  let actual = await locator.count();
  while (actual !== expected && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    actual = await locator.count();
  }
  check(label, actual === expected, `实际 ${actual}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

// 上一次中断的运行可能留下自建资料，先按标题清一遍，否则行数断言全错位
const SEEDED = new Set([
  "kb_linked_list_delete_basic",
  "kb_head_node_delete",
  "kb_empty_list_guard",
  "kb_boundary_test_reasoning",
]);
{
  const headers = { "X-Demo-User-Id": "user_teacher_001" };
  const listed = await fetch(`${BASE}/api/v1/teacher/resources?course_id=course_ds_001&page_size=100`, {
    headers,
  }).then((response) => response.json());
  for (const item of listed.data.items) {
    if (SEEDED.has(item.resource_id)) continue;
    await fetch(`${BASE}/api/v1/teacher/resources/${item.resource_id}`, { method: "DELETE", headers });
    console.log(`（清理上次残留：${item.title}）`);
  }
}

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
// 登录页有演示账号快捷按钮，点它比猜输入框稳
await page.getByRole("button", { name: /王老师 \/ teacher_wang/ }).click();
await page.getByRole("button", { name: /登录/ }).click();
await page.waitForURL(/\/teacher\//, { timeout: 15000 });

await page.getByRole("link", { name: "资料中心" }).click();
await page.waitForURL(/\/teacher\/resources/, { timeout: 10000 });
await page.getByRole("heading", { name: "资料中心", level: 1 }).waitFor({ timeout: 10000 });

// 种子资料应当出现，统计卡与列表同源。
// 注意骨架屏也带 .resource-row，必须排掉 .skeleton-block 才是真数据行
const rows = page.locator(".resource-row:not(.skeleton-block)");
await rows.first().waitFor({ timeout: 10000 });
await page.locator(".resource-row.skeleton-block").first().waitFor({ state: "detached", timeout: 10000 });
check("列表渲染出种子资料", (await rows.count()) === 4, `实际 ${await rows.count()} 行`);
check(
  "「删除头节点时的链表起点更新」在列表里",
  await page.getByText("删除头节点时的链表起点更新").first().isVisible()
);
const totalCard = page.locator(".class-stat", { hasText: "资料总数" });
check("资料总数卡为 4", (await totalCard.textContent())?.includes("4"));
check("章节标签渲染", await page.locator(".resource-tags .chapter").first().isVisible());
check("两个独立开关灯都渲染", (await page.locator(".resource-flags span").count()) >= 8);
await page.screenshot({ path: `${OUT}/01-list.png`, fullPage: true });

// 状态分段：切到「已停用」应为空态
await page.getByRole("button", { name: "已停用", exact: true }).click();
await page.locator(".class-empty").waitFor({ timeout: 8000 });
check("已停用为空态", await page.locator(".class-empty").isVisible());
const statsAfterFilter = await totalCard.textContent();
check("切筛选后统计卡不掉成 0", statsAfterFilter?.includes("4"), statsAfterFilter?.trim());
await page.getByRole("button", { name: "全部", exact: true }).click();
await rows.first().waitFor({ timeout: 8000 });

// 章节筛选与搜索
await page.getByLabel("知识点筛选").selectOption("头节点删除");
await page.waitForTimeout(900);
await expectCount(rows, 1, "知识点筛选收窄到 1 行");
await page.getByLabel("知识点筛选").selectOption("");
await page.waitForTimeout(900);

await page.getByLabel("按标题或摘要搜索资料").fill("空链表");
await page.waitForTimeout(900);
// 搜索同时覆盖标题和摘要：「空链表与非法位置保护」标题命中，
// 「用边界测试验证链表删除」摘要里也有「空链表」，两条都该出现
await expectCount(rows, 2, "搜索命中标题与摘要");
await page.getByLabel("按标题或摘要搜索资料").fill("");
await page.waitForTimeout(900);

// 新建文本资料
await page.getByRole("button", { name: /新建文本资料/ }).click();
const editor = page.locator(".resource-editor");
await editor.waitFor({ timeout: 8000 });
await editor.getByLabel("学生可见").waitFor();
await editor.locator("input").first().fill("E2E 校验资料");
await editor.locator("textarea").first().fill("端到端校验用摘要");
await editor.locator("textarea").nth(1).fill("端到端校验用正文");
await page.screenshot({ path: `${OUT}/02-create.png`, fullPage: true });
await editor.getByRole("button", { name: "创建资料" }).click();
await page.locator(".review-message.success").waitFor({ timeout: 8000 });
check("新建成功提示出现", await page.locator(".review-message.success").isVisible());
await expectCount(rows, 5, "新建后列表变 5 行");

// 编辑并留下版本记录
const mine = page.locator(".resource-row:not(.skeleton-block)", { hasText: "E2E 校验资料" });
await mine.getByRole("button", { name: "编辑" }).click();
await editor.waitFor({ timeout: 8000 });
// 详情要拉一次才有版本记录区块，等它出现再动表单
await editor.locator(".resource-revisions").waitFor({ timeout: 8000 });
await editor.locator("label", { hasText: "标题" }).locator("input").fill("E2E 校验资料（改）");
await editor.locator("label", { hasText: "版本号" }).locator("input").fill("v1.1");
await editor.locator("label", { hasText: "修改说明" }).locator("input").fill("E2E 改标题与版本");
await editor.getByRole("button", { name: "保存修改" }).click();
const revisions = editor.locator(".resource-revisions li");
await expectCount(revisions, 1, "版本记录追加一条");
check("历史版本保留旧标题", (await revisions.first().textContent())?.includes("E2E 校验资料"));
check("引用次数为 0 段落出现", await editor.getByText(/还没有 AI 诊断引用过这条资料/).isVisible());
await page.screenshot({ path: `${OUT}/03-editor-revisions.png`, fullPage: true });
await editor.getByRole("button", { name: "取消" }).click();

// 停用 -> 状态灯与徽标变化
const mine2 = page.locator(".resource-row:not(.skeleton-block)", { hasText: "E2E 校验资料（改）" });
await mine2.getByRole("button", { name: "停用" }).click();
await page.waitForTimeout(1200);
const mine3 = page.locator(".resource-row:not(.skeleton-block)", { hasText: "E2E 校验资料（改）" });
check("徽标变为停用", (await mine3.locator(".resource-badge").textContent())?.includes("停用"));
check(
  "停用后 AI 检索灯灭",
  (await mine3.locator(".resource-flags span.on").count()) <
    (await mine3.locator(".resource-flags span").count())
);
await page.screenshot({ path: `${OUT}/04-disabled.png`, fullPage: true });

// 被引用的种子资料：删除确认里必须提示只能停用
const seeded = page.locator(".resource-row:not(.skeleton-block)", { hasText: "删除头节点时的链表起点更新" });
await seeded.getByRole("button", { name: /删除/ }).click();
await page.locator(".resource-confirm").waitFor({ timeout: 8000 });
const confirmBox = page.locator(".resource-confirm-box");
const warnVisible = await confirmBox.locator("p.warn").isVisible().catch(() => false);
check("被引用资料的确认框给出停用提示", warnVisible);
check(
  "被引用资料的确认删除按钮禁用",
  await confirmBox.getByRole("button", { name: "确认删除" }).isDisabled()
);
await page.screenshot({ path: `${OUT}/05-delete-blocked.png`, fullPage: true });
await confirmBox.getByRole("button", { name: "取消" }).click();

// 删除自建资料，回到 4 行
await mine3.getByRole("button", { name: /删除/ }).click();
await page.locator(".resource-confirm").waitFor({ timeout: 8000 });
await page.locator(".resource-confirm-box").getByRole("button", { name: "确认删除" }).click();
await expectCount(rows, 4, "删除自建资料后回到 4 行");

// 移动端一眼
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
);
check("移动端无横向溢出", !overflow);
await page.screenshot({ path: `${OUT}/06-mobile.png`, fullPage: true });

check("无浏览器控制台报错", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

await browser.close();
console.log(problems.length ? `\n${problems.length} 项未通过` : "\n全部通过");
process.exit(problems.length ? 1 : 0);
