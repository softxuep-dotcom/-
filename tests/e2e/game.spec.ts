import { expect, test, type Page } from "@playwright/test";

const screenshots = "artifacts/screenshots";

async function stageBox(page: Page) {
  const box = await page.locator("#stage-viewport").boundingBox();
  if (!box) throw new Error("Stage viewport is missing.");
  return box;
}

async function fling(
  page: Page,
  direction: "right" | "left" = "right",
  pointerType: "mouse" | "touch" = "mouse",
) {
  const box = await stageBox(page);
  const start = {
    x: box.x + box.width * (direction === "right" ? 0.2 : 0.8),
    y: box.y + box.height * 0.67,
  };
  const end = {
    x: box.x + box.width * (direction === "right" ? 0.96 : 0.04),
    y: box.y + box.height * (direction === "right" ? 0.55 : 0.82),
  };
  if (pointerType === "touch") {
    const stage = page.locator("#stage-viewport");
    const base = {
      pointerId: 7,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      buttons: 1,
    };
    await stage.dispatchEvent("pointerdown", {
      ...base,
      clientX: start.x,
      clientY: start.y,
    });
    await stage.dispatchEvent("pointermove", {
      ...base,
      clientX: end.x,
      clientY: end.y,
    });
    await stage.dispatchEvent("pointerup", {
      ...base,
      buttons: 0,
      clientX: end.x,
      clientY: end.y,
    });
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
  }
}

async function bootFresh(page: Page) {
  await page.goto("/?qa=1&platform=mock");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText("Curtain Call", { exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator("#loading-screen")).toBeHidden();
}

interface QaState {
  readonly status: string;
  readonly flingsUsed: number;
  readonly elapsed: number;
  readonly focus: readonly [number, number];
  readonly goal: readonly [number, number];
  readonly bumperHits: number;
  readonly mechanismTypes: readonly string[];
  readonly mechanismUnlocked: boolean;
}

async function directedFling(
  page: Page,
  verticalBias: number,
  routeTarget?: readonly [number, number],
) {
  const state = await page.evaluate(() =>
    (
      window as unknown as {
        __FF_DIAGNOSTICS__: { getState: () => QaState };
      }
    ).__FF_DIAGNOSTICS__.getState(),
  );
  const target = routeTarget ?? state.goal;
  const dx = target[0] - state.focus[0];
  const dy = target[1] - state.focus[1] + verticalBias;
  const length = Math.max(0.01, Math.hypot(dx, dy));
  const direction = { x: dx / length, y: dy / length };
  const start = { x: 60, y: 590 };
  const end = {
    x: start.x + direction.x * 260,
    y: start.y - direction.y * 260,
  };
  const stage = page.locator("#stage-viewport");
  const base = {
    pointerId: 11,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    buttons: 1,
  };
  await stage.dispatchEvent("pointerdown", {
    ...base,
    clientX: start.x,
    clientY: start.y,
  });
  await page.waitForTimeout(350);
  await stage.dispatchEvent("pointermove", {
    ...base,
    clientX: end.x,
    clientY: end.y,
  });
  await stage.dispatchEvent("pointerup", {
    ...base,
    buttons: 0,
    clientX: end.x,
    clientY: end.y,
  });
}

test("first three stunts complete consecutively in a real browser", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await bootFresh(page);
  const levels = [
    { id: 1, name: "Curtain Call", maxFlings: 3, bias: -0.1 },
    { id: 2, name: "Bank Shot", maxFlings: 3, bias: -0.1 },
    { id: 3, name: "Double Bounce", maxFlings: 4, bias: -0.1 },
  ] as const;

  for (const level of levels) {
    await expect(page.getByText(level.name, { exact: true })).toBeVisible();
    for (let flingIndex = 0; flingIndex < level.maxFlings; flingIndex += 1) {
      const before = await page.evaluate(() =>
        (
          window as unknown as {
            __FF_DIAGNOSTICS__: { getState: () => QaState };
          }
        ).__FF_DIAGNOSTICS__.getState(),
      );
      if (before.status === "won") break;
      const routeTarget =
        level.id === 3 && before.bumperHits === 0
          ? ([-0.9, 0.15] as const)
          : level.id === 3 && before.bumperHits === 1
            ? ([0.95, 1] as const)
            : undefined;
      await directedFling(page, level.bias, routeTarget);
      const settleChecks = level.id === 3 ? 1 : 12;
      for (let settle = 0; settle < settleChecks; settle += 1) {
        await page.waitForTimeout(250);
        const status = await page.evaluate(
          () =>
            (
              window as unknown as {
                __FF_DIAGNOSTICS__: { getState: () => QaState };
              }
            ).__FF_DIAGNOSTICS__.getState().status,
        );
        if (status !== "playing") break;
      }
    }
    await expect(page.getByText("BELL RUNG!", { exact: true })).toBeVisible({
      timeout: 7_000,
    });
    const after = await page.evaluate(() =>
      (
        window as unknown as {
          __FF_DIAGNOSTICS__: { getState: () => QaState };
        }
      ).__FF_DIAGNOSTICS__.getState(),
    );
    expect(after.elapsed).toBeGreaterThan(0);
    expect(after.mechanismUnlocked).toBe(true);
    await page.screenshot({
      path: `${screenshots}/stunt-${level.id}-victory.png`,
    });
    if (level.id < 3) {
      await page.getByRole("button", { name: "Next stunt" }).click();
    }
  }
});

test("production build completes the core loop, pause, settings, save, and retry", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      const text = message.text();
      if (!text.includes("GL Driver Message") || !text.includes("ReadPixels")) {
        problems.push(`${message.type()}: ${text}`);
      }
    }
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400)
      problems.push(`${response.status()} ${response.url()}`);
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await bootFresh(page);
  await page.screenshot({ path: `${screenshots}/390x844-gameplay.png` });

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(
    page.getByRole("heading", { name: "INTERMISSION" }),
  ).toBeVisible();
  await page.screenshot({ path: `${screenshots}/390x844-pause.png` });
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByText("Curtain Call", { exact: true })).toBeVisible();

  await fling(page);
  await expect(page.getByText("BELL RUNG!", { exact: true })).toBeVisible({
    timeout: 7_000,
  });
  await page.screenshot({ path: `${screenshots}/390x844-victory.png` });

  const events = await page.evaluate(
    () =>
      (
        window as unknown as {
          __FF_DIAGNOSTICS__?: { getPlatformEvents: () => readonly string[] };
        }
      ).__FF_DIAGNOSTICS__?.getPlatformEvents() ?? [],
  );
  expect(events).toContain("loadingFinished");
  expect(events).toContain("gameplayStart");
  expect(events).toContain("gameplayStop");

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator("#modal-layer")).toBeHidden();
  await expect(page.locator("#goal-label")).toHaveText("Curtain Call");
  await fling(page, "left");
  await fling(page, "left");
  await fling(page, "left");
  await expect(page.getByText("STUNT BUSTED", { exact: true })).toBeVisible({
    timeout: 8_000,
  });
  await page.screenshot({ path: `${screenshots}/390x844-failure.png` });
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator("#modal-layer")).toBeHidden();
  await expect(page.locator("#goal-label")).toHaveText("Curtain Call");

  await page.reload();
  await expect(page.getByText("Bank Shot", { exact: true })).toBeVisible();
  expect(problems).toEqual([]);
});

test("keyboard modal controls, focus trap, shelf, and continuation work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootFresh(page);

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(
    page.getByRole("dialog", { name: "INTERMISSION" }),
  ).toBeVisible();
  const resume = page.getByRole("button", { name: "Resume" });
  await expect(resume).toBeFocused();

  const motion = page.locator("input[data-setting='reducedMotion']");
  await motion.focus();
  await page.keyboard.press("Tab");
  await expect(resume).toBeFocused();

  const music = page.locator("input[data-setting='music']");
  const musicBefore = await music.isChecked();
  await music.focus();
  await page.keyboard.press("Space");
  if (musicBefore) {
    await expect(page.locator("input[data-setting='music']")).not.toBeChecked();
  } else {
    await expect(page.locator("input[data-setting='music']")).toBeChecked();
  }

  const shelf = page.getByRole("button", { name: "Stunt shelf" });
  await shelf.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "STUNT BADGES" }),
  ).toBeVisible();
  await page.screenshot({ path: `${screenshots}/390x844-shelf.png` });

  const levelOne = page.locator("button[data-level='1']");
  await levelOne.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#modal-layer")).toBeHidden();

  await fling(page);
  await expect(page.getByText("BELL RUNG!", { exact: true })).toBeVisible({
    timeout: 7_000,
  });
  const next = page.getByRole("button", { name: "Next stunt" });
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#modal-layer")).toBeHidden();
  await expect(page.locator("#goal-label")).toHaveText("Bank Shot");
});

test("blur safely pauses and corrupted records cannot break the shelf", async ({
  page,
}) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto("/?qa=1&platform=disabled");
  await page.evaluate(() => {
    localStorage.setItem(
      "fling-fiasco-save",
      JSON.stringify({
        version: 1,
        unlockedLevel: Number.NaN,
        levels: {
          "1": {
            stars: -7,
            bestTime: "bad",
            bestFlings: null,
            bestPoints: Number.POSITIVE_INFINITY,
          },
        },
        settings: {
          music: true,
          effects: true,
          language: "zh",
          reducedMotion: false,
        },
      }),
    );
  });
  await page.reload();
  await expect(page.locator("#loading-screen")).toBeHidden();

  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(
    page.getByRole("dialog", { name: "INTERMISSION" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stunt shelf" }).click();
  await expect(
    page.getByRole("dialog", { name: "STUNT BADGES" }),
  ).toBeVisible();
  await expect(page.locator("button[data-level='1']")).toContainText("☆☆☆");
  expect(problems).toEqual([]);
});

test("touch pointer gesture completes the tutorial stunt", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await bootFresh(page);
  await fling(page, "right", "touch");
  await expect(page.getByText("BELL RUNG!", { exact: true })).toBeVisible({
    timeout: 7_000,
  });
  await context.close();
});

const viewports = [
  [360, 640],
  [375, 667],
  [390, 844],
  [412, 915],
  [430, 932],
  [768, 1024],
  [820, 1180],
  [907, 510],
  [1366, 768],
  [1920, 1080],
] as const;

for (const [width, height] of viewports) {
  test(`responsive visual states ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await bootFresh(page);
    await page.screenshot({
      path: `${screenshots}/${width}x${height}-gameplay.png`,
    });
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(
      page.getByRole("heading", { name: "INTERMISSION" }),
    ).toBeVisible();
    await page.screenshot({
      path: `${screenshots}/${width}x${height}-pause.png`,
    });
    await page.getByRole("button", { name: "Stunt shelf" }).click();
    await expect(
      page.getByRole("dialog", { name: "STUNT BADGES" }),
    ).toBeVisible();
    await page.screenshot({
      path: `${screenshots}/${width}x${height}-shelf.png`,
    });
    await page.locator("button[data-level='1']").click();
    await expect(page.locator("#modal-layer")).toBeHidden();
    await fling(page);
    await expect(page.getByText("BELL RUNG!", { exact: true })).toBeVisible({
      timeout: 8_000,
    });
    await page.screenshot({
      path: `${screenshots}/${width}x${height}-victory.png`,
    });
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.locator("#modal-layer")).toBeHidden();
    await fling(page, "left");
    await fling(page, "left");
    await fling(page, "left");
    await expect(page.getByText("STUNT BUSTED", { exact: true })).toBeVisible({
      timeout: 8_000,
    });
    await page.screenshot({
      path: `${screenshots}/${width}x${height}-failure.png`,
    });
  });
}

test("landscape touch device shows a safe portrait recommendation", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto("/?qa=1&platform=disabled");
  await expect(page.locator("#loading-screen")).toBeHidden();
  const state = await page.evaluate(() =>
    (
      window as unknown as {
        __FF_DIAGNOSTICS__: { getState: () => QaState };
      }
    ).__FF_DIAGNOSTICS__.getState(),
  );
  expect(state.status).toBe("playing");
  await expect(
    page.getByText("Portrait is best — rotate your phone for the full stunt."),
  ).toBeVisible();
  await page.screenshot({ path: `${screenshots}/844x390-landscape.png` });
  await context.close();
});
