const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const ss = (name) => page.screenshot({ path: path.join(__dirname, 'screenshots', name), fullPage: false });
  const dw = () => page.locator('.ant-drawer-body');

  // Login
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.fill('input', 'admin');
  await page.click('button:has-text("登")');
  await page.waitForTimeout(2000);
  await page.waitForSelector('text=工作台', { timeout: 10000 });
  await ss('01-dashboard.png'); console.log('01 ✓');

  // Open personal center from dropdown
  await page.locator('.header-user').click(); await page.waitForTimeout(500);
  await page.click('text=个人中心'); await page.waitForTimeout(1200);
  await ss('02-personal-center.png'); console.log('02 ✓');

  // Account & Security
  await dw().locator('text=账号与安全').click(); await page.waitForTimeout(1000);
  await ss('03-account-security.png'); console.log('03 ✓');

  // Change phone flow
  await dw().locator('button:has-text("更换")').first().click(); await page.waitForTimeout(1000);
  await ss('04-change-phone-verify.png'); console.log('04 ✓');

  // Send code & fill
  const sendBtns = dw().locator('button:has-text("发送验证码")');
  if (await sendBtns.first().isVisible().catch(() => false)) await sendBtns.first().click();
  await page.waitForTimeout(500);

  // Find the first code input (identity verification)
  const allInputs = dw().locator('input');
  const inputCount = await allInputs.count();
  // The identity verification code input should be the one in step 0
  let found = false;
  for (let i = 0; i < inputCount; i++) {
    const ph = await allInputs.nth(i).getAttribute('placeholder');
    if (ph && ph.includes('验证码')) {
      await allInputs.nth(i).fill('123456');
      found = true;
      break;
    }
  }
  if (!found) console.log('WARN: no code input found');
  await page.waitForTimeout(300);
  await ss('05-code-filled.png'); console.log('05 ✓');

  // Click verify button
  const verifyBtn = dw().locator('button:has-text("验证")');
  if (await verifyBtn.isVisible()) await verifyBtn.click();
  await page.waitForTimeout(1000);

  // Step 2: new phone number
  const newPhoneInput = dw().locator('input[placeholder*="新手机"]');
  if (await newPhoneInput.isVisible().catch(() => false)) {
    await newPhoneInput.fill('13912345678');
    await page.waitForTimeout(300);
  }
  // Fill new phone verification code
  const smsCodeInput = dw().locator('input[placeholder*="短信"]');
  if (await smsCodeInput.isVisible().catch(() => false)) {
    await smsCodeInput.fill('123456');
    await page.waitForTimeout(300);
  }
  await ss('06-bind-new-phone.png'); console.log('06 ✓');

  // Confirm binding
  const confirmBtn = dw().locator('button:has-text("确认绑定")');
  if (await confirmBtn.isVisible().catch(() => false)) {
    await confirmBtn.click();
    await page.waitForTimeout(1000);
  }
  await ss('07-done.png'); console.log('07 ✓');

  // Navigate back to main view
  // Click back arrow buttons until we reach main view
  for (let i = 0; i < 5; i++) {
    const backBtn = dw().locator('button').filter({ hasText: '' }).first();
    const arrowBtn = page.locator('.ant-drawer-body .lucide-arrow-left, .ant-drawer-body [data-icon]').first();
    // simpler: click any button with an SVG inside that looks like back
    const anyBack = page.locator('.ant-drawer-body button').filter({ has: page.locator('svg') }).first();
    if (await anyBack.isVisible({ timeout: 300 }).catch(() => false)) {
      await anyBack.click();
      await page.waitForTimeout(600);
    } else {
      break;
    }
  }

  await page.waitForTimeout(500);

  // Re-open personal center for other views
  await page.locator('.header-user').click(); await page.waitForTimeout(500);
  await page.click('text=个人中心'); await page.waitForTimeout(1000);

  // Login devices
  try {
    await dw().locator('text=登录设备管理').click({ timeout: 3000 });
    await page.waitForTimeout(1000);
    await ss('08-devices.png'); console.log('08 ✓');
    // back
    const backBtn = page.locator('.ant-drawer-body button').first();
    if (await backBtn.isVisible()) { await backBtn.click(); await page.waitForTimeout(600); }
  } catch (e) { console.log('08 skipped:', e.message.slice(0, 50)); }

  // Help & feedback
  try {
    await dw().locator('text=帮助与反馈').click({ timeout: 3000 });
    await page.waitForTimeout(1000);
    await ss('09-feedback.png'); console.log('09 ✓');
  } catch (e) { console.log('09 skipped:', e.message.slice(0,50)); }

  await ss('10-final.png'); console.log('10 ✓');
  console.log('\n✅ Done!');
  await browser.close();
})();
