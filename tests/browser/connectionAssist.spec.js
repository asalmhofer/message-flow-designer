import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {diagram} from '../fixtures/diagram.js';
import {openExport} from './exportHelpers.js';

const source=page=>page.locator('.componentGroup[data-id="web"]');
const handle=(page,side='right')=>source(page).locator(`.quickConnect[data-side="${side}"]`);
const picker=page=>page.getByRole('dialog',{name:'Add connected component',exact:true});
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('event-flow-designer-state-v1')));
async function center(locator){const b=await locator.boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};}
async function seed(page,options={},component={}){
  const data=diagram();data.components[0].shape='roundedRectangle';data.messageFlows=[];
  Object.assign(data.components[0],component);
  Object.assign(data.settings,{zoom:1,panX:0,panY:0,animationSpeed:100},options);
  await page.goto('/');await page.locator('#importInput').setInputFiles({name:'Connections.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
}
async function startDrag(page,side='right'){
  await source(page).locator('.componentShape').hover();const point=await center(handle(page,side));
  await page.mouse.move(point.x,point.y,{steps:12});await page.mouse.down();
}
test.beforeEach(async({page})=>{page._connectionErrors=[];page.on('pageerror',e=>page._connectionErrors.push(e.message));});
test.afterEach(async({page})=>expect(page._connectionErrors).toEqual([]));

test('hover handles stay the same screen size when zoomed and preserve selection until a connection starts',async({page})=>{
  await seed(page,{zoom:.5,panX:80,panY:80});await source(page).locator('.componentShape').hover();
  expect((await handle(page).boundingBox()).width).toBeCloseTo(40,1);await expect(source(page)).not.toHaveClass(/selected/);
  const arrow=await center(handle(page));await page.mouse.move(arrow.x,arrow.y,{steps:20});await expect(handle(page)).toBeVisible();
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();await source(page).locator('.componentShape').hover();
  expect((await handle(page).boundingBox()).width).toBeCloseTo(40,1);
  await handle(page).press('Enter');await expect(picker(page)).toBeVisible();await page.keyboard.press('Escape');await expect(source(page)).toBeFocused();
  expect((await saved(page)).messageFlows).toHaveLength(0);
});

for(const near of [false,true])test(`drag connects to an existing component with a matching preview ${near?'near its edge':'on its body'}`,async({page})=>{
  await seed(page);const target=await page.locator('.componentGroup[data-id="service"] .componentShape').boundingBox();await startDrag(page);
  await page.mouse.move(near?target.x-10:target.x+target.width/2,target.y+target.height/2,{steps:10});
  await expect(page.locator('.connectionTargetOutline')).toHaveCount(1);
  const preview=await page.locator('.connectionDraftPreview').getAttribute('d');await page.mouse.up();
  await expect(page.locator('.flowPath')).toHaveCount(1);expect(await page.locator('.flowPath').getAttribute('d')).toBe(preview);
  const data=await saved(page);expect([data.messageFlows[0].sourceComponentId,data.messageFlows[0].targetComponentId]).toEqual(['web','service']);
  await expect(page.getByRole('button',{name:'Name message',exact:true})).toBeVisible();await page.getByRole('button',{name:'Name message',exact:true}).click();
  await page.locator('.inlineEditor').fill('Submit request');await page.locator('.inlineEditor').press('Enter');expect((await saved(page)).messageFlows[0].messageText).toBe('Submit request');
});

test('click creates a reversed UML neighbour, names it and undoes the entire creation once',async({page})=>{
  await seed(page);await source(page).locator('.componentShape').click();await handle(page,'bottom').click();
  await expect(picker(page)).toBeVisible();await expect(page.locator('.connectedPreview')).toHaveCount(1);
  expect((await saved(page)).components).toHaveLength(2);
  await picker(page).getByRole('button',{name:'Reverse connection direction',exact:true}).click();
  await picker(page).getByRole('searchbox').fill('node');await picker(page).getByRole('button',{name:'Add connected node',exact:true}).hover();
  const preview=await page.locator('.connectionDraftPreview').getAttribute('d');await picker(page).getByRole('button',{name:'Add connected node',exact:true}).click();
  expect(await page.locator('.flowPath').getAttribute('d')).toBe(preview);
  await expect(page.locator('.inlineEditor')).toBeFocused();await page.locator('.inlineEditor').fill('Worker');await page.locator('.inlineEditor').press('Enter');
  const data=await saved(page),added=data.components.at(-1);expect(added.shape).toBe('umlNode');expect(added.name).toBe('Worker');
  expect(added.y).toBeGreaterThan(data.components[0].y+data.components[0].height);
  expect([data.messageFlows[0].sourceComponentId,data.messageFlows[0].targetComponentId]).toEqual([added.id,'web']);
  expect(data.messageFlows[0].sourcePortId).toMatch(/^top/);expect(data.messageFlows[0].targetPortId).toMatch(/^bottom/);
  await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await saved(page)).components).toHaveLength(2);expect((await saved(page)).messageFlows).toHaveLength(0);
  await page.getByRole('button',{name:'Redo',exact:true}).click();expect((await saved(page)).components.at(-1).name).toBe('Worker');
  await page.reload();expect((await saved(page)).messageFlows[0].sourceComponentId).toBe(added.id);
});

for(const sameType of [true,false])test(`connected ${sameType?'matching':'different'} shapes inherit source appearance in preview, history and storage`,async({page})=>{
  const style={fontSize:21.5,fontWeight:700,textAlign:'left',textColor:'#7c3aed',textOpacity:.6,fillColor:'#ffedd5',fillOpacity:.4,borderColor:'#dc2626',borderWidth:4,borderStyle:'dashed',borderOpacity:.8};
  await seed(page,{}, {...style,width:277,height:137});await source(page).locator('.componentShape').click();await handle(page,'bottom').click();
  if(!sameType)await picker(page).getByRole('button',{name:'Reverse connection direction',exact:true}).click();
  const choice=picker(page).getByRole('button',{name:sameType?'Add connected rounded rectangle':'Add connected node',exact:true});await choice.hover();
  const preview=page.locator('.connectedPreview');
  await expect(preview.locator('.componentShape').first()).toHaveAttribute('fill','#ffedd5');
  await expect(preview.locator('.componentShape').first()).toHaveAttribute('stroke-width','4');
  await expect(preview.locator('.componentShape').first()).toHaveCSS('stroke','rgb(220, 38, 38)');
  await expect(preview.locator('.componentShape').first()).toHaveCSS('stroke-dasharray','16px, 12px');
  await expect(preview).toHaveCSS('opacity','1');
  await expect(preview.locator('text').first()).toHaveCSS('font-size','21.5px');
  const path=await page.locator('.connectionDraftPreview').getAttribute('d');await choice.click();await page.locator('.inlineEditor').press('Escape');
  const data=await saved(page),added=data.components.at(-1);expect(added).toMatchObject(style);
  expect([added.width,added.height]).toEqual(sameType?[277,137]:[210,132]);expect(data.components[0]).toMatchObject({...style,width:277,height:137});
  expect(data.messageFlows[0][sameType?'targetComponentId':'sourceComponentId']).toBe(added.id);expect(await page.locator('.flowPath').getAttribute('d')).toBe(path);
  await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await saved(page)).components).toHaveLength(2);
  await page.getByRole('button',{name:'Redo',exact:true}).click();expect((await saved(page)).components.at(-1)).toEqual(added);
  await page.reload();expect((await saved(page)).components.at(-1)).toEqual(added);
});

test('connected elements inherit effective legacy defaults and zero-valued appearance settings',async({page})=>{
  await seed(page,{diagramTheme:'monochrome'},{fillColor:'transparent',fillOpacity:0,borderWidth:0,borderOpacity:0,textOpacity:0,borderStyle:'none'});
  await source(page).locator('.componentShape').click();await handle(page,'bottom').click();
  await picker(page).getByRole('button',{name:'Add connected node',exact:true}).click();await page.locator('.inlineEditor').press('Escape');
  expect((await saved(page)).components.at(-1)).toMatchObject({fillColor:'transparent',fillOpacity:0,borderWidth:0,borderOpacity:0,textOpacity:0,borderStyle:'none',fontSize:14,fontWeight:600,textAlign:'center',textColor:'#0f172a',borderColor:'#334155'});
});

test('blank-space drag previews without saving; cancel and outside drops leave no objects or history',async({page})=>{
  await seed(page);await page.reload();const original=await saved(page),canvas=await page.locator('#diagram').boundingBox();await startDrag(page,'bottom');
  await page.mouse.move(canvas.x+450,canvas.y+380,{steps:8});await page.mouse.up();await expect(picker(page)).toBeVisible();
  await picker(page).getByRole('searchbox').fill('database');await picker(page).getByRole('button',{name:'Add connected database',exact:true}).hover();
  expect((await saved(page)).components).toEqual(original.components);
  await page.keyboard.press('Escape');await expect(picker(page)).toBeHidden();await expect(page.locator('.connectedPreview,.connectionDraftPreview')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeDisabled();
  await startDrag(page);await page.mouse.move(1100,350,{steps:8});await page.mouse.up();await expect(picker(page)).toBeHidden();
  expect((await saved(page)).components).toEqual(original.components);expect((await saved(page)).messageFlows).toHaveLength(0);
});

test('drag-to-create uses the chosen location, shares library favourites and records recent elements',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('message-flow-element-library-v1',JSON.stringify({favorites:['cylinder','umlPort'],recent:['queue']})));
  await seed(page);const canvas=await page.locator('#diagram').boundingBox();await startDrag(page,'bottom');
  await page.mouse.move(canvas.x+450,canvas.y+380,{steps:8});await page.mouse.up();
  await picker(page).getByRole('button',{name:'Favourites',exact:true}).click();await expect(picker(page).locator('[data-shape]')).toHaveCount(1);
  await picker(page).getByRole('button',{name:'Add connected database',exact:true}).click();await page.locator('.inlineEditor').press('Escape');
  const added=(await saved(page)).components.at(-1);expect(added.shape).toBe('cylinder');expect(Math.abs(added.x+added.width/2-450)).toBeLessThanOrEqual(12);expect(Math.abs(added.y+added.height/2-380)).toBeLessThanOrEqual(12);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('message-flow-element-library-v1')).recent[0])).toBe('cylinder');
});

test('new handles and connection previews never leak into exported SVG',async({page},info)=>{
  await seed(page);await source(page).locator('.componentShape').click();await openExport(page,'SVG');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export SVG',exact:true}).click();const download=await pending,path=info.outputPath('diagram.svg');await download.saveAs(path);
  expect(await readFile(path,'utf8')).not.toMatch(/quickConnect|connectedPreview|connectionTargetOutline/);
});

test('an off-screen neighbour is revealed, and cancelling restores the original view without activating a covered control',async({page})=>{
  await seed(page);await source(page).locator('.componentShape').click();const view=await page.locator('#viewport').getAttribute('transform');
  await handle(page,'left').click();const canvas=await page.locator('#diagram').boundingBox(),box=await page.locator('.connectedPreview').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(canvas.x);expect(box.x+box.width).toBeLessThanOrEqual(canvas.x+canvas.width);
  const undo=await center(page.getByRole('button',{name:'Undo',exact:true}));await page.mouse.click(undo.x,undo.y);
  await expect(picker(page)).toBeHidden();expect(await page.locator('#viewport').getAttribute('transform')).toBe(view);expect((await saved(page)).components).toHaveLength(2);
});

test('pointer cancellation clears a connection without opening the picker',async({page})=>{
  await seed(page);await startDrag(page);await page.mouse.move(420,390,{steps:5});await page.locator('#diagram').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();
  await expect(picker(page)).toBeHidden();await expect(page.locator('.connectionDraftPreview,.connectionTargetOutline')).toHaveCount(0);expect((await saved(page)).messageFlows).toHaveLength(0);
});

for(const width of [1280,600])test(`picker remains usable at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:720});await seed(page);await source(page).locator('.componentShape').click();await handle(page,'bottom').click();
  const box=await picker(page).boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(box.y+box.height).toBeLessThanOrEqual(720);
  await expect(picker(page).getByRole('button',{name:'Cancel connected component',exact:true})).toBeInViewport();await page.screenshot({path:info.outputPath('picker.png')});
});
