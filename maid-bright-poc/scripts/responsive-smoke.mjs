import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
const staticRoot = process.env.POC_STATIC_DIR ? resolve(process.env.POC_STATIC_DIR) : null;
const base = staticRoot ? 'https://maidbright.poc' : process.env.POC_URL || 'http://localhost:8081';
const launch = {
  headless: true,
  args: process.env.CHROMIUM_ARGS ? JSON.parse(process.env.CHROMIUM_ARGS) : ['--no-sandbox'],
};
if (process.env.CHROMIUM_EXECUTABLE_PATH)
  launch.executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
const browser = await chromium.launch(launch);
const sizes = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 1000 },
];
try {
  for (const size of sizes) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
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
    const visible = (text) =>
      page
        .getByText(text, { exact: true })
        .filter({ visible: true })
        .first()
        .waitFor({ state: 'visible' });
    const button = (name) => page.getByRole('button', { name, exact: true });
    const tap = (name) => button(name).click();
    const tab = (name) => page.getByRole('tab', { name, exact: true }).click();
    const back = () => page.getByRole('link', { name: /, back$/ }).click();
    const overflow = async (label) => {
      const result = await page.evaluate(() => ({
        viewport: innerWidth,
        content: document.documentElement.scrollWidth,
        scrolls: [...document.querySelectorAll('[data-testid]')]
          .filter((n) => n.clientWidth > 0)
          .map((n) => ({ id: n.dataset.testid, width: n.clientWidth, scroll: n.scrollWidth })),
      }));
      assert.ok(result.content <= result.viewport + 1, `${size.name}: ${label} page overflows`);
      for (const node of result.scrolls)
        assert.ok(node.scroll <= node.width + 1, `${size.name}: ${label} ${node.id} overflows`);
    };
    const picture = async (name) => {
      if (process.env.QA_SCREENSHOT_DIR) {
        await mkdir(process.env.QA_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({
          path: join(process.env.QA_SCREENSHOT_DIR, `${size.name}-${name}.png`),
        });
      }
    };
    const grid = async (id) => {
      const boxes = await page
        .getByTestId(id)
        .locator(':scope > div')
        .evaluateAll((nodes) =>
          nodes.slice(0, 2).map((n) => {
            const r = n.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width };
          }),
        );
      assert.equal(boxes.length, 2);
      if (size.name === 'mobile')
        assert.ok(
          boxes[1].y > boxes[0].y && Math.abs(boxes[0].x - boxes[1].x) < 2,
          'Phone content is stacked',
        );
      else
        assert.ok(
          Math.abs(boxes[0].y - boxes[1].y) < 2 && boxes[1].x > boxes[0].x,
          'Wide content is in two columns',
        );
    };
    try {
      await page.goto(base);
      await tap('Log in');
      await visible('Welcome back.');
      await overflow('login');
      await picture('login');
      await page.getByLabel('Email address', { exact: true }).fill('alex.morgan@example.com');
      await page.getByLabel('Password', { exact: true }).fill('wrong-password');
      await tap('Log in to demo account');
      await visible('Email or password does not match a demo account.');
      await tap('Create an account');
      await visible('A fresh start begins here.');
      const email = `${size.name}.taylor@example.com`;
      for (const [label, value] of [
        ['First name', 'Taylor'],
        ['Last name', 'Reed'],
        ['Email address', email],
        ['Phone number', '5550103030'],
        ['Password', 'SamplePass123!'],
        ['Confirm password', 'DifferentPass123!'],
      ])
        await page.getByLabel(label, { exact: true }).fill(value);
      await tap('Create demo account');
      await visible('The passwords do not match.');
      await page.getByLabel('Confirm password', { exact: true }).fill('SamplePass123!');
      await overflow('signup');
      await picture('signup');
      await tap('Create demo account');
      await visible('Hello, Taylor.');
      await grid('dashboard-grid');
      await overflow('dashboard');
      await picture('home');
      const homeTab = await page.getByRole('tab', { name: 'Home', exact: true }).boundingBox();
      if (size.name === 'desktop')
        assert.ok(homeTab.x < 225 && homeTab.y < size.height / 2, 'Desktop sidebar is on the left');
      else assert.ok(homeTab.y > size.height - 100, 'Mobile/tablet navigation is at the bottom');
      await tab('Appointments');
      await visible('Your cleanings');
      await grid('appointments-grid');
      await overflow('appointments');
      await picture('appointments');
      await page
        .getByRole('button', { name: /^View Standard Home Cleaning on/ })
        .first()
        .click();
      await overflow('appointment detail');
      await tap('Add a service');
      await page.getByRole('checkbox', { name: 'Carpet cleaning, $75.00', exact: true }).click();
      await overflow('additional services');
      await picture('services');
      await back();
      await back();
      await tab('Payments');
      await grid('invoices-grid');
      await overflow('payments');
      await picture('payments');
      await tab('Messages');
      await overflow('messages');
      await tab('Profile');
      await grid('profile-grid');
      await overflow('profile');
      await picture('profile');
      await tap('Sign out of demo');
      await tap('Confirm sign out');
      await tap('Log in');
      await page.getByLabel('Email address', { exact: true }).fill(email);
      await page.getByLabel('Password', { exact: true }).fill('SamplePass123!');
      await tap('Log in to demo account');
      await visible('Hello, Taylor.');
      await page.setViewportSize({
        width: size.name === 'mobile' ? 844 : size.name === 'tablet' ? 1180 : 1024,
        height: size.name === 'mobile' ? 390 : 820,
      });
      await overflow('rotated/resized dashboard');
      assert.deepEqual(errors, [], `${size.name} browser exceptions`);
      console.log(
        `PASS ${size.name} (${size.width}×${size.height}): authentication, grids, navigation, customer screens, and resize`,
      );
    } catch (error) {
      await picture('failure');
      console.log({ size: size.name, url: page.url(), browserErrors: errors });
      throw error;
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
