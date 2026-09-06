/** Check FreeJ2ME metadata before handing an RMS tree to the host.
 * A JVM safepoint can occur after metadata is written but before its records.
 * This detects that incomplete write; it cannot determine game-level progress.
 */
export function assertCompleteRmsTree(files) {
  const paths = new Set(files.map(({ path }) => path));
  for (const file of files) {
    if (!file.path.endsWith(".rms")) continue;
    try {
      const metadata = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(file.bytes));
      if (metadata?.rmsVersion !== "1.0.0" || !Array.isArray(metadata.ids)) throw new Error();
      const prefix = file.path.slice(0, -4);
      const ids = new Set();
      for (const id of metadata.ids) {
        if (!Number.isSafeInteger(id) || id <= 0 || ids.has(id) || !paths.has(`${prefix}.${id}`)) throw new Error();
        ids.add(id);
      }
    } catch {
      throw new Error("J2ME_RMS_STORAGE_INCOMPLETE");
    }
  }
}
