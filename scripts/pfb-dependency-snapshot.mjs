import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {chmod, lstat, mkdir, readFile, readlink, realpath, symlink, writeFile} from "node:fs/promises";
import {dirname, isAbsolute, join, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const coreRoot = fileURLToPath(new URL("..", import.meta.url));
const names = ["miniJVM", "freej2meOnMinijvm", "freej2me-plus"];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (root, ...args) => execFileSync("git", args, {cwd: root, encoding: "utf8"});

export async function snapshotDependencies(projectRoot, output) {
  const project = await realpath(projectRoot);
  if (await realpath(coreRoot) !== join(project, "retrom-core/j2me-web") ||
      !project.includes("/.worktree/") || !isAbsolute(output)) {
    throw new Error("J2ME_PFB_DEPENDENCIES_INVALID");
  }
  const inputs = [];
  for (const name of names) {
    const root = await realpath(join(project, "retrom-other", name));
    if (root !== join(project, "retrom-other", name) ||
        git(root, "rev-parse", "--show-toplevel").trim() !== root) {
      throw new Error("J2ME_PFB_DEPENDENCIES_INVALID");
    }
    const origin = git(root, "remote", "get-url", "origin").trim().replace(/^git@github\.com:/u, "https://github.com/").replace(/\.git$/u, "");
    if (origin !== `https://github.com/retrom-project/${name}`) {
      throw new Error("J2ME_PFB_DEPENDENCIES_INVALID");
    }
    const files = await copySource(root, join(output, name));
    inputs.push({name, repository: origin, commit: git(root, "rev-parse", "HEAD").trim(),
      dirty: git(root, "status", "--porcelain=v1").length > 0,
      sourceTreeSha256: hash(JSON.stringify(files))});
  }
  await writeFile(join(output, "build-inputs.json"), `${JSON.stringify({schemaVersion: 1, kind: "PFB_WORKTREES", inputs}, null, 2)}\n`);
}

async function copySource(root, output) {
  const paths = [...new Set(git(root, "ls-files", "--cached", "--others", "--exclude-standard", "-z")
    .split("\0").filter(Boolean))].sort((a, b) => Buffer.from(a).compare(Buffer.from(b)));
  const records = [];
  for (const path of paths) {
    if (isAbsolute(path) || path.split("/").some((part) => !part || part === "..")) {
      throw new Error("J2ME_PFB_SOURCE_INVALID");
    }
    const source = join(root, path);
    let info;
    try { info = await lstat(source); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    const target = join(output, path);
    await mkdir(dirname(target), {recursive: true});
    let bytes;
    let mode;
    if (info.isSymbolicLink()) {
      const link = await readlink(source);
      const destination = relative(root, resolve(dirname(source), link));
      if (isAbsolute(link) || destination === ".." || destination.startsWith("../")) {
        throw new Error("J2ME_PFB_SOURCE_INVALID");
      }
      bytes = Buffer.from(link);
      mode = "120000";
      await symlink(link, target);
    } else if (info.isFile()) {
      bytes = await readFile(source);
      mode = info.mode & 0o100 ? "100755" : "100644";
      await writeFile(target, bytes);
      await chmod(target, mode === "100755" ? 0o755 : 0o644);
    } else { throw new Error("J2ME_PFB_SOURCE_INVALID"); }
    records.push({path, mode, sha256: hash(bytes)});
  }
  return records;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await snapshotDependencies(process.argv[2], process.argv[3]);
}
