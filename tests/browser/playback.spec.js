import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {diagram} from '../fixtures/diagram.js';

function journey(){
  const data=diagram();
  data.components[0].shape='roundedRectangle';
  data.messageFlows.push({...data.messageFlows[1],id:'finish',sequenceNumber:3,timing:'afterPrevious',messageText:'Confirm the customer order and publish all of the delivery instructions for the warehouse team',actionText:'Publish confirmation'});
  return data;
}
async function seed(page,data=journey()){
  await page.goto('/');
  await page.locator('#importInput').setInputFiles({name:'Playback.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await expect(page.locator('.flowItem')).toHaveCount(data.messageFlows.length);
}
async function options(page,open=true){
  if((await page.locator('#playbackOptions').getAttribute('open')!==null)!==open) await page.getByLabel('Playback settings',{exact:true}).click();
}
async function manual(page){
  await options(page);await page.getByRole('radio',{name:'Manual',exact:true}).check();await options(page,false);
}
const next=page=>page.getByRole('button',{name:'Next message',exact:true});
const phase=page=>page.locator('#playbackPhase');
const token=page=>page.locator('.messageToken circle').first();
const tokenPosition=page=>token(page).evaluate(el=>[Number(el.getAttribute('cx')),Number(el.getAttribute('cy'))]);
test.beforeEach(async({page})=>{
  page._playbackErrors=[];page.on('pageerror',e=>page._playbackErrors.push(e.message));
  await page.clock.install();
});
test.afterEach(async({page})=>expect(page._playbackErrors).toEqual([]));

for(const presentation of [false,true]) test(`Manual Next animates one complete group and waits in ${presentation?'presentation':'editor'}`,async({page})=>{
  const data=journey();data.settings.showProcessingActionInPresentation=true;
  await seed(page,data);await manual(page);
  if(presentation) await page.getByRole('button',{name:'Start presentation mode',exact:true}).click();
  await next(page).click();
  await expect(page.locator('#playbackCounter')).toHaveText('Messages 1–2 of 3');
  await expect(page.locator('.messageToken circle')).toHaveCount(2);
  const start=await tokenPosition(page);
  await page.clock.runFor(500);
  expect(await tokenPosition(page)).not.toEqual(start);
  await expect(next(page)).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#playbackCounter')).toHaveText('Messages 1–2 of 3');
  await page.clock.runFor(1300);await expect(phase(page)).toHaveText('Received');
  await page.clock.runFor(650);await expect(phase(page)).toHaveText('Processing');
  await page.clock.runFor(1000);await expect(phase(page)).toHaveText('Waiting for Next');
  await page.clock.runFor(10000);await expect(phase(page)).toHaveText('Waiting for Next');
  await next(page).click();
  await expect(page.locator('#playbackCounter')).toHaveText('Message 3 of 3');
  await expect(page.locator('.messageToken circle')).toHaveCount(1);
  await page.clock.runFor(4000);await expect(phase(page)).toHaveText('Finished');
  await expect(next(page)).toBeDisabled();
  await page.clock.runFor(10000);await expect(phase(page)).toHaveText('Finished');
  await expect(page.getByRole('button',{name:'Start animation',exact:true})).toBeEnabled();
});

test('Manual Next plays the selected final message and a single-message diagram',async({page})=>{
  await seed(page);await manual(page);
  await page.getByRole('button',{name:'Start presentation mode',exact:true}).click();
  await page.locator('.timelineMessage').last().click();
  await expect(phase(page)).toHaveText('Ready');await expect(next(page)).toBeEnabled();
  await next(page).click();await expect(page.locator('#playbackCounter')).toHaveText('Message 3 of 3');
  await expect(token(page)).toBeVisible();await page.clock.runFor(4000);
  const data=diagram();data.messageFlows=data.messageFlows.slice(0,1);data.settings.animationMode='step';
  await seed(page,data);await next(page).click();
  await expect(token(page)).toBeVisible();await expect(page.locator('#playbackCounter')).toHaveText('Message 1 of 1');
  await page.clock.runFor(15000);await expect(phase(page)).toHaveText('Finished');
});

test('Manual pause preserves token position and remaining arrival time; Stop cancels timers',async({page})=>{
  await seed(page);await manual(page);await next(page).click();await page.clock.runFor(500);
  await page.getByRole('button',{name:'Pause animation',exact:true}).click();
  const paused=await tokenPosition(page);await page.clock.runFor(4000);
  expect(await tokenPosition(page)).toEqual(paused);
  await expect(next(page)).toBeDisabled();
  await page.getByRole('button',{name:'Resume animation',exact:true}).click();
  await page.clock.runFor(1150);await expect(phase(page)).toHaveText('Received');
  await page.getByRole('button',{name:'Pause animation',exact:true}).click();
  await page.clock.runFor(3000);await expect(phase(page)).toHaveText('Paused · Received');
  await page.getByRole('button',{name:'Resume animation',exact:true}).click();
  await page.clock.runFor(700);await expect(phase(page)).toHaveText('Processing');
  await page.getByRole('button',{name:'Stop animation',exact:true}).click();
  await page.clock.runFor(10000);await expect(phase(page)).toHaveText('Ready');await expect(page.locator('.messageToken')).toHaveCount(0);
});

test('phase inspection cancels automatic phase timing and Next returns to complete message playback',async({page})=>{
  await seed(page);await manual(page);await next(page).click();await page.clock.runFor(1800);
  await options(page);await page.getByRole('button',{name:'Next phase',exact:true}).click();
  await page.clock.runFor(7000);await expect(phase(page)).toHaveText('Processing');
  await expect(page.locator('#playbackModeHint')).toContainText('Inspecting individual phases');
  await page.getByRole('button',{name:'Previous phase',exact:true}).click();
  await page.clock.runFor(7000);await expect(phase(page)).toHaveText('Received');
  await options(page,false);await next(page).click();
  await expect(page.locator('#playbackCounter')).toHaveText('Message 3 of 3');
  await page.clock.runFor(4000);await expect(phase(page)).toHaveText('Finished');
});

test('switching Manual and Auto while waiting resumes the flow without stale timers',async({page})=>{
  await seed(page);await manual(page);await next(page).click();await page.clock.runFor(4000);
  await expect(phase(page)).toHaveText('Waiting for Next');
  await options(page);await page.getByRole('radio',{name:'Auto',exact:true}).check();
  await page.clock.runFor(1000);await expect(phase(page)).toHaveText('Sending');
  await page.getByRole('radio',{name:'Manual',exact:true}).check();await options(page,false);
  await page.clock.runFor(12000);await expect(phase(page)).toHaveText('Finished');
});

test('presentation text switches are independent, live, and survive reload and JSON export',async({page},testInfo)=>{
  await seed(page);await manual(page);await page.getByRole('button',{name:'Start presentation mode',exact:true}).click();
  await next(page).click();await page.clock.runFor(300);
  await expect(page.locator('.messageToken text')).toHaveCount(2);
  await options(page);
  const names=page.getByRole('checkbox',{name:'Message name beside token',exact:true});
  const actions=page.getByRole('checkbox',{name:'Show processing phase',exact:true});
  await expect(names).toBeChecked();await expect(actions).not.toBeChecked();
  await names.uncheck();await expect(page.locator('.messageToken text')).toHaveCount(0);
  await expect(page.locator('.messageToken circle')).toHaveCount(2);
  await actions.check();await page.clock.runFor(2200);
  await expect(page.locator('.processingCallout')).toHaveCount(2);
  await actions.uncheck();await expect(page.locator('.processingCallout')).toHaveCount(0);
  await actions.check();await options(page,false);
  await page.getByRole('button',{name:'Close presentation mode',exact:true}).click();
  // Presentation choices leave the editor's labels available.
  await next(page).click();await expect(page.locator('.messageToken text')).toHaveCount(2);
  await page.getByRole('button',{name:'Stop animation',exact:true}).click();
  await page.reload();await options(page);await expect(names).not.toBeChecked();await expect(actions).toBeChecked();await options(page,false);
  const download=page.waitForEvent('download');
  await page.getByLabel('File menu',{exact:true}).click();await page.getByRole('button',{name:'Export JSON',exact:true}).click();
  const file=testInfo.outputPath('presentation-options.json');await (await download).saveAs(file);
  const exported=JSON.parse(await readFile(file,'utf8'));
  expect(exported.settings).toMatchObject({showTokenMessageInPresentation:false,showProcessingActionInPresentation:true});
  await page.locator('#importInput').setInputFiles(file);await options(page);await expect(names).not.toBeChecked();await expect(actions).toBeChecked();
});

test('simultaneous processing actions at the same component have distinct, unobstructed callouts',async({page},testInfo)=>{
  const data=journey();data.messageFlows[1]={...data.messageFlows[0],id:'second',sequenceNumber:2,timing:'withPrevious',messageText:'Record audit event',actionText:'Write the received request to the audit log'};
  data.settings.showProcessingActionInPresentation=true;
  await seed(page,data);await manual(page);await page.getByRole('button',{name:'Start presentation mode',exact:true}).click();
  await next(page).click();await page.clock.runFor(2500);
  await expect(page.locator('.processingCallout')).toHaveCount(2);
  await expect(page.locator('.actionHeading').first()).toHaveText('Submit order');
  await expect(page.locator('.actionHeading').last()).toHaveText('Record audit event');
  const bubbles=await page.locator('.actionBubble').evaluateAll(els=>els.map(el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};}));
  const components=await page.locator('.componentShape').evaluateAll(els=>els.map(el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};}));
  const overlaps=(a,b)=>a.x<b.x+b.width && b.x<a.x+a.width && a.y<b.y+b.height && b.y<a.y+a.height;
  bubbles.forEach((b,i)=>{for(const other of [...components,...bubbles.slice(i+1)]) expect(overlaps(b,other)).toBe(false);});
  await page.screenshot({path:testInfo.outputPath('processing-callouts.png')});
});

for(const width of [1280,980]) test(`playback and presentation layout stays fixed across changing messages and phases at ${width}px`,async({page},testInfo)=>{
  const data=journey();data.settings.showProcessingActionInPresentation=true;
  await page.setViewportSize({width,height:720});await seed(page,data);
  async function boxes(presentation){
    const ids=['animationBar','prevMessageBtn','startBtn','nextMessageBtn','stopBtn','playbackSummary','playbackOptions',...(presentation?['presentationCounter','presentationPhase','presentationMessage','presentationRoute']:[])];
    return Promise.all(ids.map(id=>page.locator('#'+id).boundingBox()));
  }
  for(const presentation of [false,true]){
    if(presentation) await page.getByRole('button',{name:'Start presentation mode',exact:true}).click();
    await page.locator('#main').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)));
    const before=await boxes(presentation);
    const stable=async()=>{
      const after=await boxes(presentation);
      after.forEach((box,i)=>{for(const key of ['x','y','width','height']) expect(box[key]).toBeCloseTo(before[i][key],1);});
    };
    await page.getByRole('button',{name:'Start animation',exact:true}).click();await page.clock.runFor(500);await stable();
    await page.getByRole('button',{name:'Pause animation',exact:true}).click();await stable();
    await next(page).click();await stable();
    await page.getByRole('button',{name:'Start animation',exact:true}).click();await page.clock.runFor(2500);await stable();
    await page.getByRole('button',{name:'Pause animation',exact:true}).click();await stable();
    await page.getByRole('button',{name:'Stop animation',exact:true}).click();await stable();
    await options(page);const popup=await page.locator('.playbackPanel').boundingBox();expect(popup.y).toBeGreaterThanOrEqual(0);expect(popup.x+popup.width).toBeLessThanOrEqual(width);
    await page.getByRole('radio',{name:'Manual',exact:true}).check();await options(page,false);
    await next(page).click();await page.clock.runFor(4000);await expect(phase(page)).toHaveText('Waiting for Next');await stable();
    await page.getByRole('button',{name:'Play next message',exact:true}).click();await page.clock.runFor(4000);await expect(phase(page)).toHaveText('Finished');await stable();
    await page.getByRole('button',{name:'Previous message',exact:true}).click();await expect(phase(page)).toHaveText('Ready');
    await next(page).click();await expect(page.locator('#playbackCounter')).toHaveText('Messages 1–2 of 3');
    await page.getByRole('button',{name:'Stop animation',exact:true}).click();
    await options(page);await page.getByRole('radio',{name:'Auto',exact:true}).check();
    await options(page,false);
  }
  await page.screenshot({path:testInfo.outputPath('stable-playback.png')});
});
