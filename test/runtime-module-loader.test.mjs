import {test} from "node:test";
import assert from "node:assert/strict";
import {loadModuleFactory} from "../web/runtime-module-loader.js";

function fixture(onAppend) {
  const script = {dataset: {}, remove() {this.removed = true;}};
  const frame = {setTimeout, clearTimeout, document: {
    createElement: () => script, head: {append: () => onAppend(script, frame)}
  }};
  return {script, frame};
}

test("external loader works behind a server that forbids asset query parameters", async () => {
  const factory = () => undefined;
  const f = fixture((script, frame) => {
    const url = new URL(script.src);
    if (url.search) {script.onerror(); return;}
    assert.equal(url.pathname, "/assets/j2me/runtime-loader.js");
    assert.equal(url.hash, "");
    assert.notEqual(script.type, "module");
    frame[script.dataset.j2meBridge].resolve(factory);
  });
  assert.equal(await loadModuleFactory(new URL("https://host.test/assets/j2me/"), f.frame,
    new AbortController().signal), factory);
  assert.equal(f.script.removed, true);
  assert.equal(Object.keys(f.frame).some(key => key.startsWith("__j2meLoader_")), false);
});

test("abort cleans the pending bridge and external script", async () => {
  const controller = new AbortController();
  const f = fixture(() => controller.abort());
  await assert.rejects(loadModuleFactory(new URL("https://host.test/assets/"), f.frame, controller.signal),
    {name: "AbortError"});
  assert.equal(f.script.removed, true);
});
