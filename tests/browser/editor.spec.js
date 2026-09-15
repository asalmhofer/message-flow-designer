import {test, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {diagram} from '../fixtures/diagram.js';

const key = 'event-flow-designer-state-v1';
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
async function seed(page, flows=true){
  const data = diagram();
  data.components[0].shape = 'roundedRectangle';
  data.messageFlows[0].hiddenInDrawingMode=false;
  if(page.viewportSize().width < 1100) data.components[1].x = 360;
  data.settings = {...data.settings, zoom:1, panX:0, panY:0};
  if(!flows) data.messageFlows = [];
  await page.addInitScript(({key,data}) => localStorage.setItem(key, JSON.stringify(data)), {key,data});
  await page.goto('/');
}
async function point(locator){
  const b = await locator.boundingBox();
  return {x:b.x + b.width/2, y:b.y + b.height/2};
}
async function dragBetween(page, from, to){
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, {steps:12});
  await page.mouse.up();
}
test.beforeEach(async ({page}) => {
  page._editorErrors = [];
  page.on('pageerror', error => page._editorErrors.push(error.message));
});
test.afterEach(async ({page}) => expect(page._editorErrors).toEqual([]));

test('shape placement previews, cancels, follows the pointer and commits one undoable shape', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Open element library',exact:true}).click();
  await page.locator('[data-shape="roundedRectangle"]').click();
  await expect(page.locator('.componentGroup')).toHaveCount(0);
  await expect(page.locator('.placementPreview')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.placementPreview')).toHaveCount(0);
  await page.getByRole('button',{name:'Open element library',exact:true}).click();
  await page.locator('[data-shape="diamond"]').click();
  const canvas = await page.locator('#diagram').boundingBox();
  await page.mouse.move(canvas.x + 320, canvas.y + 240);
  const preview = await page.locator('.placementPreview').boundingBox();
  await page.mouse.click(canvas.x + 320, canvas.y + 240);
  await expect(page.locator('.componentGroup')).toHaveCount(1);
  const placed = await page.locator('.componentGroup .componentShape').boundingBox();
  expect(placed.x).toBeCloseTo(preview.x, 0);
  expect(placed.y).toBeCloseTo(preview.y, 0);
  await expect(page.getByRole('tab', {name:'Properties',exact:true})).toHaveAttribute('aria-selected','true');
  await page.getByRole('button', {name:'Undo',exact:true}).click();
  await expect(page.locator('.componentGroup')).toHaveCount(0);
  await page.getByRole('button', {name:'Redo',exact:true}).click();
  expect((await saved(page)).components[0].shape).toBe('diamond');
});

test('click selects without connecting or moving; double-click renames; dragging moves', async ({page}) => {
  await seed(page, false);
  const shape = page.locator('.componentGroup[data-id="web"] .componentShape');
  await shape.click();
  await expect(page.locator('.componentGroup.selected')).toHaveCount(1);
  await expect(page.locator('.connectionDraftPreview')).toHaveCount(0);
  await expect(page.locator('#drawingHint')).toBeHidden();
  expect((await saved(page)).components[0].x).toBe(100);
  await shape.dblclick();
  await page.locator('.inlineEditor').fill('Client');
  await page.locator('.inlineEditor').press('Enter');
  expect((await saved(page)).components[0].name).toBe('Client');
  const start = await point(shape);
  await dragBetween(page, start, {x:start.x + 48, y:start.y + 48});
  expect((await saved(page)).components[0].x).toBe(144);
  await expect(page.locator('.flowItem')).toHaveCount(0);
  await page.getByRole('button', {name:'Undo',exact:true}).click();
  expect((await saved(page)).components[0].x).toBe(100);
});

test('connections support drag, cancelled drop, click-to-click and keyboard handles', async ({page}) => {
  await seed(page, false);
  const source = page.locator('.componentGroup[data-id="web"]');
  const target = page.locator('.componentGroup[data-id="service"]');
  await source.locator('.componentShape').click();
  const port = source.locator('.componentPort[data-port^="right"]').first();
  await dragBetween(page, await point(port), await point(target.locator('.componentShape')));
  await expect(page.locator('.flowItem')).toHaveCount(1);
  const flow = (await saved(page)).messageFlows[0];
  expect([flow.sourceComponentId,flow.targetComponentId]).toEqual(['web','service']);
  await page.getByRole('button', {name:'Undo',exact:true}).click();
  await source.locator('.componentShape').click();
  await dragBetween(page, await point(port), {x:400,y:440});
  await expect(page.locator('.flowItem')).toHaveCount(0);
  await expect(page.locator('.connectionDraftPreview')).toHaveCount(0);
  await port.click();
  await expect(page.locator('.connectionDraftPreview')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await source.locator('.componentShape').click();
  await port.click();
  await target.locator('.componentPort[data-port^="left"]').first().click();
  await expect(page.locator('.flowItem')).toHaveCount(1);
  await page.getByRole('button', {name:'Undo',exact:true}).click();
  await source.locator('.componentShape').click();
  await port.press('Enter');
  await target.locator('.componentPort[data-port^="left"]').first().press('Enter');
  await expect(page.locator('.flowItem')).toHaveCount(1);
});

test('flow cards select without opening, edit in a popup and show parallel timing', async ({page}) => {
  await seed(page);
  await expect(page.locator('.parallelGroup .flowItem')).toHaveCount(2);
  await page.locator('.flowItem').first().locator('.flowRoute').click();
  await expect(page.locator('.flowPath.selected')).toHaveCount(1);
  await expect(page.locator('.flowEndpointSelected')).toHaveCount(2);
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button',{name:'Edit step 1',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Message',{exact:true}).fill('Place order');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  expect((await saved(page)).messageFlows[0].messageText).toBe('Place order');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  expect((await saved(page)).messageFlows[0].messageText).toBe('Submit order');
  await page.getByRole('button',{name:'Redo',exact:true}).click();
  await page.locator('.flowItem').nth(1).locator('.flowRoute').dblclick();
  await page.getByRole('dialog').getByLabel('Timing',{exact:true}).selectOption('afterPrevious');
  await page.getByRole('dialog').getByLabel('Processing action',{exact:true}).fill('Record the result');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.locator('.parallelGroup')).toHaveCount(0);
  expect((await saved(page)).messageFlows[1].actionText).toBe('Record the result');
});

test('drag and keyboard reorder renumber automatically; deletion preserves valid sequence and undo', async ({page}) => {
  await page.goto('/');
  await page.locator('#emptyExampleBtn').click();
  const original = (await saved(page)).messageFlows;
  const rows = page.locator('.flowItem');
  await rows.nth(0).locator('.flowDragHandle').dragTo(rows.nth(2), {targetPosition:{x:120,y:58}});
  await expect(rows.nth(2).locator('.flowName')).toHaveText(original[0].messageText);
  await expect(page.locator('.seqBadge')).toHaveText(['1','2','3','4','5','6','7']);
  await rows.nth(2).locator('.flowDragHandle').press('Alt+ArrowUp');
  await expect(rows.nth(1).locator('.flowName')).toHaveText(original[0].messageText);
  await rows.nth(1).locator('.expandStep').click();
  await page.locator('.stepDetails').getByRole('button', {name:'Delete step',exact:true}).click();
  await expect(page.locator('.seqBadge')).toHaveText(['1','2','3','4','5','6']);
  await page.getByRole('button', {name:'Undo',exact:true}).click();
  await expect(rows).toHaveCount(7);
  await expect(rows.nth(1).locator('.flowName')).toHaveText(original[0].messageText);
});

test('shape palette also supports dragging and keyboard placement', async ({page}) => {
  await page.goto('/');
  const canvas = await page.locator('#diagram').boundingBox();
  await page.getByRole('button',{name:'Open element library',exact:true}).click();
  await page.getByRole('button',{name:'Basic',exact:true}).click();
  await dragBetween(page, await point(page.locator('[data-shape="roundedRectangle"]')), {x:canvas.x + 300, y:canvas.y + 240});
  await expect(page.locator('.componentGroup')).toHaveCount(1);
  await page.getByRole('button',{name:'Open element library',exact:true}).click();
  await page.locator('[data-shape="ellipse"]').click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('.componentGroup')).toHaveCount(2);
  expect((await saved(page)).components.map(c => c.shape)).toEqual(['roundedRectangle','ellipse']);
});

for(const width of [1280,980]) test(`compact toolbar, accessible tabs and contextual alignment at ${width}px`, async ({page},testInfo) => {
  await page.setViewportSize({width,height:720});
  await seed(page, false);
  const toolbar = await page.locator('.toolbar').boundingBox();
  expect(toolbar.height).toBeLessThanOrEqual(66);
  await expect(page.locator('#selectionTools')).toBeHidden();
  await page.locator('.componentGroup[data-id="web"] .componentShape').click();
  await expect(page.locator('#propertiesPane')).toBeVisible();
  await expect(page.locator('#flowPane')).toBeHidden();
  await page.getByRole('tab', {name:'Properties',exact:true}).press('ArrowLeft');
  await expect(page.locator('#flowPane')).toBeVisible();
  await page.locator('.componentGroup[data-id="service"] .componentShape').click({modifiers:['Shift']});
  await expect(page.locator('#selectionTools')).toBeVisible();
  await page.getByLabel('Align menu', {exact:true}).click();
  await page.getByRole('button', {name:'Align horizontally',exact:true}).click();
  const boxes = (await saved(page)).components;
  expect(boxes[0].y).toBe(boxes[1].y);
  for(const id of ['presentationBtn','startBtn','resetZoomBtn','closePanelBtn']){
    expect(await page.locator('#' + id).evaluate(el => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.x + r.width/2, r.y + r.height/2));
    })).toBe(true);
  }
  await page.locator('#diagramName').fill('Order journey');
  await page.locator('#diagramName').press('Enter');
  const downloaded = page.waitForEvent('download');
  await page.getByLabel('File menu', {exact:true}).click();
  await page.getByRole('button', {name:'Export JSON',exact:true}).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('Order journey.json');
  const path = testInfo.outputPath('diagram.json');
  await download.saveAs(path);
  expect(JSON.parse(await readFile(path,'utf8')).settings.diagramFileName).toBe('Order journey.json');
  await page.getByRole('button', {name:'Start presentation mode',exact:true}).click();
  await expect(page.locator('.sidebarTabs')).toBeHidden();
  await expect(page.locator('#presentationImageCard')).toBeVisible();
  await page.getByRole('button', {name:'Close presentation mode',exact:true}).click();
  await expect(page.locator('#propertiesPane')).toBeVisible();
  await page.screenshot({path:testInfo.outputPath(`editor-${width}.png`)});
});
