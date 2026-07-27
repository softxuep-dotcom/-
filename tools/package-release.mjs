import {
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, relative, resolve, sep } from "node:path";
import { zipSync } from "fflate";

const workspace = resolve(".");
const source = resolve("dist");
const releaseRoot = resolve("release");
const target = resolve(releaseRoot, "fling-fiasco-rc");
const archive = resolve(releaseRoot, "fling-fiasco-rc.zip");

if (
  !target.startsWith(`${workspace}${sep}`) ||
  !target.startsWith(`${releaseRoot}${sep}`)
) {
  throw new Error(
    "Refusing to package outside the workspace release directory.",
  );
}

await stat(resolve(source, "index.html"));
await rm(target, { recursive: true, force: true });
await mkdir(dirname(target), { recursive: true });
await cp(source, target, { recursive: true });

const files = [];
const archiveEntries = {};
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
    } else {
      const content = await readFile(fullPath);
      const archivePath = relative(target, fullPath).replaceAll("\\", "/");
      archiveEntries[archivePath] = new Uint8Array(content);
      files.push({
        path: archivePath,
        bytes: content.byteLength,
        sha256: createHash("sha256").update(content).digest("hex"),
      });
    }
  }
}
await walk(target);
files.sort((a, b) => a.path.localeCompare(b.path));
const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
const metadata = {
  title: "Fling Fiasco",
  version: "1.0.0-rc.1",
  createdAt: new Date().toISOString(),
  entrypoint: "index.html",
  fileCount: files.length,
  totalBytes,
  files,
};
await writeFile(
  resolve(releaseRoot, "release-manifest.json"),
  `${JSON.stringify(metadata, null, 2)}\n`,
);
await rm(archive, { force: true });
await writeFile(archive, zipSync(archiveEntries, { level: 9 }));
console.log(`Packaged ${target}`);
console.log(`Created ${archive}`);
console.log(`${files.length} files, ${totalBytes} bytes`);
