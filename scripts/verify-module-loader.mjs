import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import puppeteer from "puppeteer-core";

const files = {
  "/helper.js": new URL("../web/runtime-module-loader.js", import.meta.url),
  "/assets/runtime-loader.js": new URL("../web/runtime-loader.js", import.meta.url)
};
const server = createServer(async (request, response) => {
  if (request.url.includes("?")) {response.writeHead(400); response.end(); return;}
  const file = files[request.url];
  if (file || request.url === "/assets/runtime.js") {
    response.setHeader("content-type", "text/javascript");
    response.setHeader("cache-control", "public,max-age=31536000,immutable");
    response.end(file ? await readFile(file) : "export default function factory(){return globalThis;}");
    return;
  }
  response.setHeader("content-type", "text/html");
  response.end("<!doctype html><body></body>");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await puppeteer.launch({executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true, args: ["--no-sandbox"]});
  const page = await browser.newPage();
  for (let navigation = 0; navigation < 2; navigation++) {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    for (let frame = 0; frame < 2; frame++) {
      const result = await page.evaluate(async () => {
        const {loadModuleFactory} = await import("/helper.js");
        const iframe = document.createElement("iframe");
        document.body.append(iframe);
        const frameWindow = iframe.contentWindow;
        frameWindow.setTimeout = (fn, ms) => window.setTimeout(fn, Math.min(ms, 2000));
        try {
          const factory = await loadModuleFactory(new URL("/assets/", location.href), frameWindow,
            new AbortController().signal);
          return factory() === frameWindow;
        } finally {iframe.remove();}
      });
      assert.equal(result, true, "factory must belong to the new frame");
      console.log(`PASS cached loader navigation ${navigation}, frame ${frame}`);
    }
  }
} finally {await browser?.close(); server.close();}
