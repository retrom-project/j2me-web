// Loaded as a classic external script so currentScript identifies this insertion.
// Dynamic import still creates the core factory in the host's frame under CSP.
(() => {
  const bridge = globalThis[document.currentScript?.dataset.j2meBridge];
  if (!bridge) return;
  void (async () => {
  try {
    const { default: factory } = await import("./runtime.js");
    if (typeof factory !== "function") throw new Error("J2ME_RUNTIME_ASSET_INVALID");
    bridge.resolve(factory);
  } catch (error) { bridge.reject(error); }
  })();
})();
