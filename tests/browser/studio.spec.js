import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {exportFile} from './exportHelpers.js';
const key='event-flow-designer-state-v1';
const saved=page=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
const group=(page,id)=>page.locator(`.componentGroup[data-id="${id}"]`);
const fixture=()=>({components:[{id:'service',name:'Order service',shape:'umlComponent',x:200,y:160,width:190,height:112,fillColor:'#fff',borderColor:'#475569',stereotype:'service',details:'Validates incoming orders',zIndex:1}],messageFlows:[],settings:{zoom:1,panX:0,panY:0,showGrid:true,snapToGrid:false,diagramTheme:'technical',diagramPalette:'blue'}});
async function seed(page,data=fixture()){
  await page.goto('/');await page.locator('#importInput').setInputFiles({name:'Architecture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await expect(page.locator('.componentGroup')).toHaveCount(data.components.length);
}
async function library(page){await page.getByRole('button',{name:'Open element library',exact:true}).click();await page.getByRole('button',{name:'All',exact:true}).click();await page.getByRole('searchbox',{name:'Search elements'}).fill('');}
async function choose(page,shape){await library(page);await page.locator(`[data-shape="${shape}"]`).click();}
async function place(page,shape,x,y){await choose(page,shape);await page.locator('#diagram').click({position:{x,y}}); const details=page.locator('#propertiesPanel details').first();if(await details.count())await details.locator('summary').click();}
async function drag(page,from,to){await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up();}
async function edit(page,id,value){await page.locator(id).fill(value);await page.locator(id).press('Tab');}
test.beforeEach(async({page})=>{page._studioErrors=[];page.on('pageerror',e=>page._studioErrors.push(e.message));});
test.afterEach(async({page})=>expect(page._studioErrors).toEqual([]));

test('library search, categories, favourites and recent items persist with keyboard dismissal',async({page})=>{
  await page.goto('/');await library(page);
  await expect(page.locator('.elementChoice')).toHaveCount(24);
  await page.getByRole('searchbox').fill('interface');await expect(page.locator('.elementChoice')).toHaveCount(2);
  await page.getByRole('button',{name:'Favourite Provided interface',exact:true}).click();
  await page.getByRole('searchbox').fill('nothing-matches');await expect(page.locator('.libraryEmpty')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('#elementLibrary')).toBeHidden();
  await expect(page.locator('#addComponentBtn')).toBeFocused();
  await place(page,'umlComponent',400,260);
  await page.reload();await library(page);await page.getByRole('button',{name:'Favourites',exact:true}).click();
  await expect(page.locator('.elementChoice')).toHaveCount(1);await expect(page.locator('[data-shape="providedInterface"]')).toBeVisible();
  await page.getByRole('button',{name:'Recent',exact:true}).click();await expect(page.locator('[data-shape="umlComponent"]')).toBeVisible();
  await page.getByRole('button',{name:'Deployment',exact:true}).click();await expect(page.locator('.elementChoice')).toHaveCount(2);
});

test('ports and interfaces attach, follow owner movement and resizing, and survive undo, copy and deletion',async({page})=>{
  await seed(page);
  await place(page,'umlPort',390,216);
  const port=(await saved(page)).components.find(c=>c.shape==='umlPort');expect(port.ownerId).toBe('service');
  await place(page,'providedInterface',397,216);
  const api=(await saved(page)).components.find(c=>c.shape==='providedInterface');expect(api.ownerId).toBe(port.id);
  const canvas=await page.locator('#diagram').boundingBox();
  await drag(page,{x:canvas.x+260,y:canvas.y+215},{x:canvas.x+308,y:canvas.y+251});
  let data=await saved(page);expect(data.components.find(c=>c.id===port.id).x).toBeCloseTo(port.x+48,0);
  expect(data.components.find(c=>c.id===api.id).x).toBeCloseTo(api.x+48,0);
  const handle=await group(page,'service').locator('.resizeHandle[data-handle="se"]').boundingBox();
  await drag(page,{x:handle.x+handle.width/2,y:handle.y+handle.height/2},{x:handle.x+handle.width/2+60,y:handle.y+handle.height/2+40});
  data=await saved(page);expect(data.components.find(c=>c.id===port.id).x).toBeCloseTo(port.x+108,0);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  expect((await saved(page)).components.find(c=>c.id===port.id).x).toBeCloseTo(port.x+48,0);
  await group(page,'service').locator('.componentShape').click();await page.locator('#duplicatePropBtn').click();
  data=await saved(page);expect(data.components).toHaveLength(6);
  const copy=data.components.find(c=>c.name==='Order service copy');const copyPort=data.components.find(c=>c.ownerId===copy.id);
  expect(data.components.some(c=>c.ownerId===copyPort.id)).toBe(true);
  await page.keyboard.press('Delete');expect((await saved(page)).components).toHaveLength(3);
  await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await saved(page)).components).toHaveLength(6);
  await page.reload();await expect(page.locator('.componentGroup')).toHaveCount(6);
});

test('attachment placement requires an owner and attached labels and side controls remain editable',async({page})=>{
  await seed(page);await place(page,'requiredInterface',650,400);
  await expect(page.locator('.componentGroup')).toHaveCount(1);await expect(page.locator('.placementPreview')).toHaveCount(1);
  await page.locator('#diagram').click({position:{x:200,y:216}});
  await page.getByText('Attachment',{exact:true}).click();await edit(page,'#propName','Payment API');await page.locator('#propAttachmentSide').selectOption('bottom');
  await edit(page,'#propAttachmentRatio','25');
  const c=(await saved(page)).components.find(c=>c.shape==='requiredInterface');
  expect(c.attachment).toEqual({side:'bottom',ratio:.25});expect(c.name).toBe('Payment API');
  const canvas=await page.locator('#diagram').boundingBox();
  await page.mouse.move(canvas.x+c.x+c.width/2,canvas.y+c.y+c.height/2);
  await page.mouse.down();await page.mouse.move(canvas.x+370,canvas.y+216,{steps:10});
  await page.keyboard.press('Escape');await page.mouse.up();
  expect((await saved(page)).components.find(item=>item.id===c.id).attachment).toEqual(c.attachment);
  await page.reload();await expect(page.locator('.elementText').filter({hasText:'Payment API'})).toBeVisible();
});

test('package moves and duplicates its contents; comments keep an annotation link without a playback step',async({page})=>{
  const d=fixture();d.components.unshift({id:'pkg',name:'Ordering',shape:'package',x:160,y:100,width:300,height:250,zIndex:0});
  await seed(page,d);const canvas=await page.locator('#diagram').boundingBox();
  await drag(page,{x:canvas.x+200,y:canvas.y+112},{x:canvas.x+248,y:canvas.y+148});
  expect((await saved(page)).components.find(c=>c.id==='service').x).toBe(248);
  await page.locator('#duplicatePropBtn').click();expect((await saved(page)).components).toHaveLength(4);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await page.keyboard.down('Control');
  await drag(page,{x:canvas.x+240,y:canvas.y+148},{x:canvas.x+320,y:canvas.y+196});
  await page.keyboard.up('Control');
  const copied=await saved(page);expect(copied.components).toHaveLength(4);
  expect(copied.components.find(c=>c.id==='service').x).toBe(248);
  expect(copied.components.find(c=>c.id==='pkg').x).toBe(208);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await place(page,'umlComment',650,380);await edit(page,'#propDetails','Review this boundary');await page.locator('#propAnnotation').selectOption('service');
  await expect(page.locator('.annotationLink')).toHaveCount(1);await expect(page.locator('.flowItem')).toHaveCount(0);
  await group(page,'service').locator('.componentShape').click();await page.keyboard.press('Delete');
  await expect(page.locator('.annotationLink')).toHaveCount(0);await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('.annotationLink')).toHaveCount(1);
});

test('deployment kinds, stereotypes and artifact details round-trip in JSON and SVG/PNG exports',async({page},info)=>{
  await seed(page);await place(page,'umlNode',630,180);await page.locator('#propNodeKind').selectOption('executionEnvironment');await edit(page,'#propName','Container runtime');
  await place(page,'umlArtifact',640,410);await edit(page,'#propName','orders.jar');await edit(page,'#propStereotype','executable');await edit(page,'#propDetails','Version 2.4');
  await page.getByLabel('Diagram style',{exact:true}).click();await page.locator('#diagramTheme').selectOption('soft');await page.locator('#diagramPalette').selectOption('teal');await page.getByLabel('Diagram style',{exact:true}).click();
  const original=await saved(page);
  for(const [button,extension] of [['Export JSON','json'],['Export SVG','svg'],['Export PNG','png']]){
    const download=await exportFile(page,button.replace('Export ',''));const file=info.outputPath('studio.'+extension);await download.saveAs(file);const bytes=await readFile(file);
    if(extension==='json'){const exported=JSON.parse(bytes);expect(exported.components).toEqual(original.components);await page.locator('#importInput').setInputFiles(file);}
    if(extension==='svg'){const svg=bytes.toString();expect(svg).toContain('executionEnvironment');expect(svg).toContain('orders.jar');expect(svg).toContain('Version 2.4');expect(svg).toContain('rgb(234, 247, 244)');}
    if(extension==='png')expect([...bytes.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
  }
  await page.reload();expect((await saved(page)).settings.diagramPalette).toBe('teal');
});

test('themes are undoable and imported custom colours are preserved until a theme is chosen',async({page})=>{
  const d=fixture();delete d.settings.diagramTheme;d.components[0].fillColor='#fde68a';await seed(page,d);
  expect((await saved(page)).components[0].fillColor).toBe('#fde68a');
  await page.getByLabel('Diagram style',{exact:true}).click();await expect(page.locator('#diagramTheme')).toHaveValue('custom');await page.locator('#diagramTheme').selectOption('monochrome');
  expect((await saved(page)).components[0].borderColor).toBe('#242424');
  await page.getByLabel('Diagram style',{exact:true}).click();await page.getByRole('button',{name:'Undo',exact:true}).click();
  expect((await saved(page)).components[0].fillColor).toBe('#fde68a');
});

for(const width of [1280,980])test(`library and style panel fit at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:720});await seed(page);await library(page);
  const libraryBox=await page.locator('#elementLibrary').boundingBox(),canvas=await page.locator('#canvasWrap').boundingBox();
  expect(libraryBox.x+libraryBox.width).toBeLessThanOrEqual(canvas.x+canvas.width);expect(libraryBox.y+libraryBox.height).toBeLessThan(720);
  await page.screenshot({path:info.outputPath('library.png')});await page.keyboard.press('Escape');
  await page.getByLabel('Diagram style',{exact:true}).click();const style=await page.locator('.themePanel').boundingBox();expect(style.x).toBeGreaterThanOrEqual(0);expect(style.x+style.width).toBeLessThanOrEqual(width);expect((await page.locator('.toolbar').boundingBox()).height).toBeLessThanOrEqual(66);
});
