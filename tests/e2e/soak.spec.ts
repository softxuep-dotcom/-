import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function flingTutorial(page: Page) {
  const stage = page.locator("#stage-viewport");
  const base = {
    pointerId: 31,
    pointerType: "touch",
    isPrimary: true,
    button: 0,
    buttons: 1,
  };
  await stage.dispatchEvent("pointerdown", {
    ...base,
    clientX: 60,
    clientY: 590,
  });
  await stage.dispatchEvent("pointermove", {
    ...base,
    clientX: 360,
    clientY: 535,
  });
  await stage.dispatchEvent("pointerup", {
    ...base,
    buttons: 0,
    clientX: 360,
    clientY: 535,
  });
}

test("@soak ten-minute production-browser gameplay soak", async ({ page }) => {
  test.setTimeout(660_000);
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400)
      problems.push(`${response.status()} ${response.url()}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?qa=1&platform=mock");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#loading-screen")).toBeHidden();

  const startedAt = Date.now();
  const requestedDuration = Number(process.env.SOAK_DURATION_MS ?? 600_000);
  const durationMs =
    Number.isFinite(requestedDuration) && requestedDuration >= 10_000
      ? requestedDuration
      : 600_000;
  let cycles = 0;
  let victories = 0;
  let failures = 0;
  let reloads = 0;
  let pauses = 0;
  let minFps = Number.POSITIVE_INFINITY;
  let maxGeometries = 0;
  let maxTextures = 0;

  while (Date.now() - startedAt < durationMs) {
    if (cycles > 0 && cycles % 12 === 0) {
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await expect(page.locator("#loading-screen")).toBeHidden();
      reloads += 1;
    }
    if (cycles > 0 && cycles % 7 === 0) {
      await page.getByRole("button", { name: "Pause" }).click();
      await expect(
        page.getByRole("dialog", { name: "INTERMISSION" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Resume" }).click();
      await expect(page.locator("#modal-layer")).toBeHidden();
      pauses += 1;
    }

    await flingTutorial(page);
    const victory = page.getByText("BELL RUNG!", { exact: true });
    const failure = page.getByText("STUNT BUSTED", { exact: true });
    await expect(victory.or(failure)).toBeVisible({ timeout: 8_000 });
    if (await victory.isVisible()) victories += 1;
    else failures += 1;

    const metrics = await page.evaluate(() =>
      (
        window as unknown as {
          __FF_DIAGNOSTICS__: {
            getMetrics: () => {
              fps: number;
              geometries: number;
              textures: number;
            };
          };
        }
      ).__FF_DIAGNOSTICS__.getMetrics(),
    );
    minFps = Math.min(minFps, metrics.fps);
    maxGeometries = Math.max(maxGeometries, metrics.geometries);
    maxTextures = Math.max(maxTextures, metrics.textures);

    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.locator("#modal-layer")).toBeHidden();
    cycles += 1;
  }

  const result = {
    durationMs: Date.now() - startedAt,
    cycles,
    victories,
    failures,
    reloads,
    pauses,
    minFps,
    maxGeometries,
    maxTextures,
    problems,
    completedAt: new Date().toISOString(),
  };
  await mkdir("artifacts/performance", { recursive: true });
  await writeFile(
    "artifacts/performance/ten-minute-soak.json",
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8",
  );
  expect(result.durationMs).toBeGreaterThanOrEqual(durationMs);
  expect(victories).toBeGreaterThan(0);
  expect(problems).toEqual([]);
});
