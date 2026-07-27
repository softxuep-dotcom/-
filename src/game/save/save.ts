export interface LevelRecord {
  readonly stars: number;
  readonly bestTime: number;
  readonly bestFlings: number;
  readonly bestPoints: number;
}

export interface GameSettings {
  readonly music: boolean;
  readonly effects: boolean;
  readonly language: "en" | "zh";
  readonly reducedMotion: boolean;
}

export interface SaveData {
  readonly version: 1;
  readonly unlockedLevel: number;
  readonly levels: Readonly<Record<string, LevelRecord>>;
  readonly settings: GameSettings;
}

const SAVE_KEY = "fling-fiasco-save";

function defaultLanguage(): "en" | "zh" {
  return "en";
}

function sanitizeLevelRecords(value: unknown): Record<string, LevelRecord> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const records: Record<string, LevelRecord> = {};
  for (const [key, rawRecord] of Object.entries(value)) {
    const levelId = Number(key);
    if (
      !Number.isInteger(levelId) ||
      levelId < 1 ||
      levelId > 12 ||
      !rawRecord ||
      typeof rawRecord !== "object"
    ) {
      continue;
    }
    const record = rawRecord as Partial<LevelRecord>;
    const stars = Number(record.stars);
    const bestTime = Number(record.bestTime);
    const bestFlings = Number(record.bestFlings);
    const bestPoints = Number(record.bestPoints);
    records[key] = {
      stars: Number.isFinite(stars)
        ? Math.max(0, Math.min(3, Math.floor(stars)))
        : 0,
      bestTime: Number.isFinite(bestTime) ? Math.max(0, bestTime) : 0,
      bestFlings: Number.isFinite(bestFlings)
        ? Math.max(0, Math.floor(bestFlings))
        : 0,
      bestPoints: Number.isFinite(bestPoints)
        ? Math.max(0, Math.floor(bestPoints))
        : 0,
    };
  }
  return records;
}

export function createDefaultSave(): SaveData {
  return {
    version: 1,
    unlockedLevel: 1,
    levels: {},
    settings: {
      music: true,
      effects: true,
      language: defaultLanguage(),
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches,
    },
  };
}

export function parseSave(raw: string | null): SaveData {
  const fallback = createDefaultSave();
  if (!raw) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return fallback;
    const candidate = value as Partial<SaveData>;
    if (candidate.version !== 1) return fallback;
    const unlockedLevel =
      typeof candidate.unlockedLevel === "number" &&
      Number.isFinite(candidate.unlockedLevel)
        ? Math.max(1, Math.min(12, Math.floor(candidate.unlockedLevel)))
        : 1;
    const settings = candidate.settings;
    return {
      version: 1,
      unlockedLevel,
      levels: sanitizeLevelRecords(candidate.levels),
      settings: {
        music: typeof settings?.music === "boolean" ? settings.music : true,
        effects:
          typeof settings?.effects === "boolean" ? settings.effects : true,
        language: "en",
        reducedMotion:
          typeof settings?.reducedMotion === "boolean"
            ? settings.reducedMotion
            : fallback.settings.reducedMotion,
      },
    };
  } catch {
    return fallback;
  }
}

export class SaveStore {
  private data: SaveData;
  private storageAvailable = true;

  constructor() {
    try {
      this.data = parseSave(window.localStorage.getItem(SAVE_KEY));
    } catch {
      this.storageAvailable = false;
      this.data = createDefaultSave();
    }
  }

  get snapshot(): SaveData {
    return this.data;
  }

  get isPersistent(): boolean {
    return this.storageAvailable;
  }

  updateSettings(patch: Partial<GameSettings>): SaveData {
    this.data = {
      ...this.data,
      settings: { ...this.data.settings, ...patch },
    };
    this.persist();
    return this.data;
  }

  recordVictory(
    levelId: number,
    record: LevelRecord,
    totalLevels: number,
  ): {
    readonly data: SaveData;
    readonly improved: boolean;
    readonly newlyUnlocked: boolean;
  } {
    const key = String(levelId);
    const previous = this.data.levels[key];
    const improved =
      !previous ||
      record.stars > previous.stars ||
      record.bestPoints > previous.bestPoints;
    const merged: LevelRecord = previous
      ? {
          stars: Math.max(previous.stars, record.stars),
          bestTime: Math.min(previous.bestTime, record.bestTime),
          bestFlings: Math.min(previous.bestFlings, record.bestFlings),
          bestPoints: Math.max(previous.bestPoints, record.bestPoints),
        }
      : record;
    const nextUnlocked = Math.min(
      totalLevels,
      Math.max(this.data.unlockedLevel, levelId + 1),
    );
    const newlyUnlocked = nextUnlocked > this.data.unlockedLevel;
    this.data = {
      ...this.data,
      unlockedLevel: nextUnlocked,
      levels: { ...this.data.levels, [key]: merged },
    };
    this.persist();
    return { data: this.data, improved, newlyUnlocked };
  }

  replaceForTest(value: SaveData): void {
    this.data = value;
    this.persist();
  }

  private persist(): void {
    if (!this.storageAvailable) return;
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      this.storageAvailable = false;
    }
  }
}
