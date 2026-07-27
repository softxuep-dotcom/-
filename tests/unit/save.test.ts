import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultSave,
  parseSave,
  SaveStore,
} from "../../src/game/save/save";

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  vi.stubGlobal("navigator", { language: "en-US" });
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: false }),
    localStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("save data", () => {
  it("falls back safely for empty, corrupt, and unknown-version data", () => {
    expect(parseSave(null).unlockedLevel).toBe(1);
    expect(parseSave("{broken").unlockedLevel).toBe(1);
    expect(parseSave('{"version":99,"unlockedLevel":12}').unlockedLevel).toBe(
      1,
    );
  });

  it("merges victory records without duplicating or reducing rewards", () => {
    const store = new SaveStore();
    store.recordVictory(
      1,
      { stars: 2, bestTime: 20, bestFlings: 2, bestPoints: 1500 },
      12,
    );
    store.recordVictory(
      1,
      { stars: 1, bestTime: 25, bestFlings: 3, bestPoints: 1200 },
      12,
    );
    expect(store.snapshot.unlockedLevel).toBe(2);
    expect(store.snapshot.levels["1"]).toEqual({
      stars: 2,
      bestTime: 20,
      bestFlings: 2,
      bestPoints: 1500,
    });
  });

  it("keeps a serializable versioned schema", () => {
    const value = createDefaultSave();
    expect(value.version).toBe(1);
    expect(JSON.parse(JSON.stringify(value))).toEqual(value);
  });
});
