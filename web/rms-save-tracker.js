import { assertCompleteRmsTree } from "./rms-storage.js";

const blocked = (blocker) => ({ available: false, blocker });
const copy = (files) => files.map(({ path, bytes }) => ({ path, bytes: bytes.slice() }));
const equal = (a, b) => a !== null && b !== null && a.length === b.length && a.every((file, i) =>
  file.path === b[i].path && file.bytes.length === b[i].bytes.length &&
  file.bytes.every((byte, j) => byte === b[i].bytes[j]));

export class RmsSaveTracker {
  constructor(_digest, restored = []) {
    this.baseline = copy(this.records(restored));
    this.candidate = null;
    this.tree = null;
    this.changedAt = 0;
    this.revision = 0;
  }

  observe(files, now) {
    let records;
    try { records = this.records(files); }
    catch { return this.invalidate(); }
    if (!equal(this.tree, files)) {
      this.tree = copy(files);
      this.changedAt = now;
    }
    if (!equal(this.candidate, records)) {
      this.candidate = copy(records);
      this.revision++;
    }
    if (equal(this.baseline, records)) return blocked(records.length ? "UNCHANGED" : "NO_SAVE");
    if (now - this.changedAt < 1500) return blocked("BUSY");
    return { available: true, blocker: null, revision: String(this.revision) };
  }

  invalidate() {
    this.tree = null;
    return blocked("BUSY");
  }

  acknowledge(files) { this.baseline = copy(this.records(files)); }

  records(files) {
    assertCompleteRmsTree(files);
    return files.map(({ path, bytes }) => {
      if (!path.endsWith(".rms")) return { path, bytes };
      const metadata = JSON.parse(new TextDecoder().decode(bytes));
      // Synchronize all stores, including empty stores and deletions. Only these
      // bookkeeping fields are excluded from content equality, never from export.
      delete metadata.rmsDate;
      delete metadata.lastModified;
      delete metadata.modificationCount;
      const canonical = Object.fromEntries(Object.keys(metadata).sort().map((key) => [key, metadata[key]]));
      return { path, bytes: new TextEncoder().encode(JSON.stringify(canonical)) };
    }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  }
}
