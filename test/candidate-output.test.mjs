import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("candidate preparation accepts an empty absolute output and rejects existing contents", async () => {
  const output = await mkdtemp(join(tmpdir(), "j2me-candidate-"));
  try {
    execFileSync(process.execPath, ["scripts/package-candidate.mjs", "prepare", output]);
    await writeFile(join(output, "user-file"), "preserve");
    assert.throws(() => execFileSync(process.execPath, ["scripts/package-candidate.mjs", "prepare", output], { stdio: "pipe" }));
    assert.throws(() => execFileSync(process.execPath, ["scripts/package-candidate.mjs", "prepare", "relative"], { stdio: "pipe" }));
  } finally { await rm(output, { recursive: true, force: true }); }
});
