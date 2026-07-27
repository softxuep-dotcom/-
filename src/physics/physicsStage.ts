import RAPIER from "@dimforge/rapier3d-compat";
import type {
  ActivationType,
  LevelDefinition,
  Mechanism,
  Vec2,
  Wall,
} from "../game/content/levels";
import { FIXED_TIMESTEP } from "../game/simulation/rules";

export type VisualShape =
  | { readonly kind: "box"; readonly size: readonly [number, number, number] }
  | { readonly kind: "sphere"; readonly radius: number }
  | {
      readonly kind: "capsule";
      readonly radius: number;
      readonly length: number;
    };

export interface PhysicsVisual {
  readonly id: string;
  readonly body: RAPIER.RigidBody;
  readonly shape: VisualShape;
  readonly color: string;
  readonly accent?: string;
  readonly role:
    | "ragdoll"
    | "wall"
    | "crate"
    | "bumper"
    | "fan"
    | "spring"
    | "crusher"
    | "platform";
}

interface RuntimeMechanism {
  readonly id: string;
  readonly definition: Mechanism;
  readonly body?: RAPIER.RigidBody;
  readonly base: Vec2;
  cooldown: number;
  position: Vec2;
}

export type StageFailure = "fell" | "crushed";

export interface StageEvents {
  readonly onImpact: (strength: number) => void;
  readonly onSpring: () => void;
  readonly onGoal: () => void;
  readonly onFailure: (reason: StageFailure) => void;
}

export interface GoalState {
  readonly position: Vec2;
  readonly radius: number;
}

const COLORS = {
  ink: "#17182f",
  cream: "#fff3d6",
  coral: "#ff6b6b",
  gold: "#ffd166",
  mint: "#57e2b2",
  sky: "#63c7ff",
  lilac: "#9b8cff",
  wall: "#4b4f7f",
} as const;

const RAGDOLL_COLLISION_GROUP = (0x0001 << 16) | 0x0002;
const STAGE_COLLISION_GROUP = (0x0002 << 16) | 0x0003;

function rotationZ(angle: number): RAPIER.Rotation {
  return { x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) };
}

function isInside(
  point: RAPIER.Vector,
  center: Vec2,
  size: Vec2,
  padding = 0,
): boolean {
  return (
    Math.abs(point.x - center[0]) <= size[0] / 2 + padding &&
    Math.abs(point.y - center[1]) <= size[1] / 2 + padding
  );
}

export class PhysicsStage {
  readonly visuals: PhysicsVisual[] = [];
  readonly level: LevelDefinition;
  private readonly world: RAPIER.World;
  private readonly ragdoll: PhysicsVisual[] = [];
  private readonly mechanisms: RuntimeMechanism[] = [];
  private readonly activatedTypes = new Set<ActivationType>();
  private readonly activatedBumpers = new Set<string>();
  private readonly recentSpeeds = new Map<number, number>();
  private elapsed = 0;
  private ended = false;
  private goalPosition: Vec2;
  private impactCooldown = 0;

  constructor(level: LevelDefinition) {
    this.level = level;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = FIXED_TIMESTEP;
    this.goalPosition = level.goal;
    level.walls.forEach((wall, index) => this.createWall(wall, index));
    this.createRagdoll(level.start);
    level.mechanisms.forEach((mechanism, index) =>
      this.createMechanism(mechanism, index),
    );
  }

  step(events: StageEvents): void {
    if (this.ended) return;
    this.elapsed += FIXED_TIMESTEP;
    this.impactCooldown = Math.max(0, this.impactCooldown - FIXED_TIMESTEP);
    this.updateKinematics();
    this.applyContinuousMechanisms(events);
    if (this.ended) return;
    this.world.step();
    this.checkImpacts(events);
    this.checkTerminal(events);
  }

  fling(direction: Vec2, power: number): void {
    if (this.ended) return;
    const magnitude = 7.5 + power * 11;
    const groundedBoost = this.getFocusPosition()[1] < 0 ? magnitude * 0.32 : 0;
    const impulse = {
      x: direction[0] * magnitude,
      y: direction[1] * magnitude + groundedBoost + 0.45,
      z: 0,
    };
    this.applyGroupImpulse(impulse.x, impulse.y);
    const pelvis = this.ragdoll.find((part) => part.id === "ragdoll-pelvis");
    pelvis?.body.applyTorqueImpulse(
      { x: 0, y: 0, z: direction[0] * 0.32 },
      true,
    );
  }

  getGoalState(): GoalState {
    return { position: this.goalPosition, radius: 0.68 };
  }

  getFocusPosition(): Vec2 {
    const torso = this.ragdoll
      .find((part) => part.id === "ragdoll-torso")
      ?.body.translation();
    return torso ? [torso.x, torso.y] : this.level.start;
  }

  getAverageSpeed(): number {
    if (!this.ragdoll.length) return 0;
    const total = this.ragdoll.reduce((sum, part) => {
      const velocity = part.body.linvel();
      return sum + Math.hypot(velocity.x, velocity.y);
    }, 0);
    return total / this.ragdoll.length;
  }

  getDistanceToGoal(): number {
    const focus = this.getFocusPosition();
    return Math.hypot(
      this.goalPosition[0] - focus[0],
      this.goalPosition[1] - focus[1],
    );
  }

  getMechanismProgress(): {
    readonly types: readonly ActivationType[];
    readonly bumperHits: number;
    readonly unlocked: boolean;
  } {
    return {
      types: [...this.activatedTypes],
      bumperHits: this.activatedBumpers.size,
      unlocked: this.isGoalUnlocked(),
    };
  }

  getRagdollSnapshot(): readonly {
    readonly id: string;
    readonly position: Vec2;
    readonly velocity: Vec2;
  }[] {
    return this.ragdoll.map((part) => {
      const position = part.body.translation();
      const velocity = part.body.linvel();
      return {
        id: part.id,
        position: [position.x, position.y],
        velocity: [velocity.x, velocity.y],
      };
    });
  }

  dispose(): void {
    this.ended = true;
    this.visuals.length = 0;
    this.ragdoll.length = 0;
    this.mechanisms.length = 0;
    this.world.free();
  }

  private createRagdoll(start: Vec2): void {
    const addPart = (
      id: string,
      offset: Vec2,
      shape: VisualShape,
      collider: RAPIER.ColliderDesc,
      color: string,
      mass: number,
    ): PhysicsVisual => {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(start[0] + offset[0], start[1] + offset[1], 0)
          .setLinearDamping(0.45)
          .setAngularDamping(0.9)
          .setCcdEnabled(true)
          .enabledTranslations(true, true, false)
          .enabledRotations(false, false, true)
          .setAdditionalMass(mass),
      );
      this.world.createCollider(
        collider
          .setDensity(0.8)
          .setFriction(0.7)
          .setRestitution(0.28)
          .setCollisionGroups(RAGDOLL_COLLISION_GROUP)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body,
      );
      const visual: PhysicsVisual = { id, body, shape, color, role: "ragdoll" };
      this.visuals.push(visual);
      this.ragdoll.push(visual);
      return visual;
    };

    const pelvis = addPart(
      "ragdoll-pelvis",
      [0, 0.2],
      { kind: "box", size: [0.75, 0.52, 0.5] },
      RAPIER.ColliderDesc.cuboid(0.375, 0.26, 0.25),
      COLORS.sky,
      1,
    );
    const torso = addPart(
      "ragdoll-torso",
      [0, 0.92],
      { kind: "box", size: [0.88, 1, 0.54] },
      RAPIER.ColliderDesc.cuboid(0.44, 0.5, 0.27),
      COLORS.coral,
      1.25,
    );
    const head = addPart(
      "ragdoll-head",
      [0, 1.78],
      { kind: "sphere", radius: 0.38 },
      RAPIER.ColliderDesc.ball(0.38),
      COLORS.cream,
      0.58,
    );
    const armL = addPart(
      "ragdoll-arm-l",
      [-0.62, 0.92],
      { kind: "capsule", radius: 0.16, length: 0.72 },
      RAPIER.ColliderDesc.capsule(0.28, 0.16),
      COLORS.gold,
      0.3,
    );
    const armR = addPart(
      "ragdoll-arm-r",
      [0.62, 0.92],
      { kind: "capsule", radius: 0.16, length: 0.72 },
      RAPIER.ColliderDesc.capsule(0.28, 0.16),
      COLORS.gold,
      0.3,
    );
    const legL = addPart(
      "ragdoll-leg-l",
      [-0.25, -0.48],
      { kind: "capsule", radius: 0.18, length: 0.82 },
      RAPIER.ColliderDesc.capsule(0.32, 0.18),
      COLORS.lilac,
      0.42,
    );
    const legR = addPart(
      "ragdoll-leg-r",
      [0.25, -0.48],
      { kind: "capsule", radius: 0.18, length: 0.82 },
      RAPIER.ColliderDesc.capsule(0.32, 0.18),
      COLORS.lilac,
      0.42,
    );

    this.join(pelvis.body, torso.body, [0, 0.28], [0, -0.52]);
    this.join(torso.body, head.body, [0, 0.5], [0, -0.38]);
    this.join(torso.body, armL.body, [-0.44, 0.32], [0, 0.34]);
    this.join(torso.body, armR.body, [0.44, 0.32], [0, 0.34]);
    this.join(pelvis.body, legL.body, [-0.24, -0.23], [0, 0.36]);
    this.join(pelvis.body, legR.body, [0.24, -0.23], [0, 0.36]);
  }

  private join(
    parent: RAPIER.RigidBody,
    child: RAPIER.RigidBody,
    anchorParent: Vec2,
    anchorChild: Vec2,
  ): void {
    this.world.createImpulseJoint(
      RAPIER.JointData.spherical(
        { x: anchorParent[0], y: anchorParent[1], z: 0 },
        { x: anchorChild[0], y: anchorChild[1], z: 0 },
      ),
      parent,
      child,
      true,
    );
  }

  private createWall(wall: Wall, index: number): void {
    const angle = wall.rotation ?? 0;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(wall.position[0], wall.position[1], 0)
        .setRotation(rotationZ(angle)),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(wall.size[0] / 2, wall.size[1] / 2, 0.52)
        .setFriction(0.9)
        .setRestitution(0.1)
        .setCollisionGroups(STAGE_COLLISION_GROUP),
      body,
    );
    this.visuals.push({
      id: `wall-${index}`,
      body,
      shape: { kind: "box", size: [wall.size[0], wall.size[1], 1.04] },
      color: wall.color ?? COLORS.wall,
      accent: COLORS.ink,
      role: "wall",
    });
  }

  private createMechanism(definition: Mechanism, index: number): void {
    const id = `${definition.type}-${index}`;
    const base = definition.position;
    let body: RAPIER.RigidBody | undefined;
    if (definition.type === "crate") {
      const size = definition.size ?? [0.68, 0.68];
      body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(base[0], base[1], 0)
          .setRotation(rotationZ(definition.rotation ?? 0))
          .setLinearDamping(0.45)
          .setAngularDamping(0.6)
          .setCcdEnabled(true)
          .enabledTranslations(true, true, false)
          .enabledRotations(false, false, true)
          .setAdditionalMass(0.7),
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, 0.38)
          .setFriction(0.75)
          .setRestitution(0.18)
          .setCollisionGroups(STAGE_COLLISION_GROUP),
        body,
      );
      this.visuals.push({
        id,
        body,
        shape: { kind: "box", size: [size[0], size[1], 0.76] },
        color: "#d99a5b",
        accent: COLORS.cream,
        role: "crate",
      });
    } else if (definition.type === "bumper") {
      const radius = definition.radius ?? 0.55;
      body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(base[0], base[1], 0),
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.ball(radius)
          .setSensor(true)
          .setRestitution(0)
          .setFriction(0.1)
          .setCollisionGroups(STAGE_COLLISION_GROUP),
        body,
      );
      this.visuals.push({
        id,
        body,
        shape: { kind: "sphere", radius },
        color: definition.color ?? COLORS.coral,
        accent: COLORS.cream,
        role: "bumper",
      });
    } else if (definition.type === "fan") {
      body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(
          base[0],
          base[1] - definition.size[1] / 2,
          -0.2,
        ),
      );
      this.visuals.push({
        id,
        body,
        shape: { kind: "box", size: [definition.size[0], 0.35, 0.75] },
        color: COLORS.sky,
        accent: COLORS.cream,
        role: "fan",
      });
    } else if (definition.type === "spring") {
      const size = definition.size ?? [1.5, 0.38];
      body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(base[0], base[1], 0),
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, 0.45)
          .setRestitution(0.9)
          .setFriction(0.3)
          .setCollisionGroups(STAGE_COLLISION_GROUP),
        body,
      );
      this.visuals.push({
        id,
        body,
        shape: { kind: "box", size: [size[0], size[1], 0.9] },
        color: COLORS.mint,
        accent: COLORS.cream,
        role: "spring",
      });
    } else if (
      definition.type === "crusher" ||
      definition.type === "platform"
    ) {
      const size = definition.size;
      body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased()
          .setTranslation(base[0], base[1], 0)
          .enabledTranslations(true, true, false)
          .enabledRotations(false, false, true),
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, 0.52)
          .setFriction(0.85)
          .setRestitution(definition.type === "platform" ? 0.1 : 0)
          .setCollisionGroups(STAGE_COLLISION_GROUP),
        body,
      );
      this.visuals.push({
        id,
        body,
        shape: { kind: "box", size: [size[0], size[1], 1.04] },
        color: definition.type === "crusher" ? COLORS.coral : COLORS.lilac,
        accent: definition.type === "crusher" ? COLORS.gold : COLORS.cream,
        role: definition.type,
      });
    }
    this.mechanisms.push({
      id,
      definition,
      body,
      base,
      cooldown: 0,
      position: base,
    });
  }

  private updateKinematics(): void {
    for (const mechanism of this.mechanisms) {
      mechanism.cooldown = Math.max(0, mechanism.cooldown - FIXED_TIMESTEP);
      const definition = mechanism.definition;
      if (definition.type === "crusher") {
        const wave =
          (Math.sin(this.elapsed * definition.speed + (definition.phase ?? 0)) +
            1) /
          2;
        const position: Vec2 = [
          mechanism.base[0],
          mechanism.base[1] - wave * definition.travel,
        ];
        mechanism.position = position;
        mechanism.body?.setNextKinematicTranslation({
          x: position[0],
          y: position[1],
          z: 0,
        });
      } else if (definition.type === "platform") {
        const wave = Math.sin(
          this.elapsed * definition.speed + (definition.phase ?? 0),
        );
        const position: Vec2 = [
          mechanism.base[0] + wave * definition.travel[0],
          mechanism.base[1] + wave * definition.travel[1],
        ];
        mechanism.position = position;
        mechanism.body?.setNextKinematicTranslation({
          x: position[0],
          y: position[1],
          z: 0,
        });
      }
    }
    if (this.level.goalMoves) {
      const wave = Math.sin(this.elapsed * this.level.goalMoves.speed);
      this.goalPosition = [
        this.level.goal[0] + wave * this.level.goalMoves.travel[0],
        this.level.goal[1] + wave * this.level.goalMoves.travel[1],
      ];
    }
  }

  private applyContinuousMechanisms(events: StageEvents): void {
    for (const mechanism of this.mechanisms) {
      const definition = mechanism.definition;
      if (definition.type === "fan") {
        let activated = false;
        for (const part of this.ragdoll) {
          const point = part.body.translation();
          const center: Vec2 = [
            definition.position[0],
            definition.position[1] + definition.size[1] / 2,
          ];
          if (isInside(point, center, definition.size, 0.2)) {
            activated = true;
            part.body.applyImpulse(
              {
                x: definition.force[0] * FIXED_TIMESTEP * 0.65,
                y: definition.force[1] * FIXED_TIMESTEP * 0.65,
                z: 0,
              },
              true,
            );
          }
        }
        if (activated) this.activatedTypes.add("fan");
      } else if (
        definition.type === "bumper" &&
        mechanism.cooldown <= 0 &&
        !this.activatedBumpers.has(mechanism.id)
      ) {
        const radius = definition.radius ?? 0.55;
        const hit = this.ragdoll.find((part) => {
          const point = part.body.translation();
          return (
            Math.hypot(
              point.x - definition.position[0],
              point.y - definition.position[1],
            ) <
            radius + 0.32
          );
        });
        if (hit) {
          this.activatedTypes.add("bumper");
          this.activatedBumpers.add(mechanism.id);
          const goalX = this.goalPosition[0] - definition.position[0];
          const goalY = this.goalPosition[1] - definition.position[1];
          const goalLength = Math.max(0.1, Math.hypot(goalX, goalY));
          const power = definition.power ?? 6.5;
          this.redirectGroupVelocity(
            goalX / goalLength,
            goalY / goalLength,
            power,
          );
          mechanism.cooldown = 0.45;
          events.onSpring();
          if (
            this.isGoalUnlocked() &&
            Math.hypot(
              definition.position[0] - this.goalPosition[0],
              definition.position[1] - this.goalPosition[1],
            ) <= 1.1
          ) {
            this.ended = true;
            events.onGoal();
            return;
          }
        }
      } else if (definition.type === "spring" && mechanism.cooldown <= 0) {
        const size = definition.size ?? [1.5, 0.38];
        const hit = this.ragdoll.find((part) => {
          const point = part.body.translation();
          return (
            isInside(point, definition.position, size, 0.3) &&
            part.body.linvel().y < 1.5
          );
        });
        if (hit) {
          this.activatedTypes.add("spring");
          const direction = definition.direction ?? [0, 1];
          const length = Math.max(0.1, Math.hypot(direction[0], direction[1]));
          const power = definition.power ?? 9.5;
          this.applyGroupImpulse(
            (direction[0] / length) * power,
            (direction[1] / length) * power,
          );
          mechanism.cooldown = 0.55;
          events.onSpring();
        }
      }
    }
  }

  private checkImpacts(events: StageEvents): void {
    let strongest = 0;
    for (const part of this.ragdoll) {
      const velocity = part.body.linvel();
      const speed = Math.hypot(velocity.x, velocity.y);
      const previous = this.recentSpeeds.get(part.body.handle) ?? speed;
      strongest = Math.max(strongest, previous - speed);
      this.recentSpeeds.set(part.body.handle, speed);
    }
    if (strongest > 2.2 && this.impactCooldown <= 0) {
      events.onImpact(Math.min(3, strongest / 3));
      this.impactCooldown = 0.12;
    }
  }

  private applyGroupImpulse(x: number, y: number): void {
    for (const part of this.ragdoll) {
      const factor =
        part.id === "ragdoll-pelvis"
          ? 0.52
          : part.id === "ragdoll-torso"
            ? 0.38
            : part.id === "ragdoll-head"
              ? 0.16
              : 0.12;
      part.body.applyImpulse({ x: x * factor, y: y * factor, z: 0 }, true);
    }
  }

  private redirectGroupVelocity(x: number, y: number, power: number): void {
    const speed = 5.2 + power * 0.48;
    for (const part of this.ragdoll) {
      const current = part.body.linvel();
      part.body.setLinvel(
        {
          x: current.x * 0.18 + x * speed,
          y: current.y * 0.18 + y * speed + 0.9,
          z: 0,
        },
        true,
      );
    }
  }

  private checkTerminal(events: StageEvents): void {
    const goal = this.goalPosition;
    const reached = this.ragdoll.some((part) => {
      const point = part.body.translation();
      return Math.hypot(point.x - goal[0], point.y - goal[1]) <= 0.98;
    });
    if (reached && this.isGoalUnlocked()) {
      this.ended = true;
      events.onGoal();
      return;
    }
    const fell = this.ragdoll.every((part) => part.body.translation().y < -4.8);
    if (fell) {
      this.ended = true;
      events.onFailure("fell");
      return;
    }
    for (const mechanism of this.mechanisms) {
      const definition = mechanism.definition;
      if (definition.type !== "crusher") continue;
      const hit = this.ragdoll.some((part) =>
        isInside(
          part.body.translation(),
          mechanism.position,
          definition.size,
          0.18,
        ),
      );
      if (hit && mechanism.body && Math.abs(mechanism.body.linvel().y) > 0.4) {
        this.ended = true;
        events.onFailure("crushed");
        return;
      }
    }
  }

  private isGoalUnlocked(): boolean {
    const required = this.level.requiredActivations;
    if (!required) return true;
    if (
      required.bumperHits !== undefined &&
      this.activatedBumpers.size < required.bumperHits
    ) {
      return false;
    }
    return (
      required.types?.every((type) => this.activatedTypes.has(type)) ?? true
    );
  }
}
