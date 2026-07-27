import "./style.css";
import { AudioSystem } from "./audio/audio";
import { getLevel, LEVELS, type Vec2 } from "./game/content/levels";
import { InputController, type AimState } from "./game/input/input";
import { SaveStore } from "./game/save/save";
import {
  calculateScore,
  FIXED_TIMESTEP,
  FixedStepClock,
  MAX_ROUND_SECONDS,
  shouldFailForSettledShots,
} from "./game/simulation/rules";
import { PhysicsStage, type StageFailure } from "./physics/physicsStage";
import { initializeRapier } from "./physics/initRapier";
import { PlatformAdapter } from "./platform/platform";
import { GameRenderer } from "./render/gameRenderer";
import { GameUI } from "./ui/gameUI";

type RuntimeStatus =
  "booting" | "playing" | "paused" | "won" | "failed" | "shelf" | "ad";

interface QaDiagnostics {
  readonly getState: () => {
    readonly status: RuntimeStatus;
    readonly level: number;
    readonly flingsUsed: number;
    readonly elapsed: number;
    readonly distanceToGoal: number;
    readonly focus: Vec2;
    readonly goal: Vec2;
    readonly mechanismTypes: readonly string[];
    readonly bumperHits: number;
    readonly mechanismUnlocked: boolean;
  };
  readonly getMetrics: () => ReturnType<GameRenderer["getMetrics"]>;
  readonly getPlatformEvents: () => readonly string[];
}

declare global {
  interface Window {
    __FF_DIAGNOSTICS__?: QaDiagnostics;
  }
}

class FlingFiasco {
  private readonly platform = new PlatformAdapter();
  private readonly save = new SaveStore();
  private readonly audio = new AudioSystem();
  private readonly fixedClock = new FixedStepClock();
  private readonly ui: GameUI;
  private readonly renderer: GameRenderer;
  private readonly input: InputController;
  private stage: PhysicsStage | null = null;
  private status: RuntimeStatus = "booting";
  private levelId = 1;
  private flingsUsed = 0;
  private elapsed = 0;
  private settledSeconds = 0;
  private roundStarted = false;
  private lastFrame = performance.now();
  private animationFrame = 0;
  private currentAim: AimState = {
    active: false,
    direction: [0.8, 0.6],
    power: 0,
  };
  private statusBeforeShelf: RuntimeStatus = "paused";
  private lastFailureReason: "fell" | "crushed" | "outOfFlings" | "timeout" =
    "outOfFlings";

  constructor(root: HTMLElement) {
    this.ui = new GameUI(root, {
      onRetry: () => void this.retry(),
      onNext: () => void this.next(),
      onPause: () => this.togglePause(),
      onResume: () => void this.resume(),
      onOpenShelf: () => this.openShelf(),
      onSelectLevel: (levelId) => void this.selectLevel(levelId),
      onSettings: (patch) => this.changeSettings(patch),
    });
    this.renderer = new GameRenderer(
      this.ui.stage,
      () => this.onContextLost(),
      () => this.onContextRestored(),
    );
    this.input = new InputController(this.ui.stage, {
      onAim: (aim) => this.onAim(aim),
      onFling: (direction, power) => this.onFling(direction, power),
      onPause: () => this.togglePause(),
      onRetry: () => {
        if (
          this.status === "playing" ||
          this.status === "failed" ||
          this.status === "won"
        ) {
          void this.retry();
        }
      },
      onFirstGesture: () => this.onFirstGesture(),
    });
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("pagehide", this.onPageHide);
    window.addEventListener("blur", this.onWindowBlur);
  }

  async start(): Promise<void> {
    this.ui.setLoading(12);
    const platformReady = this.platform.init();
    await initializeRapier();
    this.ui.setLoading(48);
    await platformReady;
    this.ui.setLoading(72);
    this.ui.configure(this.save.snapshot, this.save.isPersistent);
    this.audio.configure(
      this.save.snapshot.settings.music,
      this.save.snapshot.settings.effects,
    );
    this.renderer.setReducedMotion(this.save.snapshot.settings.reducedMotion);
    this.platform.onExternalMuteChange((muted) =>
      this.audio.setExternalMute(muted),
    );

    const preferred = Math.max(
      1,
      Math.min(
        LEVELS.length,
        Object.keys(this.save.snapshot.levels).length > 0
          ? this.save.snapshot.unlockedLevel
          : 1,
      ),
    );
    this.loadLevel(preferred);
    this.platform.loadingFinished();
    this.ui.setLoading(100);
    this.installQaDiagnostics();
    this.animationFrame = requestAnimationFrame(this.loop);
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("pagehide", this.onPageHide);
    window.removeEventListener("blur", this.onWindowBlur);
    this.input.dispose();
    this.stage?.dispose();
    this.renderer.dispose();
    this.audio.dispose();
    delete window.__FF_DIAGNOSTICS__;
  }

  private loadLevel(levelId: number): void {
    this.stage?.dispose();
    this.levelId = Math.max(1, Math.min(LEVELS.length, levelId));
    const level = getLevel(this.levelId);
    this.stage = new PhysicsStage(level);
    this.renderer.rebuild(this.stage.visuals, level.backdrop);
    this.renderer.setAim({ ...this.currentAim, active: false }, level.start);
    this.flingsUsed = 0;
    this.elapsed = 0;
    this.settledSeconds = 0;
    this.roundStarted = false;
    this.status = "playing";
    this.fixedClock.reset();
    this.input.setEnabled(true);
    this.audio.setSuspended(false);
    this.ui.hideModal();
    this.ui.enterGame(level);
    this.updateUi();
  }

  private onAim(aim: AimState): void {
    this.currentAim = aim;
    if (this.status !== "playing" || !this.stage) return;
    this.renderer.setAim(aim, this.stage.getFocusPosition());
    this.ui.setPower(aim.power, aim.active);
  }

  private onFling(direction: Vec2, power: number): void {
    if (this.status !== "playing" || !this.stage) return;
    const level = this.stage.level;
    if (this.flingsUsed >= level.maxFlings) return;
    if (!this.roundStarted) this.onFirstGesture();
    this.flingsUsed += 1;
    this.settledSeconds = 0;
    this.stage.fling(direction, power);
    this.audio.play("fling", power);
    this.renderer.impact(power * 0.75);
    this.ui.dismissHint();
    this.ui.announce(`${this.flingsUsed} / ${level.maxFlings}`);
    this.updateUi();
  }

  private onFirstGesture(): void {
    void this.audio.unlock();
    if (this.status === "playing" && !this.roundStarted) {
      this.roundStarted = true;
      this.platform.gameplayStart();
    }
  }

  private readonly loop = (now: number): void => {
    const delta = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    const stage = this.stage;
    if (stage) {
      if (this.status === "playing" && this.roundStarted) {
        const steps = this.fixedClock.consume(delta, () => {
          stage.step({
            onImpact: (strength) => {
              this.audio.play("impact", strength);
              this.renderer.impact(strength);
            },
            onSpring: () => this.audio.play("spring"),
            onGoal: () => this.onVictory(),
            onFailure: (reason) => this.onStageFailure(reason),
          });
        });
        this.elapsed += steps * FIXED_TIMESTEP;
        const speed = stage.getAverageSpeed();
        this.settledSeconds =
          this.flingsUsed >= stage.level.maxFlings
            ? this.settledSeconds + steps * FIXED_TIMESTEP
            : speed < 0.16
              ? this.settledSeconds + steps * FIXED_TIMESTEP
              : 0;
        if (
          this.status === "playing" &&
          shouldFailForSettledShots(
            this.flingsUsed,
            stage.level.maxFlings,
            speed,
            this.settledSeconds,
          )
        ) {
          this.onFailure("outOfFlings");
        } else if (
          this.status === "playing" &&
          this.elapsed >= MAX_ROUND_SECONDS
        ) {
          this.onFailure("timeout");
        }
      } else if (this.status === "playing") this.fixedClock.reset();
      stage.getFocusPosition();
      this.renderer.render(
        delta,
        stage.getFocusPosition(),
        stage.getGoalState(),
      );
      this.renderer.setAim(this.currentAim, stage.getFocusPosition());
      this.updateUi();
    }
    this.animationFrame = requestAnimationFrame(this.loop);
  };

  private updateUi(): void {
    const stage = this.stage;
    if (!stage) return;
    const focus = stage.getFocusPosition();
    const goal = stage.getGoalState().position;
    this.ui.updateHud(
      stage.level,
      Math.max(0, stage.level.maxFlings - this.flingsUsed),
      this.elapsed,
      stage.getDistanceToGoal(),
      [goal[0] - focus[0], goal[1] - focus[1]],
    );
  }

  private onVictory(): void {
    if (this.status !== "playing" || !this.stage) return;
    this.status = "won";
    this.input.setEnabled(false);
    this.platform.gameplayStop();
    const level = this.stage.level;
    const score = calculateScore({
      maxFlings: level.maxFlings,
      flingsUsed: this.flingsUsed,
      elapsedSeconds: this.elapsed,
      parTime: level.parTime,
    });
    const result = this.save.recordVictory(
      level.id,
      {
        stars: score.stars,
        bestTime: this.elapsed,
        bestFlings: this.flingsUsed,
        bestPoints: score.points,
      },
      LEVELS.length,
    );
    this.ui.configure(result.data, this.save.isPersistent);
    this.renderer.celebrate(this.stage.getGoalState().position);
    this.audio.play("victory");
    this.platform.reportProgress(level.id, LEVELS.length);
    this.ui.showVictory({
      level,
      score,
      elapsed: this.elapsed,
      flingsUsed: this.flingsUsed,
      improved: result.improved,
      newlyUnlocked: result.newlyUnlocked,
      finalLevel: level.id === LEVELS.length,
    });
  }

  private onStageFailure(reason: StageFailure): void {
    this.onFailure(reason);
  }

  private onFailure(
    reason: "fell" | "crushed" | "outOfFlings" | "timeout",
  ): void {
    if (this.status !== "playing") return;
    this.lastFailureReason = reason;
    this.status = "failed";
    this.input.setEnabled(false);
    this.platform.gameplayStop();
    this.audio.play("failure");
    this.ui.showFailure(reason);
  }

  private togglePause(): void {
    if (this.status === "playing") {
      this.pause();
    } else if (this.status === "paused") {
      void this.resume();
    }
  }

  private pause(): void {
    if (this.status !== "playing") return;
    this.status = "paused";
    this.input.setEnabled(false);
    this.fixedClock.reset();
    this.platform.gameplayStop();
    this.audio.setSuspended(true);
    this.ui.showPause();
  }

  private resume(): void {
    if (this.status === "shelf") {
      if (
        this.statusBeforeShelf === "won" ||
        this.statusBeforeShelf === "failed"
      ) {
        this.ui.hideModal();
        if (this.statusBeforeShelf === "won" && this.stage) {
          const score = calculateScore({
            maxFlings: this.stage.level.maxFlings,
            flingsUsed: this.flingsUsed,
            elapsedSeconds: this.elapsed,
            parTime: this.stage.level.parTime,
          });
          this.ui.showVictory({
            level: this.stage.level,
            score,
            elapsed: this.elapsed,
            flingsUsed: this.flingsUsed,
            improved: false,
            newlyUnlocked: false,
            finalLevel: this.stage.level.id === LEVELS.length,
          });
          this.status = "won";
        } else {
          this.status = "failed";
          this.ui.showFailure(this.lastFailureReason);
        }
        return;
      }
      this.status = "paused";
    }
    if (this.status !== "paused") return;
    this.status = "playing";
    this.lastFrame = performance.now();
    this.fixedClock.reset();
    this.input.setEnabled(true);
    this.ui.hideModal();
    this.audio.setSuspended(false);
    if (this.roundStarted) this.platform.gameplayStart();
  }

  private async retry(): Promise<void> {
    if (
      this.status !== "playing" &&
      this.status !== "paused" &&
      this.status !== "failed" &&
      this.status !== "won"
    ) {
      return;
    }
    const level = this.levelId;
    if (this.status === "playing") this.platform.gameplayStop();
    this.status = "ad";
    this.input.setEnabled(false);
    await this.platform.requestAd("midgame", {
      onStarted: () => this.audio.setSuspended(true),
      onFinished: () => this.audio.setSuspended(false),
    });
    this.loadLevel(level);
  }

  private async next(): Promise<void> {
    if (this.status !== "won") return;
    if (this.levelId >= LEVELS.length) {
      this.openShelf();
      return;
    }
    const nextId = this.levelId + 1;
    this.status = "ad";
    await this.platform.requestAd("midgame", {
      onStarted: () => this.audio.setSuspended(true),
      onFinished: () => this.audio.setSuspended(false),
    });
    this.loadLevel(nextId);
  }

  private openShelf(): void {
    if (
      this.status === "ad" ||
      this.status === "booting" ||
      this.status === "shelf"
    ) {
      return;
    }
    this.statusBeforeShelf = this.status;
    if (this.status === "playing") this.pause();
    this.status = "shelf";
    this.input.setEnabled(false);
    this.platform.gameplayStop();
    this.audio.setSuspended(true);
    this.ui.showShelf(this.save.snapshot);
  }

  private async selectLevel(levelId: number): Promise<void> {
    if (this.status !== "shelf") return;
    if (levelId > this.save.snapshot.unlockedLevel) return;
    this.status = "ad";
    await this.platform.requestAd("midgame", {
      onStarted: () => this.audio.setSuspended(true),
      onFinished: () => this.audio.setSuspended(false),
    });
    this.loadLevel(levelId);
  }

  private changeSettings(patch: {
    music?: boolean;
    effects?: boolean;
    language?: "en" | "zh";
    reducedMotion?: boolean;
  }): void {
    const data = this.save.updateSettings(patch);
    this.ui.configure(data, this.save.isPersistent);
    this.audio.configure(data.settings.music, data.settings.effects);
    this.renderer.setReducedMotion(data.settings.reducedMotion);
    this.audio.play("ui");
    if (this.status === "paused") this.ui.showPause();
    if (this.status === "shelf") this.ui.showShelf(data);
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden" && this.status === "playing") {
      this.pause();
    }
  };

  private readonly onPageHide = (): void => {
    if (this.status === "playing") this.platform.gameplayStop();
  };

  private readonly onWindowBlur = (): void => {
    if (this.status === "playing") this.pause();
  };

  private onContextLost(): void {
    if (this.status === "playing") this.pause();
    this.ui.showContextLost();
  }

  private onContextRestored(): void {
    this.loadLevel(this.levelId);
  }

  private installQaDiagnostics(): void {
    const qaEnabled =
      import.meta.env.DEV ||
      new URLSearchParams(window.location.search).get("qa") === "1";
    if (!qaEnabled) return;
    window.__FF_DIAGNOSTICS__ = {
      getState: () => {
        const mechanismProgress = this.stage?.getMechanismProgress();
        return {
          status: this.status,
          level: this.levelId,
          flingsUsed: this.flingsUsed,
          elapsed: this.elapsed,
          distanceToGoal: this.stage?.getDistanceToGoal() ?? 0,
          focus: this.stage?.getFocusPosition() ?? [0, 0],
          goal: this.stage?.getGoalState().position ?? [0, 0],
          mechanismTypes: mechanismProgress?.types ?? [],
          bumperHits: mechanismProgress?.bumperHits ?? 0,
          mechanismUnlocked: mechanismProgress?.unlocked ?? true,
        };
      },
      getMetrics: () => this.renderer.getMetrics(),
      getPlatformEvents: () => this.platform.getEventLog(),
    };
  }
}

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Game root is missing.");

const game = new FlingFiasco(root);
void game.start();
