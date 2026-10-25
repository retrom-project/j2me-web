const phoneProfiles = Object.freeze([
  "Standard", "Nokia", "NokiaKeyboard", "KDDI", "LG", "Motorola",
  "MotoTriplets", "MotoV8", "MotoA1000", "Sagem", "Siemens", "SKT"
]);
const graphicsBackends = Object.freeze(["AUTO", "SOFTWARE", "WEBGL2"]);

export const DEFAULT_COMPATIBILITY_PROFILE = deepFreeze({
  schemaVersion: 1,
  id: "default-240x320",
  viewport: { width: 240, height: 320 },
  frameRate: 60,
  phone: "Standard",
  rotation: 0,
  input: {
    softKeySwap: false,
    repeatDelayMs: 500,
    repeatIntervalMs: 80
  },
  audio: {
    enabled: true,
    gain: 1,
    transcodeFallback: true
  },
  graphics3d: {
    backend: "AUTO",
    halfResolution: false
  },
  launch: {
    midletNumber: null
  }
});

// Content hashes identify bytes and saves; only explicit standard settings
// may change emulation behavior.
export function resolveCompatibilityProfile(_source, override = {}) {
  const merged = mergeProfile(DEFAULT_COMPATIBILITY_PROFILE, override);
  if (!validCompatibilityProfile(merged)) throw new Error("J2ME_COMPATIBILITY_PROFILE_INVALID");
  return deepFreeze(merged);
}

export function validCompatibilityProfileOverride(value) {
  if (value === undefined) return true;
  if (!plainObject(value) || !onlyKeys(value, [
    "schemaVersion", "id", "viewport", "frameRate", "phone", "rotation", "input", "audio", "graphics3d", "launch"
  ]) || value.schemaVersion !== undefined && value.schemaVersion !== 1) return false;
  try {
    resolveCompatibilityProfile(null, value);
    return true;
  } catch {
    return false;
  }
}

export function encodeCoreProfile(profile) {
  if (!validCompatibilityProfile(profile)) throw new Error("J2ME_COMPATIBILITY_PROFILE_INVALID");
  return [
    "schema=1",
    `width=${profile.viewport.width}`,
    `height=${profile.viewport.height}`,
    `fps=${profile.frameRate}`,
    `phone=${profile.phone}`,
    `rotation=${profile.rotation}`,
    `sound=${profile.audio.enabled ? "on" : "off"}`,
    `m3g.backend=${profile.graphics3d.backend.toLowerCase()}`,
    `m3g.halfResolution=${profile.graphics3d.halfResolution ? "on" : "off"}`,
    `midlet.number=${profile.launch.midletNumber ?? ""}`,
    ""
  ].join("\n");
}

function mergeProfile(base, override) {
  return {
    schemaVersion: 1,
    id: override.id ?? base.id,
    viewport: { ...base.viewport, ...override.viewport },
    frameRate: override.frameRate ?? base.frameRate,
    phone: override.phone ?? base.phone,
    rotation: override.rotation ?? base.rotation,
    input: { ...base.input, ...override.input },
    audio: { ...base.audio, ...override.audio },
    graphics3d: { ...base.graphics3d, ...override.graphics3d },
    launch: { ...base.launch, ...override.launch }
  };
}

function validCompatibilityProfile(value) {
  return plainObject(value) && value.schemaVersion === 1 && boundedText(value.id, 100) &&
    validViewport(value.viewport) && integerRange(value.frameRate, 1, 240) &&
    phoneProfiles.includes(value.phone) && [0, 90, 180, 270].includes(value.rotation) &&
    plainObject(value.input) && onlyKeys(value.input, ["softKeySwap", "repeatDelayMs", "repeatIntervalMs"]) &&
    typeof value.input.softKeySwap === "boolean" && integerRange(value.input.repeatDelayMs, 100, 2000) &&
    integerRange(value.input.repeatIntervalMs, 30, 1000) &&
    plainObject(value.audio) && onlyKeys(value.audio, ["enabled", "gain", "transcodeFallback"]) &&
    typeof value.audio.enabled === "boolean" && Number.isFinite(value.audio.gain) &&
    value.audio.gain >= 0 && value.audio.gain <= 2 && typeof value.audio.transcodeFallback === "boolean" &&
    plainObject(value.graphics3d) && onlyKeys(value.graphics3d, ["backend", "halfResolution"]) &&
    graphicsBackends.includes(value.graphics3d.backend) && typeof value.graphics3d.halfResolution === "boolean" &&
    plainObject(value.launch) && onlyKeys(value.launch, ["midletNumber"]) &&
    (value.launch.midletNumber === null || integerRange(value.launch.midletNumber, 1, 9999));
}

function onlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function integerRange(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function validViewport(value) {
  return plainObject(value) && onlyKeys(value, ["width", "height"]) &&
    integerRange(value.width, 1, 4096) && integerRange(value.height, 1, 4096);
}

function boundedText(value, maximum) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
