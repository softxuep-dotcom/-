import { expect, test, type Page } from "@playwright/test";

async function waitForBoot(page: Page) {
  await expect(page.locator("#loading-screen")).toBeHidden({ timeout: 10_000 });
  await expect(page.locator("#goal-label")).toHaveText("Curtain Call");
}

async function mockCrazy(
  page: Page,
  options: { environment?: "local" | "disabled"; hangAd?: boolean } = {},
) {
  const environment = options.environment ?? "local";
  const adBody = options.hangAd
    ? "window.__sdkEvents.push('ad:hang');"
    : "window.__sdkEvents.push('ad:' + kind); callbacks.adStarted(); setTimeout(callbacks.adFinished, 20);";
  await page.route(
    "https://sdk.crazygames.com/crazygames-sdk-v3.js",
    async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `
          window.__sdkEvents = [];
          window.CrazyGames = { SDK: {
            environment: ${JSON.stringify(environment)},
            init: async () => {
              window.__sdkEvents.push("init");
              ${environment === "disabled" ? 'throw new Error("disabled");' : ""}
            },
            game: {
              settings: { muteAudio: false },
              loadingStart: () => window.__sdkEvents.push("loadingStart"),
              loadingStop: () => window.__sdkEvents.push("loadingStop"),
              gameplayStart: () => window.__sdkEvents.push("gameplayStart"),
              gameplayStop: () => window.__sdkEvents.push("gameplayStop"),
              reportGameCompletedPercentage: (value) => window.__sdkEvents.push("progress:" + value),
              addSettingsChangeListener: () => undefined
            },
            ad: {
              requestAd: (kind, callbacks) => { ${adBody} }
            }
          }};
        `,
      });
    },
  );
}

async function mockPoki(page: Page) {
  await page.route(
    "https://game-cdn.poki.com/scripts/v2/poki-sdk.js",
    async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `
          window.__sdkEvents = [];
          window.PokiSDK = {
            init: async () => window.__sdkEvents.push("init"),
            gameLoadingFinished: () => window.__sdkEvents.push("loadingFinished"),
            gameplayStart: () => window.__sdkEvents.push("gameplayStart"),
            gameplayStop: () => window.__sdkEvents.push("gameplayStop"),
            commercialBreak: async (started) => {
              window.__sdkEvents.push("commercialBreak");
              started?.();
            },
            rewardedBreak: async (started) => {
              window.__sdkEvents.push("rewardedBreak");
              started?.();
              return true;
            }
          };
        `,
      });
    },
  );
}

test("CrazyGames adapter boots and brackets gameplay without duplicate calls", async ({
  page,
}) => {
  await mockCrazy(page);
  await page.goto("/?qa=1&platform=crazy");
  await waitForBoot(page);
  await page.keyboard.press("Space");
  await page.waitForTimeout(100);
  await page.keyboard.press("p");
  await expect(
    page.getByRole("dialog", { name: "INTERMISSION" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.locator("#modal-layer")).toBeHidden();
  const events = await page.evaluate(
    () => (window as unknown as { __sdkEvents: string[] }).__sdkEvents,
  );
  expect(events).toEqual(
    expect.arrayContaining([
      "init",
      "loadingStart",
      "loadingStop",
      "gameplayStart",
      "gameplayStop",
    ]),
  );
  expect(events).not.toContain("ad:midgame");
});

test("Poki adapter boots and uses a commercial break at retry", async ({
  page,
}) => {
  await mockPoki(page);
  await page.goto("/?qa=1&platform=poki");
  await waitForBoot(page);
  await page.keyboard.press("r");
  await expect(page.locator("#goal-label")).toHaveText("Curtain Call");
  const events = await page.evaluate(
    () => (window as unknown as { __sdkEvents: string[] }).__sdkEvents,
  );
  expect(events).toContain("loadingFinished");
  expect(events).toContain("commercialBreak");
});

test("disabled and SDK-disabled environments degrade to a playable game", async ({
  page,
}) => {
  await page.goto("/?qa=1&platform=disabled");
  await waitForBoot(page);

  await mockCrazy(page, { environment: "disabled" });
  await page.goto("/?qa=1&platform=crazy");
  await waitForBoot(page);
  const adapterEvents = await page.evaluate(() =>
    (
      window as unknown as {
        __FF_DIAGNOSTICS__: { getPlatformEvents: () => readonly string[] };
      }
    ).__FF_DIAGNOSTICS__.getPlatformEvents(),
  );
  expect(adapterEvents).toContain("init-fallback");
});

test("an ad with no callbacks times out instead of soft-locking input", async ({
  page,
}) => {
  test.setTimeout(20_000);
  await mockCrazy(page, { hangAd: true });
  await page.goto("/?qa=1&platform=crazy");
  await waitForBoot(page);
  await page.keyboard.press("r");
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __FF_DIAGNOSTICS__: { getState: () => { status: string } };
              }
            ).__FF_DIAGNOSTICS__.getState().status,
        ),
      { timeout: 10_000 },
    )
    .toBe("playing");
  const adapterEvents = await page.evaluate(() =>
    (
      window as unknown as {
        __FF_DIAGNOSTICS__: { getPlatformEvents: () => readonly string[] };
      }
    ).__FF_DIAGNOSTICS__.getPlatformEvents(),
  );
  expect(adapterEvents).toContain("adTimeout:midgame");
});

test("a loaded SDK with a hanging init falls back after a bounded wait", async ({
  page,
}) => {
  test.setTimeout(20_000);
  await page.route(
    "https://sdk.crazygames.com/crazygames-sdk-v3.js",
    async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `
          window.CrazyGames = { SDK: {
            environment: "local",
            init: () => new Promise(() => undefined),
            game: {},
            ad: {}
          }};
        `,
      });
    },
  );
  await page.goto("/?qa=1&platform=crazy");
  await waitForBoot(page);
  const adapterEvents = await page.evaluate(() =>
    (
      window as unknown as {
        __FF_DIAGNOSTICS__: { getPlatformEvents: () => readonly string[] };
      }
    ).__FF_DIAGNOSTICS__.getPlatformEvents(),
  );
  expect(adapterEvents).toContain("init-fallback");
});
