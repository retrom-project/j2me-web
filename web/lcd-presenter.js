import { scale2xPixels } from "./video-scaling.js";

// Retain one logical frame for screenshots and paused display-mode changes.
// Input polling is deliberately independent of this presentation gate.
export class LcdPresenter {
  constructor(surface) {
    this.surface = surface;
    this.frame = null;
    this.displayDirty = true;
  }

  invalidate(sourceChanged = false) {
    this.displayDirty = true;
    if (sourceChanged) this.frame = null;
  }

  sync(frame, visible = true) {
    const s = this.surface, viewport = s.logicalViewport;
    if (!s.source.width || !s.source.height) return false;
    try {
      if (frame !== this.frame) {
        const logical = s.staging.getContext("2d", { alpha: false, willReadFrequently: true });
        if (!logical) return false;
        logical.drawImage(s.source, 2, 32, viewport.width, viewport.height,
          0, 0, viewport.width, viewport.height);
        this.frame = frame;
        this.displayDirty = true;
      }
      if (!visible || !this.displayDirty) return false;
      const output = s.display.getContext("2d", { alpha: false });
      if (!output) return false;
      if (s.scalingMode === "SCALE2X") {
        const logical = s.staging.getContext("2d");
        const input = logical.getImageData(0, 0, viewport.width, viewport.height);
        scale2xPixels(new Uint32Array(input.data.buffer), viewport.width, viewport.height, s.scaledPixels);
        s.scaledImage ??= output.createImageData(viewport.width * 2, viewport.height * 2);
        new Uint32Array(s.scaledImage.data.buffer).set(s.scaledPixels);
        output.putImageData(s.scaledImage, 0, 0);
      } else {
        output.drawImage(s.staging, 0, 0, viewport.width, viewport.height,
          0, 0, s.display.width, s.display.height);
      }
      this.displayDirty = false;
      return true;
    } catch {
      // A resize/context transition can temporarily make the source unavailable.
      // Keep the request pending so the next refresh retries it.
      return false;
    }
  }
}
