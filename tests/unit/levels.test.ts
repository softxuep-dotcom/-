import { beforeAll, describe, expect, it } from "vitest";
import { LEVELS, type Vec2 } from "../../src/game/content/levels";
import { initializeRapier } from "../../src/physics/initRapier";
import { PhysicsStage } from "../../src/physics/physicsStage";

beforeAll(async () => {
  await initializeRapier();
});

function normalizedAim(from: Vec2, to: Vec2, verticalBias: number): Vec2 {
  const x = to[0] - from[0];
  const y = to[1] - from[1] + verticalBias;
  const length = Math.max(0.01, Math.hypot(x, y));
  return [x / length, y / length];
}

function routeTarget(stage: PhysicsStage, levelId: number): Vec2 {
  const level = LEVELS[levelId - 1]!;
  const progress = stage.getMechanismProgress();
  const required = level.requiredActivations;
  if (
    required?.bumperHits !== undefined &&
    progress.bumperHits < required.bumperHits
  ) {
    const bumpers = level.mechanisms.filter(
      (mechanism) => mechanism.type === "bumper",
    );
    return bumpers[progress.bumperHits]?.position ?? level.goal;
  }
  const missingType = required?.types?.find(
    (type) => !progress.types.includes(type),
  );
  const mechanism = level.mechanisms.find(
    (candidate) => candidate.type === missingType,
  );
  if (mechanism?.type === "fan") {
    return [
      mechanism.position[0],
      mechanism.position[1] + mechanism.size[1] * 0.42,
    ];
  }
  return mechanism?.position ?? stage.getGoalState().position;
}

function attemptLevel(
  levelId: number,
  verticalBias: number,
  intervalSeconds: number,
  initialDelay: number,
): {
  readonly won: boolean;
  readonly flings: number;
  readonly bumperHits: number;
  readonly distance: number;
} {
  const level = LEVELS[levelId - 1]!;
  const stage = new PhysicsStage(level);
  let won = false;
  let failed = false;
  let flings = 0;
  let nextFling = initialDelay;
  for (let step = 0; step < 60 * 18 && !won && !failed; step += 1) {
    const time = step / 60;
    if (flings < level.maxFlings && time >= nextFling) {
      stage.fling(
        normalizedAim(
          stage.getFocusPosition(),
          routeTarget(stage, levelId),
          verticalBias,
        ),
        1,
      );
      flings += 1;
      nextFling += intervalSeconds;
    }
    stage.step({
      onImpact: () => undefined,
      onSpring: () => undefined,
      onGoal: () => {
        won = true;
      },
      onFailure: () => {
        failed = true;
      },
    });
  }
  const bumperHits = stage.getMechanismProgress().bumperHits;
  const distance = stage.getDistanceToGoal();
  stage.dispose();
  return { won, flings, bumperHits, distance };
}

describe("level completion smoke solver", () => {
  for (const level of LEVELS) {
    it(`finds a legal assisted completion for level ${level.id}: ${level.name}`, () => {
      let bestAttempt = { bumperHits: 0, distance: Number.POSITIVE_INFINITY };
      let strategy:
        | {
            readonly verticalBias: number;
            readonly intervalSeconds: number;
            readonly initialDelay: number;
            readonly flings: number;
          }
        | undefined;
      for (const bias of [-0.1, 0.15, 0.4, 0.7, 1]) {
        for (const interval of [0.65, 1, 1.45, 2]) {
          for (const delay of [0, 0.4, 0.9, 1.4]) {
            const attempt = attemptLevel(level.id, bias, interval, delay);
            if (
              attempt.bumperHits > bestAttempt.bumperHits ||
              (attempt.bumperHits === bestAttempt.bumperHits &&
                attempt.distance < bestAttempt.distance)
            ) {
              bestAttempt = attempt;
            }
            if (attempt.won) {
              strategy = {
                verticalBias: bias,
                intervalSeconds: interval,
                initialDelay: delay,
                flings: attempt.flings,
              };
              break;
            }
          }
          if (strategy) break;
        }
        if (strategy) break;
      }
      expect(
        strategy,
        `No legal completion found for level ${level.id}; best ${JSON.stringify(bestAttempt)}`,
      ).toBeDefined();
    });
  }
});
