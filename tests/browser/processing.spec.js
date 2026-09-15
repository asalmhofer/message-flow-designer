import {test,expect} from '@playwright/test';
import {diagram} from '../fixtures/diagram.js';

const phase=page=>page.locator('#playbackPhase');
const counter=page=>page.locator('#playbackCounter');
const next=page=>page.getByRole('button',{name:'Next message',exact:true});
const processing=page=>page.getByRole('checkbox',{name:'Show processing phase',exact:true});
async function options(page,open=true){
  if((await page.locator('#playbackOptions').getAttribute('open')!==null)!==open) await page.getByLabel('Playback settings',{exact:true}).click();
}
async function seed(page,{mode='step',showProcessing=false,presentation=true,single=false}={}){
  const data=diagram();
  if(single) data.messageFlows=data.messageFlows.slice(0,1);
  else data.messageFlows.push({...data.messageFlows[1],id:'finish',sequenceNumber:3,timing:'afterPrevious',messageText:'Confirm order'});
  Object.assign(data.settings,{animationMode:mode,animationSpeed:100,loopAnimation:false,showProcessingActionInPresentation:showProcessing});
  await page.goto('/');
  await page.locator('#importInput').setInputFiles({name:'Processing.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await expect(page.locator('.flowItem')).toHaveCount(data.messageFlows.length);
  if(presentation) await page.getByRole('button',{name:'Start presentation mode',exact:true}).click();
}
async function toggleProcessing(page,checked){
  await options(page);await processing(page).setChecked(checked);await options(page,false);
}
async function noProcessing(page){
  await expect(phase(page)).not.toContainText('Processing');
  await expect(page.locator('#presentationPhase')).not.toContainText('Processing');
  await expect(page.locator('.processingCallout,.componentGroup.processing')).toHaveCount(0);
}
test.beforeEach(async({page})=>{
  page._processingErrors=[];page.on('pageerror',e=>page._processingErrors.push(e.message));
  await page.clock.install();
});
test.afterEach(async({page})=>expect(page._processingErrors).toEqual([]));

test('Manual presentation settles a simultaneous group immediately on arrival and finishes the last message',async({page})=>{
  await seed(page);await next(page).click();
  await page.clock.runFor(300);await expect(next(page)).toBeDisabled();
  await page.clock.runFor(300);await expect(phase(page)).toHaveText('Waiting for Next');
  await expect(next(page)).toBeEnabled();await noProcessing(page);
  await expect(counter(page)).toHaveText('Messages 1–2 of 3');
  await page.clock.runFor(5000);await expect(phase(page)).toHaveText('Waiting for Next');
  await page.keyboard.press('ArrowRight');await expect(counter(page)).toHaveText('Message 3 of 3');
  await expect(phase(page)).toHaveText('Sending');await page.clock.runFor(600);
  await expect(phase(page)).toHaveText('Finished');await noProcessing(page);
  await expect(next(page)).toBeDisabled();await page.clock.runFor(5000);await expect(phase(page)).toHaveText('Finished');
});

test('Auto retains the Received cue but skips the processing delay and never renders Processing',async({page})=>{
  await seed(page,{mode:'auto'});await page.getByRole('button',{name:'Start animation',exact:true}).click();
  await page.clock.runFor(600);await expect(phase(page)).toHaveText('Received');await noProcessing(page);
  await page.clock.runFor(550);await expect(counter(page)).toHaveText('Messages 1–2 of 3');
  await expect(phase(page)).toHaveText('Received');
  await page.clock.runFor(100);await expect(counter(page)).toHaveText('Message 3 of 3');await expect(phase(page)).toHaveText('Sending');
  for(let i=0;i<14;i++){await page.clock.runFor(100);await noProcessing(page);}
  await expect(phase(page)).toHaveText('Finished');
});

test('single-message Manual playback finishes on arrival even with Loop enabled',async({page})=>{
  await seed(page,{single:true});await options(page);await page.getByRole('checkbox',{name:'Loop',exact:true}).check();await options(page,false);
  await next(page).click();await page.clock.runFor(600);
  await expect(phase(page)).toHaveText('Finished');await noProcessing(page);
  await page.clock.runFor(10000);await expect(phase(page)).toHaveText('Finished');
});

for(const mode of ['step','auto']) test(`disabling Processing immediately settles the active phase in ${mode} mode`,async({page})=>{
  await seed(page,{mode,showProcessing:true});await page.getByRole('button',{name:'Start animation',exact:true}).click();
  await page.clock.runFor(1400);await expect(phase(page)).toHaveText('Processing');
  await toggleProcessing(page,false);await noProcessing(page);
  if(mode==='step'){
    await expect(phase(page)).toHaveText('Waiting for Next');await expect(next(page)).toBeEnabled();await next(page).click();
  }
  await expect(counter(page)).toHaveText('Message 3 of 3');await expect(phase(page)).toHaveText('Sending');
  await page.clock.runFor(400);await expect(phase(page)).toHaveText('Sending');
  await page.clock.runFor(1000);await expect(phase(page)).toHaveText('Finished');await noProcessing(page);
});

for(const mode of ['step','auto']) test(`disabling Processing while paused preserves pause and resumes without its delay in ${mode} mode`,async({page})=>{
  await seed(page,{mode,showProcessing:true});await page.getByRole('button',{name:'Start animation',exact:true}).click();
  await page.clock.runFor(1400);await page.getByRole('button',{name:'Pause animation',exact:true}).click();
  await toggleProcessing(page,false);await expect(phase(page)).toHaveText('Paused · Received');
  await page.clock.runFor(5000);await expect(counter(page)).toHaveText('Messages 1–2 of 3');
  await expect(phase(page)).toHaveText('Paused · Received');await noProcessing(page);
  await page.getByRole('button',{name:'Resume animation',exact:true}).click();await page.clock.runFor(1);
  if(mode==='step'){
    await expect(phase(page)).toHaveText('Waiting for Next');await expect(next(page)).toBeEnabled();
  }else{
    await expect(counter(page)).toHaveText('Message 3 of 3');await expect(phase(page)).toHaveText('Sending');
  }
});

test('a paused final message finishes only after Resume when processing is disabled',async({page})=>{
  await seed(page,{showProcessing:true,single:true});await next(page).click();await page.clock.runFor(1400);
  await page.getByRole('button',{name:'Pause animation',exact:true}).click();await toggleProcessing(page,false);
  await page.clock.runFor(5000);await expect(phase(page)).toHaveText('Paused · Received');
  await page.getByRole('button',{name:'Resume animation',exact:true}).click();
  await expect(phase(page)).toHaveText('Finished');await noProcessing(page);
});

for(const time of [300,700]) test(`turning processing off during ${time===300?'transfer':'arrival'} makes Manual Next ready at arrival`,async({page})=>{
  await seed(page,{showProcessing:true});await next(page).click();await page.clock.runFor(time);
  await toggleProcessing(page,false);
  if(time===300){await expect(phase(page)).toHaveText('Sending');await page.clock.runFor(300);}
  await expect(phase(page)).toHaveText('Waiting for Next');await expect(next(page)).toBeEnabled();await noProcessing(page);
});

test('phase inspection skips Processing forwards and backwards, including the final step',async({page})=>{
  await seed(page);await options(page);await page.getByRole('button',{name:'Next phase',exact:true}).click();
  await page.clock.runFor(1500);await expect(phase(page)).toHaveText('Received');await noProcessing(page);
  await page.getByRole('button',{name:'Next phase',exact:true}).click();await expect(counter(page)).toHaveText('Message 3 of 3');
  await page.getByRole('button',{name:'Previous phase',exact:true}).click();
  await expect(counter(page)).toHaveText('Messages 1–2 of 3');await expect(phase(page)).toHaveText('Received');await noProcessing(page);
  await page.getByRole('button',{name:'Previous phase',exact:true}).click();await expect(phase(page)).toHaveText('Sending');
  await page.clock.runFor(1500);await expect(phase(page)).toHaveText('Received');
  await page.getByRole('button',{name:'Next phase',exact:true}).click();await page.clock.runFor(1500);
  await expect(phase(page)).toHaveText('Received');await noProcessing(page);
  await page.getByRole('button',{name:'Next phase',exact:true}).click();await expect(phase(page)).toHaveText('Finished');
});

test('enabling processing while waiting applies to the next message without replaying the current one',async({page})=>{
  await seed(page);await next(page).click();await page.clock.runFor(600);
  await toggleProcessing(page,true);await page.clock.runFor(5000);
  await expect(phase(page)).toHaveText('Waiting for Next');await expect(counter(page)).toHaveText('Messages 1–2 of 3');
  await next(page).click();await page.clock.runFor(600);await expect(phase(page)).toHaveText('Received');
  await page.clock.runFor(700);await expect(phase(page)).toHaveText('Processing');await expect(next(page)).toBeDisabled();
  await page.clock.runFor(1000);await expect(phase(page)).toHaveText('Finished');
});

test('switching Auto to Manual during Received settles immediately, and Auto can continue from that wait',async({page})=>{
  await seed(page,{mode:'auto'});await page.getByRole('button',{name:'Start animation',exact:true}).click();
  await page.clock.runFor(700);await options(page);await page.getByRole('radio',{name:'Manual',exact:true}).check();
  await expect(phase(page)).toHaveText('Waiting for Next');await expect(next(page)).toBeEnabled();
  await page.clock.runFor(2000);await expect(counter(page)).toHaveText('Messages 1–2 of 3');
  await page.getByRole('radio',{name:'Auto',exact:true}).check();await options(page,false);await page.clock.runFor(700);
  await expect(counter(page)).toHaveText('Message 3 of 3');await expect(phase(page)).toHaveText('Sending');await noProcessing(page);
});

test('editor processing stays visible; entering presentation applies its disabled processing setting',async({page})=>{
  await seed(page,{presentation:false});await next(page).click();await page.clock.runFor(1400);
  await expect(phase(page)).toHaveText('Processing');await expect(page.locator('.processingCallout')).toHaveCount(2);
  await page.getByRole('button',{name:'Start presentation mode',exact:true}).click();
  await expect(phase(page)).toHaveText('Waiting for Next');await expect(next(page)).toBeEnabled();await noProcessing(page);
});
