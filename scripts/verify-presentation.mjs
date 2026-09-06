import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const port = Number(process.env.J2ME_PRESENT_TEST_PORT || 4241);
const origin = `http://127.0.0.1:${port}`;
const runtimePath = process.env.J2ME_PRESENT_RUNTIME_PATH || "/runtime/";
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: new URL("..", import.meta.url), env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "inherit"]
});
const evidence = { kind: "PRESENTATION", runtimePath };
let browser, page;
try {
  await Promise.race([once(server.stdout, "data"), once(server, "exit").then(() => { throw Error("Server exited"); })]);
  const bytes = await readFile(new URL("../.cache/test-runtime/presentation.jar", import.meta.url));
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader"] });
  evidence.browser = await browser.version();
  page = await browser.newPage();
  await page.goto(origin);
  await page.evaluate(async ({ jar, runtimePath }) => {
    const { createRuntime, sha256Hex } = await import("/runtime-api.js");
    const bytes = Uint8Array.from(jar), digest = await sha256Hex(bytes);
    window.rmsLogs = []; window.pacing = {};
    window.presentationCopies = 0;
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      if (args[0]?.className === "j2me-runtime-source" || this.canvas.className === "j2me-runtime-display") window.presentationCopies++;
      return Reflect.apply(draw, this, args);
    };
    const target = document.createElement("div"); target.style.height = "500px";
    document.body.replaceChildren(target);
    window.rmsRuntime = createRuntime({ sessionId: crypto.randomUUID(), contentDigest: digest,
      source: { kind: "J2ME_JAR_V1", name: "presentation.jar", sha256: digest, sizeBytes: bytes.length,
        url: URL.createObjectURL(new Blob([bytes])) },
      adapter: { adapterKind: "J2ME_MINIJVM_WEB", adapterId: "j2me-minijvm-web", storage: "HOST",
        runtimeBaseUrl: location.origin + runtimePath, viewport: { width: 240, height: 320 } } },
    { frameWindow: window, onDiagnostic: ({ message }) => {
      rmsLogs.push(message);
      if (message === "PRESENT_START") pacing.start = rmsRuntime.getFrameCount();
      if (message === "PRESENT_DONE") pacing.end = rmsRuntime.getFrameCount();
    } });
    await rmsRuntime.mount(target);
  }, { jar: [...bytes], runtimePath });
  await page.waitForFunction(() => rmsLogs.includes("PRESENT_DONE"), {timeout: 45000});
  evidence.pacing = await page.evaluate(() => ({...pacing, frames: pacing.end - pacing.start}));
  await new Promise(resolve => setTimeout(resolve, 300));
  const before = await page.evaluate(() => ({frames: rmsRuntime.getFrameCount(), copies: presentationCopies}));
  await new Promise(resolve => setTimeout(resolve, 1200));
  evidence.idle = await page.evaluate(before => ({frames: rmsRuntime.getFrameCount() - before.frames, copies: presentationCopies - before.copies}), before);
  assert.ok(evidence.pacing.frames >= 10 && evidence.pacing.frames <= 13,
    `12 spaced paints generated ${evidence.pacing.frames} presentations`);
  assert.equal(evidence.idle.frames, 0, "Idle core must not redraw");
  assert.equal(evidence.idle.copies, 0, "Idle display must not copy the WebGL surface");
  // Paused scaling must redraw immediately, while screenshots stay unscaled and current.
  evidence.screenshots = await page.evaluate(async () => {
    await rmsRuntime.pause();
    const results = [];
    for (const mode of ["SCALE2X", "INTEGER_NEAREST", "SHARP_FIT"]) {
      rmsRuntime.setScalingMode(mode);
      const blob = await rmsRuntime.screenshot();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
      const pixel = [...context.getImageData(120, 160, 1, 1).data];
      const display = rmsRuntime.getCanvas();
      const displayPixel = [...display.getContext("2d").getImageData(display.width / 2, display.height / 2, 1, 1).data];
      results.push({mode, width: canvas.width, height: canvas.height, pixel, displayPixel, displayWidth: display.width});
    }
    await rmsRuntime.resume();
    return results;
  });
  for (const shot of evidence.screenshots) {
    assert.equal(shot.width, 240); assert.equal(shot.height, 320);
    assert.deepEqual(shot.pixel, [171,205,239,255]); assert.deepEqual(shot.displayPixel, shot.pixel);
    assert.equal(shot.displayWidth, shot.mode === "SCALE2X" ? 480 : 240);
  }
  // An idle game must still receive gamepad input when no new frame is pending.
  await page.bringToFront();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "getGamepads", {configurable: true, value: () => [{connected: true, mapping: "standard", index: 0,
      axes: [0,0,0,0], buttons: Array.from({length: 17}, (_, i) => ({pressed: i === 1, value: i === 1 ? 1 : 0}))}]});
  });
  await page.waitForFunction(() => rmsLogs.includes("PRESENT_KEY -7"), {timeout: 5000});
  await page.evaluate(() => {delete navigator.getGamepads;});
  evidence.input = "IDLE_GAMEPAD_RIGHT_SOFT_PASSED";
  evidence.status = "PASSED";
} catch (error) {
  evidence.status = "FAILED"; evidence.error = error.message; process.exitCode = 1;
} finally {
  if (page) await page.evaluate(() => window.rmsRuntime?.exit()).catch(() => {});
  await browser?.close(); server.kill("SIGTERM");
  await mkdir(new URL("../.cache/evidence/", import.meta.url), {recursive: true});
  await writeFile(new URL("../.cache/evidence/presentation.json", import.meta.url), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
}
