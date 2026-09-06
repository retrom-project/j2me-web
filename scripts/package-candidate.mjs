import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, readFile, readdir, readlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleRuntimeApi, composeAudioWorker } from "./release-package-lib.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const [action, output] = process.argv.slice(2);
if (!["prepare", "finalize"].includes(action) || !output || !isAbsolute(output) || resolve(output) !== output) {
  throw new Error("PFB_CANDIDATE_OUTPUT_INVALID");
}
const info = await lstat(output);
if (!info.isDirectory() || info.isSymbolicLink() || (await readdir(output)).length) {
  throw new Error("PFB_CANDIDATE_OUTPUT_INVALID");
}
if (action === "finalize") {
  const manifest = JSON.parse(await readFile(join(root, "runtime-manifest.json"), "utf8"));
  const fork = JSON.parse(await readFile(join(root, "retrom-fork.json"), "utf8"));
  const assets = [...manifest.assets, "runtime-manifest.json", "THIRD_PARTY_NOTICES.md", "build-inputs.json"].sort();
  if (fork.adapterAbi !== manifest.adapter.adapterAbi || JSON.stringify([...fork.candidateAssets].sort()) !== JSON.stringify(assets)) {
    throw new Error("PFB_CANDIDATE_MANIFEST_INVALID");
  }
  await bundleRuntimeApi(join(root, "web/runtime-api.js"), join(output, "j2me-runtime.js"));
  for (const filename of manifest.assets) {
    if (filename === "j2me-runtime.js") continue;
    let bytes;
    if (filename === "audio-transcoder.worker.js") {
      bytes = Buffer.from(composeAudioWorker(
        await readFile(join(root, "public/runtime/audio-transcoder.glue.js"), "utf8"),
        await readFile(join(root, "web/audio-transcoder.worker.js"), "utf8")
      ));
    } else {
      bytes = await readFile(join(root, filename === "runtime-loader.js" ? "web" : "public/runtime", filename));
    }
    if (!bytes.length) throw new Error("PFB_CANDIDATE_ASSET_INVALID");
    await writeFile(join(output, filename), bytes);
  }
  for (const filename of ["runtime-manifest.json", "THIRD_PARTY_NOTICES.md"]) {
    await writeFile(join(output, filename), await readFile(join(root, filename)));
  }
  await writeFile(join(output, "build-inputs.json"), await readFile(join(root, "public/runtime/build-inputs.json")));
  const files = [];
  for (const filename of (await readdir(output)).sort()) {
    const bytes = await readFile(join(output, filename));
    files.push({ filename, sizeBytes: bytes.length, sha256: digest(bytes) });
  }
  const descriptor = {
    schemaVersion: 1,
    kind: "RETROM_CORE_CANDIDATE_V1",
    coreId: "j2me",
    repository: fork.forkRepository,
    branch: git("symbolic-ref", "--quiet", "--short", "HEAD").trim(),
    commit: git("rev-parse", "HEAD").trim(),
    dirty: git("status", "--porcelain=v1").length > 0,
    sourceTreeSha256: await sourceDigest(),
    adapterAbi: manifest.adapter.adapterAbi,
    files
  };
  await writeFile(join(output, "retrom-core-candidate.json"), `${JSON.stringify(descriptor)}\n`);
}

function git(...args) { return execFileSync("git", args, { cwd: root, encoding: "utf8" }); }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
async function sourceDigest() {
  const paths = [...new Set(git("ls-files", "--cached", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean))].sort((a, b) => Buffer.from(a).compare(Buffer.from(b)));
  const modes = new Map(git("ls-files", "--stage", "-z").split("\0").filter(Boolean).map((row) => {
    const separator = row.indexOf("\t");
    return [row.slice(separator + 1), row.slice(0, separator).split(" ")[0]];
  }));
  const files = [];
  for (const path of paths) {
    const target = join(root, path);
    let info;
    try { info = await lstat(target); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    if (!info.isFile() && !info.isSymbolicLink()) throw new Error("PFB_WORKTREE_INVALID");
    const bytes = info.isSymbolicLink() ? Buffer.from(await readlink(target)) : await readFile(target);
    const mode = info.isSymbolicLink() ? "120000" : modes.get(path) ?? ((info.mode & 0o100) ? "100755" : "100644");
    files.push({ mode, path, sha256: digest(bytes) });
  }
  return digest(Buffer.from(JSON.stringify(files)));
}
