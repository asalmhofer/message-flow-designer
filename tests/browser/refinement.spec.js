import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {diagram} from '../fixtures/diagram.js';

const storageKey = 'event-flow-designer-state-v1';
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)),storageKey);
async function seed(page){
  const data = diagram();
  data.components[0].shape = 'roundedRectangle';
  data.components[0].name = 'Customer request coordinator with a long component name';
  data.messageFlows[0].hiddenInDrawingMode = false;
  data.messageFlows[0].messageText = 'Submit the customer order for validation';
  data.messageFlows[2] = {...data.messageFlows[1],id:'finish',sequenceNumber:3,messageText:'Order confirmed',timing:'afterPrevious',actionText:'Publish confirmation',notes:'Ready to ship'};
  await page.goto('/');
  await page.locator('#importInput').setInputFiles({name:'Journey.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await expect(page.locator('.flowItem')).toHaveCount(3);
}
async function dragLabel(page, label, dx, dy){
  const box = await label.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+dx,box.y+box.height/2+dy,{steps:10});
  await page.mouse.up();
}
test.beforeEach(async ({page}) => {
  page._refinementErrors = [];
  page.on('pageerror',error => page._refinementErrors.push(error.message));
});
test.afterEach(async ({page}) => expect(page._refinementErrors).toEqual([]));

test('labels wrap within backgrounds, move, undo, round-trip, and reset', async ({page},testInfo) => {
  await seed(page);
  const label = page.locator('.flowLabelGroup[data-id="request"]');
  expect(await label.locator('tspan').count()).toBeGreaterThan(1);
  const labelBounds = await label.locator('.flowLabelBackground').boundingBox();
  const textBounds = await label.locator('.flowLabel').boundingBox();
  expect(textBounds.x+textBounds.width).toBeLessThan(labelBounds.x+labelBounds.width);
  const original = await label.boundingBox();
  await dragLabel(page,label,72,94);
  const moved = await label.boundingBox();
  expect(moved.x+moved.width/2-original.x-original.width/2).toBeCloseTo(72,0);
  expect(moved.y+moved.height/2-original.y-original.height/2).toBeCloseTo(94,0);
  const offset = (await saved(page)).messageFlows[0].labelOffset;
  expect(offset).toEqual({x:expect.any(Number),y:expect.any(Number)});
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  expect((await saved(page)).messageFlows[0].labelOffset).toBeUndefined();
  await page.getByRole('button',{name:'Redo',exact:true}).click();
  await page.reload();
  expect((await saved(page)).messageFlows[0].labelOffset).toEqual(offset);
  const event = page.waitForEvent('download');
  await page.getByLabel('File menu',{exact:true}).click();
  await page.getByRole('button',{name:'Export JSON',exact:true}).click();
  const file = testInfo.outputPath('labels.json');
  await (await event).saveAs(file);
  expect(JSON.parse(await readFile(file,'utf8')).messageFlows[0].labelOffset).toEqual(offset);
  await page.locator('#importInput').setInputFiles(file);
  await page.getByRole('button',{name:'Details for step 1',exact:true}).click();
  await page.locator('.stepDetails').getByRole('button',{name:'Reset label position',exact:true}).click();
  expect((await saved(page)).messageFlows[0].labelOffset).toBeUndefined();
});

test('labels support keyboard positioning, renaming, cancelled drag and focus mode', async ({page}) => {
  await page.clock.install();
  await seed(page);
  const label = page.locator('.flowLabelGroup[data-id="request"]');
  await label.press('ArrowDown');
  const offset = (await saved(page)).messageFlows[0].labelOffset;
  await label.press('Enter');
  await page.locator('.inlineEditor').fill('Submit order');
  await page.locator('.inlineEditor').press('Enter');
  await expect(label.locator('.flowLabel')).toHaveText('Submit order');
  const box = await label.boundingBox();
  await page.mouse.move(box.x+10,box.y+10); await page.mouse.down();
  await page.mouse.move(box.x+50,box.y+100,{steps:10});
  await page.clock.runFor(500);
  expect((await saved(page)).messageFlows[0].labelOffset).toEqual(offset);
  await page.keyboard.press('Escape'); await page.mouse.up();
  expect((await saved(page)).messageFlows[0].labelOffset).toEqual(offset);
  await page.getByLabel('View options',{exact:true}).click();
  await page.getByRole('button',{name:'Focus selected flow',exact:true}).click();
  await expect(page.locator('body')).toHaveClass(/focusFlow/);
  expect(await page.locator('.flowLabelGroup[data-id="finish"]').evaluate(el => Number(getComputedStyle(el).opacity))).toBeLessThan(.3);
  expect(await label.evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
});

test('presentation starts at the selected group, shows the story, and restores the editing viewport', async ({page}) => {
  await seed(page);
  const before = (await saved(page)).settings;
  await page.locator('.flowItem[data-flow-id="finish"] .flowTitle .flowRoute').click();
  await page.getByRole('button',{name:'Start presentation mode',exact:true}).click();
  await expect(page.locator('#presentationCounter')).toHaveText('Message 3 of 3');
  await expect(page.locator('#presentationMessage')).toHaveText('Order confirmed');
  await expect(page.locator('#presentationDetails')).toContainText('Publish confirmation');
  await expect(page.locator('#presentationDetails')).toContainText('Ready to ship');
  await expect(page.getByRole('button',{name:'Next message',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Previous message',exact:true}).click();
  await expect(page.locator('#presentationCounter')).toHaveText('Messages 1–2 of 3');
  await expect(page.locator('#presentationMessage')).toHaveText('Submit the customer order for validation | Accepted');
  await expect(page.locator('#presentationImagePreview img')).toHaveCount(1);
  await expect(page.locator('.timelineMessage[aria-current="step"]')).toContainText('Together');
  await page.getByRole('button',{name:'Close presentation mode',exact:true}).click();
  const after = (await saved(page)).settings;
  expect([after.zoom,after.panX,after.panY]).toEqual([before.zoom,before.panX,before.panY]);
});

test('message navigation cancels stale timers and paused jumps stay ready', async ({page}) => {
  await page.clock.install();
  await seed(page);
  await page.getByRole('button',{name:'Start presentation mode',exact:true}).click();
  await page.getByRole('button',{name:'Start animation',exact:true}).click();
  await page.clock.runFor(2000);
  await expect(page.locator('#presentationPhase')).toHaveText('Received');
  await page.getByRole('button',{name:'Pause animation',exact:true}).click();
  await page.getByRole('button',{name:'Next message',exact:true}).click();
  await expect(page.locator('#presentationCounter')).toHaveText('Message 3 of 3');
  await expect(page.locator('#presentationPhase')).toHaveText('Ready');
  await page.clock.runFor(10000);
  await expect(page.locator('#presentationPhase')).toHaveText('Ready');
  await page.getByRole('button',{name:'Start animation',exact:true}).click();
  await page.clock.runFor(2000);
  await expect(page.locator('#presentationPhase')).toHaveText('Received');
  await page.getByRole('button',{name:'Show presentation details',exact:true}).click();
  await page.getByRole('tab',{name:'Flow overview',exact:true}).click();
  await page.locator('.timelineMessage').first().click();
  await expect(page.locator('#presentationCounter')).toHaveText('Messages 1–2 of 3');
  await expect(page.locator('#presentationPhase')).toHaveText('Sending');
  await page.clock.runFor(700);
  await expect(page.locator('#presentationPhase')).toHaveText('Sending');
  await page.getByRole('button',{name:'Stop animation',exact:true}).click();
  await page.clock.runFor(6000);
  await expect(page.locator('#presentationPhase')).toHaveText('Ready');
});

test('manual phase inspection remains separate from next-message navigation', async ({page}) => {
  await page.clock.install();
  await seed(page);
  await page.getByRole('button',{name:'Start presentation mode',exact:true}).click();
  await page.getByLabel('Playback settings',{exact:true}).click();
  await page.getByRole('radio',{name:'Manual',exact:true}).check();
  await page.getByRole('checkbox',{name:'Show processing phase',exact:true}).check();
  await page.getByRole('button',{name:'Start animation',exact:true}).click();
  await page.clock.runFor(2000);
  await page.getByLabel('Playback settings',{exact:true}).click();
  await page.getByRole('button',{name:'Next phase',exact:true}).click();
  await expect(page.locator('#presentationPhase')).toHaveText('Processing');
  await expect(page.locator('#presentationCounter')).toHaveText('Messages 1–2 of 3');
  await page.getByLabel('Playback settings',{exact:true}).click();
  await page.getByRole('button',{name:'Next message',exact:true}).click();
  await expect(page.locator('#presentationCounter')).toHaveText('Message 3 of 3');
  await expect(page.locator('#presentationPhase')).toHaveText('Sending');
  await page.getByLabel('Playback settings',{exact:true}).click();
  await page.getByRole('button',{name:'Previous phase',exact:true}).click();
  await expect(page.locator('#presentationCounter')).toHaveText('Messages 1–2 of 3');
  await expect(page.locator('#presentationPhase')).toHaveText('Processing');
  await page.clock.runFor(3000);
  await expect(page.locator('#presentationPhase')).toHaveText('Processing');
});

for(const width of [1280,980]) test(`presentation and playback controls fit at ${width}px`, async ({page},testInfo) => {
  await page.setViewportSize({width,height:720});
  await page.goto('/'); await page.locator('#emptyExampleBtn').click();
  for(const id of ['startBtn','nextMessageBtn','presentationBtn']){
    await expect(page.locator('#'+id+' .uiIcon')).toHaveCount(1);
    expect(await page.locator('#'+id).evaluate(el => {
      const box = el.getBoundingClientRect();
      return box.height >= 34 && el.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));
    })).toBe(true);
  }
  await page.getByRole('button',{name:'Start presentation mode',exact:true}).click();
  await page.getByLabel('Playback settings',{exact:true}).click();
  const popup = await page.locator('.playbackPanel').boundingBox();
  expect(popup.y).toBeGreaterThan(0);
  expect(popup.x+popup.width).toBeLessThanOrEqual(width);
  await page.getByLabel('Playback settings',{exact:true}).click();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#presentationCounter')).toHaveText('Message 2 of 7');
  await page.screenshot({path:testInfo.outputPath('presentation.png')});
});
