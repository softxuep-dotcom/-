export const FIXED_TIMESTEP = 1 / 60;
export const MAX_FRAME_DELTA = 0.1;
export const MAX_CATCHUP_STEPS = 5;
export const MAX_ROUND_SECONDS = 60;

export interface ScoreInput {
  readonly maxFlings: number;
  readonly flingsUsed: number;
  readonly elapsedSeconds: number;
  readonly parTime: number;
}

export interface LevelScore {
  readonly stars: 1 | 2 | 3;
  readonly timeBonus: number;
  readonly flingBonus: number;
  readonly points: number;
}

export function calculateScore(input: ScoreInput): LevelScore {
  const remaining = Math.max(0, input.maxFlings - input.flingsUsed);
  const fast = input.elapsedSeconds <= input.parTime;
  const precise = remaining >= Math.max(1, Math.floor(input.maxFlings / 2));
  const stars: 1 | 2 | 3 = precise && fast ? 3 : remaining >= 1 || fast ? 2 : 1;
  const timeBonus = Math.max(
    0,
    Math.round((input.parTime - input.elapsedSeconds) * 25),
  );
  const flingBonus = remaining * 400;
  return {
    stars,
    timeBonus,
    flingBonus,
    points: 1000 + timeBonus + flingBonus,
  };
}

export function shouldFailForSettledShots(
  flingsUsed: number,
  maxFlings: number,
  averageSpeed: number,
  settledSeconds: number,
): boolean {
  return (
    flingsUsed >= maxFlings &&
    ((averageSpeed < 0.68 && settledSeconds > 1.25) || settledSeconds > 4.25)
  );
}

export class FixedStepClock {
  private accumulator = 0;

  reset(): void {
    this.accumulator = 0;
  }

  consume(frameDelta: number, step: () => void): number {
    this.accumulator += Math.min(Math.max(frameDelta, 0), MAX_FRAME_DELTA);
    let count = 0;
    while (this.accumulator >= FIXED_TIMESTEP && count < MAX_CATCHUP_STEPS) {
      step();
      this.accumulator -= FIXED_TIMESTEP;
      count += 1;
    }
    if (count === MAX_CATCHUP_STEPS) {
      this.accumulator = Math.min(this.accumulator, FIXED_TIMESTEP);
    }
    return count;
  }
}
