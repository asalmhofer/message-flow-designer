import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { diagram } from '../fixtures/diagram.js';
import {exportFile} from './exportHelpers.js';

const key = 'event-flow-designer-state-v1';
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const flowData = async page => (await saved(page)).messageFlows;
async function example(page){
  await page.goto('/');
  await page.locator('#emptyExampleBtn').click();
  await expect(page.locator('.flowItem')).toHaveCount(7);
}
async function openStepEditor(page, index){
  const item = page.locator('.flowItem').nth(index);
  await item.locator('[data-action=edit-flow]').click();
  await page.getByText('Routing and step order',{exact:true}).click();
  await page.locator('.flowEditorAdvanced').filter({hasText:'Processing image'}).locator('summary').click();
}
async function importDiagram(page, data){
  await page.locator('#importInput').setInputFiles({name:'diagram.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
}
test.beforeEach(async ({page}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page._reviewErrors = errors;
});
test.afterEach(async ({page}) => { expect(page._reviewErrors).toEqual([]); });

test('Cancel rolls back reorder, text and images without autosaving the draft', async ({page}) => {
  await example(page);
  const original = await flowData(page);
  await openStepEditor(page, 1);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', {name:'Move step down'}).click();
  await dialog.getByLabel('Message', {exact:true}).fill('Draft message');
  await dialog.getByRole('button', {name:'Remove image',exact:true}).click();
  expect(await flowData(page)).toEqual(original);
  await dialog.getByRole('button', {name:'Cancel',exact:true}).click();
  expect(await flowData(page)).toEqual(original);
  await expect(page.locator('.seqBadge')).toHaveText(['1','2','3','4','5','6','7']);
  await page.getByRole('button', {name:'Undo',exact:true}).click();
  await expect(page.locator('.flowItem')).toHaveCount(0);
  await page.getByRole('button', {name:'Redo',exact:true}).click();
  expect(await flowData(page)).toEqual(original);
});
test('OK is one undoable edit; Escape cancels and returns focus', async ({page}) => {
  await example(page);
  const original = await flowData(page);
  await openStepEditor(page, 1);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', {name:'Move step down'}).click();
  await dialog.getByLabel('Message', {exact:true}).fill('Committed message');
  await dialog.getByRole('button', {name:'Save changes',exact:true}).click();
  const committed = await flowData(page);
  expect(committed).not.toEqual(original);
  await page.getByRole('button', {name:'Undo',exact:true}).click();
  expect(await flowData(page)).toEqual(original);
  await page.getByRole('button', {name:'Redo',exact:true}).click();
  expect(await flowData(page)).toEqual(committed);
  await openStepEditor(page, 0);
  await dialog.getByLabel('Message', {exact:true}).fill('Cancelled by escape');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await flowData(page)).toEqual(committed);
  await expect(page.locator('.flowItem').nth(0).locator('[data-action=edit-flow]')).toBeFocused();
});
test('create, rename, connect, undo and redo through the editor', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name:'Open element library',exact:true}).click();
  await page.getByRole('button',{name:'Create component',exact:true}).click();
  await page.locator('#diagram').click({position:{x:220,y:220}});
  await page.locator('#propName').fill('Sender');
  await page.locator('#propName').press('Tab');
  await page.getByRole('button', {name:'Open element library',exact:true}).click();
  await page.getByRole('button',{name:'Create database',exact:true}).click();
  await page.locator('#diagram').click({position:{x:560,y:230}});
  await page.locator('#propName').fill('Receiver');
  await page.locator('#propName').press('Tab');
  await page.getByRole('button', {name:'Connect components',exact:true}).click();
  await page.locator('.componentGroup').filter({hasText:'Sender'}).locator('.componentShape').click();
  await page.locator('.componentGroup').filter({hasText:'Receiver'}).locator('.componentShape').click();
  await expect(page.locator('.flowItem')).toHaveCount(1);
  await page.getByRole('button', {name:'Undo',exact:true}).click();
  await expect(page.locator('.flowItem')).toHaveCount(0);
  await page.getByRole('button', {name:'Redo',exact:true}).click();
  await expect(page.locator('.flowItem')).toHaveCount(1);
});
test('imports round-trip JSON and rejects invalid replacements atomically', async ({page}, testInfo) => {
  await page.goto('/');
  await importDiagram(page, diagram());
  const original = await saved(page);
  const downloadEvent = page.waitForEvent('download');
  await page.getByLabel('File menu', {exact:true}).click();
  await page.getByRole('button', {name:'Export JSON',exact:true}).click();
  const download = await downloadEvent;
  const file = testInfo.outputPath('roundtrip.json');
  await download.saveAs(file);
  const exported = JSON.parse(await readFile(file, 'utf8'));
  expect(exported.components).toEqual(original.components);
  expect(exported.messageFlows).toEqual(original.messageFlows);
  await page.locator('#importInput').setInputFiles(file);
  expect((await saved(page)).messageFlows).toEqual(original.messageFlows);
  const bad = diagram(); bad.components[0].width = -1;
  const dialogEvent = page.waitForEvent('dialog');
  const upload = importDiagram(page, bad);
  const dialog = await dialogEvent;
  expect(dialog.message()).toContain('Import failed');
  await dialog.dismiss(); await upload;
  expect((await saved(page)).components).toEqual(original.components);
  await page.reload();
  await expect(page.locator('.componentGroup')).toHaveCount(2);
});
test('exports standalone SVG and PNG containing the rendered diagram', async ({page}, testInfo) => {
  await example(page);
  for(const type of ['SVG','PNG']){
    const download = await exportFile(page,type);
    const file = testInfo.outputPath(`diagram.${type.toLowerCase()}`);
    await download.saveAs(file);
    const bytes = await readFile(file);
    if(type === 'SVG'){
      const text = bytes.toString();
      expect(text).toContain('Order Service');
      expect(text).toContain('font-size:');
      expect(text).not.toContain('http://127.0.0.1:8080/#');
      const standalone = await page.context().newPage();
      await standalone.goto(pathToFileURL(file).href);
      await expect(standalone.locator('parsererror')).toHaveCount(0);
      await expect(standalone.locator('.componentGroup')).toHaveCount(5);
      await standalone.screenshot({path:testInfo.outputPath('standalone-svg.png')});
      await standalone.close();
    }else{
      expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(bytes.readUInt32BE(16)).toBeGreaterThan(1000);
      expect(bytes.length).toBeGreaterThan(10000);
    }
  }
});
for(const width of [1280, 980]) test(`playback controls are unobstructed at ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:720});
  await example(page);
  const hit = await page.locator('#startBtn').evaluate(button => {
    const r = button.getBoundingClientRect();
    return document.elementFromPoint(r.x+r.width/2, r.y+r.height/2)?.closest('button')?.id;
  });
  expect(hit).toBe('startBtn');
  await page.getByRole('button', {name:'Start animation',exact:true}).click();
  await expect(page.locator('#animStatus')).toContainText('Animation: step');
  await page.getByRole('button', {name:'Pause animation',exact:true}).click();
  await expect(page.locator('#animStatus')).toContainText('Paused: step');
  await page.getByRole('button', {name:'Resume animation',exact:true}).click();
  await page.getByRole('button', {name:'Stop animation',exact:true}).click();
  await expect(page.locator('#animStatus')).toHaveText('Animation stopped');
});
test('pausing arrival freezes automatic progression and resumes it', async ({page}) => {
  await page.clock.install();
  await example(page);
  await page.getByRole('button', {name:'Start animation',exact:true}).click();
  await page.clock.runFor(2000);
  await expect(page.locator('#animStatus')).toContainText('arrived');
  await page.getByRole('button', {name:'Pause animation',exact:true}).click();
  await page.clock.runFor(5000);
  await expect(page.locator('#animStatus')).toContainText('Paused: step 1, arrived');
  await page.getByRole('button', {name:'Resume animation',exact:true}).click();
  await page.clock.runFor(700);
  await expect(page.locator('#animStatus')).toContainText('processing');
});
test('corrupt autosave is retained until the recovery action succeeds', async ({page}) => {
  await page.addInitScript(({key,backup}) => {
    if(!sessionStorage.getItem('seeded')){
      localStorage.setItem(key, '{damaged');
      localStorage.setItem(`${key}.backup`, JSON.stringify(backup));
      sessionStorage.setItem('seeded', 'yes');
    }
  }, {key,backup:diagram()});
  await page.goto('/');
  await expect(page.locator('.componentGroup')).toHaveCount(2);
  await expect(page.locator('#storageNotice')).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe('{damaged');
  await page.getByRole('button', {name:'Resume autosave',exact:true}).click();
  await expect(page.locator('#storageNotice')).toBeHidden();
  expect(await page.evaluate(key => localStorage.getItem(`${key}.recovery`), key)).toBe('{damaged');
  await page.reload();
  await expect(page.locator('.componentGroup')).toHaveCount(2);
});
test('reloading an open edit keeps the committed document', async ({page}) => {
  await example(page);
  const original = await flowData(page);
  await openStepEditor(page, 1);
  await page.getByRole('dialog').getByRole('button', {name:'Move step down'}).click();
  await page.getByRole('dialog').getByLabel('Message', {exact:true}).fill('Uncommitted');
  await page.reload();
  expect(await flowData(page)).toEqual(original);
  await expect(page.getByRole('dialog')).toBeHidden();
});
test('turning Loop off completes playback once and leaves it stopped', async ({page}) => {
  await page.clock.install();
  await page.goto('/');
  const data = diagram(); data.messageFlows = data.messageFlows.slice(0,1);
  await importDiagram(page, data);
  await page.getByLabel('Playback settings', {exact:true}).click();
  await page.getByLabel('Loop', {exact:true}).uncheck();
  await page.getByLabel('Playback settings', {exact:true}).click();
  await page.getByRole('button', {name:'Start animation',exact:true}).click();
  await page.clock.runFor(7000);
  await expect(page.locator('#animStatus')).toHaveText('Animation stopped');
  await expect(page.getByRole('button', {name:'Start animation',exact:true})).toBeVisible();
  await page.clock.runFor(5000);
  await expect(page.locator('#animStatus')).toHaveText('Animation stopped');
});
test('direct file opening runs the same editor without a server or module loader', async ({page}) => {
  const file = fileURLToPath(new URL('../../index.html', import.meta.url));
  await page.goto(pathToFileURL(file).href);
  await page.getByRole('button', {name:'Open element library',exact:true}).click();
  await page.getByRole('button',{name:'Create component',exact:true}).click();
  await page.locator('#diagram').click({position:{x:220,y:220}});
  await expect(page.locator('.componentGroup')).toHaveCount(1);
});
test('the ES module adapter boots the same runtime once', async ({page}) => {
  await page.route('**/index.html', async route => {
    const response = await route.fetch();
    const html = (await response.text()).replace(/<script src="src\/(storage\/diagramDocument|canvas\/imageExport|runtime\/app)\.js"><\/script>/g, '');
    await route.fulfill({response,body:html.replace('</body>', '<script type="module" src="src/main.js"></script></body>')});
  });
  await page.goto('/index.html');
  await page.getByRole('button', {name:'Open element library',exact:true}).click();
  await page.getByRole('button',{name:'Create component',exact:true}).click();
  await page.locator('#diagram').click({position:{x:220,y:220}});
  await expect(page.locator('.componentGroup')).toHaveCount(1);
});
