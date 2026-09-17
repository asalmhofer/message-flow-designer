import {test,expect} from '@playwright/test';
import {diagram} from '../fixtures/diagram.js';

const view=page=>page.locator('#viewport').getAttribute('transform');
const zoom=page=>page.locator('#viewport').evaluate(el=>el.transform.baseVal.consolidate().matrix.a);
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('event-flow-designer-state-v1')));
// Animation replaces SVG nodes every frame: query and measure in the same task.
const screenFontSize=(page,selector)=>page.evaluate(selector=>{const el=document.querySelector(selector);return parseFloat(getComputedStyle(el).fontSize)*el.getScreenCTM().a;},selector);
async function seed(page,data=diagram()){
  data.components[0].shape='roundedRectangle';
  Object.assign(data.settings,{animationSpeed:100,animationMode:'step'});
  await page.goto('/');await page.locator('#importInput').setInputFiles({name:'Presentation.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
}
async function enter(page){await page.getByRole('button',{name:'Start presentation mode',exact:true}).click();}
async function togglePanel(page){await page.locator('#presentationDetailsBtn').click();}
async function expectFits(page,selector='.componentGroup,.flowPath'){
  const viewport=await page.locator('#diagram').boundingBox();
  const boxes=await page.locator(selector).evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};}));
  for(const box of boxes){
    expect(box.x).toBeGreaterThanOrEqual(viewport.x-1);expect(box.y).toBeGreaterThanOrEqual(viewport.y-1);
    expect(box.x+box.width).toBeLessThanOrEqual(viewport.x+viewport.width+1);expect(box.y+box.height).toBeLessThanOrEqual(viewport.y+viewport.height+1);
  }
}
test.beforeEach(async({page})=>{page._presentationErrors=[];page.on('pageerror',e=>page._presentationErrors.push(e.message));});
test.afterEach(async({page})=>expect(page._presentationErrors).toEqual([]));

test('presentation uses the full width with a compact header and refits when the panel opens and closes',async({page})=>{
  await seed(page);const editor=(await saved(page)).settings;await enter(page);
  await expect(page.locator('#sidePanel')).toBeHidden();
  const canvas=await page.locator('#diagram').boundingBox(),header=await page.locator('.toolbar').boundingBox();
  expect(canvas.width).toBe(1280);expect(header.height).toBe(80);expect(canvas.height).toBeGreaterThan(550);
  const fullZoom=await zoom(page);expect(fullZoom).toBeGreaterThan(1.7);await expectFits(page);
  await togglePanel(page);await expect(page.locator('#presentationDetailsPanel')).toBeVisible();
  expect((await page.locator('#sidePanel').boundingBox()).width).toBe(320);expect(await zoom(page)).toBeLessThan(fullZoom);
  await expectFits(page);await togglePanel(page);expect(await zoom(page)).toBeCloseTo(fullZoom,5);
  await page.getByRole('button',{name:'Close presentation mode',exact:true}).click();
  const restored=(await saved(page)).settings;expect([restored.zoom,restored.panX,restored.panY,restored.flowPanelWidth]).toEqual([editor.zoom,editor.panX,editor.panY,editor.flowPanelWidth]);
});

test('manual zoom and drag survive layout changes until Fit is chosen again',async({page})=>{
  await seed(page);await enter(page);await page.getByRole('button',{name:'Zoom in in presentation',exact:true}).click();
  await expect(page.locator('#diagram')).toHaveCSS('cursor','grab');
  await expect(page.locator('#presentationFitBtn')).toHaveAttribute('aria-pressed','false');
  const initial=await view(page),canvas=await page.locator('#diagram').boundingBox();
  await page.mouse.move(canvas.x+canvas.width/2,canvas.y+canvas.height/2);await page.mouse.down();await page.mouse.move(canvas.x+canvas.width/2+65,canvas.y+canvas.height/2+35,{steps:5});await page.mouse.up();
  const manual=await view(page);expect(manual).not.toBe(initial);
  await togglePanel(page);expect(await view(page)).toBe(manual);
  await page.setViewportSize({width:980,height:720});expect(await view(page)).toBe(manual);
  await togglePanel(page);expect(await view(page)).toBe(manual);
  await page.getByRole('button',{name:'Fit diagram',exact:true}).click();
  await expect(page.locator('#presentationFitBtn')).toHaveAttribute('aria-pressed','true');expect(await view(page)).not.toBe(manual);await expectFits(page);
  const fitted=await zoom(page);await page.setViewportSize({width:760,height:650});await expect.poll(()=>zoom(page)).toBeLessThan(fitted);await expectFits(page);
});

test('panel tabs, resizing and visibility persist without changing the editor panel',async({page})=>{
  await seed(page);const editorWidth=(await saved(page)).settings.flowPanelWidth;await enter(page);await togglePanel(page);
  await page.getByRole('tab',{name:'Details',exact:true}).press('ArrowRight');
  await expect(page.getByRole('tab',{name:'Flow overview',exact:true})).toBeFocused();await expect(page.locator('#presentationFlowPanel')).toBeVisible();
  await expect(page.locator('#presentationDetailsPanel')).toBeHidden();
  const handle=await page.locator('#sidePanelResizeHandle').boundingBox(),before=await zoom(page);
  await page.mouse.move(handle.x+6,handle.y+100);await page.mouse.down();await page.mouse.move(handle.x-74,handle.y+100,{steps:8});await page.mouse.up();
  const resizedWidth=(await page.locator('#sidePanel').boundingBox()).width;
  expect(resizedWidth).toBeGreaterThan(380);expect(resizedWidth).toBeLessThan(420);
  await expect.poll(()=>zoom(page)).toBeLessThan(before);await expectFits(page);
  await page.reload();await enter(page);await expect(page.locator('#presentationFlowPanel')).toBeVisible();
  expect((await page.locator('#sidePanel').boundingBox()).width).toBe(resizedWidth);
  expect((await saved(page)).settings.flowPanelWidth).toBe(editorWidth);
  await page.locator('.timelineMessage').first().click();expect((await saved(page)).settings.presentationPanelOpen).toBe(true);
  await togglePanel(page);await page.reload();await enter(page);await expect(page.locator('#sidePanel')).toBeHidden();
});

test('curves, tokens and simultaneous processing callouts stay in view with readable text and a stable camera',async({page})=>{
  await page.clock.install();
  const data=diagram();data.components[0].x=0;data.components[1].x=4400;
  data.messageFlows[0].controlPoint={x:2200,y:-900};
  data.messageFlows[1]={...data.messageFlows[0],id:'parallel',sequenceNumber:2,timing:'withPrevious',messageText:'Record audit trail',actionText:'Store the received request in the audit log'};
  data.settings.showProcessingActionInPresentation=true;
  await seed(page,data);await enter(page);await page.clock.runFor(32);await expectFits(page);
  const initial=await view(page);expect(await zoom(page)).toBeLessThan(.3);
  await page.getByRole('button',{name:'Next message',exact:true}).click();await page.clock.runFor(400);
  await expectFits(page,'.messageToken');
  expect(await screenFontSize(page,'.messageToken text')).toBeGreaterThanOrEqual(13.99);
  await page.clock.runFor(1100);await expect(page.locator('.processingCallout')).toHaveCount(2);
  await expectFits(page,'.processingCallout');
  expect(await screenFontSize(page,'.actionText:not(.actionHeading)')).toBeGreaterThanOrEqual(13.99);
  expect(await view(page)).toBe(initial);
  await page.getByRole('button',{name:'Close presentation mode',exact:true}).click();expect((await saved(page)).settings.zoom).toBe(.82);
});

test('full screen can be entered and left independently and closes when presentation exits',async({page})=>{
  await seed(page);await enter(page);test.skip(!await page.evaluate(()=>document.fullscreenEnabled),'Full screen unavailable in this browser');
  await page.getByRole('button',{name:'Enter full screen',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  await page.getByRole('button',{name:'Exit full screen',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
  await expect(page.locator('body')).toHaveClass(/presentation/);
  await page.getByRole('button',{name:'Enter full screen',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  await page.getByRole('button',{name:'Close presentation mode',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
});

for(const width of [1280,980,600])test(`presentation controls and diagram fit at ${width}px with the panel open and closed`,async({page},info)=>{
  await page.setViewportSize({width,height:720});await seed(page);await enter(page);
  for(const open of [false,true]){
    if(open)await togglePanel(page);
    for(const id of ['presentationBtn','presentationDetailsBtn','presentationFullscreenBtn','presentationFitBtn','presentationZoomInBtn','presentationZoomOutBtn','prevMessageBtn','startBtn','nextMessageBtn']){
      expect(await page.locator('#'+id).evaluate(el=>{const b=el.getBoundingClientRect();return b.x>=0&&b.y>=0&&b.right<=innerWidth&&b.bottom<=innerHeight&&el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));})).toBe(true);
    }
    await expectFits(page);await page.screenshot({path:info.outputPath(open?'details.png':'diagram.png')});
  }
});
