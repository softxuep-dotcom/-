export type Vec2 = readonly [number, number];
export type ActivationType = "bumper" | "fan" | "spring";

export type Mechanism =
  | {
      readonly type: "bumper";
      readonly position: Vec2;
      readonly radius?: number;
      readonly power?: number;
      readonly color?: string;
    }
  | {
      readonly type: "fan";
      readonly position: Vec2;
      readonly size: Vec2;
      readonly force: Vec2;
    }
  | {
      readonly type: "crate";
      readonly position: Vec2;
      readonly size?: Vec2;
      readonly rotation?: number;
    }
  | {
      readonly type: "crusher";
      readonly position: Vec2;
      readonly size: Vec2;
      readonly travel: number;
      readonly speed: number;
      readonly phase?: number;
    }
  | {
      readonly type: "spring";
      readonly position: Vec2;
      readonly size?: Vec2;
      readonly power?: number;
      readonly direction?: Vec2;
    }
  | {
      readonly type: "platform";
      readonly position: Vec2;
      readonly size: Vec2;
      readonly travel: Vec2;
      readonly speed: number;
      readonly phase?: number;
    };

export interface Wall {
  readonly position: Vec2;
  readonly size: Vec2;
  readonly rotation?: number;
  readonly color?: string;
}

export interface LevelDefinition {
  readonly id: number;
  readonly name: string;
  readonly subtitle: string;
  readonly hint: string;
  readonly badge: string;
  readonly start: Vec2;
  readonly goal: Vec2;
  readonly goalMoves?: { readonly travel: Vec2; readonly speed: number };
  readonly cameraCenter: number;
  readonly width: number;
  readonly maxFlings: number;
  readonly parTime: number;
  readonly walls: readonly Wall[];
  readonly mechanisms: readonly Mechanism[];
  readonly requiredActivations?: {
    readonly types?: readonly ActivationType[];
    readonly bumperHits?: number;
  };
  readonly backdrop: "curtain" | "workshop" | "night" | "circus";
}

const floor = (width: number): Wall => ({
  position: [0, -1.55],
  size: [width + 3, 0.7],
  color: "#343766",
});

export const LEVELS: readonly LevelDefinition[] = [
  {
    id: 1,
    name: "Curtain Call",
    subtitle: "One swipe. One bell. Infinite dignity.",
    hint: "Swipe toward the golden bell",
    badge: "🎬",
    start: [-3.3, 0.25],
    goal: [1.8, -0.1],
    cameraCenter: 0,
    width: 8,
    maxFlings: 3,
    parTime: 16,
    walls: [floor(8)],
    mechanisms: [],
    backdrop: "curtain",
  },
  {
    id: 2,
    name: "Bank Shot",
    subtitle: "Rubber solves what planning cannot.",
    hint: "Bank a swipe off the coral bumper",
    badge: "🔴",
    start: [-3.45, 0.1],
    goal: [3.15, 2.35],
    cameraCenter: 0,
    width: 8,
    maxFlings: 3,
    parTime: 20,
    walls: [
      floor(8),
      { position: [3.3, 0.2], size: [1.3, 0.25], color: "#7167b7" },
    ],
    mechanisms: [
      { type: "bumper", position: [0.1, 0.05], radius: 0.62, power: 7 },
    ],
    requiredActivations: { bumperHits: 1 },
    backdrop: "curtain",
  },
  {
    id: 3,
    name: "Double Bounce",
    subtitle: "A tasteful amount of ricochet.",
    hint: "Use both bumpers to climb",
    badge: "🎱",
    start: [-3.5, -0.1],
    goal: [1.65, 1.25],
    cameraCenter: 0,
    width: 8,
    maxFlings: 4,
    parTime: 25,
    walls: [
      floor(8),
      { position: [1.65, -0.05], size: [1.4, 0.25], color: "#7167b7" },
      { position: [4.15, 1.5], size: [0.28, 6], color: "#586093" },
    ],
    mechanisms: [
      { type: "bumper", position: [-0.9, 0.15], radius: 0.68, power: 3.8 },
      {
        type: "bumper",
        position: [0.95, 1],
        radius: 0.78,
        power: 3.4,
        color: "#63c7ff",
      },
    ],
    requiredActivations: { bumperHits: 2 },
    backdrop: "circus",
  },
  {
    id: 4,
    name: "Fan Service",
    subtitle: "Hair styling included at no charge.",
    hint: "Ride the blue air stream upward",
    badge: "💨",
    start: [-3.6, -0.05],
    goal: [3.35, 3.35],
    cameraCenter: 0,
    width: 8.5,
    maxFlings: 4,
    parTime: 28,
    walls: [
      floor(8.5),
      { position: [3.3, 1.25], size: [1.5, 0.25], color: "#586093" },
    ],
    mechanisms: [
      { type: "fan", position: [0.1, 0.2], size: [1.5, 4.2], force: [2, 12] },
    ],
    requiredActivations: { types: ["fan"] },
    backdrop: "workshop",
  },
  {
    id: 5,
    name: "Crate Expectations",
    subtitle: "Please handle the performer with care.",
    hint: "Smash through or sail over the boxes",
    badge: "📦",
    start: [-4, 0.1],
    goal: [3.9, 1.35],
    cameraCenter: 0,
    width: 9,
    maxFlings: 4,
    parTime: 30,
    walls: [floor(9)],
    mechanisms: [
      { type: "crate", position: [-0.1, -0.45] },
      { type: "crate", position: [0.65, -0.45] },
      { type: "crate", position: [0.28, 0.35] },
      { type: "bumper", position: [2.05, -0.25], radius: 0.5, power: 6 },
    ],
    backdrop: "workshop",
  },
  {
    id: 6,
    name: "Pancake Panic",
    subtitle: "The press has strong opinions.",
    hint: "Time the swipe between crusher drops",
    badge: "🔨",
    start: [-4.2, -0.05],
    goal: [4.1, 1],
    cameraCenter: 0,
    width: 9.5,
    maxFlings: 4,
    parTime: 32,
    walls: [
      floor(9.5),
      { position: [0.2, 2.85], size: [1.7, 0.25], color: "#4a4d80" },
    ],
    mechanisms: [
      {
        type: "crusher",
        position: [0.2, 1.85],
        size: [1.25, 0.7],
        travel: 2.2,
        speed: 2.4,
      },
    ],
    backdrop: "night",
  },
  {
    id: 7,
    name: "Spring Cleaning",
    subtitle: "The floor is feeling unusually helpful.",
    hint: "Land on the mint spring",
    badge: "🌀",
    start: [-4.1, 0],
    goal: [4.1, 3.55],
    cameraCenter: 0,
    width: 9.5,
    maxFlings: 4,
    parTime: 28,
    walls: [
      floor(9.5),
      { position: [4.05, 1.5], size: [1.4, 0.22], color: "#586093" },
    ],
    mechanisms: [
      {
        type: "spring",
        position: [0.35, -0.45],
        size: [1.6, 0.38],
        power: 10.5,
      },
    ],
    requiredActivations: { types: ["spring"] },
    backdrop: "circus",
  },
  {
    id: 8,
    name: "Wind-Up Alley",
    subtitle: "The weather forecast says boing.",
    hint: "Bumper first, then catch the fan",
    badge: "🌪️",
    start: [-4.5, -0.05],
    goal: [4.35, 3.45],
    cameraCenter: 0,
    width: 10,
    maxFlings: 4,
    parTime: 34,
    walls: [
      floor(10),
      { position: [4.3, 1.4], size: [1.4, 0.22], color: "#586093" },
    ],
    mechanisms: [
      { type: "bumper", position: [-1.35, 0.8], radius: 0.62, power: 4 },
      {
        type: "fan",
        position: [1.4, 0.25],
        size: [1.55, 4.6],
        force: [1.2, 11.5],
      },
    ],
    requiredActivations: { types: ["bumper", "fan"] },
    backdrop: "night",
  },
  {
    id: 9,
    name: "Moving Day",
    subtitle: "The furniture refuses to commit.",
    hint: "Use the moving shelf—or jump above it",
    badge: "🛋️",
    start: [-4.7, 0],
    goal: [4.6, 2.9],
    goalMoves: { travel: [0, 1.3], speed: 1.1 },
    cameraCenter: 0,
    width: 10.5,
    maxFlings: 5,
    parTime: 38,
    walls: [floor(10.5)],
    mechanisms: [
      {
        type: "platform",
        position: [0.1, 0.35],
        size: [2.25, 0.32],
        travel: [0, 2.45],
        speed: 1.15,
      },
      {
        type: "spring",
        position: [-2.2, -0.48],
        power: 9.6,
        direction: [0.35, 1],
      },
    ],
    backdrop: "workshop",
  },
  {
    id: 10,
    name: "Boxed In",
    subtitle: "An elegant route through terrible storage.",
    hint: "Break the low route or float above",
    badge: "🧸",
    start: [-5, 0],
    goal: [4.85, 2.35],
    cameraCenter: 0,
    width: 11,
    maxFlings: 5,
    parTime: 40,
    walls: [
      floor(11),
      { position: [4.8, 0.4], size: [1.2, 0.22], color: "#586093" },
    ],
    mechanisms: [
      { type: "crate", position: [-0.8, -0.45] },
      { type: "crate", position: [-0.05, -0.45] },
      { type: "crate", position: [0.7, -0.45] },
      { type: "crate", position: [-0.42, 0.3] },
      { type: "crate", position: [0.33, 0.3] },
      {
        type: "fan",
        position: [2.25, 0.3],
        size: [1.4, 3.7],
        force: [2.4, 9.5],
      },
    ],
    backdrop: "night",
  },
  {
    id: 11,
    name: "Pinball Payroll",
    subtitle: "Every collision is billable.",
    hint: "Choose the quick high route or safe low route",
    badge: "🧾",
    start: [-5.2, -0.1],
    goal: [5.05, 2.8],
    goalMoves: { travel: [0, 1.6], speed: 1.35 },
    cameraCenter: 0,
    width: 11.5,
    maxFlings: 5,
    parTime: 42,
    walls: [
      floor(11.5),
      { position: [1.1, 3.3], size: [3.4, 0.2], rotation: -0.08 },
    ],
    mechanisms: [
      { type: "bumper", position: [-2.2, -0.1], radius: 0.58, power: 7.2 },
      {
        type: "bumper",
        position: [0.05, 1.1],
        radius: 0.55,
        power: 6.8,
        color: "#63c7ff",
      },
      { type: "bumper", position: [2.35, -0.05], radius: 0.6, power: 7.6 },
      {
        type: "spring",
        position: [0.3, -0.5],
        power: 9.2,
        direction: [0.55, 1],
      },
    ],
    backdrop: "circus",
  },
  {
    id: 12,
    name: "Grand Fiasco",
    subtitle: "One last perfectly planned catastrophe.",
    hint: "Read the rhythm. Use every toy.",
    badge: "🏆",
    start: [-5.6, -0.05],
    goal: [5.5, 3.85],
    cameraCenter: 0,
    width: 12.2,
    maxFlings: 6,
    parTime: 48,
    walls: [
      floor(12.2),
      { position: [5.45, 1.75], size: [1.35, 0.22], color: "#7167b7" },
      {
        position: [1.85, 3.7],
        size: [2.2, 0.22],
        rotation: 0.08,
        color: "#586093",
      },
    ],
    mechanisms: [
      {
        type: "spring",
        position: [-3.45, -0.48],
        power: 10.2,
        direction: [0.42, 1],
      },
      { type: "crate", position: [-1.35, -0.45] },
      { type: "crate", position: [-0.6, -0.45] },
      {
        type: "fan",
        position: [0.85, 0.2],
        size: [1.45, 4.5],
        force: [1.5, 11.2],
      },
      {
        type: "platform",
        position: [2.55, 1.05],
        size: [1.8, 0.28],
        travel: [0.9, 1.2],
        speed: 1.25,
        phase: 0.4,
      },
      {
        type: "crusher",
        position: [4.15, 2.5],
        size: [1.05, 0.6],
        travel: 1.8,
        speed: 2.15,
        phase: 1,
      },
      { type: "bumper", position: [3.6, -0.15], radius: 0.55, power: 7.2 },
    ],
    backdrop: "curtain",
  },
] as const;

export function getLevel(id: number): LevelDefinition {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, id - 1))] ?? LEVELS[0]!;
}
