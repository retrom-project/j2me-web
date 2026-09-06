import {test} from "node:test";
import assert from "node:assert/strict";
import {webcrypto, createHash} from "node:crypto";
import {loadCachedJar} from "../web/jar-cache.js";

function fixture(bytes = new Uint8Array([1, 2, 3])) {
  const data = new Map();
  let requests = 0;
  const source = {sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length};
  const cache = {match: async (key) => data.get(key)?.clone(),
    put: async (key, response) => {data.set(key, response);}, delete: async (key) => data.delete(key)};
  const frame = {location: {href: "http://localhost/"}, crypto: webcrypto, Response,
    caches: {open: async () => cache}};
  const load = () => loadCachedJar(source, frame, new AbortController().signal,
    async () => {requests++; return bytes;});
  return {data, cache, frame, source, load, requests: () => requests};
}

test("two fresh runtime loads reuse verified JAR bytes", async () => {
  const f = fixture();
  assert.deepEqual(await f.load(), await f.load());
  assert.equal(f.requests(), 1);
  const key = [...f.data.keys()][0];
  f.data.set(key, new Response(new Uint8Array([9, 9, 9])));
  await f.load();
  assert.equal(f.requests(), 2);
});

test("persistent storage failure still permits network loading", async () => {
  const f = fixture(); f.cache.put = async () => {throw new Error("quota");};
  await f.load(); await f.load();
  assert.equal(f.requests(), 2);
});

test("local Blob JARs use their HTTP origin for persistent content identity", async () => {
  const f = fixture();
  f.source.url = "blob:http://localhost/first-upload";
  await f.load();
  f.source.url = "blob:http://localhost/second-upload";
  await f.load();
  assert.equal(f.requests(), 1);
  assert.match([...f.data.keys()][0], /^http:\/\/localhost\/__j2me_content_v1__\//);
});

test("opaque origins cannot make content loading fail", async () => {
  const f = fixture();
  f.source.url = "blob:null/local-upload";
  f.frame.location.href = "about:blank";
  await f.load();
  assert.equal(f.requests(), 1);
});
