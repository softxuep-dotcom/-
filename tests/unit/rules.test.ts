import { describe, expect, it } from "vitest";
import {
  calculateScore,
  FIXED_TIMESTEP,
  FixedStepClock,
  shouldFailForSettledShots,
} from "../../src/game/simulation/rules";

describe("simulation rules", () => {
  it("awards stars from visible time and fling criteria", () => {
    expect(
      calculateScore({
        maxFlings: 4,
        flingsUsed: 1,
        elapsedSeconds: 8,
        parTime: 20,
      }).stars,
    ).toBe(3);
    expect(
      calculateScore({
        maxFlings: 4,
        flingsUsed: 4,
        elapsedSeconds: 18,
        parTime: 20,
      }).stars,
    ).toBe(2);
    expect(
      calculateScore({
        maxFlings: 4,
        flingsUsed: 4,
        elapsedSeconds: 30,
        parTime: 20,
      }).stars,
    ).toBe(1);
  });

  it("produces the same fixed simulation count at common display refresh rates", () => {
    for (const refreshRate of [60, 120, 144, 165]) {
      const clock = new FixedStepClock();
      let steps = 0;
      for (let frame = 0; frame < refreshRate * 10; frame += 1) {
        clock.consume(1 / refreshRate, () => {
          steps += 1;
        });
      }
      expect(steps, `${refreshRate} Hz`).toBeGreaterThanOrEqual(599);
      expect(steps, `${refreshRate} Hz`).toBeLessThanOrEqual(600);
      expect(steps * FIXED_TIMESTEP).toBeCloseTo(10, 1);
    }
  });

  it("ends an exhausted attempt after settling or a bounded wait", () => {
    expect(shouldFailForSettledShots(3, 3, 0.3, 1.3)).toBe(true);
    expect(shouldFailForSettledShots(3, 3, 3, 2)).toBe(false);
    expect(shouldFailForSettledShots(3, 3, 3, 4.3)).toBe(true);
    expect(shouldFailForSettledShots(2, 3, 0, 10)).toBe(false);
  });
});
