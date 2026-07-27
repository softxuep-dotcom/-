import { describe, expect, it } from "vitest";
import { LEVELS } from "../../src/game/content/levels";

describe("authored content", () => {
  it("ships twelve distinct formal levels", () => {
    expect(LEVELS).toHaveLength(12);
    expect(new Set(LEVELS.map((level) => level.name)).size).toBe(12);
    expect(
      new Set(LEVELS.map((level) => `${level.goal[0]}:${level.goal[1]}`)).size,
    ).toBeGreaterThan(8);
    for (const level of LEVELS) {
      expect(level.maxFlings).toBeGreaterThanOrEqual(3);
      expect(level.maxFlings).toBeLessThanOrEqual(6);
      expect(level.parTime).toBeGreaterThanOrEqual(16);
      expect(level.parTime).toBeLessThanOrEqual(48);
      expect(level.walls.length).toBeGreaterThan(0);
    }
  });

  it("contains at least four decision-changing mechanism families", () => {
    const mechanismTypes = new Set(
      LEVELS.flatMap((level) => level.mechanisms.map((item) => item.type)),
    );
    expect([...mechanismTypes].sort()).toEqual([
      "bumper",
      "crate",
      "crusher",
      "fan",
      "platform",
      "spring",
    ]);
  });

  it("introduces and recombines mechanisms along the difficulty curve", () => {
    const firstAppearance = new Map<string, number>();
    for (const level of LEVELS) {
      for (const mechanism of level.mechanisms) {
        if (!firstAppearance.has(mechanism.type))
          firstAppearance.set(mechanism.type, level.id);
      }
    }
    expect(firstAppearance.get("bumper")).toBe(2);
    expect(firstAppearance.get("fan")).toBe(4);
    expect(firstAppearance.get("crate")).toBe(5);
    expect(firstAppearance.get("crusher")).toBe(6);
    expect(firstAppearance.get("spring")).toBe(7);
    expect(firstAppearance.get("platform")).toBe(9);
    expect(LEVELS[11]!.mechanisms.length).toBeGreaterThanOrEqual(6);
  });
});
