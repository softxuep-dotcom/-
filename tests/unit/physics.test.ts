import { beforeAll, describe, expect, it } from "vitest";
import { getLevel } from "../../src/game/content/levels";
import { initializeRapier } from "../../src/physics/initRapier";
import { PhysicsStage } from "../../src/physics/physicsStage";

beforeAll(async () => {
  await initializeRapier();
});

describe("PhysicsStage", () => {
  it("keeps an untouched ragdoll stable on the stage", () => {
    const stage = new PhysicsStage(getLevel(1));
    let failed = false;
    for (let index = 0; index < 600; index += 1) {
      stage.step({
        onImpact: () => undefined,
        onSpring: () => undefined,
        onGoal: () => undefined,
        onFailure: () => {
          failed = true;
        },
      });
    }
    const focus = stage.getFocusPosition();
    expect(Number.isFinite(focus[0])).toBe(true);
    expect(Number.isFinite(focus[1])).toBe(true);
    expect(Math.abs(focus[0])).toBeLessThan(8);
    expect(focus[1]).toBeGreaterThan(-4);
    expect(failed).toBe(false);
    stage.dispose();
  });

  it("uses a capped, finite impulse", () => {
    const stage = new PhysicsStage(getLevel(1));
    stage.fling([0.8, 0.6], 1);
    for (let index = 0; index < 360; index += 1) {
      stage.step({
        onImpact: () => undefined,
        onSpring: () => undefined,
        onGoal: () => undefined,
        onFailure: () => undefined,
      });
    }
    const focus = stage.getFocusPosition();
    expect(Number.isFinite(focus[0])).toBe(true);
    expect(Number.isFinite(focus[1])).toBe(true);
    expect(Math.abs(focus[0])).toBeLessThan(100);
    expect(Math.abs(focus[1])).toBeLessThan(100);
    stage.dispose();
  });
});
