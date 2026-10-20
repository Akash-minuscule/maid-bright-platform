import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';

// Run against npm run web, or an exported build with POC_STATIC_DIR=dist.
const staticRoot = process.env.POC_STATIC_DIR ? resolve(process.env.POC_STATIC_DIR) : null;
const base = staticRoot ? 'http://maidbright.poc' : process.env.POC_URL || 'http://localhost:8081';
const launch = {
  headless: true,
  args: process.env.CHROMIUM_ARGS ? JSON.parse(process.env.CHROMIUM_ARGS) : ['--no-sandbox'],
};
if (process.env.CHROMIUM_EXECUTABLE_PATH)
  launch.executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
if (staticRoot) {
  const mime = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.ttf': 'font/ttf',
    '.svg': 'image/svg+xml',
  };
  await page.route(`${base}/**`, async (route) => {
    const requested = decodeURIComponent(new URL(route.request().url()).pathname);
    let path = resolve(staticRoot, `.${requested}`);
    if (!path.startsWith(`${staticRoot}/`) && path !== staticRoot)
      return route.fulfill({ status: 403 });
    if (requested === '/' || !extname(requested)) path = join(staticRoot, 'index.html');
    try {
      await route.fulfill({
        status: 200,
        contentType: mime[extname(path)] || 'application/octet-stream',
        body: await readFile(path),
      });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
}
const visible = async (text) =>
  page
    .getByText(text, { exact: true })
    .filter({ visible: true })
    .first()
    .waitFor({ state: 'visible' });
const button = (name) => page.getByRole('button', { name, exact: true });
const tap = async (name) => button(name).click();
const tab = async (name) => page.getByRole('tab', { name, exact: true }).click();
const back = async () => page.getByRole('link', { name: /, back$/ }).click();
const snapshot = async (name) => {
  if (process.env.QA_SCREENSHOT_DIR) {
    await mkdir(process.env.QA_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({
      path: join(process.env.QA_SCREENSHOT_DIR, `${name}.png`),
      fullPage: false,
    });
  }
};
const step = (message) => console.log(`PASS ${message}`);
try {
  await page.goto(base);
  await tap('Explore the demo');
  await visible('Hello, Alex.');
  await snapshot('home');
  step('demo entry and dashboard');
  await tap('View appointment');
  await tap('Reschedule cleaning');
  await page
    .getByRole('button', { name: /^Select .*Dallas time$/ })
    .first()
    .click();
  await snapshot('reschedule');
  await tap('Review request');
  await tap('Confirm request');
  await visible('You are all set');
  await tap('Back to appointments');
  await visible('Your cleanings');
  assert.equal(
    await page.getByRole('tab', { includeHidden: true }).count(),
    5,
    'Return uses the existing tab navigator',
  );
  step('reschedule and confirmation');
  await tab('Profile');
  await tap('POC controls');
  await page.getByRole('switch', { name: 'Staff review for changes', exact: true }).check();
  await back();
  await tab('Appointments');
  await page
    .getByRole('button', { name: /^View Standard Home Cleaning on/ })
    .first()
    .click();
  await tap('Skip this visit');
  await tap('Review request');
  await tap('Confirm request');
  await visible('Request received');
  step('pending review path');
  await tap('Back to appointments');
  await tab('Profile');
  await tap('POC controls');
  await tap('Approve skip visit');
  await visible('Approved. The appointment has been updated.');
  await back();
  await tab('Appointments');
  await button('Past & changes').click();
  await visible('Skipped');
  step('staff approval and skipped history');
  await button('Upcoming').click();
  await page
    .getByRole('button', { name: /^View Standard Home Cleaning on/ })
    .first()
    .click();
  await tap('Add a service');
  await page.getByRole('checkbox', { name: 'Carpet cleaning, $75.00', exact: true }).click();
  await snapshot('services');
  await tap('Review request');
  await tap('Confirm request');
  await visible('Request received');
  await tap('Back to appointments');
  step('additional-service request');
  await tab('Payments');
  await button('View invoice MB-2026-1042').click();
  await tap('Pay with saved demo method');
  await snapshot('payment');
  await tap('Confirm demo payment · $165.00');
  await visible('Payment complete');
  await tap('Back to payments');
  await visible('$0.00');
  step('payment and receipt');
  await tab('Messages');
  await page.getByLabel('Your message', { exact: true }).fill('Please focus on the kitchen.');
  await tap('Send demo reply');
  await visible('Your reply was added to the demo conversation.');
  await visible('Please focus on the kitchen.');
  step('local reply');
  await tab('Profile');
  await tap('Your home');
  await page.getByLabel('Home access instructions', { exact: true }).fill('Please ring twice.');
  await tap('Save home instructions');
  await visible('Your home instructions have been updated in the demo.');
  await back();
  await tap('Communication preferences');
  await page.getByRole('switch', { name: 'Text messages', exact: true }).uncheck();
  await tap('Save preferences');
  await visible('Your demo preferences have been saved.');
  await back();
  step('profile instructions and preferences');
  await tap('POC controls');
  await page.getByRole('switch', { name: 'Simulate offline', exact: true }).check();
  await back();
  await tab('Home');
  await visible('Hello, Alex.');
  assert.ok(
    await page
      .getByText(/Offline preview/)
      .filter({ visible: true })
      .first()
      .isVisible(),
  );
  step('offline cached dashboard');
  await tab('Profile');
  await tap('POC controls');
  await page.getByRole('switch', { name: 'Simulate offline', exact: true }).uncheck();
  await back();
  await snapshot('profile');
  await tap('Sign out of demo');
  await tap('Confirm sign out');
  await button('Explore the demo').waitFor({ state: 'visible' });
  await tap('Explore the demo');
  await visible('Hello, Alex.');
  await tab('Payments');
  await visible('$165.00');
  step('logout clears session data');
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const sizes = await page.evaluate(() => ({
      viewport: window.innerWidth,
      content: document.documentElement.scrollWidth,
    }));
    assert.ok(sizes.content <= sizes.viewport, `Horizontal overflow at ${width}px`);
  }
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('; ')}`);
  step('responsive widths and no browser exceptions');
} catch (error) {
  await snapshot('failed');
  console.log({ browserErrors: errors });
  console.log(
    await page.locator('a, [role="tab"], [role="button"], [role="switch"]').evaluateAll((nodes) =>
      nodes.map((n) => ({
        role: n.getAttribute('role'),
        name: n.getAttribute('aria-label'),
        text: n.textContent?.slice(0, 80),
      })),
    ),
  );
  throw error;
} finally {
  await browser.close();
}
