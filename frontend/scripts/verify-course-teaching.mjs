import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";

/**
 * 课程教学（开发方案 §六 6.1 / 6.2）端到端校验。
 *
 * 和 shot-monitor-board.mjs 同一套做法：真起浏览器、真登录、真读接口，
 * 断言页面上出现的是真实数据而不是占位，并把截图留到 docs/evidence。
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

// ---------------------------------------------------------------- §6.1 课程与班级
await page.getByRole("link", { name: /课程教学/ }).click();
await page.getByRole("heading", { name: "课程与班级" }).waitFor({ timeout: 20000 });
await page.locator(".course-class-card").first().waitFor({ timeout: 20000 });
await page.waitForTimeout(500);

await page.screenshot({
  path: path.join(outDir, "teacher-course-classes.png"),
  fullPage: true,
});

const classesProbe = await page.evaluate(() => {
  const cards = [...document.querySelectorAll(".course-class-card")].map((el) => ({
    className: el.querySelector("h2")?.textContent?.trim(),
    course: el.querySelector(".course-class-course")?.textContent?.trim(),
    metrics: [...el.querySelectorAll(".course-class-metrics b")].map((b) =>
      b.textContent?.trim()
    ),
  }));
  return {
    stats: [...document.querySelectorAll(".review-stats .class-stat")].map((el) => ({
      label: el.querySelector("p")?.textContent?.trim(),
      value: el.querySelector("strong")?.textContent?.trim(),
    })),
    cards,
    subNav: [...document.querySelectorAll(".teacher-subnav a")].map((a) =>
      a.textContent?.trim()
    ),
    usesAntdCard: document.querySelectorAll(".course-page .ant-card").length,
  };
});

// 展开学生名单，检查风险等级带规则文字
await page.getByRole("button", { name: /查看学生/ }).first().click();
await page.locator(".course-roster").waitFor({ timeout: 20000 });
await page.locator(".course-roster-row").first().waitFor({ timeout: 20000 });
await page.waitForTimeout(400);

await page.screenshot({
  path: path.join(outDir, "teacher-course-roster.png"),
  fullPage: true,
});

const rosterProbe = await page.evaluate(() => {
  const rows = [...document.querySelectorAll(".course-roster-row")].map((el) => ({
    name: el.querySelector(".course-roster-name strong")?.textContent?.trim(),
    risk: el.querySelector(".course-roster-risk .class-badge")?.textContent?.trim(),
    // §7 可访问性：状态不能只靠颜色，必须有文字说明命中了什么规则
    rules: [...el.querySelectorAll(".course-roster-risk .class-tag-row span")].map((s) =>
      s.textContent?.trim()
    ),
    metrics: [...el.querySelectorAll(".course-roster-metric b")].map((b) =>
      b.textContent?.trim()
    ),
  }));
  return { rowCount: rows.length, rows };
});

// ---------------------------------------------------------------- §6.2 课程大纲
await page.getByRole("link", { name: "课程大纲" }).click();
await page.getByRole("heading", { name: "课程大纲" }).waitFor({ timeout: 20000 });
await page.locator(".syllabus-chapter").first().waitFor({ timeout: 20000 });
await page.waitForTimeout(500);

await page.screenshot({
  path: path.join(outDir, "teacher-course-syllabus.png"),
  fullPage: true,
});

const syllabusProbe = await page.evaluate(() => {
  const chapters = [...document.querySelectorAll(".syllabus-chapter")].map((el) => ({
    order: el.querySelector(".syllabus-order")?.textContent?.trim(),
    title: el.querySelector("h2")?.textContent?.trim(),
    points: [...el.querySelectorAll(".syllabus-point")].map((p) => ({
      name: p.querySelector("strong")?.textContent?.trim(),
      tags: [...p.querySelectorAll(".class-tag-row span")].map((s) => s.textContent?.trim()),
      usage: p.querySelector(".syllabus-point-usage")?.textContent?.trim(),
      // 有引用的知识点删除按钮必须是禁用的，且 title 说明原因
      deleteDisabled: [...p.querySelectorAll("button")].some(
        (b) => /删除/.test(b.textContent ?? "") && b.disabled
      ),
      deleteTitle: [...p.querySelectorAll("button")]
        .find((b) => /删除/.test(b.textContent ?? ""))
        ?.getAttribute("title"),
    })),
  }));
  return {
    stats: [...document.querySelectorAll(".review-stats .class-stat")].map((el) => ({
      label: el.querySelector("p")?.textContent?.trim(),
      value: el.querySelector("strong")?.textContent?.trim(),
    })),
    chapters,
    dragEnabled: document.querySelectorAll('.syllabus-chapter[draggable="true"]').length,
    moveButtons: document.querySelectorAll('button[aria-label="上移章节"]').length,
  };
});

// 真删一次被引用的知识点，确认前端把 409 翻译成人话
const blocked = page
  .locator(".syllabus-point")
  .filter({ hasText: "链表边界处理" })
  .locator("button", { hasText: "删除" });
const blockedDisabled = await blocked.first().isDisabled();

console.log(
  JSON.stringify(
    {
      classes: classesProbe,
      roster: rosterProbe,
      syllabus: syllabusProbe,
      referencedPointDeleteDisabled: blockedDisabled,
      consoleErrors,
    },
    null,
    2
  )
);

await browser.close();
