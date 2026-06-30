import { test, expect, type Page } from '@playwright/test';

test('multiple cursors moving (visual demo)', async ({ browser }) => {
  test.skip(!process.env.DEMO, 'visual demo, run with DEMO=1 (see test:e2e:demo)');
  test.setTimeout(90_000);

  const room = 'demo';
  const count = 3;
  const pages: Page[] = [];

  for (let i = 0; i < count; i += 1) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`/?room=${room}`);
    await expect(page.locator('.status-connected')).toBeVisible({ timeout: 15_000 });
    pages.push(page);
  }

  const boxes = await Promise.all(pages.map((p) => p.locator('.workspace').boundingBox()));

  const steps = 90;
  const loops = 5;
  for (let i = 0; i < steps; i += 1) {
    const t = (i / steps) * Math.PI * 2 * loops;
    await Promise.all(
      pages.map((page, idx) => {
        const box = boxes[idx];
        if (!box) return Promise.resolve();
        const phase = (idx / count) * Math.PI * 2;
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        const r = Math.min(box.width, box.height) * 0.3;
        return page.mouse.move(cx + Math.cos(t + phase) * r, cy + Math.sin(t + phase) * r);
      }),
    );
    await pages[0].waitForTimeout(16);
  }
});
