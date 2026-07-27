export type PlatformMode = "crazy" | "poki" | "mock" | "disabled";
export type AdKind = "midgame" | "rewarded";

const AD_START_TIMEOUT_MS = 8_000;
const AD_FINISH_TIMEOUT_MS = 120_000;

interface AdHooks {
  readonly onStarted: () => void;
  readonly onFinished: (rewarded: boolean) => void;
}

interface CrazySdk {
  readonly environment?: "crazygames" | "local" | "disabled";
  init: () => Promise<void>;
  game: {
    gameplayStart: () => void;
    gameplayStop: () => void;
    loadingStart: () => void;
    loadingStop: () => void;
    reportGameCompletedPercentage?: (percentage: number) => void;
    settings?: { readonly muteAudio?: boolean };
    addSettingsChangeListener?: (
      listener: (settings: { muteAudio?: boolean }) => void,
    ) => void;
  };
  ad: {
    requestAd: (
      kind: AdKind,
      callbacks: {
        adStarted: () => void;
        adFinished: () => void;
        adError: () => void;
      },
    ) => void;
  };
}

interface PokiSdk {
  init: () => Promise<void>;
  gameLoadingFinished: () => void;
  gameplayStart: () => void;
  gameplayStop: () => void;
  commercialBreak: (onStarted?: () => void) => Promise<void>;
  rewardedBreak: (onStarted?: () => void) => Promise<boolean>;
}

declare global {
  interface Window {
    CrazyGames?: { SDK: CrazySdk };
    PokiSDK?: PokiSdk;
  }
}

function detectMode(): PlatformMode {
  const params = new URLSearchParams(window.location.search);
  const explicit = params.get("platform");
  if (
    explicit === "crazy" ||
    explicit === "poki" ||
    explicit === "mock" ||
    explicit === "disabled"
  ) {
    return explicit;
  }
  const haystack =
    `${window.location.hostname} ${document.referrer}`.toLowerCase();
  if (haystack.includes("crazygames")) return "crazy";
  if (haystack.includes("poki")) return "poki";
  return "disabled";
}

function loadScript(source: string): Promise<boolean> {
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-platform-sdk="${source}"]`,
    );
    if (existing) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => resolve(false), 7000);
    script.dataset.platformSdk = source;
    script.src = source;
    script.async = true;
    script.addEventListener(
      "load",
      () => {
        window.clearTimeout(timeout);
        resolve(true);
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => {
        window.clearTimeout(timeout);
        resolve(false);
      },
      { once: true },
    );
    document.head.append(script);
  });
}

function settlesWithin(
  promise: Promise<void>,
  timeoutMs = 7_000,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: boolean): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(result);
    };
    const timeout = window.setTimeout(() => finish(false), timeoutMs);
    promise.then(() => finish(true)).catch(() => finish(false));
  });
}

export class PlatformAdapter {
  readonly mode = detectMode();
  private ready = false;
  private playing = false;
  private loading = false;
  private externalMute = false;
  private muteListener: ((muted: boolean) => void) | null = null;
  private readonly events: string[] = [];

  async init(): Promise<void> {
    this.record(`init:${this.mode}`);
    if (this.mode === "crazy") {
      const loaded = await loadScript(
        "https://sdk.crazygames.com/crazygames-sdk-v3.js",
      );
      if (loaded && window.CrazyGames?.SDK) {
        try {
          if (window.CrazyGames.SDK.environment === "disabled") {
            this.record("init-fallback");
            return;
          }
          const initialized = await settlesWithin(window.CrazyGames.SDK.init());
          if (!initialized) throw new Error("CrazyGames SDK init timed out.");
          window.CrazyGames.SDK.game.loadingStart();
          this.ready = true;
          this.loading = true;
          this.setExternalMute(
            Boolean(window.CrazyGames.SDK.game.settings?.muteAudio),
          );
          window.CrazyGames.SDK.game.addSettingsChangeListener?.((settings) => {
            this.setExternalMute(Boolean(settings.muteAudio));
          });
        } catch {
          this.ready = false;
          this.loading = false;
          this.record("init-fallback");
        }
      }
    } else if (this.mode === "poki") {
      const loaded = await loadScript(
        "https://game-cdn.poki.com/scripts/v2/poki-sdk.js",
      );
      if (loaded && window.PokiSDK) {
        try {
          const initialized = await settlesWithin(window.PokiSDK.init());
          if (!initialized) throw new Error("Poki SDK init timed out.");
          this.ready = true;
        } catch {
          this.record("init-fallback");
        }
      }
    } else if (this.mode === "mock") {
      this.ready = true;
      this.loading = true;
    }
  }

  loadingFinished(): void {
    if (this.loading) {
      if (this.mode === "crazy" && this.ready) {
        this.invokeSdk("loadingStop", () =>
          window.CrazyGames?.SDK.game.loadingStop(),
        );
      }
      this.loading = false;
    }
    if (this.mode === "poki" && this.ready) {
      this.invokeSdk("loadingFinished", () =>
        window.PokiSDK?.gameLoadingFinished(),
      );
    }
    this.record("loadingFinished");
  }

  gameplayStart(): void {
    if (this.playing) return;
    this.playing = true;
    if (this.mode === "crazy" && this.ready) {
      this.invokeSdk("gameplayStart", () =>
        window.CrazyGames?.SDK.game.gameplayStart(),
      );
    }
    if (this.mode === "poki" && this.ready) {
      this.invokeSdk("gameplayStart", () => window.PokiSDK?.gameplayStart());
    }
    this.record("gameplayStart");
  }

  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    if (this.mode === "crazy" && this.ready) {
      this.invokeSdk("gameplayStop", () =>
        window.CrazyGames?.SDK.game.gameplayStop(),
      );
    }
    if (this.mode === "poki" && this.ready) {
      this.invokeSdk("gameplayStop", () => window.PokiSDK?.gameplayStop());
    }
    this.record("gameplayStop");
  }

  reportProgress(levelId: number, totalLevels: number): void {
    const percentage = Math.round((levelId / totalLevels) * 100);
    if (this.mode === "crazy" && this.ready) {
      this.invokeSdk("progress", () =>
        window.CrazyGames?.SDK.game.reportGameCompletedPercentage?.(percentage),
      );
    }
    this.record(`progress:${percentage}`);
  }

  async requestAd(kind: AdKind, hooks: AdHooks): Promise<boolean> {
    this.record(`adRequest:${kind}`);
    if (this.mode === "mock") {
      hooks.onStarted();
      this.record(`adStarted:${kind}`);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 40));
      hooks.onFinished(kind === "rewarded");
      this.record(`adFinished:${kind}`);
      return kind === "rewarded";
    }
    if (this.mode === "crazy" && this.ready && window.CrazyGames) {
      return new Promise<boolean>((resolve) => {
        let completed = false;
        let started = false;
        let timeout = window.setTimeout(() => {
          this.record(`adTimeout:${kind}`);
          finish(false);
        }, AD_START_TIMEOUT_MS);
        const finish = (rewarded: boolean): void => {
          if (completed) return;
          completed = true;
          window.clearTimeout(timeout);
          hooks.onFinished(rewarded);
          this.record(`adFinished:${kind}`);
          resolve(rewarded);
        };
        try {
          window.CrazyGames!.SDK.ad.requestAd(kind, {
            adStarted: () => {
              if (started || completed) return;
              started = true;
              window.clearTimeout(timeout);
              timeout = window.setTimeout(() => {
                this.record(`adTimeout:${kind}`);
                finish(false);
              }, AD_FINISH_TIMEOUT_MS);
              hooks.onStarted();
              this.record(`adStarted:${kind}`);
            },
            adFinished: () => finish(kind === "rewarded"),
            adError: () => {
              this.record(`adError:${kind}`);
              finish(false);
            },
          });
        } catch {
          this.record(`adError:${kind}`);
          finish(false);
        }
      });
    }
    if (this.mode === "poki" && this.ready && window.PokiSDK) {
      return new Promise<boolean>((resolve) => {
        let completed = false;
        let started = false;
        let timeout = window.setTimeout(() => {
          this.record(`adTimeout:${kind}`);
          finish(false);
        }, AD_START_TIMEOUT_MS);
        const finish = (rewarded: boolean): void => {
          if (completed) return;
          completed = true;
          window.clearTimeout(timeout);
          hooks.onFinished(rewarded);
          this.record(`adFinished:${kind}`);
          resolve(rewarded);
        };
        const start = (): void => {
          if (started || completed) return;
          started = true;
          window.clearTimeout(timeout);
          timeout = window.setTimeout(() => {
            this.record(`adTimeout:${kind}`);
            finish(false);
          }, AD_FINISH_TIMEOUT_MS);
          hooks.onStarted();
          this.record(`adStarted:${kind}`);
        };
        try {
          const request =
            kind === "rewarded"
              ? window.PokiSDK!.rewardedBreak(start)
              : window.PokiSDK!.commercialBreak(start).then(() => false);
          request.then(finish).catch(() => {
            this.record(`adError:${kind}`);
            finish(false);
          });
        } catch {
          this.record(`adError:${kind}`);
          finish(false);
        }
      });
    }
    hooks.onFinished(false);
    return false;
  }

  onExternalMuteChange(listener: (muted: boolean) => void): void {
    this.muteListener = listener;
    listener(this.externalMute);
  }

  getEventLog(): readonly string[] {
    return [...this.events];
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  private setExternalMute(muted: boolean): void {
    this.externalMute = muted;
    this.muteListener?.(muted);
  }

  private record(event: string): void {
    this.events.push(event);
    if (this.events.length > 100) this.events.shift();
  }

  private invokeSdk(event: string, callback: () => void): void {
    try {
      callback();
    } catch {
      this.record(`sdkError:${event}`);
    }
  }
}
