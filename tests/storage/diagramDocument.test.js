import test from 'node:test';
import assert from 'node:assert/strict';
import '../../src/storage/diagramDocument.js';
import { importProjectFromText } from '../../src/storage/importExportService.js';
import { diagram } from '../fixtures/diagram.js';

const { normalizeDiagram, createAutosaveRepository } = globalThis.MessageFlowDocuments;
function memoryStorage(){
  const values = new Map();
  return { getItem:key => values.get(key) ?? null, setItem:(key,value) => values.set(key,value) };
}
test('current diagram JSON round-trips without losing features or mutating input', () => {
  const input = diagram(), original = structuredClone(input);
  const normalized = normalizeDiagram(input);
  assert.deepEqual(input, original);
  assert.deepEqual(normalizeDiagram(JSON.parse(JSON.stringify(normalized))), normalized);
  assert.equal(normalized.components[0].shape, 'text');
  assert.equal(normalized.messageFlows[0].hiddenInDrawingMode, true);
  assert.equal(normalized.messageFlows[1].timing, 'withPrevious');
  assert.equal(normalized.messageFlows[0].processingImageDataUrl, input.messageFlows[0].processingImageDataUrl);
  assert.deepEqual(normalized.messageFlows[0].controlPoint, input.messageFlows[0].controlPoint);
});
test('modular import preserves text, hidden connectors, viewport and processing images', () => {
  const input = diagram();
  const result = importProjectFromText(JSON.stringify(input));
  assert.equal(result.components[0].shapeType, 'text');
  assert.equal(result.connectors[0].visibility.visibleInEditor, false);
  assert.deepEqual(result.viewport, {zoom:0.82,panX:28,panY:34});
  assert.equal(result.flowSteps[0].imageRef, input.messageFlows[0].processingImageDataUrl);
  assert.equal(result.flowSteps[1].executionMode, 'withPrevious');
});
for(const [name, mutate] of [
  ['duplicate component ids', d => d.components[1].id = 'web'],
  ['duplicate flow ids', d => d.messageFlows[1].id = 'request'],
  ['missing endpoint', d => d.messageFlows[0].targetComponentId = 'missing'],
  ['invalid dimensions', d => d.components[0].width = -1],
  ['unsupported shape', d => d.components[0].shape = 'unknown'],
  ['invalid zoom', d => d.settings.zoom = 'large'],
  ['duplicate order', d => d.messageFlows[1].sequenceNumber = 1],
  ['future schema', d => d.schemaVersion = 99],
]) test(`rejects ${name}`, () => { const d = diagram(); mutate(d); assert.throws(() => normalizeDiagram(d)); });
test('fills missing legacy dimensions and preserves decimal sub-step order for migration', () => {
  const d = diagram(); delete d.components[0].width; d.messageFlows[1].sequenceNumber = '1.1';
  const result = normalizeDiagram(d);
  assert.equal(result.components[0].width, 160);
  assert.equal(result.messageFlows[1].sequenceNumber, '1.1');
});
test('autosave keeps a previous valid document and recovers without overwriting damaged data', () => {
  const storage = memoryStorage();
  const repository = createAutosaveRepository(() => storage, 'diagram');
  repository.load(); repository.save(diagram());
  const edited = diagram(); edited.components[0].name = 'Changed'; repository.save(edited);
  storage.setItem('diagram', '{broken');
  const reopened = createAutosaveRepository(() => storage, 'diagram');
  const result = reopened.load();
  assert.equal(result.recovered, true);
  assert.equal(result.document.components[0].name, 'Web UI');
  assert.throws(() => reopened.save(edited), /Autosave paused/);
  assert.equal(storage.getItem('diagram'), '{broken');
  reopened.resume(edited);
  assert.equal(storage.getItem('diagram.recovery'), '{broken');
  assert.equal(JSON.parse(storage.getItem('diagram')).components[0].name, 'Changed');
});
test('storage failures preserve the saved document and allow retry', () => {
  const storage = memoryStorage();
  const repository = createAutosaveRepository(() => storage, 'diagram');
  repository.save(diagram());
  const original = storage.getItem('diagram');
  const setItem = storage.setItem;
  storage.setItem = () => { throw new Error('Storage is full'); };
  const edited = diagram(); edited.components[0].name = 'Changed';
  assert.throws(() => repository.save(edited), /Storage is full/);
  assert.equal(storage.getItem('diagram'), original);
  storage.setItem = setItem;
  repository.resume(edited);
  assert.equal(JSON.parse(storage.getItem('diagram')).components[0].name, 'Changed');
});
