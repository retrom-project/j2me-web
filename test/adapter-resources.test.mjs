import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const resources = ["12txt.fnt", "12txt_0.png", "config.txt", "j2meemu.png",
  "glsl/m3g_common.frag.glsl", "glsl/m3g_mesh.vert.glsl", "glsl/m3g_skin.vert.glsl",
  "glsl/micro3d.frag.glsl", "glsl/micro3d.vert.glsl"];

test("adapter payload contains only required resources, never upstream bundled games or jars", async () => {
  const root = await mkdtemp(join(tmpdir(), "j2me-resources-"));
  try {
    const source = join(root, "source");
    const output = join(root, "output");
    for (const file of [...resources, "pipes-game.jar", "rayman-game.jar", "lib/freej2me.jar", "unknown.bin"]) {
      await mkdir(join(source, file, ".."), { recursive: true });
      await writeFile(join(source, file), `owned test bytes for ${file}`);
    }
    execFileSync("bash", ["-euc", 'source scripts/adapter-resources.sh; copy_adapter_resources "$1" "$2"', "bash", source, output]);
    for (const file of resources) assert.deepEqual(await readFile(join(output, file)), await readFile(join(source, file)));
    for (const file of ["pipes-game.jar", "rayman-game.jar", "lib/freej2me.jar", "unknown.bin"]) {
      await assert.rejects(readFile(join(output, file)), { code: "ENOENT" }, `${file} must not enter the runtime`);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
