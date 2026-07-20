import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const targetUrl = process.env.CODETRACK_FRONTEND_URL ?? "http://127.0.0.1:5174";
const evidenceDir = path.resolve(process.cwd(), "../docs/evidence");

async function ensureAppAvailable(page) {
  const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  if (!response || !response.ok()) {
    throw new Error(`Frontend unavailable at ${targetUrl}`);
  }
  await page.getByText("CodeTrack").first().waitFor({ timeout: 15000 });
}

async function viewportMetrics(page) {
  return page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    clientWidth: document.documentElement.clientWidth,
    clientHeight: document.documentElement.clientHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    canScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    canScrollY: document.documentElement.scrollHeight > document.documentElement.clientHeight
  }));
}

async function runDesktopFlow(page) {
  await ensureAppAvailable(page);
  await page.getByRole("button", { name: /填入错误示例/ }).click();
  await page.getByRole("button", { name: /^提交$/ }).click();
  await page.getByText("LINKED_LIST_HEAD_UPDATE_ERROR").waitFor({ timeout: 45000 });
  await page.getByText("RULE_FALLBACK").waitFor({ timeout: 15000 });
  await page.screenshot({ path: path.join(evidenceDir, "student-workspace-after-diagnosis.png"), fullPage: true });

  const hintsPanel = page.getByText("渐进提示").first();
  await hintsPanel.click();
  const levelTwo = page.getByRole("button", { name: "申请二级提示" });
  if (await levelTwo.isEnabled()) {
    await levelTwo.click();
  }
  await page.getByText("第 2 级提示").waitFor({ timeout: 15000 });
  await page.screenshot({ path: path.join(evidenceDir, "student-workspace-after-level2-hint.png"), fullPage: true });

  await page.getByRole("tab", { name: "教师查看" }).click();
  await page.getByText("过程时间线").waitFor({ timeout: 15000 });
  const timeline = page.locator(".ant-timeline").first();
  await timeline.getByText("EXECUTION_FINISHED").first().waitFor({ timeout: 15000 });
  await timeline.getByText("DIAGNOSIS_READY").first().waitFor({ timeout: 15000 });
  await page.screenshot({ path: path.join(evidenceDir, "teacher-timeline.png"), fullPage: true });
}

async function runMobilePass(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  await ensureAppAvailable(page);
  await page.getByText("学生工作台").waitFor({ timeout: 15000 });
  await page.getByText("单链表指定位置节点删除").waitFor({ timeout: 30000 });
  await page.getByText("代码编辑").waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: /^提交$/ }).waitFor({ timeout: 30000 });
  const metrics = await viewportMetrics(page);
  await page.screenshot({ path: path.join(evidenceDir, "mobile-initial.png"), fullPage: true });
  await context.close();
  return metrics;
}

async function main() {
  await fs.mkdir(evidenceDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const report = {
    targetUrl,
    generatedAt: new Date().toISOString(),
    checks: [],
    desktopMetrics: null,
    mobileMetrics: null,
    screenshots: [
      "docs/evidence/student-workspace-after-diagnosis.png",
      "docs/evidence/student-workspace-after-level2-hint.png",
      "docs/evidence/teacher-timeline.png",
      "docs/evidence/mobile-initial.png"
    ]
  };

  await runDesktopFlow(page);
  report.desktopMetrics = await viewportMetrics(page);
  report.checks.push("desktop student flow reached RULE_FALLBACK diagnosis");
  report.checks.push("level 2 progressive hint displayed");
  report.checks.push("teacher timeline displayed execution event");
  report.checks.push("teacher timeline displayed diagnosis event");

  await context.close();
  report.mobileMetrics = await runMobilePass(browser);
  report.checks.push("mobile initial task workspace loaded");
  await browser.close();

  await fs.writeFile(path.join(evidenceDir, "qa-report.json"), JSON.stringify(report, null, 2), "utf-8");
  console.log(`Evidence written to ${evidenceDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
