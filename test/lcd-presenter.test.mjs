import assert from "node:assert/strict";
import test from "node:test";
import { LcdPresenter } from "../web/lcd-presenter.js";

function setup() {
  const calls = { source: 0, display: 0, readback: 0, scaled: 0 };
  const logical = {
    drawImage() { calls.source++; },
    getImageData() { calls.readback++; return { data: new Uint8ClampedArray(16).fill(255) }; }
  };
  const output = {
    drawImage() { calls.display++; },
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData() { calls.scaled++; }
  };
  const surface = {
    source: {width: 960, height: 540}, staging: {getContext: () => logical},
    display: {width: 2, height: 2, getContext: () => output},
    logicalViewport: {width: 2, height: 2}, scalingMode: "SHARP_FIT", scaledPixels: new Uint32Array(16)
  };
  return { calls, logical, surface, presenter: new LcdPresenter(surface) };
}

test("repeated browser refreshes copy each submitted core frame once", () => {
  const {presenter, calls} = setup();
  for (let frame = 1; frame <= 12; frame++) for (let refresh = 0; refresh < 4; refresh++) presenter.sync(frame);
  assert.deepEqual(calls, {source: 12, display: 12, readback: 0, scaled: 0});
  for (let refresh = 0; refresh < 120; refresh++) assert.equal(presenter.sync(12), false);
  assert.equal(calls.source, 12);
});

test("paused scaling redraws retained logical pixels without reading the WebGL source again", () => {
  const {presenter, surface, calls} = setup();
  presenter.sync(7);
  surface.scalingMode = "SCALE2X";
  presenter.invalidate();
  assert.equal(presenter.sync(7), true);
  presenter.sync(7);
  assert.deepEqual(calls, {source: 1, display: 1, readback: 1, scaled: 1});
  surface.scalingMode = "INTEGER_NEAREST";
  presenter.invalidate(); presenter.sync(7);
  assert.equal(calls.source, 1); assert.equal(calls.display, 2);
});

test("emulator view retains the latest screenshot and paints LCD on return", () => {
  const {presenter, calls} = setup();
  presenter.sync(1, false); presenter.sync(2, false);
  assert.equal(calls.source, 2); assert.equal(calls.display, 0);
  presenter.sync(2, true);
  assert.equal(calls.source, 2); assert.equal(calls.display, 1);
});

test("resize and failed source copies retry without losing an update", () => {
  const {presenter, surface, logical, calls} = setup();
  surface.source.width = 0;
  assert.equal(presenter.sync(1), false);
  surface.source.width = 960;
  const draw = logical.drawImage;
  logical.drawImage = () => { throw Error("resizing"); };
  assert.equal(presenter.sync(1), false);
  logical.drawImage = draw;
  assert.equal(presenter.sync(1), true);
  presenter.invalidate(true);
  presenter.sync(1);
  assert.equal(calls.source, 2);
});
