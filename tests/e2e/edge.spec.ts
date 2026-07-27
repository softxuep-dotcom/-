import { chromium, expect, test } from "@playwright/test";

test("Microsoft Edge completes a mouse core flow", async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({
    viewport: { width: 907, height: 510 },
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173/?qa=1&platform=disabled");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const box = await page.locator("#stage-viewport").boundingBox();
  if (!box) throw new Error("Stage viewport is missing.");
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.67);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.96, box.y + box.height * 0.55, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(page.getByText("BELL RUNG!", { exact: true })).toBeVisible({
    timeout: 7_000,
  });
  await context.close();
  await browser.close();
});
