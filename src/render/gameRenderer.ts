import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { AimState } from "../game/input/input";
import type { Vec2 } from "../game/content/levels";
import type { GoalState, PhysicsVisual } from "../physics/physicsStage";

interface VisualEntry {
  readonly source: PhysicsVisual;
  readonly object: THREE.Object3D;
}

export interface RenderMetrics {
  readonly fps: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly dpr: number;
  readonly geometries: number;
  readonly textures: number;
}

interface ConfettiParticle {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly rotation: THREE.Euler;
  readonly spin: THREE.Vector3;
  life: number;
}

const PALETTE = ["#ff6b6b", "#ffd166", "#57e2b2", "#63c7ff", "#9b8cff"];

export class GameRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 9 / 16, 0.1, 100);
  private readonly worldRoot = new THREE.Group();
  private readonly backdropRoot = new THREE.Group();
  private readonly visualEntries: VisualEntry[] = [];
  private readonly goal = new THREE.Group();
  private readonly goalHalo: THREE.Mesh;
  private readonly aimRoot = new THREE.Group();
  private readonly aimShaft: THREE.Mesh;
  private readonly aimTip: THREE.Mesh;
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private readonly clockWindow: number[] = [];
  private readonly confetti: ConfettiParticle[] = [];
  private readonly confettiMesh: THREE.InstancedMesh;
  private readonly scratchMatrix = new THREE.Matrix4();
  private readonly scratchQuaternion = new THREE.Quaternion();
  private readonly scratchScale = new THREE.Vector3();
  private readonly lowTier: boolean;
  private targetCameraX = 0;
  private targetCameraY = 1.35;
  private targetCameraZ = 15;
  private shake = 0;
  private elapsed = 0;
  private reducedMotion = false;
  private disposed = false;

  constructor(
    private readonly host: HTMLElement,
    onContextLost: () => void,
    onContextRestored: () => void,
  ) {
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number })
      .deviceMemory;
    this.lowTier =
      /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ||
      (deviceMemory !== undefined && deviceMemory <= 4);
    this.canvas = document.createElement("canvas");
    this.canvas.className = "game-canvas";
    this.canvas.setAttribute("aria-label", "3D toybox stunt stage");
    host.prepend(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.lowTier,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = !this.lowTier;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.background = new THREE.Color("#24264d");
    this.scene.fog = new THREE.Fog("#24264d", 18, 34);
    this.scene.add(this.backdropRoot, this.worldRoot);
    this.configureLights();
    this.configureBackdrop();

    this.goalHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.82, 0.075, 10, 32),
      new THREE.MeshStandardMaterial({
        color: "#57e2b2",
        emissive: "#57e2b2",
        emissiveIntensity: 1.3,
        roughness: 0.35,
      }),
    );
    this.configureGoal();
    this.scene.add(this.goal);

    this.aimShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 1, 10),
      new THREE.MeshBasicMaterial({
        color: "#fff3d6",
        transparent: true,
        opacity: 0.9,
      }),
    );
    this.aimTip = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.36, 12),
      new THREE.MeshBasicMaterial({ color: "#ffd166" }),
    );
    this.aimRoot.add(this.aimShaft, this.aimTip);
    this.aimRoot.visible = false;
    this.aimRoot.position.z = 1.2;
    this.scene.add(this.aimRoot);

    const confettiGeometry = new THREE.BoxGeometry(0.12, 0.05, 0.025);
    const confettiMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
    });
    this.confettiMesh = new THREE.InstancedMesh(
      confettiGeometry,
      confettiMaterial,
      48,
    );
    this.confettiMesh.frustumCulled = false;
    this.confettiMesh.count = 0;
    PALETTE.forEach((color, index) => {
      for (let i = index; i < 48; i += PALETTE.length) {
        this.confettiMesh.setColorAt(i, new THREE.Color(color));
      }
    });
    this.scene.add(this.confettiMesh);

    this.camera.position.set(0, 1.4, 15);
    this.camera.lookAt(0, 1.2, 0);

    this.canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      onContextLost();
    });
    this.canvas.addEventListener("webglcontextrestored", onContextRestored);
    window.addEventListener("resize", this.resize);
    new ResizeObserver(this.resize).observe(host);
    this.resize();
    void this.loadStageMark();
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  rebuild(visuals: readonly PhysicsVisual[], backdrop: string): void {
    this.clearWorld();
    this.scene.background = new THREE.Color(
      backdrop === "workshop"
        ? "#273850"
        : backdrop === "night"
          ? "#1d2349"
          : backdrop === "circus"
            ? "#3d2854"
            : "#24264d",
    );
    visuals.forEach((visual) => {
      const object = this.createVisualObject(visual);
      this.visualEntries.push({ source: visual, object });
      this.worldRoot.add(object);
    });
  }

  setAim(aim: AimState, origin: Vec2): void {
    this.aimRoot.visible = aim.active && aim.power > 0.03;
    if (!this.aimRoot.visible) return;
    const length = 0.6 + aim.power * 2;
    const angle = Math.atan2(aim.direction[1], aim.direction[0]);
    this.aimRoot.position.set(origin[0], origin[1] + 0.4, 1.15);
    this.aimRoot.rotation.z = angle - Math.PI / 2;
    this.aimShaft.scale.set(1, length, 1);
    this.aimShaft.position.y = length / 2;
    this.aimTip.position.y = length + 0.16;
    const color = new THREE.Color().setHSL(0.12 - aim.power * 0.1, 0.88, 0.62);
    (this.aimShaft.material as THREE.MeshBasicMaterial).color.copy(color);
  }

  impact(strength: number): void {
    if (!this.reducedMotion)
      this.shake = Math.max(this.shake, Math.min(0.16, strength * 0.055));
  }

  celebrate(goal: Vec2): void {
    this.confetti.length = 0;
    for (let i = 0; i < 48; i += 1) {
      const angle = (i / 48) * Math.PI * 2 + Math.random() * 0.2;
      const speed = 2.5 + Math.random() * 4;
      this.confetti.push({
        position: new THREE.Vector3(goal[0], goal[1], 1.4),
        velocity: new THREE.Vector3(
          Math.cos(angle) * speed,
          2.5 + Math.random() * 5,
          Math.sin(angle) * 0.8,
        ),
        rotation: new THREE.Euler(
          Math.random() * 3,
          Math.random() * 3,
          Math.random() * 3,
        ),
        spin: new THREE.Vector3(
          Math.random() * 8,
          Math.random() * 8,
          Math.random() * 8,
        ),
        life: 1.4 + Math.random() * 0.8,
      });
    }
    this.confettiMesh.count = this.confetti.length;
    this.shake = this.reducedMotion ? 0 : 0.18;
  }

  render(frameDelta: number, focus: Vec2, goalState: GoalState): void {
    if (this.disposed) return;
    this.elapsed += frameDelta;
    for (const entry of this.visualEntries) {
      const position = entry.source.body.translation();
      const rotation = entry.source.body.rotation();
      entry.object.position.set(position.x, position.y, position.z);
      entry.object.quaternion.set(
        rotation.x,
        rotation.y,
        rotation.z,
        rotation.w,
      );
      if (entry.source.role === "bumper") {
        const pulse = 1 + Math.sin(this.elapsed * 4) * 0.035;
        entry.object.scale.setScalar(this.reducedMotion ? 1 : pulse);
      }
      if (entry.source.role === "fan") {
        entry.object.rotation.z = Math.sin(this.elapsed * 8) * 0.03;
      }
    }

    this.goal.position.set(goalState.position[0], goalState.position[1], 0);
    const haloScale = this.reducedMotion
      ? 1
      : 1 + Math.sin(this.elapsed * 4.5) * 0.06;
    this.goalHalo.scale.setScalar(haloScale);
    this.goal.rotation.y = Math.sin(this.elapsed * 1.3) * 0.08;

    const spanX = Math.abs(goalState.position[0] - focus[0]);
    const goalWeight = spanX <= 8 ? 0.5 : 0.32;
    this.targetCameraX = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(focus[0], goalState.position[0], goalWeight),
      -4.7,
      4.7,
    );
    this.targetCameraY = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(focus[1], goalState.position[1], 0.46) + 0.35,
      1.15,
      2.3,
    );
    const horizontalFov =
      2 *
      Math.atan(
        Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) *
          this.camera.aspect,
      );
    const requiredDistance =
      (spanX + 1.8) / Math.max(0.1, 2 * Math.tan(horizontalFov / 2));
    this.targetCameraZ = THREE.MathUtils.clamp(requiredDistance, 14.5, 22.5);
    const smoothing = 1 - Math.exp(-frameDelta * 3.4);
    this.camera.position.x = THREE.MathUtils.lerp(
      this.camera.position.x,
      this.targetCameraX,
      smoothing,
    );
    this.camera.position.y = THREE.MathUtils.lerp(
      this.camera.position.y,
      this.targetCameraY,
      smoothing,
    );
    this.camera.position.z = THREE.MathUtils.lerp(
      this.camera.position.z,
      this.targetCameraZ,
      smoothing,
    );
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.pow(0.04, frameDelta);
    }
    this.camera.lookAt(this.camera.position.x, this.camera.position.y - 0.1, 0);

    this.updateConfetti(frameDelta);
    this.renderer.render(this.scene, this.camera);
    this.clockWindow.push(frameDelta);
    if (this.clockWindow.length > 120) this.clockWindow.shift();
  }

  getMetrics(): RenderMetrics {
    const average =
      this.clockWindow.length > 0
        ? this.clockWindow.reduce((sum, value) => sum + value, 0) /
          this.clockWindow.length
        : 1 / 60;
    return {
      fps: Math.round(1 / Math.max(average, 0.001)),
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      dpr: this.renderer.getPixelRatio(),
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
    };
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener("resize", this.resize);
    this.clearWorld();
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.confettiMesh.geometry.dispose();
    (this.confettiMesh.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  private configureLights(): void {
    this.scene.add(new THREE.HemisphereLight("#d7e8ff", "#24264d", 1.55));
    const key = new THREE.DirectionalLight("#fff0cf", 3);
    key.position.set(-5, 9, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 9;
    key.shadow.camera.bottom = -4;
    key.shadow.bias = -0.001;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight("#739cff", 1.2);
    rim.position.set(8, 4, 3);
    this.scene.add(rim);
  }

  private configureBackdrop(): void {
    const backMaterial = new THREE.MeshStandardMaterial({
      color: "#30345f",
      roughness: 1,
      metalness: 0,
    });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(38, 22), backMaterial);
    back.position.set(0, 3, -2.5);
    back.receiveShadow = true;
    this.backdropRoot.add(back);

    const archMaterial = new THREE.MeshStandardMaterial({
      color: "#494d82",
      roughness: 0.95,
    });
    for (let x = -16; x <= 16; x += 4) {
      const column = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 12, 0.4),
        archMaterial,
      );
      column.position.set(x, 2.5, -2);
      this.backdropRoot.add(column);
    }
    const starGeometry = new THREE.OctahedronGeometry(0.09, 0);
    const starMaterial = new THREE.MeshBasicMaterial({ color: "#ffd166" });
    for (let i = 0; i < 42; i += 1) {
      const star = new THREE.Mesh(starGeometry, starMaterial);
      star.position.set(
        -17 + ((i * 47) % 340) / 10,
        1 + ((i * 73) % 85) / 10,
        -1.8,
      );
      star.scale.setScalar(0.55 + (i % 4) * 0.18);
      this.backdropRoot.add(star);
    }
  }

  private configureGoal(): void {
    const halo = this.goalHalo;
    halo.position.z = 0.05;
    const bellMaterial = new THREE.MeshStandardMaterial({
      color: "#ffd166",
      roughness: 0.28,
      metalness: 0.32,
      emissive: "#7f4b00",
      emissiveIntensity: 0.25,
    });
    const bell = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 0.72, 20, 1, true),
      bellMaterial,
    );
    bell.rotation.z = Math.PI;
    bell.position.y = 0.06;
    bell.castShadow = true;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.49, 0.07, 8, 24),
      bellMaterial,
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.29;
    const clapper = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 12, 8),
      bellMaterial,
    );
    clapper.position.y = -0.39;
    const sign = this.makeTextSprite("HIT!", "#17182f", "#fff3d6");
    sign.position.set(0, 0.82, 0.1);
    sign.scale.set(1.2, 0.48, 1);
    this.goal.add(halo, bell, rim, clapper, sign);
  }

  private createVisualObject(visual: PhysicsVisual): THREE.Object3D {
    const group = new THREE.Group();
    const geometry = this.getGeometry(visual);
    const material = this.getMaterial(visual.color, visual.role === "ragdoll");
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = visual.role !== "wall";
    mesh.receiveShadow = true;
    group.add(mesh);

    if (visual.role === "ragdoll" && visual.id === "ragdoll-head") {
      const faceMaterial = new THREE.MeshBasicMaterial({ color: "#17182f" });
      const eyeGeometry = new THREE.SphereGeometry(0.045, 8, 6);
      faceMaterial.userData.levelOwned = true;
      eyeGeometry.userData.levelOwned = true;
      [-0.13, 0.13].forEach((x) => {
        const eye = new THREE.Mesh(eyeGeometry, faceMaterial);
        eye.position.set(x, 0.08, 0.35);
        group.add(eye);
      });
      const smile = new THREE.Mesh(
        new THREE.TorusGeometry(0.11, 0.023, 6, 12, Math.PI),
        faceMaterial,
      );
      smile.geometry.userData.levelOwned = true;
      smile.position.set(0, -0.06, 0.35);
      smile.rotation.z = Math.PI;
      group.add(smile);
    } else if (visual.role === "bumper") {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(
          visual.shape.kind === "sphere" ? visual.shape.radius * 0.72 : 0.4,
          0.055,
          8,
          24,
        ),
        new THREE.MeshBasicMaterial({ color: visual.accent ?? "#fff3d6" }),
      );
      ring.geometry.userData.levelOwned = true;
      (ring.material as THREE.Material).userData.levelOwned = true;
      ring.position.z =
        visual.shape.kind === "sphere" ? visual.shape.radius * 0.86 : 0.5;
      group.add(ring);
    } else if (visual.role === "crate") {
      const strapMaterial = new THREE.MeshStandardMaterial({
        color: visual.accent ?? "#fff3d6",
        roughness: 0.9,
      });
      const strap = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.72, 0.78),
        strapMaterial,
      );
      strap.geometry.userData.levelOwned = true;
      strapMaterial.userData.levelOwned = true;
      group.add(strap);
    } else if (visual.role === "spring") {
      for (let i = -2; i <= 2; i += 1) {
        const tooth = new THREE.Mesh(
          new THREE.BoxGeometry(0.13, 0.44, 0.95),
          new THREE.MeshStandardMaterial({
            color: i % 2 === 0 ? "#fff3d6" : "#57e2b2",
          }),
        );
        tooth.geometry.userData.levelOwned = true;
        (tooth.material as THREE.Material).userData.levelOwned = true;
        tooth.position.x = i * 0.25;
        tooth.rotation.z = 0.6;
        group.add(tooth);
      }
    } else if (visual.role === "fan") {
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 0.85, 12),
        new THREE.MeshStandardMaterial({ color: "#fff3d6" }),
      );
      hub.geometry.userData.levelOwned = true;
      (hub.material as THREE.Material).userData.levelOwned = true;
      hub.rotation.x = Math.PI / 2;
      group.add(hub);
    } else if (visual.role === "crusher") {
      for (let i = -2; i <= 2; i += 1) {
        const tooth = new THREE.Mesh(
          new THREE.ConeGeometry(0.13, 0.28, 4),
          new THREE.MeshStandardMaterial({ color: "#ffd166" }),
        );
        tooth.geometry.userData.levelOwned = true;
        (tooth.material as THREE.Material).userData.levelOwned = true;
        tooth.position.set(i * 0.22, -0.43, 0);
        tooth.rotation.z = Math.PI;
        group.add(tooth);
      }
    }
    return group;
  }

  private getGeometry(visual: PhysicsVisual): THREE.BufferGeometry {
    const shape = visual.shape;
    const key =
      shape.kind === "box"
        ? `box:${shape.size.join(":")}`
        : shape.kind === "sphere"
          ? `sphere:${shape.radius}`
          : `capsule:${shape.radius}:${shape.length}`;
    const existing = this.geometries.get(key);
    if (existing) return existing;
    const geometry =
      shape.kind === "box"
        ? new THREE.BoxGeometry(...shape.size)
        : shape.kind === "sphere"
          ? new THREE.SphereGeometry(shape.radius, 18, 12)
          : new THREE.CapsuleGeometry(
              shape.radius,
              Math.max(0.05, shape.length - shape.radius * 2),
              5,
              10,
            );
    this.geometries.set(key, geometry);
    return geometry;
  }

  private getMaterial(
    color: string,
    ragdoll: boolean,
  ): THREE.MeshStandardMaterial {
    const key = `${color}:${ragdoll ? "r" : "s"}`;
    const existing = this.materials.get(key);
    if (existing) return existing;
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: ragdoll ? 0.72 : 0.82,
      metalness: 0.02,
    });
    this.materials.set(key, material);
    return material;
  }

  private makeTextSprite(
    text: string,
    ink: string,
    fill: string,
  ): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 96;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = fill;
      context.strokeStyle = ink;
      context.lineWidth = 10;
      context.beginPath();
      context.roundRect(10, 10, 236, 76, 24);
      context.fill();
      context.stroke();
      context.fillStyle = ink;
      context.font = "900 44px Arial";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(text, 128, 51);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true }),
    );
    sprite.userData.disposeTexture = texture;
    return sprite;
  }

  private updateConfetti(delta: number): void {
    let active = 0;
    this.confetti.forEach((particle, index) => {
      particle.life -= delta;
      if (particle.life <= 0) {
        this.scratchMatrix.makeScale(0, 0, 0);
        this.confettiMesh.setMatrixAt(index, this.scratchMatrix);
        return;
      }
      particle.velocity.y -= 8.5 * delta;
      particle.position.addScaledVector(particle.velocity, delta);
      particle.rotation.x += particle.spin.x * delta;
      particle.rotation.y += particle.spin.y * delta;
      particle.rotation.z += particle.spin.z * delta;
      this.scratchQuaternion.setFromEuler(particle.rotation);
      this.scratchScale.setScalar(1);
      this.scratchMatrix.compose(
        particle.position,
        this.scratchQuaternion,
        this.scratchScale,
      );
      this.confettiMesh.setMatrixAt(index, this.scratchMatrix);
      active += 1;
    });
    if (active > 0) this.confettiMesh.instanceMatrix.needsUpdate = true;
    if (active === 0 && this.confettiMesh.count) this.confettiMesh.count = 0;
  }

  private clearWorld(): void {
    const ownedGeometries = new Set<THREE.BufferGeometry>();
    const ownedMaterials = new Set<THREE.Material>();
    for (const entry of this.visualEntries) {
      entry.object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mesh = child as THREE.Mesh<
            THREE.BufferGeometry,
            THREE.Material | THREE.Material[]
          >;
          if (mesh.geometry.userData.levelOwned) {
            ownedGeometries.add(mesh.geometry);
          }
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          materials.forEach((material) => {
            if (material.userData.levelOwned) ownedMaterials.add(material);
          });
        }
        if (child instanceof THREE.Sprite) {
          const texture = child.userData.disposeTexture as
            THREE.Texture | undefined;
          texture?.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
      entry.object.removeFromParent();
    }
    ownedGeometries.forEach((geometry) => geometry.dispose());
    ownedMaterials.forEach((material) => material.dispose());
    this.visualEntries.length = 0;
  }

  private readonly resize = (): void => {
    if (this.disposed) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.lowTier ? 1 : 1.75);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private async loadStageMark(): Promise<void> {
    try {
      const gltf = await new GLTFLoader().loadAsync("./assets/stage-mark.glb");
      const mark = gltf.scene;
      mark.position.set(0, 5.25, -1.55);
      mark.scale.setScalar(0.8);
      mark.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      this.backdropRoot.add(mark);
    } catch {
      // The runtime remains playable if optional decorative content cannot be decoded.
    }
  }
}
