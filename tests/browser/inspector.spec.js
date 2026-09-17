import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {diagram} from '../fixtures/diagram.js';
import {exportFile} from './exportHelpers.js';
const key='event-flow-designer-state-v1';
const saved=page=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
async function seed(page,flow=false,component={}){
  const data=diagram();data.components[0].shape='roundedRectangle';data.settings={...data.settings,zoom:1,panX:0,panY:0};
  Object.assign(data.components[0],component);
  if(!flow)data.messageFlows=[];
  await page.goto('/');await page.locator('#importInput').setInputFiles({name:'Styles.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
}
const web=page=>page.locator('.componentGroup[data-id=web]');
test.beforeEach(async({page})=>{page._inspectorErrors=[];page.on('pageerror',e=>page._inspectorErrors.push(e.message));});
test.afterEach(async({page})=>expect(page._inspectorErrors).toEqual([]));

test('colour picker previews, cancels, commits once and remembers recent colours',async({page})=>{
  await seed(page);await web(page).locator('.componentShape').click();
  const original=(await saved(page)).components;
  await page.getByRole('button',{name:'Fill colour',exact:true}).click();
  await page.getByRole('button',{name:'Use #f3e8ff',exact:true}).click();
  await expect(web(page).locator('.componentShape')).toHaveAttribute('fill','#f3e8ff');
  expect((await saved(page)).components).toEqual(original);
  await page.keyboard.press('Escape');await expect(web(page).locator('.componentShape')).toHaveAttribute('fill','#dbeafe');
  await page.getByRole('button',{name:'Fill colour',exact:true}).click();
  await page.getByRole('textbox',{name:'HEX colour'}).fill('#abc');await page.getByRole('textbox',{name:'HEX colour'}).press('Tab');
  await page.getByRole('slider',{name:'Colour opacity'}).press('Home');await page.getByRole('slider',{name:'Colour opacity'}).press('ArrowRight');
  await page.getByRole('button',{name:'Done',exact:true}).click();
  expect((await saved(page)).components[0]).toMatchObject({fillColor:'#aabbcc',fillOpacity:.01});
  await expect(web(page).locator('.componentText')).toHaveAttribute('fill-opacity','1');
  await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await saved(page)).components).toEqual(original);
  await page.getByRole('button',{name:'Redo',exact:true}).click();
  await page.reload();await web(page).locator('.componentShape').click();
  await page.getByRole('button',{name:'Fill colour',exact:true}).click();await expect(page.getByRole('button',{name:'Recent #aabbcc',exact:true})).toBeVisible();
});

test('appearance changes round-trip through JSON and SVG; reset is undoable',async({page},info)=>{
  await seed(page);await web(page).locator('.componentShape').click();
  await page.getByRole('button',{name:'Dashed border',exact:true}).click();
  await page.getByLabel('Border width',{exact:true}).selectOption('4');
  await page.getByLabel('Font size (px)',{exact:true}).fill('20');await page.getByLabel('Font size (px)',{exact:true}).press('Enter');await page.getByLabel('Weight',{exact:true}).selectOption('700');await page.getByLabel('Alignment',{exact:true}).selectOption('left');
  await expect(web(page).locator('.componentShape')).toHaveAttribute('stroke-dasharray','16 12');
  await expect(web(page).locator('.componentShape')).toHaveCSS('stroke-width','4px');
  await expect(web(page).locator('.componentText')).toHaveCSS('font-size','20px');
  await expect(web(page).locator('.componentText')).toHaveCSS('text-anchor','start');
  const styled=(await saved(page)).components;
  for(const format of ['JSON','SVG']){
    const download=await exportFile(page,format);const file=info.outputPath('styled.'+format.toLowerCase());await download.saveAs(file);const content=await readFile(file,'utf8');
    if(format==='JSON'){expect(JSON.parse(content).components).toEqual(styled);await page.locator('#importInput').setInputFiles(file);}
    else {expect(content).toMatch(/stroke-dasharray: 16px, 12px/);expect(content).toContain('font-size: 20px');expect(content).not.toContain('componentSelectionOutline');}
  }
  await web(page).locator('.componentShape').click();await page.getByRole('button',{name:'Reset to theme',exact:true}).click();expect((await saved(page)).components[0].borderStyle).toBeUndefined();
  await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await saved(page)).components).toEqual(styled);
});

test('multiple selection displays mixed values and applies one shared style edit',async({page})=>{
  await seed(page,false,{fontSize:21.5});await web(page).locator('.componentShape').click();await page.locator('.componentGroup[data-id=service] .componentShape').click({modifiers:['Shift']});
  await expect(page.getByText('2 elements selected',{exact:true})).toBeVisible();await expect(page.locator('[data-color=fillColor]')).toContainText('Mixed');
  const before=(await saved(page)).components;await page.getByRole('button',{name:'Dotted border',exact:true}).click();expect((await saved(page)).components.every(c=>c.borderStyle==='dotted')).toBe(true);
  await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await saved(page)).components).toEqual(before);
  await web(page).locator('.componentShape').click();await page.locator('.componentGroup[data-id=service] .componentShape').click({modifiers:['Shift']});
  const font=page.getByLabel('Font size (px)',{exact:true});await expect(font).toHaveAttribute('placeholder','Mixed');
  await font.fill('17.5');await font.press('Enter');expect((await saved(page)).components.every(c=>c.fontSize===17.5)).toBe(true);
  await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await saved(page)).components).toEqual(before);
});

test('custom font sizes validate, persist, and scale UML labels and details',async({page})=>{
  await seed(page,false,{shape:'umlNode',width:320,height:250,stereotype:'service',details:'Processes orders'});
  await web(page).locator('.componentShape').first().click();
  const font=page.getByLabel('Font size (px)',{exact:true});await expect(font).toHaveValue('14');
  for(const invalid of ['7','97','']){
    await font.fill(invalid);await font.press('Enter');expect((await saved(page)).components[0].fontSize).toBeUndefined();
    await expect(web(page).locator('.elementText').filter({hasText:'Web UI'})).toHaveCSS('font-size','14px');
  }
  await font.fill('21.5');await font.press('Enter');
  await expect(web(page).locator('.elementText').filter({hasText:'Web UI'})).toHaveCSS('font-size','21.5px');
  await font.fill('28');await font.press('Enter');
  await expect(web(page).locator('.elementText').filter({hasText:'Web UI'})).toHaveCSS('font-size','28px');
  await expect(web(page).locator('.elementText').filter({hasText:'«service»'})).toHaveCSS('font-size','22px');
  await expect(web(page).locator('.elementText').filter({hasText:'Processes orders'})).toHaveCSS('font-size','24px');
  await font.fill('35');await font.press('Escape');await expect(font).toHaveValue('28');
  await page.reload();await web(page).locator('.componentShape').first().click();await expect(font).toHaveValue('28');
  await expect(web(page).locator('.elementText').filter({hasText:'Web UI'})).toHaveCSS('font-size','28px');
});

test('selected connections preview their own colour and width, including the arrowhead',async({page})=>{
  await seed(page,true);await page.getByRole('button',{name:'Show connection for step 1',exact:true}).click();await page.getByRole('tab',{name:'Properties',exact:true}).click();
  await page.getByRole('button',{name:'Line colour',exact:true}).click();await page.getByRole('button',{name:'Use #dc2626',exact:true}).click();await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByLabel('Line width',{exact:true}).selectOption('4');await page.getByRole('button',{name:'Dashed line',exact:true}).click();
  await expect(page.locator('#path-request')).toHaveCSS('stroke','rgb(220, 38, 38)');await expect(page.locator('#path-request')).toHaveCSS('stroke-width','4px');await expect(page.locator('#flow-arrow-0 path')).toHaveAttribute('fill','#dc2626');
  await page.getByRole('button',{name:'None line',exact:true}).click();await expect(page.locator('#flow-arrow-0 path')).toHaveAttribute('fill-opacity','0');
  expect((await saved(page)).messageFlows[0].style).toMatchObject({color:'#dc2626',lineStyle:'none',thickness:4});
});

test('hidden steps stay hidden on selection, reload and export but still play',async({page},info)=>{
  await seed(page,true);const card=page.locator('.flowItem[data-flow-id=request]');
  await card.locator('.flowRoute').click();await expect(page.locator('#path-request')).toHaveCount(0);await expect(page.locator('.flowLabelGroup[data-id=request]')).toHaveCount(0);await expect(page.locator('.flowEndpointHandle')).toHaveCount(0);
  await page.getByRole('button',{name:'Show connection for step 1',exact:true}).click();await expect(page.locator('#path-request')).toHaveCount(1);
  await page.getByRole('button',{name:'Hide connection for step 1',exact:true}).click();await expect(page.locator('#path-request')).toHaveCount(0);
  await page.reload();await expect(page.locator('#path-request')).toHaveCount(0);
  const download=await exportFile(page,'SVG');const file=info.outputPath('hidden.svg');await download.saveAs(file);expect(await readFile(file,'utf8')).not.toContain('id="path-request"');
  await card.locator('.flowRoute').click();await page.getByRole('button',{name:'Start presentation mode',exact:true}).click();await expect(page.locator('#path-request')).toHaveCount(1);
  expect((await saved(page)).messageFlows).toHaveLength(2);
});

test('drag keeps the full card visible and moves neighbours before committing; Escape and outside drops cancel',async({page})=>{
  await page.goto('/');await page.locator('#emptyExampleBtn').click();const before=(await saved(page)).messageFlows;
  const list=page.locator('#flowList'),rows=list.locator('.flowItem');
  const firstId=await rows.first().getAttribute('data-flow-id');
  const source=await rows.first().locator('.flowDragHandle').boundingBox(),target=await rows.nth(2).boundingBox();
  await page.mouse.move(source.x+source.width/2,source.y+source.height/2);await page.mouse.down();await page.mouse.move(target.x+45,target.y+target.height-5,{steps:14});
  await expect(page.locator('.flowFloatingCard')).toBeVisible();await expect(page.locator('.flowFloatingCard .flowName')).toHaveText(before[0].messageText);await expect(page.locator('.flowDropSlot')).toHaveCount(1);
  await expect(rows.nth(2)).toHaveAttribute('data-flow-id',firstId);expect((await saved(page)).messageFlows).toEqual(before);
  await page.keyboard.press('Escape');await page.mouse.up();await expect(page.locator('.flowFloatingCard')).toHaveCount(0);expect((await saved(page)).messageFlows).toEqual(before);await expect(rows.first()).toHaveAttribute('data-flow-id',firstId);
  await rows.first().locator('.flowDragHandle').dragTo(rows.nth(2),{targetPosition:{x:100,y:70}});await expect(rows.nth(2)).toHaveAttribute('data-flow-id',firstId);
  await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await saved(page)).messageFlows).toEqual(before);
  const handle=await rows.first().locator('.flowDragHandle').boundingBox();await page.mouse.move(handle.x+10,handle.y+10);await page.mouse.down();await page.mouse.move(400,300,{steps:12});await page.mouse.up();expect((await saved(page)).messageFlows).toEqual(before);
});

test('drag auto-scrolls and cancelling preserves simultaneous timing',async({page})=>{
  await seed(page,true);const before=(await saved(page)).messageFlows;
  const rows=page.locator('#flowList .flowItem');const a=await rows.first().locator('.flowDragHandle').boundingBox(),b=await rows.last().boundingBox();
  await page.mouse.move(a.x+10,a.y+10);await page.mouse.down();await page.mouse.move(b.x+40,b.y+b.height-5,{steps:12});await page.keyboard.press('Escape');await page.mouse.up();await expect(page.locator('.parallelGroup .flowItem')).toHaveCount(2);expect((await saved(page)).messageFlows).toEqual(before);
  await page.getByLabel('File menu',{exact:true}).click();page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Load example flow',exact:true}).click();
  const grip=await rows.first().locator('.flowDragHandle').boundingBox(),scroll=page.locator('.flowPanelBody'),bounds=await scroll.boundingBox();
  await page.mouse.move(grip.x+10,grip.y+10);await page.mouse.down();await page.mouse.move(bounds.x+40,bounds.y+bounds.height-8,{steps:12});await expect.poll(()=>scroll.evaluate(el=>el.scrollTop)).toBeGreaterThan(30);await page.keyboard.press('Escape');await page.mouse.up();await expect(page.locator('.flowFloatingCard')).toHaveCount(0);
});
