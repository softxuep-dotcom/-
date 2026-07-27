import type { Vec2 } from "../content/levels";

export interface AimState {
  readonly active: boolean;
  readonly direction: Vec2;
  readonly power: number;
}

export interface InputCallbacks {
  readonly onAim: (aim: AimState) => void;
  readonly onFling: (direction: Vec2, power: number) => void;
  readonly onPause: () => void;
  readonly onRetry: () => void;
  readonly onFirstGesture: () => void;
}

export class InputController {
  private enabled = true;
  private pointerId: number | null = null;
  private start = { x: 0, y: 0 };
  private currentAim: AimState = {
    active: false,
    direction: [0.8, 0.6],
    power: 0,
  };
  private keyboardDirection: [number, number] = [0.8, 0.6];
  private firstGestureSent = false;

  constructor(
    private readonly element: HTMLElement,
    private readonly callbacks: InputCallbacks,
  ) {
    element.addEventListener("pointerdown", this.onPointerDown);
    element.addEventListener("pointermove", this.onPointerMove);
    element.addEventListener("pointerup", this.onPointerUp);
    element.addEventListener("pointercancel", this.onPointerCancel);
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("blur", this.cancel);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.cancel();
  }

  dispose(): void {
    this.element.removeEventListener("pointerdown", this.onPointerDown);
    this.element.removeEventListener("pointermove", this.onPointerMove);
    this.element.removeEventListener("pointerup", this.onPointerUp);
    this.element.removeEventListener("pointercancel", this.onPointerCancel);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("blur", this.cancel);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.enabled || this.pointerId !== null || event.button !== 0) return;
    if (
      (event.target as HTMLElement).closest(
        "button, input, select, [role='dialog']",
      )
    )
      return;
    this.signalFirstGesture();
    this.pointerId = event.pointerId;
    this.start = { x: event.clientX, y: event.clientY };
    this.capturePointer(event.pointerId);
    this.updatePointer(event);
    event.preventDefault();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.updatePointer(event);
    event.preventDefault();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.updatePointer(event);
    const aim = this.currentAim;
    this.pointerId = null;
    this.releasePointer(event.pointerId);
    this.callbacks.onAim({ ...aim, active: false });
    if (aim.power >= 0.12) this.callbacks.onFling(aim.direction, aim.power);
    event.preventDefault();
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) this.cancel();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        "button, input, select, textarea, a, [contenteditable='true']",
      )
    ) {
      return;
    }
    if (key === "escape" || key === "p") {
      event.preventDefault();
      this.callbacks.onPause();
      return;
    }
    if (key === "r") {
      event.preventDefault();
      this.callbacks.onRetry();
      return;
    }
    if (!this.enabled) return;
    if (
      [
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
        " ",
        "enter",
        "w",
        "a",
        "s",
        "d",
      ].includes(key)
    ) {
      event.preventDefault();
    }
    const delta: Record<string, Vec2> = {
      arrowup: [0, 0.16],
      w: [0, 0.16],
      arrowdown: [0, -0.16],
      s: [0, -0.16],
      arrowleft: [-0.16, 0],
      a: [-0.16, 0],
      arrowright: [0.16, 0],
      d: [0.16, 0],
    };
    const change = delta[key];
    if (change) {
      this.signalFirstGesture();
      const x = this.keyboardDirection[0] + change[0];
      const y = this.keyboardDirection[1] + change[1];
      const length = Math.max(0.001, Math.hypot(x, y));
      this.keyboardDirection = [x / length, y / length];
      this.currentAim = {
        active: true,
        direction: this.keyboardDirection,
        power: 0.78,
      };
      this.callbacks.onAim(this.currentAim);
    } else if (key === " " || key === "enter") {
      this.signalFirstGesture();
      this.callbacks.onFling(this.keyboardDirection, 0.78);
      this.callbacks.onAim({
        active: false,
        direction: this.keyboardDirection,
        power: 0,
      });
    }
  };

  private updatePointer(event: PointerEvent): void {
    const dx = event.clientX - this.start.x;
    const dy = this.start.y - event.clientY;
    const distance = Math.hypot(dx, dy);
    const length = Math.max(1, distance);
    const direction: Vec2 = [dx / length, dy / length];
    const diagonal = Math.hypot(
      this.element.clientWidth,
      this.element.clientHeight,
    );
    const power = Math.min(1, distance / Math.max(120, diagonal * 0.23));
    this.currentAim = { active: true, direction, power };
    this.keyboardDirection = [direction[0], direction[1]];
    this.callbacks.onAim(this.currentAim);
  }

  private readonly cancel = (): void => {
    if (this.pointerId !== null) this.releasePointer(this.pointerId);
    this.pointerId = null;
    this.callbacks.onAim({ ...this.currentAim, active: false, power: 0 });
  };

  private capturePointer(pointerId: number): void {
    try {
      this.element.setPointerCapture(pointerId);
    } catch {
      // Capture is an enhancement; the gesture still works while over the stage.
    }
  }

  private releasePointer(pointerId: number): void {
    try {
      if (this.element.hasPointerCapture(pointerId))
        this.element.releasePointerCapture(pointerId);
    } catch {
      // A cancelled or detached pointer is already effectively released.
    }
  }

  private signalFirstGesture(): void {
    if (this.firstGestureSent) return;
    this.firstGestureSent = true;
    this.callbacks.onFirstGesture();
  }
}
