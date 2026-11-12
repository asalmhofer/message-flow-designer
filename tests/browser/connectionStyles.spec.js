import {test, expect} from '@playwright/test';
import {diagram} from '../fixtures/diagram.js';

const storageKey = 'event-flow-designer-state-v1';
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);

async function seed(page, {withFlow=true}={}){
  const data = diagram();
  data.components[0].shape = 'roundedRectangle';
  if(data.messageFlows.length) data.messageFlows[0].hiddenInDrawingMode = false;
  if(!withFlow) data.messageFlows = [];
  delete data.settings.defaultConnectionStyle;
  Object.assign(data.settings, {zoom:1, panX:0, panY:0});
  await page.goto('/');
  await page.locator('#importInput').setInputFiles({
    name:'Connection styles.json',
    mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(data))
  });
}

test.beforeEach(async({page})=>{
  page._connectionStyleErrors=[];
  page.on('pageerror', error=>page._connectionStyleErrors.push(error.message));
});
test.afterEach(async({page})=>expect(page._connectionStyleErrors).toEqual([]));

test('Style menu changes the selected flow and the change is undoable',async({page})=>{
  await seed(page);
  const label=page.locator('.flowLabelGroup[data-id="request"]');
  const path=page.locator('.flowPath[data-id="request"]');
  await label.click({button:'right'});
  await page.locator('#themeMenu summary').click();
  await page.locator('#connectionStyleSelect').selectOption('straight');
  expect((await saved(page)).messageFlows.find(flow=>flow.id==='request').connectionStyle).toBe('straight');
  expect(await path.getAttribute('d')).toMatch(/ L/);

  await page.getByRole('button',{name:'Undo',exact:true}).click();
  expect((await saved(page)).messageFlows.find(flow=>flow.id==='request').connectionStyle).toBe('arc');
});

test('connection context menu changes routing style',async({page})=>{
  await seed(page);
  await page.locator('.flowLabelGroup[data-id="request"]').click({button:'right'});
  const styles=page.locator('#contextConnectionStyles');
  await expect(styles).toBeVisible();
  await styles.getByRole('menuitem',{name:'Elbow',exact:true}).click();

  expect((await saved(page)).messageFlows.find(flow=>flow.id==='request').connectionStyle).toBe('angular');
  expect(await page.locator('.flowPath[data-id="request"]').getAttribute('d')).toContain(' L');
});

test('new flows default to straight and retain that style after reload',async({page})=>{
  await seed(page,{withFlow:false});
  await expect(page.locator('#connectionStyleSelect')).toHaveValue('straight');

  const source=page.locator('.componentGroup[data-id="web"]');
  const target=page.locator('.componentGroup[data-id="service"] .componentShape');
  await source.locator('.componentShape').hover();
  const handle=source.locator('.quickConnect[data-side="right"]');
  await expect(handle).toBeVisible();
  const handleBox=await handle.boundingBox();
  const targetBox=await target.boundingBox();
  await page.mouse.move(handleBox.x+handleBox.width/2,handleBox.y+handleBox.height/2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x+targetBox.width/2,targetBox.y+targetBox.height/2,{steps:10});
  await page.mouse.up();

  expect((await saved(page)).settings.defaultConnectionStyle).toBe('straight');
  expect((await saved(page)).messageFlows[0].connectionStyle).toBe('straight');
  await page.reload();
  expect((await saved(page)).messageFlows[0].connectionStyle).toBe('straight');
});
