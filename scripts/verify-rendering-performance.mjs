import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const port = Number(process.env.J2ME_RENDER_TEST_PORT || 4239);
const origin = `http://127.0.0.1:${port}`;
const runtimePath = process.env.J2ME_RENDER_RUNTIME_PATH || "/runtime/";
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: new URL("..", import.meta.url), env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "inherit"]
});
const evidence = { kind: "RENDERING_PERFORMANCE", runtimePath };
let browser, page;
try {
  await Promise.race([once(server.stdout, "data"), once(server, "exit").then(() => { throw Error("Server exited"); })]);
  const bytes = await readFile(new URL("../.cache/test-runtime/rendering-performance.jar", import.meta.url));
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
      source: { kind: "J2ME_JAR_V1", name: "rendering-performance.jar", sha256: digest, sizeBytes: bytes.length,
        url: URL.createObjectURL(new Blob([bytes])) },
      adapter: { adapterKind: "J2ME_MINIJVM_WEB", adapterId: "j2me-minijvm-web", storage: "HOST",
        runtimeBaseUrl: location.origin + runtimePath, viewport: { width: 240, height: 320 } } },
    { frameWindow: window, onDiagnostic: ({ message }) => rmsLogs.push(message) });
    await rmsRuntime.mount(target);
  }, { jar: [...bytes], runtimePath });
  await page.waitForFunction(() => rmsLogs.some(line => line === "RENDER_PERF_DONE" || line.startsWith("RENDER_PERF_FAIL")), { timeout: 120000 });
  evidence.logs = await page.evaluate(() => rmsLogs.filter(line => line.startsWith("RENDER_PERF")));
  assert.ok(evidence.logs.includes("RENDER_PERF_DONE"), evidence.logs.join("\n"));
  evidence.samples = evidence.logs.filter(line => /^RENDER_PERF (blit|game) /.test(line)).map(line => {
    const [, name, elapsed, frames] = line.split(" ");
    return {name, elapsedMs: Number(elapsed), frames: Number(frames), msPerFrame: Number(elapsed) / Number(frames)};
  });
  for (const sample of evidence.samples) assert.ok(sample.msPerFrame <= Number(process.env.J2ME_RENDER_MAX_FRAME_MS || 80), `${sample.name}: ${sample.msPerFrame} ms exceeds frame budget`);
  const cdp = await page.createCDPSession();
  await cdp.send("Performance.enable");
  await new Promise(resolve => setTimeout(resolve, 500));
  const before = await cdp.send("Performance.getMetrics");
  const beforeFrames = await page.evaluate(() => rmsRuntime.getFrameCount());
  await new Promise(resolve => setTimeout(resolve, 3000));
  const after = await cdp.send("Performance.getMetrics");
  evidence.idle = {
    milliseconds: 3000,
    presentedFrames: await page.evaluate(() => rmsRuntime.getFrameCount()) - beforeFrames,
    mainThreadTaskSeconds: after.metrics.find(m => m.name === "TaskDuration").value - before.metrics.find(m => m.name === "TaskDuration").value,
  };
  assert.ok(evidence.idle.presentedFrames <= 4, "An unchanged Canvas keeps scheduling its own presentation frames");
  evidence.status = "PASSED";
} catch (error) {
  evidence.status = "FAILED"; evidence.error = error.message; process.exitCode = 1;
} finally {
  if (page) await page.evaluate(() => window.rmsRuntime?.exit()).catch(() => {});
  await browser?.close(); server.kill("SIGTERM");
  await mkdir(new URL("../.cache/evidence/", import.meta.url), { recursive: true });
  await writeFile(new URL("../.cache/evidence/rendering-performance.json", import.meta.url), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
}
