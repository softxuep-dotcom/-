import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

class NodeFileReader {
  result = null;
  onloadend = null;

  readAsArrayBuffer(blob) {
    void blob.arrayBuffer().then((value) => {
      this.result = value;
      this.onloadend?.();
    });
  }

  readAsDataURL(blob) {
    void blob.arrayBuffer().then((value) => {
      this.result = `data:${blob.type};base64,${Buffer.from(value).toString("base64")}`;
      this.onloadend?.();
    });
  }
}

globalThis.FileReader = NodeFileReader;

const root = new THREE.Group();
root.name = "stage_mark";

const ink = new THREE.MeshStandardMaterial({
  color: "#17182f",
  roughness: 0.78,
});
const gold = new THREE.MeshStandardMaterial({
  color: "#ffd166",
  emissive: "#6a4200",
  emissiveIntensity: 0.25,
  roughness: 0.48,
});
const coral = new THREE.MeshStandardMaterial({
  color: "#ff6b6b",
  roughness: 0.72,
});

const badge = new THREE.Mesh(
  new THREE.CylinderGeometry(1.35, 1.35, 0.22, 20),
  ink,
);
badge.name = "badge_back";
badge.rotation.x = Math.PI / 2;
root.add(badge);

const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.74, 0), gold);
star.name = "finale_star";
star.position.z = 0.22;
star.scale.set(1, 1.25, 0.38);
root.add(star);

for (const [x, rotation] of [
  [-0.72, -0.22],
  [0.72, 0.22],
]) {
  const baton = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.2, 0.2), coral);
  baton.name = x < 0 ? "left_baton" : "right_baton";
  baton.position.set(x, -0.02, 0.26);
  baton.rotation.z = rotation;
  root.add(baton);
}

const exporter = new GLTFExporter();
const binary = await exporter.parseAsync(root, {
  binary: true,
  onlyVisible: true,
  trs: false,
});
if (!(binary instanceof ArrayBuffer)) {
  throw new Error("Expected a binary GLB export.");
}

const output = resolve("public/assets/stage-mark.glb");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, Buffer.from(binary));
console.log(`Generated ${output} (${binary.byteLength} bytes)`);
