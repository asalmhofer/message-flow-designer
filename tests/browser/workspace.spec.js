import {test,expect} from '@playwright/test';
import {diagram} from '../fixtures/diagram.js';

const selected=page=>page.locator('.componentGroup.selected');
const shape=(page,id)=>page.locator(`.componentGroup[data-id="${id}"] .componentShape`).first();
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('event-flow-designer-state-v1')));
const next=page=>page.getByRole('button',{name:'Next message',exact:true});
const phase=page=>page.locator('#playbackPhase');
const tokenPoints=page=>page.locator('.messageToken circle').evaluateAll(nodes=>nodes.map(node=>[node.getAttribute('cx'),node.getAttribute('cy')]));
async function seed(page,{presentation=false,processing=false}={}){
  const data=diagram();
  data.components[0].shape='roundedRectangle';
  data.messageFlows.push({...data.messageFlows[1],id:'finish',sequenceNumber:3,timing:'afterPrevious',messageText:'Finish'});
  Object.assign(data.settings,{zoom:1,panX:0,panY:0,snapToGrid:false,animationSpeed:100,animationMode:'step',loopAnimation:false,showProcessingActionInPresentation:processing});
  await page.goto('/');
  await page.locator('#importInput').setInputFiles({name:'Workspace.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await expect(page.locator('.componentGroup')).toHaveCount(2);
  if(presentation)await page.getByRole('button',{name:'Start presentation mode',exact:true}).click();
}
async function center(locator){const box=await locator.boundingBox();return {x:box.x+box.width/2,y:box.y+box.height/2};}
async function drag(page,from,dx,dy){
  await page.mouse.move(from.x,from.y);await page.mouse.down();
  await page.mouse.move(from.x+dx,from.y+dy,{steps:8});await page.mouse.up();
}
test.beforeEach(async({page})=>{
  page._workspaceErrors=[];page.on('pageerror',e=>page._workspaceErrors.push(e.message));
});
test.afterEach(async({page})=>expect(page._workspaceErrors).toEqual([]));

for(const modifier of ['Control','Meta','Shift'])test(`${modifier}-click toggles multi-selection without creating copies or undo entries`,async({page})=>{
  await seed(page);await shape(page,'web').click();
  await shape(page,'service').click({modifiers:[modifier]});await expect(selected(page)).toHaveCount(2);
  await expect(page.getByText('2 elements selected',{exact:true})).toBeVisible();
  await expect(page.locator('#selectionTools')).toBeVisible();
  await shape(page,'web').click({modifiers:[modifier]});await expect(selected(page)).toHaveCount(1);
  await expect(selected(page)).toHaveAttribute('data-id','service');
  await shape(page,'service').click({modifiers:[modifier]});await expect(selected(page)).toHaveCount(0);
  await expect(page.locator('.componentGroup')).toHaveCount(2);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.locator('.componentGroup')).toHaveCount(0);
});

test('dragging a Ctrl-selected group moves both components and its routes in one undoable action',async({page})=>{
  await seed(page);const before=await saved(page);
  await shape(page,'web').click();await shape(page,'service').click({modifiers:['Control']});
  await drag(page,await center(shape(page,'web')),36,44);
  const after=await saved(page);
  after.components.forEach((c,i)=>{expect(c.x).toBeCloseTo(before.components[i].x+36);expect(c.y).toBeCloseTo(before.components[i].y+44);});
  expect(after.messageFlows[0].controlPoint).toEqual({x:386,y:104});
  await expect(selected(page)).toHaveCount(2);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  expect((await saved(page)).components).toEqual(before.components);
});

test('Ctrl click jitter stays a click even if the modifier is released before pointer-up',async({page})=>{
  await seed(page);await shape(page,'web').click();const point=await center(shape(page,'service'));
  await page.keyboard.down('Control');await page.mouse.move(point.x,point.y);await page.mouse.down();
  await page.mouse.move(point.x+2,point.y+1);await expect(page.locator('.componentGroup')).toHaveCount(2);
  await page.keyboard.up('Control');await page.mouse.up();
  await expect(selected(page)).toHaveCount(2);
});

for(const cancel of [false,true])test(`Ctrl-drag copies a selected group only after movement and ${cancel?'Escape restores it':'one undo removes the copy'}`,async({page})=>{
  await seed(page);const before=await saved(page);
  await shape(page,'web').click();await shape(page,'service').click({modifiers:['Control']});
  const point=await center(shape(page,'web'));
  await page.keyboard.down('Control');await page.mouse.move(point.x,point.y);await page.mouse.down();
  await expect(page.locator('.componentGroup')).toHaveCount(2);
  await page.mouse.move(point.x+44,point.y+80,{steps:8});
  await expect(page.locator('.componentGroup')).toHaveCount(4);
  if(cancel)await page.keyboard.press('Escape');
  await page.mouse.up();await page.keyboard.up('Control');
  if(!cancel){
    const copied=await saved(page);expect(copied.messageFlows).toHaveLength(6);
    const ids=copied.components.slice(2).map(c=>c.id);
    expect(copied.messageFlows.slice(3).every(f=>ids.includes(f.sourceComponentId)&&ids.includes(f.targetComponentId))).toBe(true);
    expect(copied.components.slice(0,2)).toEqual(before.components);
    await page.getByRole('button',{name:'Undo',exact:true}).click();
  }else await expect(selected(page)).toHaveCount(2);
  expect((await saved(page)).components).toEqual(before.components);
  expect((await saved(page)).messageFlows).toEqual(before.messageFlows);
});

test('transfer trace and group progress freeze on pause, then arrival pulses once without delaying Manual Next',async({page})=>{
  await page.clock.install();await seed(page,{presentation:true});await next(page).click();
  await expect(page.locator('.departureCue')).toHaveCount(2);
  await page.clock.runFor(250);await expect(page.locator('.departureCue')).toHaveCount(0);
  await expect(page.locator('.messageTrace')).toHaveCount(2);
  await expect(page.locator('.timelineMessage').first()).toHaveAccessibleName(/\. Submit order \+ Accepted$/);
  const values=await page.locator('.flowItem .stepProgress').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('aria-valuenow'))));
  expect(values[0]).toBeGreaterThan(0);expect(values[0]).toBe(values[1]);expect(values[2]).toBe(0);
  await page.getByRole('button',{name:'Pause animation',exact:true}).click();
  const positions=await tokenPoints(page),trace=await page.locator('.messageTrace').first().getAttribute('stroke-dashoffset');
  await page.clock.runFor(4000);expect(await tokenPoints(page)).toEqual(positions);
  expect(await page.locator('.messageTrace').first().getAttribute('stroke-dashoffset')).toBe(trace);
  await page.getByRole('button',{name:'Resume animation',exact:true}).click();await page.clock.runFor(350);
  await expect(phase(page)).toHaveText('Waiting for Next');await expect(next(page)).toBeEnabled();
  await expect(page.locator('.arrivalPulse')).toHaveCount(2);
  await expect(page.locator('.flowItem[data-playback-state="completed"]')).toHaveCount(2);
  await expect(page.locator('.timelineMessage[data-playback-state="completed"]')).toHaveCount(1);
  await page.clock.runFor(500);await expect(page.locator('.arrivalPulse')).toHaveCount(0);
  await next(page).click();await expect(page.locator('.flowItem[data-playback-state="completed"]')).toHaveCount(2);
  await page.clock.runFor(600);await expect(phase(page)).toHaveText('Finished');
  await expect(page.locator('.flowItem[data-playback-state="completed"]')).toHaveCount(3);
  await page.clock.runFor(500);await expect(page.locator('.arrivalPulse')).toHaveCount(0);
});

test('processing progress pauses and Stop clears all transient feedback and completion marks',async({page})=>{
  await page.clock.install();await seed(page,{presentation:true,processing:true});await next(page).click();
  await page.clock.runFor(1450);await expect(phase(page)).toHaveText('Processing');
  await expect(page.locator('.processingIndicator')).toHaveCount(2);
  await page.getByRole('button',{name:'Pause animation',exact:true}).click();
  const width=await page.locator('.processingProgress').first().getAttribute('width');
  await page.clock.runFor(4000);expect(await page.locator('.processingProgress').first().getAttribute('width')).toBe(width);
  await page.getByRole('button',{name:'Resume animation',exact:true}).click();await page.clock.runFor(250);
  expect(Number(await page.locator('.processingProgress').first().getAttribute('width'))).toBeGreaterThan(Number(width));
  await page.getByRole('button',{name:'Stop animation',exact:true}).click();await page.clock.runFor(5000);
  await expect(page.locator('.messageToken,.messageTrace,.arrivalPulse,.departureCue,.processingIndicator')).toHaveCount(0);
  await expect(page.locator('.stepCompletion:visible')).toHaveCount(0);
});

test('reduced motion shows stationary phase cues while preserving Manual timing and processing choices',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.clock.install();await seed(page,{presentation:true});
  await next(page).click();const initial=await tokenPoints(page);
  await page.clock.runFor(350);expect(await tokenPoints(page)).toEqual(initial);
  await expect(page.locator('.messageTrace,.arrivalPulse,.departureCue')).toHaveCount(0);
  await page.clock.runFor(250);await expect(phase(page)).toHaveText('Waiting for Next');
  await expect(next(page)).toBeEnabled();await expect(page.locator('.processingIndicator')).toHaveCount(0);
  await next(page).click();await page.clock.runFor(600);await expect(phase(page)).toHaveText('Finished');
});

test('dark interface surfaces leave document appearance intact in editor and presentation',async({page},info)=>{
  await seed(page);const before=await saved(page);
  const fill=await shape(page,'web').evaluate(el=>getComputedStyle(el).fill);
  for(const presentation of [false,true]){
    if(presentation)await page.getByRole('button',{name:'Start presentation mode',exact:true}).click();
    const colors=await page.evaluate(()=>Object.fromEntries(['.toolbar','.canvasWrap','.sidePanel','.animationBar'].map(selector=>[selector,getComputedStyle(document.querySelector(selector)).backgroundColor])));
    expect(colors['.toolbar']).toBe('rgb(32, 44, 62)');expect(colors['.animationBar']).toBe(colors['.toolbar']);
    expect(colors['.canvasWrap']).toBe('rgb(255, 255, 255)');expect(colors['.sidePanel']).toBe('rgb(237, 241, 246)');
    expect(await shape(page,'web').evaluate(el=>getComputedStyle(el).fill)).toBe(fill);
    await page.screenshot({path:info.outputPath(presentation?'presentation.png':'editor.png')});
  }
  expect((await saved(page)).components).toEqual(before.components);
});
