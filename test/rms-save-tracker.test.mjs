import assert from "node:assert/strict";
import test from "node:test";
import { RmsSaveTracker } from "../web/rms-save-tracker.js";

const mota = "916455b40823c02b48372b7ebb4df0c8a8a76bb7651df7844c9cc91c69ea4c2b";
const xianjian = "75aaf194cbd01715d4eaa99720e6876ff2355e494d3ed5f09c33d85cae81b100";
const store = (name, values, modified = 1) => [
  { path: `${name}.rms`, bytes: new TextEncoder().encode(JSON.stringify({
    rmsVersion: "1.0.0", recordName: name, ids: values.map((_, i) => i + 1), lastModified: modified,
  })) },
  ...values.map((bytes, i) => ({ path: `${name}.${i + 1}`, bytes: Uint8Array.from(bytes) })),
];
const ready = (tracker, files, now = 0) => {
  tracker.observe(files, now);
  return tracker.observe(files, now + 1500);
};

test("fresh empty RMS has no data; every persisted store can be synchronized", () => {
  assert.equal(ready(new RmsSaveTracker(mota), []).blocker, "NO_SAVE");
  for (const files of [store("JD", []), store("SZ", [[1]]), store("rc", [[1]])]) {
    assert.equal(ready(new RmsSaveTracker(mota), files).available, true);
  }
});

test("waits for stable complete records, preserving zero-byte records", () => {
  const tracker = new RmsSaveTracker(mota);
  const files = store("JD", [[], [7]]);
  assert.equal(tracker.observe(files, 0).blocker, "BUSY");
  assert.equal(tracker.observe(files, 1499).available, false);
  const saved = tracker.observe(files, 1500);
  assert.equal(saved.available, true);
  assert.ok(saved.revision);
  assert.equal(tracker.observe(files.slice(0, 2), 1600).blocker, "BUSY");
  assert.equal(tracker.observe(files, 1700).blocker, "BUSY");
  assert.equal(tracker.observe(files, 3200).available, true);
});

test("restore is the baseline; metadata changes and identical writes do not create new saves", () => {
  const original = store("JD", [[7]]);
  const tracker = new RmsSaveTracker(mota, original);
  assert.equal(ready(tracker, store("JD", [[7]], 999)).blocker, "UNCHANGED");
  assert.equal(ready(tracker, store("JD", [[8]]), 2000).available, true);
});

test("export does not acknowledge upload; acknowledgment uses the exported content, not live data", () => {
  const tracker = new RmsSaveTracker(mota);
  const first = store("JD", [[7]]), second = store("JD", [[8]]);
  const a = ready(tracker, first);
  assert.deepEqual(tracker.observe(first, 1700), a);
  const b = ready(tracker, second, 2000);
  assert.notEqual(a.revision, b.revision);
  tracker.acknowledge(first);
  assert.equal(tracker.observe(second, 4000).available, true);
  tracker.acknowledge(second);
  assert.equal(tracker.observe(second, 4100).blocker, "UNCHANGED");
  assert.equal(ready(tracker, store("JD", [[8]], 200), 4200).blocker, "UNCHANGED");
  assert.equal(ready(tracker, first, 6000).available, true);
});

test("synchronizes settings and purchases for every game without progress-store allowlists", () => {
  for (const digest of [mota, xianjian, "c".repeat(64)]) {
    for (const name of ["SZ", "down", "Save52_SMS_RS"]) {
      const tracker = new RmsSaveTracker(digest);
      assert.equal(ready(tracker, store(name, [[1]])).available, true);
    }
  }
});

test("empty-store creation and deletion of the last record or store are changes", () => {
  const tracker = new RmsSaveTracker("c".repeat(64));
  assert.equal(ready(tracker, []).blocker, "NO_SAVE");
  const empty = store("settings", []);
  assert.equal(ready(tracker, empty, 2000).available, true);
  tracker.acknowledge(empty);
  const full = store("settings", [[1]]);
  assert.equal(ready(tracker, full, 4000).available, true);
  tracker.acknowledge(full);
  assert.equal(ready(tracker, empty, 6000).available, true);
  tracker.acknowledge(empty);
  assert.equal(ready(tracker, [], 8000).available, true);
  tracker.acknowledge([]);
  assert.equal(ready(tracker, [], 10000).available, false);
});
