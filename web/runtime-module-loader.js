export async function loadModuleFactory(runtimeBaseUrl, frameWindow, signal) {
  signal.throwIfAborted();
  const key = `__j2meLoader_${globalThis.crypto.randomUUID().replaceAll("-", "")}`;
  const script = frameWindow.document.createElement("script");
  const url = new URL("runtime-loader.js", runtimeBaseUrl);
  // A classic external script runs on every insertion, including a cached response.
  // Keep per-instance identity out of the immutable asset URL and module cache.
  script.dataset.j2meBridge = key;
  script.src = url.href;
  let abort;
  let timeout;
  const pending = new Promise((resolve, reject) => {
    frameWindow[key] = { resolve, reject };
    script.onerror = () => reject(new Error("J2ME_RUNTIME_ASSET_INVALID"));
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    timeout = frameWindow.setTimeout(() => reject(new Error("J2ME_RUNTIME_INIT_TIMEOUT")), 30000);
  });
  try {
    frameWindow.document.head.append(script);
    return await pending;
  } finally {
    signal.removeEventListener("abort", abort);
    frameWindow.clearTimeout(timeout);
    delete frameWindow[key];
    script.remove();
  }
}
