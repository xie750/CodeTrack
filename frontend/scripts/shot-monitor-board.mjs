import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";

const url = process.env.CODETRACK_FRONTEND_URL ?? "http://127.0.0.1:5174";
const apiOrigin = process.env.CODETRACK_API_ORIGIN ?? "";
const outDir = path.resolve(process.cwd(), "../docs/evidence");

/**
 * 把 /api 请求改投到指定后端。
 * vite.config.ts 里的代理目标是写死的 8000，本机 8000 被别的实例占着时用这个绕开，
 * 不改共享的 vite 配置。
 */
async function routeApi(target) {
  if (!apiOrigin) return;
  await target.route("**/api/**", (route) => {
    const next = route.request().url().replace(new URL(url).origin, apiOrigin);
    route.continue({ url: next });
  });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await routeApi(context);
const page = await context.newPage();

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

await fs.mkdir(outDir, { recursive: true });

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /王老师/ }).click();
await page.getByRole("button", { name: /^登录$/ }).click();

await page.getByRole("link", { name: /任务监控/ }).click();
await page.getByRole("heading", { name: "提交进度看板" }).waitFor({ timeout: 20000 });
// 等首屏数据到位，而不是等固定时间
await page.getByText("总人数").waitFor({ timeout: 20000 });
await page.waitForTimeout(600);

await page.screenshot({ path: path.join(outDir, "teacher-monitor-board.png"), fullPage: true });

const probe = await page.evaluate(() => {
  const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;
  const stats = [...document.querySelectorAll(".monitor-stats .class-stat")].map((el) => ({
    label: el.querySelector("p")?.textContent?.trim(),
    value: el.querySelector("strong")?.textContent?.trim(),
    note: el.querySelector("em")?.textContent?.trim(),
    clickable: el.tagName === "BUTTON",
  }));
  return {
    taskTitle: text(".monitor-task-title h2"),
    scoreNote: text(".monitor-task-note"),
    statCount: stats.length,
    stats,
    rowCount: document.querySelectorAll(".monitor-row").length,
    selects: [...document.querySelectorAll(".monitor-filters .review-select")].map(
      (el) => el.options[el.selectedIndex]?.text
    ),
    hasAntd: Boolean(document.querySelector('[class*="ant-"]')),
    gaps: document.querySelectorAll(".monitor-gaps li").length,
    // 横向滚动是 UI 回归的常见症状
    scrollX:
      document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});

// 点"逾期"卡片，验证卡片即筛选入口且计数不跟着筛选变
const before = probe.stats.find((s) => s.label === "总人数")?.value;
await page.getByRole("button", { name: /逾期/ }).first().click();
await page.waitForTimeout(900);
const afterTotal = await page.evaluate(
  () =>
    document
      .querySelector(".monitor-stats .class-stat strong")
      ?.textContent?.trim() ?? null
);
await page.screenshot({
  path: path.join(outDir, "teacher-monitor-board-overdue.png"),
  fullPage: true,
});

console.log(
  JSON.stringify(
    { ...probe, totalBefore: before, totalAfterOverdueFilter: afterTotal, consoleErrors },
    null,
    2
  )
);

// 移动端一遍，确认六列概览会退化而不是溢出
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
await routeApi(mobile);
const mpage = await mobile.newPage();
await mpage.goto(url, { waitUntil: "domcontentloaded" });
await mpage.getByRole("button", { name: /王老师/ }).click();
await mpage.getByRole("button", { name: /^登录$/ }).click();
// 移动端侧栏是收起的，点不到导航链接，直接走 URL
await mpage.waitForURL(/\/teacher\//, { timeout: 20000 });
await mpage.goto(`${url}/teacher/monitor`, { waitUntil: "domcontentloaded" });
await mpage.getByText("总人数").waitFor({ timeout: 20000 });
await mpage.waitForTimeout(600);
const mobileScrollX = await mpage.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth
);
await mpage.screenshot({
  path: path.join(outDir, "teacher-monitor-board-mobile.png"),
  fullPage: true,
});
console.log(JSON.stringify({ mobileScrollX }, null, 2));

await browser.close();
