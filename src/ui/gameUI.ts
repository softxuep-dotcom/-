import {
  LEVELS,
  type LevelDefinition,
  type Vec2,
} from "../game/content/levels";
import { t, type Language } from "../game/i18n";
import type { SaveData } from "../game/save/save";
import type { LevelScore } from "../game/simulation/rules";

export interface UiCallbacks {
  readonly onRetry: () => void;
  readonly onNext: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onOpenShelf: () => void;
  readonly onSelectLevel: (levelId: number) => void;
  readonly onSettings: (patch: {
    music?: boolean;
    effects?: boolean;
    language?: Language;
    reducedMotion?: boolean;
  }) => void;
}

export interface VictoryView {
  readonly level: LevelDefinition;
  readonly score: LevelScore;
  readonly elapsed: number;
  readonly flingsUsed: number;
  readonly improved: boolean;
  readonly newlyUnlocked: boolean;
  readonly finalLevel: boolean;
}

export class GameUI {
  readonly stage: HTMLElement;
  private readonly loading: HTMLElement;
  private readonly loadingBar: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly levelLabel: HTMLElement;
  private readonly goalLabel: HTMLElement;
  private readonly flingsLabel: HTMLElement;
  private readonly timeLabel: HTMLElement;
  private readonly powerWrap: HTMLElement;
  private readonly powerFill: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly modal: HTMLElement;
  private readonly modalPanel: HTMLElement;
  private readonly liveRegion: HTMLElement;
  private readonly rotateHint: HTMLElement;
  private readonly persistenceNote: HTMLElement;
  private language: Language = "en";
  private save: SaveData | null = null;
  private hintTimer = 0;
  private previousFocus: HTMLElement | null = null;

  constructor(
    root: HTMLElement,
    private readonly callbacks: UiCallbacks,
  ) {
    root.innerHTML = `
      <main class="game-shell">
        <section class="stage-frame" aria-label="Fling Fiasco game">
          <div class="stage-viewport" id="stage-viewport" tabindex="-1"></div>
          <div class="loading-screen" id="loading-screen">
            <div class="loading-mark" aria-hidden="true">★</div>
            <h1>FLING<br><span>FIASCO</span></h1>
            <p id="loading-label">Winding up the toybox…</p>
            <div class="loading-track" role="progressbar" aria-labelledby="loading-label" aria-valuemin="0" aria-valuemax="100" aria-valuenow="10">
              <span id="loading-bar"></span>
            </div>
          </div>
          <div class="hud" id="hud" hidden>
            <div class="hud-top">
              <div class="objective-chip">
                <span class="eyebrow" id="level-label">STUNT 1</span>
                <strong id="goal-label">Curtain Call</strong>
              </div>
              <div class="status-cluster">
                <span class="status-pill"><small id="flings-title">FLINGS</small><b id="flings-label">3</b></span>
                <span class="status-pill"><small id="time-title">TIME</small><b id="time-label">0:00</b></span>
                <button class="icon-button" id="pause-button" type="button" aria-label="Pause">Ⅱ</button>
              </div>
            </div>
            <div class="target-bearing" id="target-bearing" aria-live="off">🔔 → 6.0m</div>
            <div class="power-wrap" id="power-wrap" hidden>
              <span id="power-title">POWER</span>
              <div class="power-track"><span id="power-fill"></span></div>
            </div>
            <div class="control-hint" id="control-hint">
              <span class="swipe-glyph" aria-hidden="true">☝</span>
              <strong id="hint-title">SWIPE TO FLING</strong>
              <small id="hint-detail">Drag toward the bell, then release</small>
            </div>
          </div>
          <div class="rotate-hint" id="rotate-hint">
            <span aria-hidden="true">↻</span>
            <p>Portrait is best — rotate your phone for the full stunt.</p>
          </div>
          <div class="modal-layer" id="modal-layer" hidden>
            <section class="toy-panel" id="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title"></section>
          </div>
          <p class="storage-note" id="storage-note" hidden></p>
          <div class="sr-only" id="live-region" aria-live="polite"></div>
        </section>
        <div class="side-dressing side-left" aria-hidden="true"><span>FLING</span><i>★</i></div>
        <div class="side-dressing side-right" aria-hidden="true"><i>★</i><span>FIASCO</span></div>
      </main>
    `;
    this.stage = root.querySelector<HTMLElement>("#stage-viewport")!;
    this.loading = root.querySelector<HTMLElement>("#loading-screen")!;
    this.loadingBar = root.querySelector<HTMLElement>("#loading-bar")!;
    this.hud = root.querySelector<HTMLElement>("#hud")!;
    this.levelLabel = root.querySelector<HTMLElement>("#level-label")!;
    this.goalLabel = root.querySelector<HTMLElement>("#goal-label")!;
    this.flingsLabel = root.querySelector<HTMLElement>("#flings-label")!;
    this.timeLabel = root.querySelector<HTMLElement>("#time-label")!;
    this.powerWrap = root.querySelector<HTMLElement>("#power-wrap")!;
    this.powerFill = root.querySelector<HTMLElement>("#power-fill")!;
    this.hint = root.querySelector<HTMLElement>("#control-hint")!;
    this.modal = root.querySelector<HTMLElement>("#modal-layer")!;
    this.modalPanel = root.querySelector<HTMLElement>("#modal-panel")!;
    this.liveRegion = root.querySelector<HTMLElement>("#live-region")!;
    this.rotateHint = root.querySelector<HTMLElement>("#rotate-hint")!;
    this.persistenceNote = root.querySelector<HTMLElement>("#storage-note")!;

    root
      .querySelector<HTMLButtonElement>("#pause-button")!
      .addEventListener("click", () => {
        this.callbacks.onPause();
      });
    this.modalPanel.addEventListener("keydown", this.onModalKeyDown);
  }

  configure(save: SaveData, persistent: boolean): void {
    this.save = save;
    this.language = save.settings.language;
    document.documentElement.lang = this.language === "zh" ? "zh-CN" : "en";
    document.documentElement.classList.toggle(
      "reduced-motion",
      save.settings.reducedMotion,
    );
    this.persistenceNote.hidden = persistent;
    this.persistenceNote.textContent = t(this.language, "storageOff");
    this.refreshStaticLabels();
  }

  setLoading(progress: number): void {
    const clamped = Math.max(0, Math.min(100, progress));
    this.loadingBar.style.width = `${clamped}%`;
    const track = this.loadingBar.parentElement;
    track?.setAttribute("aria-valuenow", String(Math.round(clamped)));
  }

  enterGame(level: LevelDefinition): void {
    this.loading.classList.add("is-done");
    this.hud.hidden = false;
    this.modal.hidden = true;
    this.levelLabel.textContent = `${t(this.language, "level")} ${level.id}`;
    this.goalLabel.textContent = level.name;
    this.showHint(level.hint);
  }

  updateHud(
    level: LevelDefinition,
    flingsRemaining: number,
    elapsed: number,
    distance: number,
    goalDelta: Vec2,
  ): void {
    this.levelLabel.textContent = `${t(this.language, "level")} ${level.id}`;
    this.goalLabel.textContent = level.name;
    this.flingsLabel.textContent = String(flingsRemaining);
    const minutes = Math.floor(elapsed / 60);
    const seconds = Math.floor(elapsed % 60);
    this.timeLabel.textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
    const arrow =
      Math.abs(goalDelta[0]) > Math.abs(goalDelta[1])
        ? goalDelta[0] >= 0
          ? "→"
          : "←"
        : goalDelta[1] >= 0
          ? "↑"
          : "↓";
    this.stage.parentElement
      ?.querySelector<HTMLElement>("#target-bearing")
      ?.replaceChildren(
        document.createTextNode(`🔔 ${arrow} ${distance.toFixed(1)}m`),
      );
  }

  setPower(power: number, visible: boolean): void {
    this.powerWrap.hidden = !visible;
    this.powerFill.style.height = `${Math.round(Math.max(0, Math.min(1, power)) * 100)}%`;
  }

  dismissHint(): void {
    this.hint.classList.add("is-hidden");
  }

  showHint(detail: string): void {
    window.clearTimeout(this.hintTimer);
    this.hint.classList.remove("is-hidden");
    const title = this.hint.querySelector<HTMLElement>("#hint-title");
    const description = this.hint.querySelector<HTMLElement>("#hint-detail");
    if (title) title.textContent = t(this.language, "swipe");
    if (description)
      description.textContent =
        this.language === "zh" ? t(this.language, "aim") : detail;
    this.hintTimer = window.setTimeout(() => this.dismissHint(), 8000);
  }

  showPause(): void {
    const save = this.save;
    if (!save) return;
    this.modalPanel.innerHTML = `
      <div class="panel-kicker">${t(this.language, "pause")}</div>
      <h2 id="modal-title">INTERMISSION</h2>
      <p class="panel-copy">${t(this.language, "keyboard")}</p>
      <p class="panel-copy">${t(this.language, "scoring")}</p>
      <div class="primary-actions">
        <button class="toy-button primary" data-action="resume">${t(this.language, "resume")}</button>
        <button class="toy-button" data-action="retry">${t(this.language, "retry")}</button>
        <button class="toy-button" data-action="shelf">${t(this.language, "shelf")}</button>
      </div>
      ${this.settingsMarkup(save)}
    `;
    this.openModal();
    this.bindModalActions();
  }

  showVictory(view: VictoryView): void {
    const stars = Array.from(
      { length: 3 },
      (_, index) =>
        `<span class="${index < view.score.stars ? "earned" : ""}">★</span>`,
    ).join("");
    this.modalPanel.innerHTML = `
      <div class="panel-kicker">${view.finalLevel ? t(this.language, "finale") : t(this.language, "won")}</div>
      <h2 id="modal-title">${view.finalLevel ? "GRAND FIASCO" : view.level.name}</h2>
      <div class="star-row" aria-label="${view.score.stars} ${t(this.language, "stars")}">${stars}</div>
      <div class="result-score">
        <small>${t(this.language, "score")}</small>
        <strong>${view.score.points.toLocaleString()}</strong>
        <span>${view.elapsed.toFixed(1)}s · ${view.flingsUsed}/${view.level.maxFlings}</span>
      </div>
      <div class="result-ribbons">
        ${view.improved ? `<b>${t(this.language, "best")}</b>` : ""}
        ${view.newlyUnlocked ? `<b>${t(this.language, "unlocked")}</b>` : ""}
      </div>
      <p class="panel-copy">${view.finalLevel ? t(this.language, "finaleSub") : view.level.subtitle}</p>
      <div class="primary-actions">
        <button class="toy-button primary" data-action="next">${view.finalLevel ? t(this.language, "shelf") : t(this.language, "continue")}</button>
        <button class="toy-button" data-action="retry">${t(this.language, "retry")}</button>
      </div>
    `;
    this.openModal();
    this.bindModalActions();
    this.announce(
      `${t(this.language, "won")} ${view.score.stars} ${t(this.language, "stars")}`,
    );
  }

  showFailure(reason: "fell" | "crushed" | "outOfFlings" | "timeout"): void {
    this.modalPanel.innerHTML = `
      <div class="panel-kicker danger">${t(this.language, "failed")}</div>
      <h2 id="modal-title">OOF!</h2>
      <div class="failure-stamp" aria-hidden="true">✦</div>
      <p class="panel-copy">${t(this.language, reason)}</p>
      <div class="primary-actions">
        <button class="toy-button primary" data-action="retry">${t(this.language, "retry")}</button>
        <button class="toy-button" data-action="shelf">${t(this.language, "shelf")}</button>
      </div>
    `;
    this.openModal();
    this.bindModalActions();
    this.announce(`${t(this.language, "failed")}: ${t(this.language, reason)}`);
  }

  showShelf(save: SaveData): void {
    this.save = save;
    const totalStars = Object.values(save.levels).reduce(
      (sum, record) => sum + record.stars,
      0,
    );
    const cards = LEVELS.map((level) => {
      const locked = level.id > save.unlockedLevel;
      const record = save.levels[String(level.id)];
      const stars = record ? "★".repeat(record.stars).padEnd(3, "☆") : "☆☆☆";
      return `
        <button class="level-card ${locked ? "is-locked" : ""}" data-level="${level.id}" ${locked ? "disabled" : ""}>
          <span class="level-badge" aria-hidden="true">${locked ? "🔒" : level.badge}</span>
          <span><small>${t(this.language, "level")} ${level.id}</small><strong>${level.name}</strong></span>
          <b aria-label="${record?.stars ?? 0} ${t(this.language, "stars")}">${locked ? t(this.language, "locked") : stars}</b>
        </button>
      `;
    }).join("");
    this.modalPanel.innerHTML = `
      <div class="shelf-heading">
        <div><div class="panel-kicker">${t(this.language, "shelf")}</div><h2 id="modal-title">STUNT BADGES</h2></div>
        <div class="total-stars"><span>★</span><b>${totalStars}/36</b></div>
      </div>
      <div class="level-grid">${cards}</div>
      <div class="primary-actions compact">
        <button class="toy-button primary" data-action="resume">${t(this.language, "resume")}</button>
      </div>
    `;
    this.openModal("wide");
    this.modalPanel
      .querySelectorAll<HTMLButtonElement>("[data-level]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const levelId = Number(button.dataset.level);
          this.setModalBusy();
          this.callbacks.onSelectLevel(levelId);
        });
      });
    this.bindModalActions();
  }

  hideModal(): void {
    this.modal.hidden = true;
    this.hud.inert = false;
    this.stage.inert = false;
    this.modalPanel.removeAttribute("aria-busy");
    this.modalPanel.replaceChildren();
    const restoreTarget =
      this.previousFocus?.isConnected &&
      !this.previousFocus.closest("#modal-layer")
        ? this.previousFocus
        : this.stage;
    restoreTarget.focus({ preventScroll: true });
    this.previousFocus = null;
  }

  showContextLost(): void {
    this.modalPanel.innerHTML = `
      <div class="panel-kicker danger">DISPLAY PAUSED</div>
      <h2 id="modal-title">THE CURTAIN FELL</h2>
      <p class="panel-copy">The graphics context was interrupted. The stage will recover automatically; reload if it does not return.</p>
      <div class="primary-actions"><button class="toy-button primary" data-action="reload">Reload stunt</button></div>
    `;
    this.openModal();
    this.bindModalActions();
  }

  announce(message: string): void {
    this.liveRegion.textContent = "";
    window.setTimeout(() => {
      this.liveRegion.textContent = message;
    }, 20);
  }

  private settingsMarkup(save: SaveData): string {
    const settings = save.settings;
    return `
      <fieldset class="settings-block">
        <legend>${t(this.language, "settings")}</legend>
        <label class="toggle-row"><span>♫ ${t(this.language, "music")}</span><input type="checkbox" data-setting="music" ${settings.music ? "checked" : ""}><i></i></label>
        <label class="toggle-row"><span>✦ ${t(this.language, "effects")}</span><input type="checkbox" data-setting="effects" ${settings.effects ? "checked" : ""}><i></i></label>
        <label class="toggle-row"><span>↯ ${t(this.language, "motion")}</span><input type="checkbox" data-setting="reducedMotion" ${settings.reducedMotion ? "checked" : ""}><i></i></label>
      </fieldset>
    `;
  }

  private openModal(size = ""): void {
    if (this.modal.hidden) {
      this.previousFocus = document.activeElement as HTMLElement | null;
    }
    this.modal.hidden = false;
    this.hud.inert = true;
    this.stage.inert = true;
    this.modalPanel.className = `toy-panel ${size}`;
    this.modalPanel.removeAttribute("aria-busy");
    window.setTimeout(() => {
      this.modalPanel
        .querySelector<HTMLElement>("button, input, select")
        ?.focus({ preventScroll: true });
    }, 30);
  }

  private bindModalActions(): void {
    this.modalPanel
      .querySelectorAll<HTMLElement>("[data-action]")
      .forEach((element) => {
        element.addEventListener("click", () => {
          const action = element.dataset.action;
          this.setModalBusy();
          if (action === "resume") this.callbacks.onResume();
          else if (action === "retry") this.callbacks.onRetry();
          else if (action === "next") this.callbacks.onNext();
          else if (action === "shelf") this.callbacks.onOpenShelf();
          else if (action === "reload") window.location.reload();
        });
      });
    this.modalPanel
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-setting]")
      .forEach((input) => {
        input.addEventListener("change", () => {
          const setting = input.dataset.setting;
          if (input instanceof HTMLInputElement) {
            this.callbacks.onSettings({ [setting!]: input.checked });
          }
        });
      });
  }

  private setModalBusy(): void {
    this.modalPanel.setAttribute("aria-busy", "true");
    this.modalPanel
      .querySelectorAll<HTMLButtonElement>("[data-action], [data-level]")
      .forEach((button) => {
        button.disabled = true;
      });
  }

  private readonly onModalKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Tab") return;
    const controls = Array.from(
      this.modalPanel.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    ).filter((control) => !control.hidden);
    if (controls.length === 0) return;
    const first = controls[0]!;
    const last = controls[controls.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  private refreshStaticLabels(): void {
    const byId = (id: string): HTMLElement | null =>
      this.stage.parentElement?.querySelector<HTMLElement>(`#${id}`) ?? null;
    byId("flings-title")!.textContent = t(this.language, "flings");
    byId("time-title")!.textContent = t(this.language, "time");
    byId("power-title")!.textContent = t(this.language, "power");
    byId("loading-label")!.textContent = t(this.language, "loading");
    byId("pause-button")!.setAttribute("aria-label", t(this.language, "pause"));
    byId("hint-title")!.textContent = t(this.language, "swipe");
    byId("hint-detail")!.textContent = t(this.language, "aim");
    this.rotateHint.querySelector("p")!.textContent = t(
      this.language,
      "rotate",
    );
  }
}
