import assert from "node:assert/strict";
import test from "node:test";
import { assertCompleteRmsTree } from "../web/rms-storage.js";

const metadata = (ids) => ({ path: "suite/store.rms", bytes: new TextEncoder().encode(JSON.stringify({ rmsVersion: "1.0.0", ids })) });
const record = (id, bytes = []) => ({ path: `suite/store.${id}`, bytes: Uint8Array.from(bytes) });

test("rejects an export taken between RMS metadata and record writes", () => {
  assert.throws(() => assertCompleteRmsTree([metadata([1, 2, 3]), record(1, [7])]), /J2ME_RMS_STORAGE_INCOMPLETE/u);
  assert.throws(() => assertCompleteRmsTree([{ path: "suite/store.rms", bytes: new TextEncoder().encode('{"ids":') }]), /J2ME_RMS_STORAGE_INCOMPLETE/u);
});

test("preserves zero-byte records and a complete tree without changing its bytes", () => {
  const files = [metadata([1, 2]), record(1), record(2, [0, 255]), { path: "suite/legacy", bytes: Uint8Array.of(7) }];
  const before = structuredClone(files);
  assertCompleteRmsTree(files);
  assert.deepEqual(files, before);
  assertCompleteRmsTree([metadata([])]);
});

test("rejects malformed record IDs without interpreting them as paths", () => {
  for (const ids of [[0], [-1], [1.5], ["../other"], [1, 1], null]) {
    assert.throws(() => assertCompleteRmsTree([metadata(ids), record(1)]), /J2ME_RMS_STORAGE_INCOMPLETE/u);
  }
});
