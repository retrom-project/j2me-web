import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const port = Number(process.env.J2ME_INSTANT_TEST_PORT || 4208);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: new URL("..", import.meta.url), env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "inherit"]
});
const evidence = { schemaVersion: 1, kind: "J2ME_CORE_ADMISSION", checks: [] };
let browser;
let page;
let failure;
async function check(name, run) {
  try { await run(); evidence.checks.push({ name, status: "PASSED" }); }
  catch (error) {
    evidence.checks.push({ name, status: "FAILED", error: error.message,
      diagnostics: page ? await page.evaluate(() => window.instantLogs?.slice(-20)).catch(() => []) : [] });
    failure ??= error;
  }
}
try {
  await mkdir(new URL("../.cache/evidence/", import.meta.url), { recursive: true });
  await Promise.race([once(server.stdout, "data"), once(server, "exit").then(() => { throw new Error("Server exited"); })]);
  const jar = await readFile(new URL("../.cache/test-runtime/instant-checkpoint.jar", import.meta.url));
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader"]
  });
  evidence.browser = await browser.version();
  page = await browser.newPage();
  evidence.browserErrors = [];
  page.on("pageerror", (error) => evidence.browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") evidence.browserErrors.push(message.text()); });
  page.on("requestfailed", (request) => evidence.browserErrors.push(`${request.url()}: ${request.failure()?.errorText}`));
  await page.goto(origin);
  await page.evaluate(async (jarBytes) => {
    const { createRuntime, sha256Hex } = await import("/runtime-api.js");
    const bytes = Uint8Array.from(jarBytes);
    const jarUrl = URL.createObjectURL(new Blob([bytes], { type: "application/java-archive" }));
    const sha256 = await sha256Hex(bytes);
    window.mountInstantProbe = async (restorePayload) => {
      const iframe = document.createElement("iframe");
      iframe.width = "800"; iframe.height = "600";
      document.body.replaceChildren(iframe);
      const frameWindow = iframe.contentWindow;
      window.instantPad = { connected: true, mapping: "standard", axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })) };
      Object.defineProperty(frameWindow.navigator, "getGamepads", { value: () => [instantPad] });
      const workers = new Set();
      window.instantWorkerEvents = [];
      const NativeWorker = frameWindow.Worker;
      frameWindow.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args); workers.add(this);
          this.addEventListener("message", (event) => instantWorkerEvents.push(event.data?.cmd ?? "message"));
          this.addEventListener("error", (event) => instantWorkerEvents.push(`error: ${event.message}`));
        }
        terminate() { workers.delete(this); return super.terminate(); }
      };
      window.instantWorkerCount = () => workers.size;
      const target = frameWindow.document.createElement("div");
      target.style.height = "500px";
      frameWindow.document.body.append(target);
      window.instantLogs = [];
      window.instantEvents = [];
      window.instantFrame = iframe;
      window.instantRuntime = createRuntime({ sessionId: crypto.randomUUID(), contentDigest: sha256,
        source: { kind: "J2ME_JAR_V1", name: "instant-checkpoint.jar", url: jarUrl, sizeBytes: bytes.length, sha256 },
        adapter: { adapterKind: "J2ME_MINIJVM_WEB", adapterId: "j2me-minijvm-web", runtimeBaseUrl: `${location.origin}/runtime/`,
          storage: "HOST", viewport: { width: 240, height: 320 } } },
      { frameWindow, restorePayload, onDiagnostic: ({ message }) => instantLogs.push(message) });
      instantRuntime.subscribe((event) => instantEvents.push(event));
      await instantRuntime.mount(target);
    };
    window.instantScreenReady = async () => {
      const image = await createImageBitmap(await instantRuntime.screenshot());
      const canvas = document.createElement("canvas"); canvas.width = 240; canvas.height = 320;
      const context = canvas.getContext("2d"); context.drawImage(image, 0, 0); image.close();
      const pixel = context.getImageData(100, 100, 1, 1).data;
      return pixel[0] === 16 && pixel[1] === 32 && pixel[2] === 48;
    };
    await mountInstantProbe();
  }, [...jar]);
  assert.equal(await page.evaluate(() => instantRuntime.getState()), "RUNNING");
  await page.waitForFunction(() => instantLogs.some((line) => line.includes("INSTANT_STARTED")));
  await page.waitForFunction(() => instantScreenReady(), { timeout: 10000 });
  await check("keyboard reaches the MIDlet", async () => {
    await page.keyboard.down("ArrowRight");
    await waitPosition(1);
    await page.keyboard.up("ArrowRight");
  });
  await check("standard gamepad direction reaches the MIDlet", async () => {
    await setGamepadButton(15, true);
    await waitPosition(2);
    await setGamepadButton(15, false);
  });
  await check("standard gamepad confirmation reaches the MIDlet", async () => {
    await setGamepadButton(0, true);
    await waitPosition(3);
    await setGamepadButton(0, false);
  });
  await check("logical screenshot dimensions", async () => {
    const size = await page.evaluate(async () => {
      const image = await createImageBitmap(await instantRuntime.screenshot());
      const size = [image.width, image.height]; image.close(); return size;
    });
    assert.deepEqual(size, [240, 320]);
  });
  // Do not continue from a failed setup and report its consequences as save bugs.
  if (failure) throw failure;
  await page.evaluate(() => new Promise((resolve) => instantFrame.contentWindow.requestAnimationFrame(() => instantFrame.contentWindow.requestAnimationFrame(resolve))));
  const checkpoint = await page.evaluate(async () => {
    await instantRuntime.pause();
    const value = await instantRuntime.checkpoint();
    return { bytes: [...value.bytes], format: value.format, screenshot: [...new Uint8Array(await (await instantRuntime.screenshot()).arrayBuffer())] };
  });
  assert.ok(checkpoint.bytes.length > 0);
  evidence.checkpoint = { format: checkpoint.format, sizeBytes: checkpoint.bytes.length };
  await page.evaluate(() => instantRuntime.exit());
  assert.equal(await page.evaluate(() => instantWorkerCount()), 0);
  await page.evaluate((bytes) => mountInstantProbe(Uint8Array.from(bytes)), checkpoint.bytes);
  await page.evaluate(() => new Promise((resolve) => instantFrame.contentWindow.requestAnimationFrame(() => instantFrame.contentWindow.requestAnimationFrame(resolve))));
  await page.waitForFunction(() => instantScreenReady(), { timeout: 10000 });
  await check("new runtime restores the checkpointed screen state", async () => {
    const screenshot = await page.evaluate(async () => [...new Uint8Array(await (await instantRuntime.screenshot()).arrayBuffer())]);
    await writeFile(new URL("../.cache/evidence/instant-before.png", import.meta.url), Buffer.from(checkpoint.screenshot));
    await writeFile(new URL("../.cache/evidence/instant-restored.png", import.meta.url), Buffer.from(screenshot));
    assert.equal(Buffer.from(screenshot).equals(Buffer.from(checkpoint.screenshot)), true, "restored pixels must retain the memory-only position");
  });
  await check("new runtime restores memory state and continues input", async () => {
    await page.keyboard.down("Enter");
    await page.waitForFunction(() => instantLogs.some((line) => line.includes("INSTANT_POSITION")));
    await page.keyboard.up("Enter");
    const actual = await page.evaluate(() => Number(instantLogs.find((line) => line.includes("INSTANT_POSITION")).match(/INSTANT_POSITION (\d+)/u)[1]));
    evidence.restoredPositionAfterInput = actual;
    evidence.expectedPositionAfterInput = 4;
    assert.equal(actual, 4, "position was 3 at checkpoint; new input must continue at 4 without game-managed saves");
  });
  await check("standard gamepad cancellation triggers one game-requested exit and releases resources", async () => {
    await setGamepadButton(1, true);
    await page.waitForFunction(() => instantRuntime.getState() === "EXITED", { timeout: 15000 });
    const result = await page.evaluate(() => ({
      exits: instantEvents.filter((event) => event.type === "EXIT_REQUESTED").length,
      workers: instantWorkerCount(),
      canvas: Boolean(instantFrame.contentDocument.querySelector("canvas")),
      checkpoint: instantRuntime.getCheckpointAvailability().available
    }));
    assert.deepEqual(result, { exits: 1, workers: 0, canvas: false, checkpoint: false });
  });
} catch (error) {
  failure ??= error;
  if (page) {
    evidence.diagnostics = await page.evaluate(() => window.instantLogs?.slice(-30)).catch(() => []);
    evidence.workerEvents = await page.evaluate(() => window.instantWorkerEvents).catch(() => []);
  }
}
finally {
  if (page) await page.evaluate(() => window.instantRuntime?.exit()).catch(() => undefined);
  await browser?.close();
  server.kill("SIGTERM");
  evidence.status = failure ? "FAILED" : "PASSED";
  if (failure) evidence.error = failure.message;
  await mkdir(new URL("../.cache/evidence/", import.meta.url), { recursive: true });
  await writeFile(new URL("../.cache/evidence/instant-checkpoint.json", import.meta.url), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
}
if (failure) process.exitCode = 1;

async function waitPosition(expected) {
  await page.waitForFunction((position) => instantLogs.some((line) => line.includes(`INSTANT_POSITION ${position}`)),
    { timeout: 15000 }, expected);
}

async function setGamepadButton(index, pressed) {
  await page.evaluate(({ index, pressed }) => {
    instantPad.buttons[index].pressed = pressed;
    instantPad.buttons[index].value = pressed ? 1 : 0;
  }, { index, pressed });
}
