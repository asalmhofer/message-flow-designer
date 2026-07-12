import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const indexHtml = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const runtimePath = new URL('../../src/runtime/app.js', import.meta.url);

test('index uses the direct-open runtime script', () => {
  assert.match(indexHtml, /<script src="src\/runtime\/app\.js"><\/script>/);
  assert.equal(existsSync(runtimePath), true);
});

test('runtime contains core UI handlers', () => {
  const runtime = readFileSync(runtimePath, 'utf8');
  assert.match(runtime, /function loadExample\(\)/);
  assert.match(runtime, /addComponentBtn/);
  assert.match(runtime, /setupEvents\(\)/);
});


test('runtime contains improved interaction affordances', () => {
  const runtime = readFileSync(runtimePath, 'utf8');
  assert.match(runtime, /flowDragHandle/);
  assert.match(runtime, /onFlowDragEnd/);
  assert.match(runtime, /Collapse flow panel/);
  assert.match(runtime, /step-order-up/);
  assert.match(runtime, /durationForAnimationSpeed/);
});

test('runtime exposes compact animation controls and speed range UI', () => {
  assert.match(indexHtml, /class="iconOnlyAnim primaryAnim"/);
  assert.match(indexHtml, /type="range"[^>]*id="speedSelect"|id="speedSelect"[^>]*type="range"/);
  assert.doesNotMatch(indexHtml, />Slow<|>Normal<|>Fast</);
  assert.match(indexHtml, /panelToggleBtn/);
});


test('runtime defines speed slider helpers required by render and animation', () => {
  const runtime = readFileSync(runtimePath, 'utf8');
  assert.match(runtime, /function normalizeAnimationSpeed\(/);
  assert.match(runtime, /function speedToRangeValue\(/);
  assert.match(runtime, /function speedDisplayLabel\(/);
  assert.match(runtime, /function durationForAnimationSpeed\(/);
});


test('runtime exposes resized panel and radio play mode controls', () => {
  assert.match(indexHtml, /class="playModeGroup"/);
  assert.match(indexHtml, /name="animationMode" value="step"/);
  assert.match(indexHtml, /name="animationMode" value="auto"/);
  assert.match(indexHtml, /sidePanelResizeHandle/);
  const runtime = readFileSync(runtimePath, 'utf8');
  assert.match(runtime, /startFlowPanelResize/);
  assert.match(runtime, /setAnimationModeUi/);
  assert.match(runtime, /prevBtn\.disabled = isAutoMode/);
  assert.match(runtime, /nextBtn\.disabled = isAutoMode/);
});
