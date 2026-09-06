import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const port = Number(process.env.J2ME_ALPHA_TEST_PORT || 4236);
const origin = `http://127.0.0.1:${port}`;
const runtimePath = process.env.J2ME_ALPHA_RUNTIME_PATH || "/runtime/";
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: new URL("..", import.meta.url), env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "inherit"]
});
const evidence = { kind: "ALPHA_COMPOSITING", runtimePath };
let browser, page;
try {
  await Promise.race([once(server.stdout, "data"), once(server, "exit").then(() => { throw Error("Server exited"); })]);
  const bytes = await readFile(new URL("../.cache/test-runtime/alpha-compositing.jar", import.meta.url));
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader"] });
  evidence.browser = await browser.version();
  page = await browser.newPage();
  await page.goto(origin);
  await page.evaluate(async ({ jar, runtimePath }) => {
    const { createRuntime, sha256Hex } = await import("/runtime-api.js");
    const bytes = Uint8Array.from(jar), digest = await sha256Hex(bytes);
    window.rmsLogs = [];
    const target = document.createElement("div"); target.style.height = "500px";
    document.body.replaceChildren(target);
    window.rmsRuntime = createRuntime({ sessionId: crypto.randomUUID(), contentDigest: digest,
      source: { kind: "J2ME_JAR_V1", name: "alpha-compositing.jar", sha256: digest, sizeBytes: bytes.length,
        url: URL.createObjectURL(new Blob([bytes])) },
      adapter: { adapterKind: "J2ME_MINIJVM_WEB", adapterId: "j2me-minijvm-web", storage: "HOST",
        runtimeBaseUrl: location.origin + runtimePath, viewport: { width: 240, height: 320 } } },
    { frameWindow: window, onDiagnostic: ({ message }) => rmsLogs.push(message) });
    await rmsRuntime.mount(target);
  }, { jar: [...bytes], runtimePath });
  await page.waitForFunction(() => rmsLogs.includes("ALPHA_DONE"), {timeout: 30000});
  evidence.logs = await page.evaluate(() => rmsLogs.filter(line => line.startsWith("ALPHA_")));
  assert.deepEqual(evidence.logs.filter(line => line.startsWith("ALPHA_FAIL")), []);
  for (const name of ["midp", "awt1", "awt2", "scrolling"]) assert.ok(evidence.logs.includes(`ALPHA_PASS ${name}`), name);
  evidence.status = "PASSED";
} catch (error) {
  evidence.status = "FAILED"; evidence.error = error.message; process.exitCode = 1;
} finally {
  if (page) await page.evaluate(() => window.rmsRuntime?.exit()).catch(() => {});
  await browser?.close(); server.kill("SIGTERM");
  await mkdir(new URL("../.cache/evidence/", import.meta.url), { recursive: true });
  await writeFile(new URL("../.cache/evidence/alpha-compositing.json", import.meta.url), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
}
