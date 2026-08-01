import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";

/**
 * 教学首页（开发方案 §五）视觉与结构验证。
 *
 * 与 shot-monitor-board.mjs 同一套做法：真机渲染 + 结构探针，确认页面用的是学生端
 * 设计系统的控件类名而不是 AntD 默认卡片，并且六张概览卡片都能点。
 */

const url = process.env.CODETRACK_FRONTEND_URL ?? "http://127.0.0.1:5174";
const apiOrigin = process.env.CODETRACK_API_ORIGIN ?? "";
const outDir = path.resolve(process.cwd(), "../docs/evidence");

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

await page.getByRole("heading", { name: "教学首页" }).waitFor({ timeout: 20000 });
// 等首屏聚合数据到位，而不是等固定时间
await page.getByText("班级人数").waitFor({ timeout: 20000 });
await page.waitForTimeout(600);

await page.screenshot({ path: path.join(outDir, "teacher-dashboard.png"), fullPage: true });

const probe = await page.evaluate(() => {
  const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;
  return {
    heroLine: text(".teacher-hero .hero-copy p"),
    contextSelects: [...document.querySelectorAll(".teacher-context select")].map(
      (el) => el.options[el.selectedIndex]?.text ?? null
    ),
    stats: [...document.querySelectorAll(".teacher-stat")].map((el) => ({
      label: el.querySelector("em")?.textContent?.trim(),
      value: el.querySelector("strong")?.textContent?.trim(),
      clickable: el.tagName === "BUTTON" && !el.disabled,
    })),
    taskRows: document.querySelectorAll(".teacher-task-row").length,
    todoItems: document.querySelectorAll(".teacher-todo").length,
    trendBars: document.querySelectorAll(".teacher-trend-col").length,
    rankRows: document.querySelectorAll(".teacher-rank li").length,
    // 「标记已处理」必须是禁用态并带原因，不能给假成功
    markDisabled: [...document.querySelectorAll(".teacher-todo-actions .text-link")].every(
      (el) => el.disabled && Boolean(el.title)
    ),
    // 教师端和学生端必须是同一套视觉语言：本页不该出现 AntD 默认卡片
    antdNodes: document.querySelectorAll('[class*="ant-card"], [class*="ant-statistic"]').length,
    scrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});

// 切换班级后数据必须同步刷新（§四）
const classSelect = page.locator(".teacher-context select").nth(2);
const optionCount = await classSelect.locator("option").count();
let switched = null;
if (optionCount > 1) {
  const before = await page.locator(".teacher-stat strong").first().textContent();
  await classSelect.selectOption({ index: 1 });
  await page.waitForTimeout(1200);
  switched = {
    beforeStudentCount: before?.trim() ?? null,
    afterClass: await page.locator(".teacher-context select").nth(2).inputValue(),
    afterHero: (await page.locator(".teacher-hero .hero-copy p").textContent())?.trim() ?? null,
  };
  await page.screenshot({
    path: path.join(outDir, "teacher-dashboard-switched-class.png"),
    fullPage: true,
  });
}

console.log(JSON.stringify({ probe, switched, consoleErrors }, null, 2));

await browser.close();
