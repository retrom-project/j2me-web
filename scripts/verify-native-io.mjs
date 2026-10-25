import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import puppeteer from "puppeteer-core";

const port = Number(process.env.J2ME_IO_TEST_PORT || 4211);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: new URL("..", import.meta.url), env: {...process.env, PORT: String(port)}, stdio: ["ignore", "pipe", "inherit"]
});
const evidence = {kind: "NATIVE_IO_SAFEPOINT_CONTRACT", events: [], pauses: []};
let browser, page;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function limit(promise, ms, code) {
  let timer;
  try {return await Promise.race([promise, new Promise((_, reject) => {timer = setTimeout(() => reject(new Error(code)), ms);})]);}
  finally {clearTimeout(timer);}
}
try {
  for (let i = 0; i < 100; i++) {
    try {if ((await fetch(origin)).ok) break;} catch { /* Server startup. */ }
    await delay(100);
  }
  browser = await puppeteer.launch({executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader"]});
  evidence.browser = await browser.version();
  page = await browser.newPage();
  page.on("pageerror", error => {evidence.pageError = error.message;});
  page.on("console", message => {if (message.text().startsWith("NATIVE_IO_")) evidence.events.push(message.text());});
  await page.goto(origin);
  const jar = await readFile(new URL("../.cache/test-runtime/startup-native-io.jar", import.meta.url));
  await limit(page.evaluate(async jar => {
    const {createRuntime, sha256Hex} = await import("/runtime-api.js");
    const bytes = Uint8Array.from(jar), digest = await sha256Hex(bytes);
    const target = document.createElement("div"); target.style.height = "500px"; document.body.replaceChildren(target);
    window.ioLogs = [];
    window.ioRuntime = createRuntime({sessionId: crypto.randomUUID(), contentDigest: digest,
      source: {kind: "J2ME_JAR_V1", name: "native-io.jar", sha256: digest, sizeBytes: bytes.length,
        url: URL.createObjectURL(new Blob([bytes]))},
      adapter: {adapterKind: "J2ME_MINIJVM_WEB", adapterId: "j2me-minijvm-web", storage: "HOST", runtimeBaseUrl: location.origin + "/runtime/"}},
    {frameWindow: window, onDiagnostic: ({message}) => {ioLogs.push(message); if (message.startsWith("NATIVE_IO_")) console.log(message);}});
    await ioRuntime.mount(target);
  }, [...jar]), 45000, "IO_FIXTURE_STARTUP_TIMEOUT");
  await page.waitForFunction(() => ioLogs.some(line => line.startsWith("NATIVE_IO_PROGRESS")), {timeout: 15000});
  for (let i = 0; i < 12; i++) {
    await delay(41 + i * 17);
    const paused = await limit(page.evaluate(async () => {
      const begin = performance.now(); await ioRuntime.pause();
      return {state: ioRuntime.getState(), frames: ioRuntime.getFrameCount(), elapsedMs: performance.now() - begin};
    }), 5000, "NATIVE_IO_PAUSE_TIMEOUT");
    assert.equal(paused.state, "PAUSED");
    evidence.pauses.push(paused);
    await delay(30);
    assert.equal(await page.evaluate(() => ioRuntime.getFrameCount()), paused.frames);
    await limit(page.evaluate(() => ioRuntime.resume()), 5000, "NATIVE_IO_RESUME_TIMEOUT");
  }
  await page.evaluate(() => ioRuntime.setInput("FIRE", true));
  await delay(60);
  await page.evaluate(() => ioRuntime.setInput("FIRE", false));
  await page.waitForFunction(() => ioLogs.some(line => line.startsWith("NATIVE_IO_STOPPED")), {timeout: 15000});
  evidence.logs = await page.evaluate(() => ioLogs);
  assert.ok(!evidence.logs.some(line => line.startsWith("NATIVE_IO_FAIL")));
  await page.waitForFunction(() => ioRuntime.getCheckpointAvailability().available, {timeout: 10000});
  evidence.checkpoint = await page.evaluate(async () => {
    const checkpoint = await ioRuntime.checkpoint();
    await ioRuntime.acknowledgeCheckpoint(checkpoint);
    return {format: checkpoint.format, sizeBytes: checkpoint.bytes.length};
  });
  assert.ok(evidence.checkpoint.sizeBytes > 0);
  assert.ok(!evidence.pageError, evidence.pageError);
  evidence.status = "PASSED";
} catch (error) {evidence.status = "FAILED"; evidence.error = String(error.stack || error); process.exitCode = 1;}
finally {
  if (page) await limit(page.evaluate(() => window.ioRuntime?.exit()), 5000, "IO_EXIT_TIMEOUT").catch(() => {});
  if (browser) await limit(browser.close(), 3000, "IO_BROWSER_CLOSE_TIMEOUT").catch(() => browser.process()?.kill("SIGKILL"));
  server.kill("SIGTERM");
  await mkdir(new URL("../.cache/evidence/", import.meta.url), {recursive: true});
  await writeFile(new URL("../.cache/evidence/native-io.json", import.meta.url), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
}
