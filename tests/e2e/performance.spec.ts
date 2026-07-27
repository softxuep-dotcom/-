import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

test("low-tier portrait grand finale stays within the rendering budget", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 Chrome/138 Mobile Safari/537.36",
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "deviceMemory", {
      configurable: true,
      get: () => 4,
    });
  });
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      problems.push(`${response.status()} ${response.url()}`);
  });

  await page.goto("/?qa=1&platform=disabled");
  await page.evaluate(() => {
    localStorage.setItem(
      "fling-fiasco-save",
      JSON.stringify({
        version: 1,
        unlockedLevel: 12,
        levels: {
          "1": {
            stars: 3,
            bestTime: 2,
            bestFlings: 1,
            bestPoints: 2200,
          },
        },
        settings: {
          music: false,
          effects: false,
          language: "en",
          reducedMotion: false,
        },
      }),
    );
  });
  await page.reload();
  await expect(page.locator("#loading-screen")).toBeHidden();
  await expect(page.locator("#goal-label")).toHaveText("Grand Fiasco");
  await page.waitForTimeout(800);

  const readMetrics = () =>
    page.evaluate(() =>
      (
        window as unknown as {
          __FF_DIAGNOSTICS__: {
            getMetrics: () => {
              fps: number;
              drawCalls: number;
              triangles: number;
              dpr: number;
              geometries: number;
              textures: number;
            };
          };
        }
      ).__FF_DIAGNOSTICS__.getMetrics(),
    );

  const initial = await readMetrics();
  for (let retry = 0; retry < 12; retry += 1) {
    await page.keyboard.press("r");
    await expect(page.locator("#goal-label")).toHaveText("Grand Fiasco");
  }
  await page.waitForTimeout(500);
  const afterRebuilds = await readMetrics();
  expect(afterRebuilds.geometries).toBeLessThanOrEqual(initial.geometries + 2);
  expect(afterRebuilds.textures).toBeLessThanOrEqual(initial.textures + 1);

  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.keyboard.press("Space");
  await page.waitForTimeout(4_000);
  const metrics = await readMetrics();
  await mkdir("artifacts/performance", { recursive: true });
  await writeFile(
    "artifacts/performance/low-tier-grand-fiasco.json",
    `${JSON.stringify(
      {
        profile: "Android-class 4 GB, 390x844, DPR 2 device, 4x CPU throttle",
        initial,
        afterRebuilds,
        active: metrics,
        recordedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await page.screenshot({
    path: "artifacts/screenshots/390x844-grand-fiasco-low-tier.png",
  });

  expect(metrics.fps).toBeGreaterThanOrEqual(30);
  expect(metrics.drawCalls).toBeLessThanOrEqual(80);
  expect(metrics.triangles).toBeLessThanOrEqual(8_000);
  expect(metrics.dpr).toBeLessThanOrEqual(1);
  expect(problems).toEqual([]);
  await context.close();
});
