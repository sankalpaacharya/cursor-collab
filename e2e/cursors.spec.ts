import { test, expect, type Page } from '@playwright/test';

const MANY = Number(process.env.E2E_USERS ?? 5);

async function joinRoom(page: Page, room: string): Promise<void> {
  await page.goto(`/?room=${room}`);
  await expect(page.locator('.status-connected')).toBeVisible({ timeout: 15_000 });
}

test('two users see each other in the same room', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const alice = await ctxA.newPage();
  const bob = await ctxB.newPage();

  await joinRoom(alice, 'e2e-pair');
  await joinRoom(bob, 'e2e-pair');

  await expect(alice.locator('.userlist .count')).toHaveText('2');
  await expect(bob.locator('.userlist .count')).toHaveText('2');

  await ctxA.close();
  await ctxB.close();
});

test("one user's cursor move shows up on the other's screen", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const alice = await ctxA.newPage();
  const bob = await ctxB.newPage();

  await joinRoom(alice, 'e2e-move');
  await joinRoom(bob, 'e2e-move');

  const aliceCursorOnBob = bob.locator('.workspace .cursor');
  await expect(aliceCursorOnBob).toHaveCount(1);
  const positionBefore = await aliceCursorOnBob.getAttribute('style');

  const box = await alice.locator('.workspace').boundingBox();
  if (!box) throw new Error('workspace not found');
  await alice.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await alice.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.65, { steps: 5 });

  await expect
    .poll(() => aliceCursorOnBob.getAttribute('style'), { timeout: 10_000 })
    .not.toBe(positionBefore);

  await ctxA.close();
  await ctxB.close();
});

test(`${MANY} users all appear in the same room`, async ({ browser }) => {
  const room = 'e2e-many';
  const contexts = [];
  const pages: Page[] = [];

  for (let i = 0; i < MANY; i += 1) {
    const ctx = await browser.newContext();
    contexts.push(ctx);
    const page = await ctx.newPage();
    pages.push(page);
    await joinRoom(page, room);
  }

  for (const page of pages) {
    await expect(page.locator('.userlist .count')).toHaveText(String(MANY), { timeout: 20_000 });
  }

  for (const ctx of contexts) await ctx.close();
});
